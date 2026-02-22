'use strict';

require('dotenv').config();

const express            = require('express');
const { Storage }        = require('@google-cloud/storage');
const { v4: uuidv4 }    = require('uuid');
const fs                 = require('fs');
const path               = require('path');
const db                 = require('./db');
const { detectShotChanges }  = require('./services/videoIntelligence');
const { transcribeVideo }    = require('./services/speechToText');
const { analyzeClips }       = require('./services/geminiAnalyzer');
const { getVideoDuration, detectSilences, snapToSilence } = require('./services/ffmpeg');
const { logger }         = require('./utils/logger');

const storage  = new Storage();
const TMP_DIR  = process.env.TMP_DIR || '/tmp/clipora';

// Ensure tmp dir exists
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

/**
 * Core processing logic.
 * Accepts the GCS bucket name and object path, then runs the full pipeline:
 * transcribe → shot detect → silence detect → AI analysis → save clip candidates.
 */
async function processVideo(bucketName, objectName) {
  let videoId;

  try {
    logger.info(`Processing upload: gs://${bucketName}/${objectName}`);

    // ── 1. Find Video Record in DB ──────────────────────────────────────
    const { rows } = await db.query(
      'SELECT * FROM videos WHERE upload_path = $1',
      [objectName]
    );
    if (!rows[0]) throw new Error(`No video record found for path: ${objectName}`);

    videoId = rows[0].id;
    const projectId = rows[0].project_id;

    // ── 2. Mark as PROCESSING ───────────────────────────────────────────
    await updateVideoStatus(videoId, 'PROCESSING');

    // ── 3. Download Video to Temp Storage ───────────────────────────────
    const localVideoPath = path.join(TMP_DIR, `input_${videoId}.mp4`);
    logger.info(`Downloading video to ${localVideoPath}`);
    await storage.bucket(bucketName).file(objectName).download({ destination: localVideoPath });

    // ── 4. Get Duration ─────────────────────────────────────────────────
    const videoDurationSeconds = await getVideoDuration(localVideoPath);
    logger.info(`Video duration: ${videoDurationSeconds}s`);
    await db.query('UPDATE videos SET duration_seconds = $1 WHERE id = $2', [
      Math.round(videoDurationSeconds), videoId,
    ]);

    // ── 5. Transcribe + Shot Detection + Silence Detection (parallel) ───
    await updateVideoStatus(videoId, 'TRANSCRIBING');
    const gcsUri = `gs://${bucketName}/${objectName}`;
    logger.info('Starting transcription, shot detection, and silence detection in parallel...');

    const [transcriptionResult, shotTimestamps, silences] = await Promise.all([
      transcribeVideo(gcsUri),
      detectShotChanges(gcsUri),
      detectSilences(localVideoPath),
    ]);

    const { text: transcription, words } = transcriptionResult;
    await db.query('UPDATE videos SET transcription = $1, updated_at = now() WHERE id = $2', [
      transcription, videoId,
    ]);

    await db.query('UPDATE videos SET shot_change_timestamps = $1, updated_at = now() WHERE id = $2', [
      JSON.stringify(shotTimestamps), videoId,
    ]);

    // ── 6. AI Clip Analysis ─────────────────────────────────────────────
    await updateVideoStatus(videoId, 'ANALYZING');

    // Fetch script content if linked to this project
    const { rows: scriptRows } = await db.query(
      `SELECT content FROM scripts WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );
    const script = scriptRows[0]?.content?.text || null;

    const rawClips = await analyzeClips({
      words,
      videoDurationSeconds,
      script,
      gcsUri,
    });

    // Map word indices to timestamps and snap to silence boundaries
    const clips = rawClips.map((clip) => {
      const rawStart = words[clip.start_word_index].start;
      const rawEnd   = words[clip.end_word_index].end;
      return {
        ...clip,
        start_time: snapToSilence(rawStart, silences, 2.0),
        end_time:   snapToSilence(rawEnd, silences, 2.0),
      };
    });

    // ── 7. Save Clip Candidates (no ffmpeg cut yet) ─────────────────────
    const clipResults = [];
    for (const clip of clips) {
      const clipId = uuidv4();
      const slug = clip.title
        ? clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
        : clipId;
      const destPath = `${projectId}/${videoId}/${slug}.mp4`;

      await db.query(
        `INSERT INTO clips
           (id, video_id, processed_path, cdn_url,
            start_time_seconds, end_time_seconds, duration_seconds,
            strategic_rank, hook_score, rationale, title, hook)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          clipId, videoId, destPath, null,
          clip.start_time, clip.end_time,
          parseFloat((clip.end_time - clip.start_time).toFixed(3)),
          clip.strategic_rank, clip.hook_score, clip.rationale,
          clip.title, clip.hook,
        ]
      );

      clipResults.push({ clipId, start: clip.start_time, end: clip.end_time });
      logger.info(`Clip candidate ${clipId} saved: ${clip.start_time}s -> ${clip.end_time}s`);
    }

    // ── 8. Generate Long-Form Edit Guidance ─────────────────────────────
    if (script && transcription) {
      try {
        const { generateEditGuidance } = require('./services/editGuidance');
        logger.info('Generating long-form edit guidance...');
        const editGuidance = await generateEditGuidance(script, transcription);
        if (editGuidance) {
          await db.query(
            'UPDATE videos SET edit_guidance = $1, updated_at = now() WHERE id = $2',
            [JSON.stringify(editGuidance), videoId]
          );
          logger.info('Edit guidance saved successfully');
        }
      } catch (e) {
        logger.warn(`Edit guidance generation failed (non-critical): ${e.message}`);
      }
    }

    // ── 9. Mark as COMPLETED ────────────────────────────────────────────
    await updateVideoStatus(videoId, 'COMPLETED');
    logger.info(`Video ${videoId} processing complete. ${clipResults.length} clip candidates generated.`);

    // Clean up local video file
    fs.unlink(localVideoPath, () => {});
    return clipResults;
  } catch (err) {
    logger.error({ message: `Processing failed: ${err.message}`, stack: err.stack });
    if (videoId) await updateVideoStatus(videoId, 'FAILED').catch(() => {});
    throw err;
  }
}

