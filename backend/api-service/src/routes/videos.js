'use strict';

const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const db       = require('../db');
const storage  = require('../services/storage');
const { reanalyzeClips } = require('../services/clipReanalyzer');
const { logger } = require('../utils/logger');

const router = express.Router();
const TMP_DIR = process.env.TMP_DIR || path.join(os.tmpdir(), 'clipora-api');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

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
                  'start_time_seconds', c.start_time_seconds,
                  'end_time_seconds', c.end_time_seconds,
                  'duration_seconds', c.duration_seconds,
                  'strategic_rank', c.strategic_rank,
                  'hook_score',     c.hook_score,
                  'rationale',      c.rationale,
                  'title',          c.title,
                  'hook',           c.hook,
                  'user_approved',  c.user_approved,
                  'sfx_data',       c.sfx_data,
                  'sfx_video_url',  c.sfx_video_url
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
  let sourceVideoUrl = null;
  try {
    const resolved = await storage.resolveUploadObject(rows[0].upload_path, {
      projectId: rows[0].project_id,
      originalFilename: rows[0].original_filename,
    });
    sourceVideoUrl = await storage.generateReadSignedUrlFromResolved(resolved);
    if (resolved.objectPath !== rows[0].upload_path) {
      await db.query(
        'UPDATE videos SET upload_path = $1, updated_at = now() WHERE id = $2',
        [resolved.objectPath, rows[0].id]
      );
    }
  } catch (error) {
    logger.warn(`Source preview lookup failed for video ${rows[0].id}: ${error.message}`);
  }
  res.json({
    data: {
      ...rows[0],
      source_video_url: sourceVideoUrl,
    },
  });
});

// GET /api/videos/:id/source-preview
// Returns a fresh signed URL for the original uploaded video.
router.get('/:id/source-preview', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, project_id, original_filename, upload_path FROM videos WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Video not found' });
  let sourceVideoUrl;
  try {
    const resolved = await storage.resolveUploadObject(rows[0].upload_path, {
      projectId: rows[0].project_id,
      originalFilename: rows[0].original_filename,
    });
    sourceVideoUrl = await storage.generateReadSignedUrlFromResolved(resolved);
    if (resolved.objectPath !== rows[0].upload_path) {
      await db.query(
        'UPDATE videos SET upload_path = $1, updated_at = now() WHERE id = $2',
        [resolved.objectPath, rows[0].id]
      );
    }
  } catch (error) {
    logger.warn(`Source preview lookup failed for video ${rows[0].id}: ${error.message}`);
    return res.status(404).json({ error: `Original video not found in uploads bucket (${storage.FALLBACK_UPLOADS_BUCKET})` });
  }
  res.json({ data: { source_video_url: sourceVideoUrl } });
});

