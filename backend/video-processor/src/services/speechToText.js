'use strict';

const speech = require('@google-cloud/speech');
const { logger } = require('../utils/logger');

const client = new speech.SpeechClient();

/**
 * Parse a Google Duration proto (e.g. { seconds: '12', nanos: 500000000 }) to float seconds.
 */
function parseTimestamp(duration) {
  const seconds = parseInt(duration.seconds || '0', 10);
  const nanos   = parseInt(duration.nanos || '0', 10);
  return seconds + nanos / 1e9;
}

/**
 * Transcribe a video file stored in GCS using Speech-to-Text v2 long-running API.
 * Handles audio encoded in the video container directly.
 *
 * @param {string} gcsUri  e.g. gs://project-uploads/path/to/video.mp4
 * @returns {Promise<{text: string, words: Array<{word: string, start: number, end: number}>}>}
 */
async function transcribeVideo(gcsUri) {
  logger.info(`Speech-to-Text: transcribing ${gcsUri}`);

  const audio = { uri: gcsUri };

  const isOgg = gcsUri.endsWith('.ogg');

  const config = {
    languageCode: 'en-US',
    enableAutomaticPunctuation: true,
    enableWordTimeOffsets: true,
    model: isOgg ? 'default' : 'video',
    audioChannelCount: isOgg ? 1 : 2,
    ...(isOgg ? { encoding: 'OGG_OPUS', sampleRateHertz: 16000 } : {}),
    enableSeparateRecognitionPerChannel: false,
  };

  const request = { audio, config };

  // Kick off long-running recognition
  const [operation] = await client.longRunningRecognize(request);
  const [response]  = await operation.promise();

  const text = response.results
    .map((result) => result.alternatives[0].transcript)
    .join(' ')
    .trim();

  // Extract word-level timestamps for clip alignment
  const words = [];
  for (const result of response.results) {
    const alt = result.alternatives[0];
    if (alt.words) {
      for (const w of alt.words) {
        words.push({
          word:  w.word,
          start: parseTimestamp(w.startTime),
          end:   parseTimestamp(w.endTime),
        });
      }
    }
  }

  logger.info(`Transcription complete: ${text.length} characters, ${words.length} words with timestamps`);
  return { text, words };
}

module.exports = { transcribeVideo };
