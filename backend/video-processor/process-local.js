'use strict';

/**
 * Local video processing script — bypasses Pub/Sub.
 * Usage: node process-local.js <video_id>
 *
 * This downloads the video from GCS, processes it locally with FFmpeg + AI,
 * and uploads the clips back to GCS.
 */

require('dotenv').config();

const { Storage }        = require('@google-cloud/storage');
const { v4: uuidv4 }     = require('uuid');
const fs                 = require('fs');
const path               = require('path');
const db                 = require('./src/db');
const { detectShotChanges }  = require('./src/services/videoIntelligence');
const { transcribeVideo }    = require('./src/services/speechToText');
const { analyzeClips }       = require('./src/services/geminiAnalyzer');
const { cutClip, getVideoDuration, detectSilences, snapToSilence } = require('./src/services/ffmpeg');
const { logger }         = require('./src/utils/logger');

const storage     = new Storage();
const TMP_DIR     = process.env.TMP_DIR || '/tmp/clipora';
const UPLOADS_BUCKET   = process.env.GCS_UPLOADS_BUCKET;
const PROCESSED_BUCKET = process.env.GCS_PROCESSED_BUCKET;
const CDN_BASE_URL     = process.env.CDN_BASE_URL;

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error('Usage: node process-local.js <video_id>');
    process.exit(1);
  }

  try {
    // 1. Find video record
    const { rows } = await db.query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (!rows[0]) throw new Error(`No video found with id: ${videoId}`);

    const video = rows[0];
    const projectId = video.project_id;
    const uploadPath = video.upload_path;

    logger.info(`Processing video: ${videoId} (${video.original_filename})`);
    logger.info(`Upload path: gs://${UPLOADS_BUCKET}/${uploadPath}`);

    // 2. Mark as PROCESSING
    await updateStatus(videoId, 'PROCESSING');

    // 3. Download from GCS
    const localVideoPath = path.join(TMP_DIR, `input_${videoId}.mp4`);
    logger.info(`Downloading to ${localVideoPath}...`);
    await storage.bucket(UPLOADS_BUCKET).file(uploadPath).download({ destination: localVideoPath });
    logger.info('Download complete');

    // 4. Get duration
    const videoDurationSeconds = await getVideoDuration(localVideoPath);
    logger.info(`Duration: ${videoDurationSeconds}s`);
    await db.query('UPDATE videos SET duration_seconds = $1 WHERE id = $2', [
      Math.round(videoDurationSeconds), videoId,
    ]);

    // 5. Transcribe + Shot Detection + Silence Detection (parallel)
    await updateStatus(videoId, 'TRANSCRIBING');
    const gcsUri = `gs://${UPLOADS_BUCKET}/${uploadPath}`;
    logger.info('Starting transcription, shot detection, and silence detection in parallel...');

    const [transcriptionResult, shotTimestamps, silences] = await Promise.all([
      transcribeVideo(gcsUri),
      detectShotChanges(gcsUri),
      detectSilences(localVideoPath),
    ]);

    const { text: transcription, words } = transcriptionResult;
    logger.info(`Transcription: ${transcription.substring(0, 200)}...`);
    await db.query('UPDATE videos SET transcription = $1, updated_at = now() WHERE id = $2', [
      transcription, videoId,
    ]);

    logger.info(`Found ${shotTimestamps.length} shot changes`);
    await db.query('UPDATE videos SET shot_change_timestamps = $1, updated_at = now() WHERE id = $2', [
      JSON.stringify(shotTimestamps), videoId,
    ]);

    // 7. AI clip analysis
    await updateStatus(videoId, 'ANALYZING');
    const { rows: scriptRows } = await db.query(
      `SELECT content FROM scripts WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );
    const script = scriptRows[0]?.content?.text || null;

    logger.info('Analyzing clips with Gemini...');
    const rawClips = await analyzeClips({
      words,
      videoDurationSeconds,
      script,
      gcsUri,
    });
    logger.info(`Gemini identified ${rawClips.length} clips`);

    const clips = rawClips.map((clip) => {
      const rawStart = words[clip.start_word_index].start;
      const rawEnd   = words[clip.end_word_index].end;
      return {
        ...clip,
        start_time: snapToSilence(rawStart, silences, 2.0),
        end_time:   snapToSilence(rawEnd, silences, 2.0),
      };
    });

    // 8. Cut clips with FFmpeg
    await updateStatus(videoId, 'CLIPPING');
    const clipResults = [];

    for (const clip of clips) {
      const clipId = uuidv4();
      logger.info(`Cutting clip ${clipId}: ${clip.start_time}s - ${clip.end_time}s (rank #${clip.strategic_rank})`);

      const localPath = await cutClip(localVideoPath, clip.start_time, clip.end_time, clipId);
      const destPath = `${projectId}/${videoId}/${clipId}.mp4`;

      // Upload to processed bucket
      await storage.bucket(PROCESSED_BUCKET).upload(localPath, {
        destination: destPath,
        metadata: { cacheControl: 'public, max-age=86400' },
      });

      const cdnUrl = CDN_BASE_URL
        ? `${CDN_BASE_URL}/${destPath}`
        : `https://storage.googleapis.com/${PROCESSED_BUCKET}/${destPath}`;

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
      fs.unlink(localPath, () => {});
    }

    // 9. Edit guidance (if script exists)
    if (script && transcription) {
      try {
        const { generateEditGuidance } = require('./src/services/editGuidance');
        logger.info('Generating edit guidance...');
        const editGuidance = await generateEditGuidance(script, transcription);
        if (editGuidance) {
          await db.query(
            'UPDATE videos SET edit_guidance = $1, updated_at = now() WHERE id = $2',
            [JSON.stringify(editGuidance), videoId]
          );
          logger.info('Edit guidance saved');
        }
      } catch (e) {
        logger.warn(`Edit guidance failed (non-critical): ${e.message}`);
      }
    }

    // 10. Done
    await updateStatus(videoId, 'COMPLETED');
    logger.info(`\nDONE! ${clipResults.length} clips generated for video ${videoId}`);
    clipResults.forEach((c, i) => logger.info(`  ${i + 1}. ${c.cdnUrl}`));

    fs.unlink(localVideoPath, () => {});
    process.exit(0);
  } catch (err) {
    logger.error(`Processing failed: ${err.message}`);
    logger.error(err.stack);
    await updateStatus(videoId, 'FAILED').catch(() => {});
    process.exit(1);
  }
}

async function updateStatus(videoId, status) {
  await db.query(
    'UPDATE videos SET processing_status = $1, updated_at = now() WHERE id = $2',
    [status, videoId]
  );
  logger.info(`Video ${videoId} -> ${status}`);
}

main();