// GET /api/videos/:id/clips
router.get('/:id/clips', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM clips WHERE video_id = $1 ORDER BY strategic_rank ASC`,
    [req.params.id]
  );
  res.json({ data: rows });
});

// POST /api/videos/:id/finalize-clips
// Re-cut and upload clips after timeline edits, then mix SFX + music if present.
router.post('/:id/finalize-clips', async (req, res) => {
  const { mixSfxOntoVideo, uploadMixedVideoToGCS } = require('../services/sfxMixer');

  const { clips } = req.body;
  if (!Array.isArray(clips) || clips.length === 0) {
    return res.status(400).json({ error: 'clips array is required' });
  }

  const { rows: videoRows } = await db.query(
    'SELECT id, project_id, upload_path FROM videos WHERE id = $1',
    [req.params.id]
  );
  const video = videoRows[0];
  if (!video) return res.status(404).json({ error: 'Video not found' });

  await db.query(
    'UPDATE videos SET processing_status = $1, updated_at = now() WHERE id = $2',
    ['CLIPPING', video.id]
  );

  const sourcePath = path.join(TMP_DIR, `src_${video.id}.mp4`);
  await storage.downloadUploadedVideo(video.upload_path, sourcePath);

  const { rows: existingClipRows } = await db.query(
    'SELECT id, title, sfx_data, music_data FROM clips WHERE video_id = $1',
    [video.id]
  );
  const existing = new Map(existingClipRows.map((item) => [item.id, item]));

  for (const clip of clips) {
    const clipId = clip?.id;
    const start = Number(clip?.start_time_seconds);
    const end = Number(clip?.end_time_seconds);
    if (!clipId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`Invalid clip payload for ${clipId || 'unknown clip'}`);
    }
    if (!existing.has(clipId)) {
      throw new Error(`Clip not found for video: ${clipId}`);
    }
  }

  const results = [];
  for (const clip of clips) {
    const clipId = clip.id;
    const start = Number(clip.start_time_seconds);
    const end = Number(clip.end_time_seconds);
    const duration = parseFloat((end - start).toFixed(3));
    const localPath = path.join(TMP_DIR, `clip_${clipId}.mp4`);
    const baseTitle = existing.get(clipId)?.title || clipId;
    const slug = String(baseTitle)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || clipId;
    const destPath = `${video.project_id}/${video.id}/${slug}.mp4`;

    await runFfmpegCut(sourcePath, localPath, start, duration);
    await storage.uploadProcessedFile(localPath, destPath);

    const cdnUrl = storage.buildCdnUrl(destPath);

    // Mix SFX + background music onto the cut clip (if any exist)
    const clipRow = existing.get(clipId);
    const sfxData = Array.isArray(clipRow?.sfx_data) ? clipRow.sfx_data : [];
    const musicData = clipRow?.music_data || null;
    let sfxVideoUrl = null;

    if (sfxData.length > 0 || musicData) {
      try {
        const videoBuffer = await mixSfxOntoVideo(cdnUrl, sfxData, musicData);
        sfxVideoUrl = await uploadMixedVideoToGCS(videoBuffer, clipId);
      } catch (mixErr) {
        logger.warn(`SFX/music mix failed for clip ${clipId}: ${mixErr.message}`);
      }
    }

    await db.query(
      `UPDATE clips
       SET processed_path = $1,
           cdn_url = $2,
           start_time_seconds = $3,
           end_time_seconds = $4,
           duration_seconds = $5,
           user_approved = TRUE,
           sfx_video_url = $6
       WHERE id = $7 AND video_id = $8`,
      [destPath, cdnUrl, start, end, duration, sfxVideoUrl, clipId, video.id]
    );

    results.push({ id: clipId, cdn_url: cdnUrl, sfx_video_url: sfxVideoUrl, start_time_seconds: start, end_time_seconds: end, duration_seconds: duration });
    fs.unlink(localPath, () => {});
  }

  fs.unlink(sourcePath, () => {});
  await db.query(
    'UPDATE videos SET processing_status = $1, updated_at = now() WHERE id = $2',
    ['COMPLETED', video.id]
  );

  logger.info(`Finalized ${results.length} clips for video ${video.id}`);
  res.json({ data: { video_id: video.id, clips: results } });
});

// POST /api/videos/:id/reanalyze-clips
// Re-analyze video clips using Gemini based on user feedback.
router.post('/:id/reanalyze-clips', async (req, res) => {
  const { suggestion } = req.body;
  if (!suggestion || typeof suggestion !== 'string' || !suggestion.trim()) {
    return res.status(400).json({ error: 'suggestion is required' });
  }

  const { rows: videoRows } = await db.query(
    'SELECT id, project_id, original_filename, upload_path, transcription, duration_seconds FROM videos WHERE id = $1',
    [req.params.id]
  );
  const video = videoRows[0];
  if (!video) return res.status(404).json({ error: 'Video not found' });
  if (!video.transcription) {
    return res.status(400).json({ error: 'Video has no transcription — cannot re-analyze' });
  }

  // Fetch current clips
  const { rows: currentClips } = await db.query(
    'SELECT id, title, start_time_seconds, end_time_seconds, duration_seconds, hook, hook_score, rationale, strategic_rank FROM clips WHERE video_id = $1 ORDER BY strategic_rank ASC',
    [video.id]
  );
  if (currentClips.length === 0) {
    return res.status(400).json({ error: 'No existing clips to refine' });
  }

  // Resolve GCS URI for Gemini multimodal input
  const resolved = await storage.resolveUploadObject(video.upload_path, {
    projectId: video.project_id,
    originalFilename: video.original_filename,
  });
  const gcsUri = `gs://${resolved.bucketName}/${resolved.objectPath}`;

  const newClips = await reanalyzeClips({
    gcsUri,
    transcription: video.transcription,
    videoDurationSeconds: Number(video.duration_seconds),
    currentClips,
    userSuggestion: suggestion.trim(),
  });

  // Transactional clip replacement
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Delete old clips
    await client.query('DELETE FROM clips WHERE video_id = $1', [video.id]);

    // Insert new clips
    const usedSlugs = new Set();
    const insertedClips = [];
    for (const clip of newClips) {
      const clipId = uuidv4();
      let slug = clip.title
        ? clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
        : clipId;
      if (usedSlugs.has(slug)) slug = `${slug}-${clipId.slice(0, 8)}`;
      usedSlugs.add(slug);
      const destPath = `${video.project_id}/${video.id}/${slug}.mp4`;
      const duration = parseFloat((clip.end_time_seconds - clip.start_time_seconds).toFixed(3));

      await client.query(
        `INSERT INTO clips
           (id, video_id, processed_path, cdn_url,
            start_time_seconds, end_time_seconds, duration_seconds,
            strategic_rank, hook_score, rationale, title, hook)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          clipId, video.id, destPath, null,
          clip.start_time_seconds, clip.end_time_seconds, duration,
          clip.strategic_rank, clip.hook_score, clip.rationale,
          clip.title, clip.hook,
        ]
      );

      insertedClips.push({
        id: clipId,
        video_id: video.id,
        start_time_seconds: clip.start_time_seconds,
        end_time_seconds: clip.end_time_seconds,
        duration_seconds: duration,
        strategic_rank: clip.strategic_rank,
        hook_score: clip.hook_score,
        rationale: clip.rationale,
        title: clip.title,
        hook: clip.hook,
        cdn_url: null,
        user_approved: null,
      });
    }

    await client.query('COMMIT');
    logger.info(`Re-analyzed ${insertedClips.length} clips for video ${video.id}`);
    res.json({ data: { video_id: video.id, clips: insertedClips } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

function runFfmpegCut(inputPath, outputPath, start, duration) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', String(start),
      '-i', inputPath,
      '-t', String(duration),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      outputPath,
    ];

    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) => reject(new Error(`Failed to spawn FFmpeg: ${err.message}`)));
  });
}

module.exports = router;
