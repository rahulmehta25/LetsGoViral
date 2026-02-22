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
 * Mix sfxItems onto a clip video at their respective timestamps.
 * Each item may include an optional `volume` (0.0–1.0, default 1.0)
 * to control per-track loudness (useful for quieter background music).
 * @param {string} clipCdnUrl - CDN URL of the source clip video
 * @param {Array<{sfx_url: string, timestamp_seconds: number, volume?: number}>} sfxItems
 * @returns {Promise<Buffer>} - Buffer of the output MP4
 */
async function mixSfxOntoVideo(clipCdnUrl, sfxItems) {
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
    // Inputs: [0] video, [1..N] sfx files
    const ffmpegArgs = ['-i', videoPath];
    for (const sfxPath of sfxPaths) {
      ffmpegArgs.push('-i', sfxPath);
    }

    // Build filter_complex
    // Each SFX: [N:a]volume=V,adelay=Xms|Xms[sN]
    // Then mix: [0:a][s0][s1]...[sN-1]amix=inputs=M:normalize=0[aout]
    const delayFilters = sfxItems.map((item, i) => {
      const delayMs = Math.round(item.timestamp_seconds * 1000);
      const vol = typeof item.volume === 'number' ? Math.max(0, Math.min(1, item.volume)) : 1.0;
      return `[${i + 1}:a]volume=${vol},adelay=${delayMs}|${delayMs}[s${i}]`;
    });

    let mixInputs;
    let amixInputCount;
    if (videoHasAudio) {
      mixInputs = `[0:a]${sfxItems.map((_, i) => `[s${i}]`).join('')}`;
      amixInputCount = sfxItems.length + 1;
    } else {
      // No audio track — mix SFX only with a silent base using aevalsrc
      delayFilters.unshift('aevalsrc=0:c=stereo:r=44100:d=60[silence]');
      mixInputs = `[silence]${sfxItems.map((_, i) => `[s${i}]`).join('')}`;
      amixInputCount = sfxItems.length + 1;
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
