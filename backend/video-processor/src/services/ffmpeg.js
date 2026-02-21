'use strict';

const { spawn } = require('child_process');
const path      = require('path');
const { logger } = require('../utils/logger');

const TMP_DIR = process.env.TMP_DIR || '/tmp/clipora';

/**
 * Cut a clip from a source video using FFmpeg.
 * Uses input seeking (-ss before -i) for fast seeking on large files.
 * Re-encodes with -preset ultrafast for frame-accurate cuts.
 *
 * @param {string} inputPath  Absolute path to the source video file
 * @param {number} startTime  Start time in seconds (decimal supported)
 * @param {number} endTime    End time in seconds
 * @param {string} clipId     UUID used to name the output file
 * @returns {Promise<string>} Absolute path to the output clip file
 */
async function cutClip(inputPath, startTime, endTime, clipId) {
  const duration   = endTime - startTime;
  const outputPath = path.join(TMP_DIR, `clip_${clipId}.mp4`);

  const args = [
    '-y',                        // overwrite output without asking
    '-ss', String(startTime),    // input seek — placed BEFORE -i for fast seeking
    '-i', inputPath,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',      // fastest re-encode; frame-accurate cuts
    '-crf', '23',                // reasonable quality
    '-c:a', 'aac',
    '-movflags', '+faststart',   // moov atom at start for mobile progressive playback
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // ensure even dimensions for libx264
    outputPath,
  ];

  logger.info(`FFmpeg cutting clip ${clipId}: ${startTime}s → ${endTime}s (${duration.toFixed(2)}s)`);

  await runFFmpeg(args);
  return outputPath;
}

/**
 * Get the duration of a video file in seconds.
 */
async function getVideoDuration(inputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      inputPath,
    ]);

    let stdout = '';
    proc.stdout.on('data', d => (stdout += d));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
      try {
        const info     = JSON.parse(stdout);
        const duration = parseFloat(info.format.duration);
        resolve(duration);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Internal: spawn ffmpeg and wait for it to exit cleanly.
 */
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);

    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('close', (code) => {
      if (code === 0) return resolve();
      logger.error(`FFmpeg error (exit ${code}):\n${stderr}`);
      reject(new Error(`FFmpeg exited with code ${code}`));
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Detect silent segments in the audio track using ffmpeg silencedetect filter.
 *
 * @param {string} videoPath  Absolute path to the video file
 * @param {number} [noiseDb=-30]  Noise threshold in dB
 * @param {number} [minDuration=0.3]  Minimum silence duration in seconds
 * @returns {Promise<Array<{start: number, end: number}>>}
 */
async function detectSilences(videoPath, noiseDb = -30, minDuration = 0.3) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', videoPath,
      '-af', `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
      '-f', 'null', '-',
    ];

    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('close', (code) => {
      // silencedetect outputs to stderr even on success; exit code 0 expected
      const silences = [];
      const startRe = /silence_start:\s*([\d.]+)/g;
      const endRe   = /silence_end:\s*([\d.]+)/g;

      const starts = [];
      const ends   = [];
      let m;
      while ((m = startRe.exec(stderr)) !== null) starts.push(parseFloat(m[1]));
      while ((m = endRe.exec(stderr)) !== null)   ends.push(parseFloat(m[1]));

      const count = Math.min(starts.length, ends.length);
      for (let i = 0; i < count; i++) {
        silences.push({ start: starts[i], end: ends[i] });
      }

      logger.info(`Detected ${silences.length} silence segments`);
      resolve(silences);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg for silence detection: ${err.message}`));
    });
  });
}

/**
 * Snap a timestamp to the nearest silence midpoint within a search window.
 * Returns the original timestamp if no silence is found within the window.
 *
 * @param {number} timestamp  Target timestamp in seconds
 * @param {Array<{start: number, end: number}>} silences  Silence segments
 * @param {number} [window=2.0]  Search window in seconds (+/-)
 * @returns {number} Snapped timestamp
 */
function snapToSilence(timestamp, silences, window = 2.0) {
  let bestMid = timestamp;
  let bestDist = Infinity;

  for (const s of silences) {
    const mid = (s.start + s.end) / 2;
    const dist = Math.abs(mid - timestamp);
    if (dist <= window && dist < bestDist) {
      bestDist = dist;
      bestMid = mid;
    }
  }

  return bestMid;
}

module.exports = { cutClip, getVideoDuration, detectSilences, snapToSilence };
