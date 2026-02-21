'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const db = require('../db');

const storage = new Storage();
const UPLOADS_BUCKET   = process.env.GCS_UPLOADS_BUCKET;
const PROCESSED_BUCKET = process.env.GCS_PROCESSED_BUCKET;

const router = express.Router();

// GET /api/projects — list all projects for current user
// NOTE: Post-MVP this will filter by authenticated user_id.
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*,
            COUNT(v.id) AS video_count
     FROM projects p
     LEFT JOIN videos v ON v.project_id = p.id
     GROUP BY p.id
     ORDER BY p.updated_at DESC`
  );
  res.json({ data: rows });
});

// POST /api/projects — create a project
router.post('/', async (req, res) => {
  const { name, description, user_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { rows } = await db.query(
    `INSERT INTO projects (id, user_id, name, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [uuidv4(), user_id || null, name, description || null]
  );
  res.status(201).json({ data: rows[0] });
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  const [projectRes, videosRes, scriptsRes] = await Promise.all([
    db.query('SELECT * FROM projects WHERE id = $1', [req.params.id]),
    db.query(
      `SELECT id, original_filename, processing_status, duration_seconds, created_at
       FROM videos WHERE project_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    ),
    db.query(
      `SELECT id, title, created_at FROM scripts WHERE project_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    ),
  ]);

  if (!projectRes.rows[0]) return res.status(404).json({ error: 'Project not found' });

  res.json({
    data: {
      ...projectRes.rows[0],
      videos: videosRes.rows,
      scripts: scriptsRes.rows,
    },
  });
});

// PUT /api/projects/:id
router.put('/:id', async (req, res) => {
  const { name, description } = req.body;
  const { rows } = await db.query(
    `UPDATE projects
     SET name        = COALESCE($1, name),
         description = COALESCE($2, description),
         updated_at  = now()
     WHERE id = $3
     RETURNING *`,
    [name, description, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
  res.json({ data: rows[0] });
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  const { rows: videos } = await db.query(
    'SELECT id, upload_path FROM videos WHERE project_id = $1',
    [req.params.id]
  );

  const { rows: clips } = await db.query(
    `SELECT c.processed_path FROM clips c
     JOIN videos v ON c.video_id = v.id
     WHERE v.project_id = $1`,
    [req.params.id]
  );

  const { rowCount } = await db.query(
    'DELETE FROM projects WHERE id = $1',
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Project not found' });

  const deleteFile = async (bucket, filePath) => {
    try { await storage.bucket(bucket).file(filePath).delete(); } catch (_) {}
  };

  Promise.all([
    ...videos.map(v => v.upload_path ? deleteFile(UPLOADS_BUCKET, v.upload_path) : null),
    ...clips.map(c => c.processed_path ? deleteFile(PROCESSED_BUCKET, c.processed_path) : null),
  ]).catch(() => {});

  res.status(204).end();
});

module.exports = router;
