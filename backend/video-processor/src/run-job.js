'use strict';

require('dotenv').config();

const { Storage }        = require('@google-cloud/storage');
const { v4: uuidv4 }     = require('uuid');
const fs                 = require('fs');
const path               = require('path');
const db                 = require('./db');
const { detectShotChanges }  = require('./services/videoIntelligence');
const { transcribeVideo }    = require('./services/speechToText');
const { analyzeClips }       = require('./services/geminiAnalyzer');
const { cutClip, getVideoDuration } = require('./services/ffmpeg');
const { logger }         = require('./utils/logger');

const storage     = new Storage();
const TMP_DIR     = process.env.TMP_DIR || '/tmp/clipora';
const UPLOADS_BUCKET   = process.env.GCS_UPLOADS_BUCKET;
const PROCESSED_BUCKET = process.env.GCS_PROCESSED_BUCKET;
const CDN_BASE_URL     = process.env.CDN_BASE_URL;

// Ensure tmp dir exists
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

/**
 * Main entry point.
 * Cloud Run Jobs receive the Pub/Sub message as the PUBSUB_MESSAGE env var
 * (base64-encoded JSON). Falls back to CLOUD_RUN_TASK_INDEX for direct invocation.
 */
async function main() {
  let videoId;

  try {
    // ── 1. Parse Pub/Sub Message ──────────────────────────────────────────
    const rawMessage = process.env.PUBSUB_MESSAGE;
    if (!rawMessage) throw new Error('PUBSUB_MESSAGE env var not set');

    const message    = JSON.parse(Buffer.from(rawMessage, 'base64').toString('utf8'));
    const bucketName = message.bucket;
    const objectName = message.name;

    logger.info(`Processing upload: gs://${bucketName}/${objectName}`);

    // ── 2. Find Video Record in DB ────────────────────────────────────────
    const { rows } = await db.query(
      'SELECT * FROM videos WHERE upload_path = $1',
      [objectName]
    );
    if (!rows[0]) throw new Error(`No video record found for path: ${objectName}`);

    videoId = rows[0].id;
    const projectId = rows[0].project_id;

    // ── 3. Mark as PROCESSING ─────────────────────────────────────────────
    await updateVideoStatus(videoId, 'PROCESSING');

    // ── 4. Download Video to Temp Storage ─────────────────────────────────
    const localVideoPath = path.join(TMP_DIR, `input_${videoId}.mp4`);
    logger.info(`Downloading video to ${localVideoPath}`);
    await storage.bucket(bucketName).file(objectName).download({ destination: localVideoPath });

    // ── 5. Get Duration ───────────────────────────────────────────────────
    const videoDurationSeconds = await getVideoDuration(localVideoPath);
    logger.info(`Video duration: ${videoDurationSeconds}s`);
    await db.query('UPDATE videos SET duration_seconds = $1 WHERE id = $2', [
      Math.round(videoDurationSeconds), videoId,
    ]);

    // ── 6. Transcribe ─────────────────────────────────────────────────────
    await updateVideoStatus(videoId, 'TRANSCRIBING');
    const gcsUri      = `gs://${bucketName}/${objectName}`;
    const transcription = await transcribeVideo(gcsUri);
    await db.query('UPDATE videos SET transcription = $1, updated_at = now() WHERE id = $2', [
      transcription, videoId,
    ]);

    // ── 7. Shot Detection ─────────────────────────────────────────────────
    const shotTimestamps = await detectShotChanges(gcsUri);
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

    const clips = await analyzeClips({
      transcription,
      shotTimestamps,
      videoDurationSeconds,
      script,
    });

    // ── 9. Cut Clips with FFmpeg ──────────────────────────────────────────
    await updateVideoStatus(videoId, 'CLIPPING');

    const clipResults = [];
    for (const clip of clips) {
      const clipId     = uuidv4();
      const localPath  = await cutClip(localVideoPath, clip.start_time, clip.end_time, clipId);
      const destPath   = `${projectId}/${videoId}/${clipId}.mp4`;

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
            strategic_rank, hook_score, rationale)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          clipId, videoId, destPath, cdnUrl,
          clip.start_time, clip.end_time,
          parseFloat((clip.end_time - clip.start_time).toFixed(3)),
          clip.strategic_rank, clip.hook_score, clip.rationale,
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

    // Clean up local video file
    fs.unlink(localVideoPath, () => {});
    process.exit(0);
  } catch (err) {
    logger.error({ message: `Processing failed: ${err.message}`, stack: err.stack });
    if (videoId) await updateVideoStatus(videoId, 'FAILED').catch(() => {});
    process.exit(1);
  }
}

async function updateVideoStatus(videoId, status) {
  await db.query(
    'UPDATE videos SET processing_status = $1, updated_at = now() WHERE id = $2',
    [status, videoId]
  );
  logger.info(`Video ${videoId} → ${status}`);
}

main();
