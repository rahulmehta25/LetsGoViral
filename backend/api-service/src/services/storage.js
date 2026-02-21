'use strict';

const { Storage } = require('@google-cloud/storage');

const SIGNING_SERVICE_ACCOUNT = process.env.GCS_SIGNING_SERVICE_ACCOUNT;

const storage = new Storage();
const signingStorage = SIGNING_SERVICE_ACCOUNT
  ? new Storage({ projectId: process.env.GCP_PROJECT_ID })
  : storage;

const UPLOADS_BUCKET   = process.env.GCS_UPLOADS_BUCKET;
const PROCESSED_BUCKET = process.env.GCS_PROCESSED_BUCKET;
const CDN_BASE_URL     = process.env.CDN_BASE_URL; // e.g. https://cdn.clipora.io

/**
 * Generate a signed URL for the mobile client to PUT a video directly to GCS.
 * URL expires in 15 minutes.
 *
 * When running with a service account key file (GOOGLE_APPLICATION_CREDENTIALS),
 * signing works automatically. When running with ADC (Application Default Credentials),
 * set GCS_SIGNING_SERVICE_ACCOUNT to the service account email to sign via IAM.
 * The ADC identity needs the "Service Account Token Creator" role on that SA.
 */
async function generateUploadSignedUrl(objectPath, contentType) {
  const signOptions = {
    version: 'v4',
    action:  'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  };

  if (SIGNING_SERVICE_ACCOUNT) {
    signOptions.signingEndpoint = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SIGNING_SERVICE_ACCOUNT}`;
  }

  const [url] = await signingStorage
    .bucket(UPLOADS_BUCKET)
    .file(objectPath)
    .getSignedUrl(signOptions);
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
