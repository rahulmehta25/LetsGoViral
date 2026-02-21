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
const { spawn }          = require('child_process');
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
    const localVideoPath = path.join(TMP_DIR, `input_${videoId}${path.extname(uploadPath)}`);
    logger.info(`Downloading to ${localVideoPath}...`);
    await storage.bucket(UPLOADS_BUCKET).file(uploadPath).download({ destination: localVideoPath });
    logger.info('Download complete');

    const gcsUri = `gs://${UPLOADS_BUCKET}/${uploadPath}`;

    // 4. Get duration
    const videoDurationSeconds = await getVideoDuration(localVideoPath);
    logger.info(`Duration: ${videoDurationSeconds}s`);
    await db.query('UPDATE videos SET duration_seconds = $1 WHERE id = $2', [
      Math.round(videoDurationSeconds), videoId,
    ]);

    // 5. Extract audio to OGG_OPUS for Speech-to-Text (small files, fast upload)
    await updateStatus(videoId, 'TRANSCRIBING');
    const audioPath = path.join(TMP_DIR, `audio_${videoId}.ogg`);
    logger.info('Extracting audio to OGG_OPUS...');
    await new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', ['-y', '-i', localVideoPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '32k', audioPath]);
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg audio extraction exited ${code}`)));
      proc.on('error', reject);
    });

    const audioGcsPath = `audio/${videoId}.ogg`;
    await storage.bucket(UPLOADS_BUCKET).upload(audioPath, { destination: audioGcsPath });
    const audioGcsUri = `gs://${UPLOADS_BUCKET}/${audioGcsPath}`;
    logger.info(`Audio uploaded to ${audioGcsUri}`);
    fs.unlink(audioPath, () => {});

    // 6. Transcribe + Shot Detection + Silence Detection (parallel)
    logger.info('Starting transcription, shot detection, and silence detection in parallel...');
    const [transcriptionResult, shotTimestamps, silences] = await Promise.all([
      transcribeVideo(audioGcsUri),
      detectShotChanges(gcsUri),
      detectSilences(localVideoPath),
    ]);

    const { text: transcription, words } = transcriptionResult;
    logger.info(`Transcription (${transcription.length} chars, ${words.length} words): ${transcription.substring(0, 200)}...`);
    await db.query('UPDATE videos SET transcription = $1, updated_at = now() WHERE id = $2', [
      transcription, videoId,
    ]);

    logger.info(`Found ${shotTimestamps.length} shot changes`);
    await db.query('UPDATE videos SET shot_change_timestamps = $1, updated_at = now() WHERE id = $2', [
      JSON.stringify(shotTimestamps), videoId,
    ]);

    logger.info(`Found ${silences.length} silence segments`);

    // 7. AI clip analysis (multimodal — sends video + word transcript)
    await updateStatus(videoId, 'ANALYZING');
    const { rows: scriptRows } = await db.query(
      `SELECT content FROM scripts WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );
    const script = scriptRows[0]?.content?.text || null;

    logger.info('Analyzing clips with Gemini 2.5 Pro (multimodal)...');
    const rawClips = await analyzeClips({
      words,
      videoDurationSeconds,
      script,
      gcsUri,
    });
    logger.info(`Gemini identified ${rawClips.length} clips`);

    // 8. Map word indices to timestamps and snap to silence boundaries
    const clips = rawClips.map((clip) => {
      const rawStart = words[clip.start_word_index].start;
      const rawEnd   = words[clip.end_word_index].end;
      const snappedStart = snapToSilence(rawStart, silences, 2.0);
      const snappedEnd   = snapToSilence(rawEnd, silences, 2.0);
      logger.info(`Clip "${clip.title}": words[${clip.start_word_index}..${clip.end_word_index}] → ${rawStart.toFixed(2)}s-${rawEnd.toFixed(2)}s → snapped ${snappedStart.toFixed(2)}s-${snappedEnd.toFixed(2)}s`);
      return {
        ...clip,
        start_time: snappedStart,
        end_time: snappedEnd,
      };
    });

    // 9. Cut clips with FFmpeg
    await updateStatus(videoId, 'CLIPPING');
    const clipResults = [];

    for (const clip of clips) {
      const clipId = uuidv4();
      logger.info(`Cutting clip ${clipId}: ${clip.start_time.toFixed(2)}s - ${clip.end_time.toFixed(2)}s (rank #${clip.strategic_rank}, score ${clip.hook_score})`);

      const localPath = await cutClip(localVideoPath, clip.start_time, clip.end_time, clipId);
      const slug = clip.title
        ? clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
        : clipId;
      const destPath = `${projectId}/${videoId}/${slug}.mp4`;

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

      clipResults.push({ clipId, cdnUrl, title: clip.title });
      logger.info(`Clip ${clipId} uploaded: ${cdnUrl}`);
      fs.unlink(localPath, () => {});
    }

    // 10. Edit guidance (if script exists)
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

    // 11. Done
    await updateStatus(videoId, 'COMPLETED');
    logger.info(`\n========================================`);
    logger.info(`DONE! ${clipResults.length} clips generated for video ${videoId}`);
    logger.info(`========================================`);
    clipResults.forEach((c, i) => logger.info(`  ${i + 1}. [${c.title}] ${c.cdnUrl}`));

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
