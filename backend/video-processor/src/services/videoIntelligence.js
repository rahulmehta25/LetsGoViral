'use strict';

const video = require('@google-cloud/video-intelligence');
const { logger } = require('../utils/logger');

const client = new video.VideoIntelligenceServiceClient();

/**
 * Run shot-change detection on a GCS video file.
 * Returns an array of shot timestamps: [{ startTime, endTime }] in seconds.
 *
 * @param {string} gcsUri  e.g. gs://project-uploads/path/to/video.mp4
 */
async function detectShotChanges(gcsUri) {
  logger.info(`Video Intelligence: detecting shots for ${gcsUri}`);

  const [operation] = await client.annotateVideo({
    inputUri: gcsUri,
    features: ['SHOT_CHANGE_DETECTION'],
  });

  // Long-running operation — poll until complete
  const [result] = await operation.promise();

  const shots = result.annotationResults[0].shotAnnotations || [];

  return shots.map((shot) => ({
    startTime: shot.startTimeOffset
      ? (shot.startTimeOffset.seconds || 0) + (shot.startTimeOffset.nanos || 0) / 1e9
      : 0,
    endTime: shot.endTimeOffset
      ? (shot.endTimeOffset.seconds || 0) + (shot.endTimeOffset.nanos || 0) / 1e9
      : 0,
  }));
}

module.exports = { detectShotChanges };
