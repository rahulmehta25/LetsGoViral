'use strict';

const { Storage } = require('@google-cloud/storage');
const path = require('path');

const SIGNING_SERVICE_ACCOUNT = process.env.GCS_SIGNING_SERVICE_ACCOUNT;

const storage = new Storage();
const signingStorage = SIGNING_SERVICE_ACCOUNT
  ? new Storage({ projectId: process.env.GCP_PROJECT_ID })
  : storage;

const UPLOADS_BUCKET   = process.env.GCS_UPLOADS_BUCKET;
const FALLBACK_UPLOADS_BUCKET = process.env.GCS_UPLOADS_BUCKET_FALLBACK || 'clipora-487805-uploads';
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
 * Generate a short-lived signed URL for reading an uploaded source video.
 */
async function generateReadSignedUrl(objectPath, expiresInMs = 60 * 60 * 1000) {
  const resolved = await resolveUploadObject(objectPath);
  return generateReadSignedUrlFromResolved(resolved, expiresInMs);
}

async function generateReadSignedUrlFromResolved(resolved, expiresInMs = 60 * 60 * 1000) {
  const [url] = await storage
    .bucket(resolved.bucketName)
    .file(resolved.objectPath)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMs,
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

async function downloadUploadedVideo(objectPath, destinationPath) {
  const resolved = await resolveUploadObject(objectPath);
  await storage.bucket(resolved.bucketName).file(resolved.objectPath).download({ destination: destinationPath });
}

async function uploadProcessedFile(localPath, destPath) {
  await storage.bucket(PROCESSED_BUCKET).upload(localPath, {
    destination: destPath,
    metadata: { cacheControl: 'public, max-age=86400' },
  });
}

async function resolveUploadObject(objectPath, hints = {}) {
  const { bucketFromPath, normalizedPath, basename } = parseUploadPath(objectPath);
  const hintedFilename = hints.originalFilename ? decodeURIComponentSafe(String(hints.originalFilename)) : '';
  const hintedProjectPrefix = hints.projectId ? `${hints.projectId}/` : '';

  const bucketCandidates = dedupe([
    bucketFromPath,
    UPLOADS_BUCKET,
    FALLBACK_UPLOADS_BUCKET,
  ].filter(Boolean));

  const pathCandidates = dedupe([
    normalizedPath,
    normalizedPath?.replace(/^\/+/, ''),
    basename,
    hintedFilename,
    hintedFilename ? `${hintedProjectPrefix}${hintedFilename}` : '',
  ].filter(Boolean));

  for (const bucketName of bucketCandidates) {
    for (const candidatePath of pathCandidates) {
      if (await objectExists(bucketName, candidatePath)) {
        return { bucketName, objectPath: candidatePath };
      }
    }
  }

  // Last-chance lookup by basename/filename, preferring project folder.
  if (basename) {
    for (const bucketName of bucketCandidates) {
      const matchedName = await findByBasename(bucketName, basename, hintedProjectPrefix);
      if (matchedName) return { bucketName, objectPath: matchedName };
    }
  }
  if (hintedFilename) {
    for (const bucketName of bucketCandidates) {
      const matchedName = await findByBasename(bucketName, hintedFilename, hintedProjectPrefix);
      if (matchedName) return { bucketName, objectPath: matchedName };
    }
  }

  throw new Error(`Source upload object not found: ${objectPath}`);
}

function parseUploadPath(objectPath) {
  const raw = String(objectPath || '').trim();
  if (raw.startsWith('gs://')) {
    const withoutScheme = raw.slice(5);
    const firstSlash = withoutScheme.indexOf('/');
    if (firstSlash >= 0) {
      return {
        bucketFromPath: withoutScheme.slice(0, firstSlash),
        normalizedPath: withoutScheme.slice(firstSlash + 1),
        basename: path.posix.basename(withoutScheme.slice(firstSlash + 1)),
      };
    }
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      const pathname = url.pathname.replace(/^\/+/, '');
      if (url.hostname === 'storage.googleapis.com') {
        const firstSlash = pathname.indexOf('/');
        if (firstSlash >= 0) {
          return {
            bucketFromPath: pathname.slice(0, firstSlash),
            normalizedPath: pathname.slice(firstSlash + 1),
            basename: path.posix.basename(pathname.slice(firstSlash + 1)),
          };
        }
      }
      return {
        bucketFromPath: null,
        normalizedPath: pathname,
        basename: path.posix.basename(pathname),
      };
    } catch {
      // Fall through to raw value.
    }
  }

  return {
    bucketFromPath: null,
    normalizedPath: raw,
    basename: path.posix.basename(raw),
  };
}

async function objectExists(bucketName, objectPath) {
  try {
    const [exists] = await storage.bucket(bucketName).file(objectPath).exists();
    return exists;
  } catch {
    return false;
  }
}

async function findByBasename(bucketName, basename, prefix = '') {
  try {
    let query = { autoPaginate: false, maxResults: 1000, prefix: prefix || undefined };
    let scannedPages = 0;
    while (scannedPages < 50) {
      // eslint-disable-next-line no-await-in-loop
      const [files, nextQuery] = await storage.bucket(bucketName).getFiles(query);
      const match = files.find((file) => file.name === basename || file.name.endsWith(`/${basename}`));
      if (match?.name) return match.name;
      if (!nextQuery) break;
      query = nextQuery;
      scannedPages += 1;
    }
    return null;
  } catch {
    return null;
  }
}

function dedupe(values) {
  return [...new Set(values)];
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

module.exports = {
  storage,
  generateUploadSignedUrl,
  generateReadSignedUrl,
  generateReadSignedUrlFromResolved,
  uploadProcessedClip,
  downloadUploadedVideo,
  uploadProcessedFile,
  resolveUploadObject,
  buildCdnUrl,
  UPLOADS_BUCKET,
  FALLBACK_UPLOADS_BUCKET,
  PROCESSED_BUCKET,
};
