'use strict';

const { Storage } = require('@google-cloud/storage');

const storage       = new Storage();
const UPLOADS_BUCKET   = process.env.GCS_UPLOADS_BUCKET;
const PROCESSED_BUCKET = process.env.GCS_PROCESSED_BUCKET;
const CDN_BASE_URL     = process.env.CDN_BASE_URL; // e.g. https://cdn.clipora.io

/**
 * Generate a signed URL for the mobile client to PUT a video directly to GCS.
 * URL expires in 15 minutes.
 */
async function generateUploadSignedUrl(objectPath, contentType) {
  const [url] = await storage
    .bucket(UPLOADS_BUCKET)
    .file(objectPath)
    .generateSignedUrl({
      version: 'v4',
      action:  'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });
  return url;
}

/**
 * Generate a CDN URL for a processed clip.
 */
function buildCdnUrl(processedPath) {
  if (CDN_BASE_URL) return `${CDN_BASE_URL}/${processedPath}`;
  return `https://storage.googleapis.com/${PROCESSED_BUCKET}/${processedPath}`;
}

/**
 * Upload a local file (used in video processor job).
 */
async function uploadProcessedClip(localPath, destPath) {
  await storage.bucket(PROCESSED_BUCKET).upload(localPath, {
    destination: destPath,
    metadata: { cacheControl: 'public, max-age=86400' },
  });
  return buildCdnUrl(destPath);
}

module.exports = {
  generateUploadSignedUrl,
  uploadProcessedClip,
  buildCdnUrl,
  UPLOADS_BUCKET,
  PROCESSED_BUCKET,
};
