'use strict';

const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db');
const storage  = require('../services/storage');
const { logger } = require('../utils/logger');

const router = express.Router();

// POST /api/videos/upload-url
// Returns a signed GCS URL for the client to upload directly.
// Enforces the 2 GB / 30-min budget limits from the implementation guide.
router.post('/upload-url', async (req, res) => {
  const { project_id, filename, content_type, file_size_mb, duration_seconds } = req.body;

  if (!project_id || !filename || !content_type) {
    return res.status(400).json({ error: 'project_id, filename, and content_type are required' });
  }

  // ── Budget protection limits ──
  if (file_size_mb && file_size_mb > 2048) {
    return res.status(413).json({ error: 'File exceeds the 2 GB size limit' });
  }
  if (duration_seconds && duration_seconds > 1800) {
    return res.status(413).json({ error: 'Video exceeds the 30-minute duration limit' });
  }

  const objectPath = `${project_id}/${uuidv4()}_${filename}`;
  const signedUrl  = await storage.generateUploadSignedUrl(objectPath, content_type);

  // Create a video record with PENDING status
  const videoId = uuidv4();
  const { rows } = await db.query(
    `INSERT INTO videos (id, project_id, original_filename, upload_path, processing_status)
     VALUES ($1, $2, $3, $4, 'PENDING')
     RETURNING *`,
    [videoId, project_id, filename, objectPath]
  );

  logger.info(`Video record created: ${videoId} for project ${project_id}`);
  res.status(201).json({ data: { video: rows[0], signed_url: signedUrl, object_path: objectPath } });
});

// GET /api/videos/:id — used for polling processing_status
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT v.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id',             c.id,
                  'cdn_url',        c.cdn_url,
                  'duration_seconds', c.duration_seconds,
                  'strategic_rank', c.strategic_rank,
                  'hook_score',     c.hook_score,
                  'rationale',      c.rationale,
                  'title',          c.title,
                  'hook',           c.hook,
                  'user_approved',  c.user_approved
                )
                ORDER BY c.strategic_rank ASC
              ) FILTER (WHERE c.id IS NOT NULL),
              '[]'
            ) AS clips
     FROM videos v
     LEFT JOIN clips c ON c.video_id = v.id
     WHERE v.id = $1
     GROUP BY v.id`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Video not found' });
  res.json({ data: rows[0] });
});

// GET /api/videos/:id/clips
router.get('/:id/clips', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM clips WHERE video_id = $1 ORDER BY strategic_rank ASC`,
    [req.params.id]
  );
  res.json({ data: rows });
});

module.exports = router;
