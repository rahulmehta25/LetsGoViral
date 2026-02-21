'use strict';

const speech = require('@google-cloud/speech');
const { logger } = require('../utils/logger');

const client = new speech.SpeechClient();

/**
 * Transcribe a video file stored in GCS using Speech-to-Text v2 long-running API.
 * Handles audio encoded in the video container directly.
 *
 * @param {string} gcsUri  e.g. gs://project-uploads/path/to/video.mp4
 * @returns {Promise<string>} Full transcription text
 */
async function transcribeVideo(gcsUri) {
  logger.info(`Speech-to-Text: transcribing ${gcsUri}`);

  const audio = { uri: gcsUri };

  const config = {
    languageCode: 'en-US',
    enableAutomaticPunctuation: true,
    enableWordTimeOffsets: true,          // Useful for future clip-to-word alignment
    model: 'video',                        // Best model for video content
    audioChannelCount: 2,
    enableSeparateRecognitionPerChannel: false,
  };

  const request = { audio, config };

  // Kick off long-running recognition
  const [operation] = await client.longRunningRecognize(request);
  const [response]  = await operation.promise();

  const transcription = response.results
    .map((result) => result.alternatives[0].transcript)
    .join(' ')
    .trim();

  logger.info(`Transcription complete: ${transcription.length} characters`);
  return transcription;
}

module.exports = { transcribeVideo };