async function updateVideoStatus(videoId, status) {
  await db.query(
    'UPDATE videos SET processing_status = $1, updated_at = now() WHERE id = $2',
    [status, videoId]
  );
  logger.info(`Video ${videoId} → ${status}`);
}

// ─── Dual-mode entry point ─────────────────────────────────────────────────
// Mode 1: Cloud Run Job — PUBSUB_MESSAGE env var contains base64-encoded JSON
// Mode 2: Cloud Run Service — Pub/Sub pushes HTTP POST with message in body

if (process.env.PUBSUB_MESSAGE) {
  // Job mode
  (async () => {
    try {
      const message = JSON.parse(Buffer.from(process.env.PUBSUB_MESSAGE, 'base64').toString('utf8'));
      await processVideo(message.bucket, message.name);
      process.exit(0);
    } catch (err) {
      logger.error({ message: `Job failed: ${err.message}`, stack: err.stack });
      process.exit(1);
    }
  })();
} else {
  // Service mode — start HTTP server for Pub/Sub push
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'clipora-video-processor' }));

  app.post('/', async (req, res) => {
    const pubsubMessage = req.body?.message;
    if (!pubsubMessage?.data) {
      return res.status(400).json({ error: 'No Pub/Sub message data' });
    }

    try {
      const payload = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString('utf8'));
      const { bucket, name } = payload;
      if (!bucket || !name) {
        return res.status(400).json({ error: 'Missing bucket or name in message' });
      }

      logger.info(`Pub/Sub push received: gs://${bucket}/${name}`);

      // Respond 200 immediately so Pub/Sub doesn't retry, then process in background
      res.status(200).json({ status: 'processing', bucket, name });

      // Process asynchronously (Cloud Run keeps the instance alive while there's work)
      processVideo(bucket, name).catch((err) => {
        logger.error({ message: `Async processing failed: ${err.message}`, stack: err.stack });
      });
    } catch (err) {
      logger.error({ message: `Failed to parse Pub/Sub message: ${err.message}` });
      return res.status(400).json({ error: 'Invalid message format' });
    }
  });

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    logger.info(`Video processor service listening on port ${PORT}`);
  });
}
