'use strict';

const { Storage } = require('@google-cloud/storage');
const { logger }  = require('../utils/logger');

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const PROCESSED_BUCKET    = process.env.GCS_PROCESSED_BUCKET;
const CDN_BASE_URL        = process.env.CDN_BASE_URL;

const MAX_SFX_DURATION   = 5;
const MAX_MUSIC_DURATION = 22;

/**
 * Call ElevenLabs /v1/sound-generation and return the audio as a Buffer.
 * @param {string} text - The text prompt describing the sound.
 * @param {number} durationSeconds - Requested duration (capped by type limits upstream).
 * @returns {Promise<Buffer>}
 */
async function generateAudio(text, durationSeconds) {
  if (!ELEVEN_LABS_API_KEY) {
    throw new Error('ELEVEN_LABS_API_KEY is not configured');
  }

  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key':   ELEVEN_LABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      duration_seconds:    durationSeconds,
      prompt_influence:    0.3,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch { /* ignore */ }
    throw new Error(`ElevenLabs API error ${response.status}: ${detail}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Upload an audio buffer to GCS and return the public CDN URL.
 * @param {Buffer} buffer
 * @param {string} clipId
 * @param {'sfx'|'music'} type
 * @returns {Promise<string>} cdnUrl
 */
async function uploadAudioToGCS(buffer, clipId, type) {
  const storage = new Storage();
  const destPath = `sounds/${clipId}/${type}.mp3`;

  await storage.bucket(PROCESSED_BUCKET).file(destPath).save(buffer, {
    contentType: 'audio/mpeg',
    metadata: { cacheControl: 'public, max-age=86400' },
  });

  if (CDN_BASE_URL) {
    return `${CDN_BASE_URL}/${destPath}`;
  }
  return `https://storage.googleapis.com/${PROCESSED_BUCKET}/${destPath}`;
}

/**
 * Upload a per-SFX audio buffer to GCS and return the public CDN URL.
 * GCS path: sounds/{clipId}/sfx_{index}.mp3
 * @param {Buffer} buffer
 * @param {string} clipId
 * @param {number} index - positional index of the SFX in the sfx_data array
 * @returns {Promise<string>} cdnUrl
 */
async function uploadSfxToGCS(buffer, clipId, index) {
  const storage = new Storage();
  const destPath = `sounds/${clipId}/sfx_${index}.mp3`;

  await storage.bucket(PROCESSED_BUCKET).file(destPath).save(buffer, {
    contentType: 'audio/mpeg',
    metadata: { cacheControl: 'public, max-age=86400' },
  });

  if (CDN_BASE_URL) {
    return `${CDN_BASE_URL}/${destPath}`;
  }
  return `https://storage.googleapis.com/${PROCESSED_BUCKET}/${destPath}`;
}

module.exports = {
  generateAudio,
  uploadAudioToGCS,
  uploadSfxToGCS,
  MAX_SFX_DURATION,
  MAX_MUSIC_DURATION,
};
