/**
 * Unified storage: local (localhost dev) or Google Cloud Storage (stage/prod).
 * Set STORAGE_PROVIDER=local | gcs
 */
require('dotenv').config();

const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

const local = require('./localStorage');
const gcs = require('./gcsStorage');

function assertGcsConfigured() {
  const hasBucket =
    (process.env.GCS_BUCKET_PROCESSED_VIDEOS || process.env.GCS_BUCKET_VIDEOS) &&
    (process.env.GCS_BUCKET_STATIC_ASSETS || process.env.GCS_BUCKET_STATIC);
  if (!hasBucket) {
    throw new Error(
      'STORAGE_PROVIDER=gcs requires GCS bucket env vars. See server/.env.example'
    );
  }
}

async function uploadVideo(filePath, folder = 'courses/videos') {
  if (provider === 'gcs') {
    assertGcsConfigured();
    return gcs.uploadVideoToGCS(filePath, folder);
  }
  return local.uploadVideoToLocal(filePath, folder);
}

async function uploadImage(filePath, folder = 'courses/images') {
  if (provider === 'gcs') {
    assertGcsConfigured();
    return gcs.uploadImageToGCS(filePath, folder);
  }
  return local.uploadImageToLocal(filePath, folder);
}

async function uploadResourceFile(filePath, folder = 'courses/resources') {
  if (provider === 'gcs') {
    assertGcsConfigured();
    return gcs.uploadResourceToGCS(filePath, folder);
  }
  return local.uploadFileToLocal(filePath, folder);
}

/**
 * Remove stored file. For GCS, pass kind so the correct bucket is used.
 * kind: 'video' | 'resource' | 'image' (default image — thumbnails & feedback use static bucket)
 */
async function deleteStoredFile(publicId, kind = 'image') {
  if (!publicId) return null;
  if (provider === 'gcs') {
    assertGcsConfigured();
    // Videos → processed bucket; thumbnails, PDFs, feedback images → static bucket
    const gcsKind = kind === 'video' ? 'video' : 'image';
    return gcs.deleteFromGCS(publicId, gcsKind);
  }
  return local.deleteFromLocal(publicId);
}

module.exports = {
  uploadVideo,
  uploadImage,
  uploadResourceFile,
  deleteStoredFile,
  STORAGE_PROVIDER: provider,
};
