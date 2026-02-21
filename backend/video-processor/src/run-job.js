'use strict';

require('dotenv').config();

const express            = require('express');
const { Storage }        = require('@google-cloud/storage');
const { v4: uuidv4 }     = require('uuid');
const fs                 = require('fs');
const path               = require('path');
const { spawn }          = require('child_process');
const db                 = require('./db');
const { detectShotChanges }  = require('./services/videoIntelligence');
const { transcribeVideo }    = require('./services/speechToText');
const { analyzeClips }       = require('./services/geminiAnalyzer');
const { cutClip, getVideoDuration, detectSilences, snapToSilence, extractAudioOggOpus } = require('./services/ffmpeg');
const { logger }         = require('./utils/logger');

const storage     = new Storage();
const TMP_DIR     = process.env.TMP_DIR || '/tmp/clipora';
const UPLOADS_BUCKET   = process.env.GCS_UPLOADS_BUCKET;
const PROCESSED_BUCKET = process.env.GCS_PROCESSED_BUCKET;
const CDN_BASE_URL     = process.env.CDN_BASE_URL;

// Ensure tmp dir exists
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Video processing pipeline (extracted from former one-shot main())
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

    // ── 2. Find Video Record in DB ────────────────────────────────────────
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

    // ── 3. Mark as PROCESSING ─────────────────────────────────────────────
    await updateVideoStatus(videoId, 'PROCESSING');

    // ── 4. Download Video to Temp Storage ─────────────────────────────────
    const localVideoPath = path.join(TMP_DIR, `input_${videoId}.mp4`);
    tmpFiles.push(localVideoPath);
    logger.info(`Downloading video to ${localVideoPath}`);
    await storage.bucket(bucketName).file(objectName).download({ destination: localVideoPath });

    // ── 5. Get Duration ───────────────────────────────────────────────────
    const videoDurationSeconds = await getVideoDuration(localVideoPath);
    logger.info(`Video duration: ${videoDurationSeconds}s`);
    await db.query('UPDATE videos SET duration_seconds = $1 WHERE id = $2', [
      Math.round(videoDurationSeconds), videoId,
    ]);

    // ── 6. Extract audio to OGG_OPUS for faster Speech-to-Text upload ────
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

    // ── 7. Transcribe + Shot Detection + Silence Detection (parallel) ─────
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

    // ── 8. AI Clip Analysis ───────────────────────────────────────────────
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

    // ── 9. Cut Clips with FFmpeg ──────────────────────────────────────────
    await updateVideoStatus(videoId, 'CLIPPING');

    const clipResults = [];
    const usedSlugs = new Set();
    for (const clip of clips) {
      const clipId     = uuidv4();
      const localPath  = await cutClip(localVideoPath, clip.start_time, clip.end_time, clipId);
      let slug = clip.title
        ? clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
        : clipId;
      if (usedSlugs.has(slug)) slug = `${slug}-${clipId.slice(0, 8)}`;
      usedSlugs.add(slug);
      const destPath   = `${projectId}/${videoId}/${slug}.mp4`;

      // Upload to processed bucket
      await storage.bucket(PROCESSED_BUCKET).upload(localPath, {
        destination: destPath,
        metadata: { cacheControl: 'public, max-age=86400' },
      });

      const cdnUrl = CDN_BASE_URL
        ? `${CDN_BASE_URL}/${destPath}`
        : `https://storage.googleapis.com/${PROCESSED_BUCKET}/${destPath}`;

      // Insert clip record
      await db.query(
        `INSERT INTO clips
           (id, video_id, processed_path, cdn_url,
            start_time_seconds, end_time_seconds, duration_seconds,
            strategic_rank, hook_score, rationale, title, hook)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          clipId, videoId, destPath, cdnUrl,
          clip.start_time, clip.end_time,
          parseFloat((clip.end_time - clip.start_time).toFixed(3)),
          clip.strategic_rank, clip.hook_score, clip.rationale,
          clip.title, clip.hook,
        ]
      );

      clipResults.push({ clipId, cdnUrl });
      logger.info(`Clip ${clipId} uploaded: ${cdnUrl}`);

      // Clean up local clip file
      fs.unlink(localPath, () => {});
    }

    // ── 10. Generate Long-Form Edit Guidance ─────────────────────────────
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

    // ── 11. Mark as COMPLETED ─────────────────────────────────────────────
    await updateVideoStatus(videoId, 'COMPLETED');
    logger.info(`Video ${videoId} processing complete. ${clipResults.length} clips generated.`);

    // Clean up orphaned audio file from GCS
    try {
      await storage.bucket(bucketName).file(audioGcsPath).delete();
      logger.info(`Deleted temporary GCS audio: ${audioGcsPath}`);
    } catch (e) {
      logger.warn(`Failed to delete GCS audio ${audioGcsPath}: ${e.message}`);
    }
  } catch (err) {
    logger.error({ message: `Processing failed: ${err.message}`, stack: err.stack });
    if (videoId) await updateVideoStatus(videoId, 'FAILED').catch(() => {});
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

// ─────────────────────────────────────────────────────────────────────────────
// Express HTTP server — receives Pub/Sub push messages
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Pub/Sub push endpoint
app.post('/', (req, res) => {
  try {
    const pubsubMessage = req.body?.message;
    if (!pubsubMessage || !pubsubMessage.data) {
      logger.warn('Received request with no Pub/Sub message data');
      return res.status(200).send('No message data — ignored');
    }

    const decoded = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString('utf8'));
    const bucketName = decoded.bucket;
    const objectName = decoded.name;

    if (!bucketName || !objectName) {
      logger.warn('Pub/Sub message missing bucket or name');
      return res.status(200).send('Missing bucket/name — ignored');
    }

    logger.info(`Received Pub/Sub notification: gs://${bucketName}/${objectName}`);

    // Acknowledge immediately so Pub/Sub doesn't retry
    res.status(200).send('OK — processing started');

    // Process asynchronously (after response is sent)
    processVideo(bucketName, objectName).catch((err) => {
      logger.error({ message: `Async processVideo failed: ${err.message}`, stack: err.stack });
    });
  } catch (err) {
    logger.error({ message: `Error parsing Pub/Sub message: ${err.message}`, stack: err.stack });
    // Return 200 to avoid infinite retries on malformed messages
    res.status(200).send('Parse error — message dropped');
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  logger.info(`Video processor service listening on port ${PORT}`);
});
