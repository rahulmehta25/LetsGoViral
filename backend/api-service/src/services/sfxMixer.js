'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { logger } = require('../utils/logger');

const execFileAsync = promisify(execFile);

const PROCESSED_BUCKET = process.env.GCS_PROCESSED_BUCKET;
const CDN_BASE_URL = process.env.CDN_BASE_URL;

/**
 * Download a URL to a Buffer using the built-in fetch API.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function downloadToBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Mix sfxItems (and optional background music) onto a clip video.
 * Each SFX item may include an optional `volume` (0.0–1.0, default 1.0).
 * @param {string} clipCdnUrl - CDN URL of the source clip video
 * @param {Array<{sfx_url: string, timestamp_seconds: number, volume?: number}>} sfxItems
 * @param {{track_url: string, volume?: number} | null} [musicData] - optional background music
 * @returns {Promise<Buffer>} - Buffer of the output MP4
 */
async function mixSfxOntoVideo(clipCdnUrl, sfxItems, musicData) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sfxmix-'));
  const tmpFiles = [];

  try {
    // Download the clip video
    const videoPath = path.join(tmpDir, 'input.mp4');
    const videoBuffer = await downloadToBuffer(clipCdnUrl);
    await fs.promises.writeFile(videoPath, videoBuffer);
    tmpFiles.push(videoPath);

    // Download each SFX audio file
    const sfxPaths = [];
    for (let i = 0; i < sfxItems.length; i++) {
      const sfxPath = path.join(tmpDir, `sfx_${i}.mp3`);
      const sfxBuffer = await downloadToBuffer(sfxItems[i].sfx_url);
      await fs.promises.writeFile(sfxPath, sfxBuffer);
      sfxPaths.push(sfxPath);
      tmpFiles.push(sfxPath);
    }

    // Download background music track (if selected)
    let musicPath = null;
    if (musicData && musicData.track_url) {
      musicPath = path.join(tmpDir, 'music.mp3');
      const musicBuffer = await downloadToBuffer(musicData.track_url);
      await fs.promises.writeFile(musicPath, musicBuffer);
      tmpFiles.push(musicPath);
    }

    // Check if video has an audio stream using ffprobe
    let videoHasAudio = true;
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-select_streams', 'a',
        videoPath,
      ]);
      const probeResult = JSON.parse(stdout);
      videoHasAudio = Array.isArray(probeResult.streams) && probeResult.streams.length > 0;
    } catch {
      videoHasAudio = false;
    }

    const outputPath = path.join(tmpDir, 'output.mp4');
    tmpFiles.push(outputPath);

    // Build FFmpeg args
    // Inputs: [0] video, [1..N] sfx files, [N+1] music (if present)
    const ffmpegArgs = ['-i', videoPath];
    for (const sfxPath of sfxPaths) {
      ffmpegArgs.push('-i', sfxPath);
    }
    const musicInputIndex = sfxItems.length + 1; // input index for music file
    if (musicPath) {
      ffmpegArgs.push('-i', musicPath);
    }

    // Build filter_complex
    // Each SFX: [N:a]volume=V,adelay=Xms|Xms[sN]
    const delayFilters = sfxItems.map((item, i) => {
      const delayMs = Math.round(item.timestamp_seconds * 1000);
      const vol = typeof item.volume === 'number' ? Math.max(0, Math.min(1, item.volume)) : 1.0;
      return `[${i + 1}:a]volume=${vol},adelay=${delayMs}|${delayMs}[s${i}]`;
    });

    // Background music: apply volume and loop with aloop to cover the clip duration
    if (musicPath) {
      const musicVol = typeof musicData.volume === 'number' ? Math.max(0, Math.min(1, musicData.volume)) : 0.5;
      delayFilters.push(`[${musicInputIndex}:a]aloop=loop=-1:size=2e+09,volume=${musicVol}[bgm]`);
    }

    let mixInputs;
    let amixInputCount;
    const sfxLabels = sfxItems.map((_, i) => `[s${i}]`).join('');
    const musicLabel = musicPath ? '[bgm]' : '';

    if (videoHasAudio) {
      mixInputs = `[0:a]${sfxLabels}${musicLabel}`;
      amixInputCount = sfxItems.length + 1 + (musicPath ? 1 : 0);
    } else {
      // No audio track — mix with a silent base using aevalsrc
      delayFilters.unshift('aevalsrc=0:c=stereo:r=44100:d=60[silence]');
      mixInputs = `[silence]${sfxLabels}${musicLabel}`;
      amixInputCount = sfxItems.length + 1 + (musicPath ? 1 : 0);
    }

    const filterComplex = [
      ...delayFilters,
      `${mixInputs}amix=inputs=${amixInputCount}:normalize=0[aout]`,
    ].join(';');

    ffmpegArgs.push(
      '-filter_complex', filterComplex,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y',
      outputPath,
    );

    logger.info(`FFmpeg mix command: ffmpeg ${ffmpegArgs.join(' ')}`);
    await execFileAsync('ffmpeg', ffmpegArgs);

    const outputBuffer = await fs.promises.readFile(outputPath);
    return outputBuffer;
  } finally {
    // Clean up all temp files
    for (const f of tmpFiles) {
      await fs.promises.unlink(f).catch(() => {});
    }
    await fs.promises.rmdir(tmpDir).catch(() => {});
  }
}

/**
 * Upload a mixed video buffer to GCS and return the CDN URL.
 * GCS path: sfx-videos/{clipId}/output.mp4
 * @param {Buffer} buffer
 * @param {string} clipId
 * @returns {Promise<string>} cdnUrl
 */
async function uploadMixedVideoToGCS(buffer, clipId) {
  const storage = new Storage();
  const destPath = `sfx-videos/${clipId}/output.mp4`;

  await storage.bucket(PROCESSED_BUCKET).file(destPath).save(buffer, {
    contentType: 'video/mp4',
    metadata: { cacheControl: 'public, max-age=3600' },
  });

  if (CDN_BASE_URL) {
    return `${CDN_BASE_URL}/${destPath}`;
  }
  return `https://storage.googleapis.com/${PROCESSED_BUCKET}/${destPath}`;
}

module.exports = { downloadToBuffer, mixSfxOntoVideo, uploadMixedVideoToGCS };
