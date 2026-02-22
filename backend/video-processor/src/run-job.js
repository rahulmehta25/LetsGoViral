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
const { getVideoDuration, detectSilences, snapToSilence, extractAudioOggOpus } = require('./services/ffmpeg');
const { logger }         = require('./utils/logger');

const storage  = new Storage();
const TMP_DIR  = process.env.TMP_DIR || '/tmp/clipora';

// Ensure tmp dir exists
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Video processing pipeline
// Saves clip candidates with timestamps — user reviews in UI, then ffmpeg cuts.
// ─────────────────────────────────────────────────────────────────────────────
const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || '600000', 10);

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function processVideo(bucketName, objectName) {
  let videoId;
  const tmpFiles = [];

  try {
    logger.info(`Processing upload: gs://${bucketName}/${objectName}`);

    // ── 1. Find Video Record in DB ──────────────────────────────────────
    const { rows } = await db.query(
      'SELECT * FROM videos WHERE upload_path = $1',
      [objectName]
    );
    if (!rows[0]) {
      logger.info(`No video record found for path: ${objectName} — skipping (likely non-video object)`);
      return;
    }

    videoId = rows[0].id;
    const projectId = rows[0].project_id;

    // Dedup: only process PENDING videos
    if (rows[0].processing_status !== 'PENDING') {
      logger.info(`Video ${videoId} is already ${rows[0].processing_status} — skipping`);
      return;
    }

    // ── 2. Mark as PROCESSING ───────────────────────────────────────────
    await updateVideoStatus(videoId, 'PROCESSING');

    // ── 3. Download Video to Temp Storage ───────────────────────────────
    const localVideoPath = path.join(TMP_DIR, `input_${videoId}.mp4`);
    tmpFiles.push(localVideoPath);
    logger.info(`Downloading video to ${localVideoPath}`);
    await storage.bucket(bucketName).file(objectName).download({ destination: localVideoPath });

    // ── 4. Get Duration ─────────────────────────────────────────────────
    const videoDurationSeconds = await getVideoDuration(localVideoPath);
    logger.info(`Video duration: ${videoDurationSeconds}s`);
    await db.query('UPDATE videos SET duration_seconds = $1 WHERE id = $2', [
      Math.round(videoDurationSeconds), videoId,
    ]);

    // ── 5. Extract audio to OGG_OPUS for faster Speech-to-Text ─────────
    await updateVideoStatus(videoId, 'TRANSCRIBING');
    const gcsUri = `gs://${bucketName}/${objectName}`;

    const audioPath = path.join(TMP_DIR, `audio_${videoId}.ogg`);
    tmpFiles.push(audioPath);
    logger.info('Extracting audio to OGG_OPUS...');
    await extractAudioOggOpus(localVideoPath, audioPath);

    const audioGcsPath = `audio/${videoId}.ogg`;
    await storage.bucket(bucketName).upload(audioPath, { destination: audioGcsPath });
    const audioGcsUri = `gs://${bucketName}/${audioGcsPath}`;
    logger.info(`Audio uploaded to ${audioGcsUri}`);

    // ── 6. Transcribe + Shot Detection + Silence Detection (parallel) ───
    logger.info('Starting transcription, shot detection, and silence detection in parallel...');

    const [transcriptionResult, shotTimestamps, silences] = await Promise.all([
      withTimeout(transcribeVideo(audioGcsUri), API_TIMEOUT_MS, 'transcribeVideo'),
      withTimeout(detectShotChanges(gcsUri), API_TIMEOUT_MS, 'detectShotChanges'),
      detectSilences(localVideoPath),
    ]);

    const { text: transcription, words } = transcriptionResult;
    await db.query('UPDATE videos SET transcription = $1, updated_at = now() WHERE id = $2', [
      transcription, videoId,
    ]);

    await db.query('UPDATE videos SET shot_change_timestamps = $1, updated_at = now() WHERE id = $2', [
      JSON.stringify(shotTimestamps), videoId,
    ]);

    // ── 7. AI Clip Analysis ─────────────────────────────────────────────
    await updateVideoStatus(videoId, 'ANALYZING');

    // Fetch script content if linked to this project
    const { rows: scriptRows } = await db.query(
      `SELECT content FROM scripts WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );
    const script = scriptRows[0]?.content?.text || null;

    const rawClips = await withTimeout(analyzeClips({
      words,
      videoDurationSeconds,
      script,
      gcsUri,
    }), API_TIMEOUT_MS, 'analyzeClips');

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

    // ── 8. Save Clip Candidates (no ffmpeg cut yet) ─────────────────────
    const clipResults = [];
    const usedSlugs = new Set();
    for (const clip of clips) {
      const clipId = uuidv4();
      let slug = clip.title
        ? clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
        : clipId;
      if (usedSlugs.has(slug)) slug = `${slug}-${clipId.slice(0, 8)}`;
      usedSlugs.add(slug);
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

    // ── 9. Generate Long-Form Edit Guidance ─────────────────────────────
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

    // ── 10. Mark as COMPLETED ───────────────────────────────────────────
    await updateVideoStatus(videoId, 'COMPLETED');
    logger.info(`Video ${videoId} processing complete. ${clipResults.length} clip candidates generated.`);

    // Clean up orphaned audio file from GCS
    try {
      await storage.bucket(bucketName).file(audioGcsPath).delete();
      logger.info(`Deleted temporary GCS audio: ${audioGcsPath}`);
    } catch (e) {
      logger.warn(`Failed to delete GCS audio ${audioGcsPath}: ${e.message}`);
    }

    return clipResults;
  } catch (err) {
    logger.error({ message: `Processing failed: ${err.message}`, stack: err.stack });
    if (videoId) await updateVideoStatus(videoId, 'FAILED').catch(() => {});
    throw err;
  } finally {
    for (const f of tmpFiles) {
      fs.unlink(f, () => {});
    }
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

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'clipora-video-processor' }));

  app.post('/', (req, res) => {
    try {
      const pubsubMessage = req.body?.message;
      if (!pubsubMessage || !pubsubMessage.data) {
        logger.warn('Received request with no Pub/Sub message data');
        return res.status(200).send('No message data — ignored');
      }

      const decoded = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString('utf8'));
      const { bucket, name } = decoded;

      if (!bucket || !name) {
        logger.warn('Pub/Sub message missing bucket or name');
        return res.status(200).send('Missing bucket/name — ignored');
      }

      logger.info(`Pub/Sub push received: gs://${bucket}/${name}`);

      // Acknowledge immediately so Pub/Sub doesn't retry
      res.status(200).send('OK — processing started');

      // Process asynchronously (Cloud Run keeps the instance alive while there's work)
      processVideo(bucket, name).catch((err) => {
        logger.error({ message: `Async processing failed: ${err.message}`, stack: err.stack });
      });
    } catch (err) {
      logger.error({ message: `Error parsing Pub/Sub message: ${err.message}`, stack: err.stack });
      // Return 200 to avoid infinite retries on malformed messages
      res.status(200).send('Parse error — message dropped');
    }
  });

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    logger.info(`Video processor service listening on port ${PORT}`);
  });
}
