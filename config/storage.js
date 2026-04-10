/**
 * Unified upload/delete API for course + feedback controllers.
 * Dispatches to GCS (`gcsStorage.js`) or local disk (`localStorage.js`) via STORAGE_PROVIDER.
 */
const gcs = require('./gcsStorage');
const local = require('./localStorage');

function storageProvider() {
  return (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
}

async function uploadImage(filePath, folder = 'courses/images') {
  if (storageProvider() === 'gcs') {
    return gcs.uploadImageToGCS(filePath, folder);
  }
  return local.uploadImageToLocal(filePath, folder);
}

async function uploadVideo(filePath, folder = 'courses/videos') {
  if (storageProvider() === 'gcs') {
    return gcs.uploadVideoToGCS(filePath, folder);
  }
  return local.uploadVideoToLocal(filePath, folder);
}

async function uploadResourceFile(filePath, folder = 'courses/resources') {
  if (storageProvider() === 'gcs') {
    return gcs.uploadResourceToGCS(filePath, folder);
  }
  return local.uploadFileToLocal(filePath, folder);
}

/** @param {'image'|'video'|'resource'} kind */
async function deleteStoredFile(publicId, kind = 'image') {
  if (storageProvider() === 'gcs') {
    const k = kind === 'video' ? 'video' : kind === 'resource' ? 'resource' : 'image';
    return gcs.deleteFromGCS(publicId, k);
  }
  return local.deleteFromLocal(publicId);
}

async function deleteLessonVideoAssets(lesson) {
  if (!lesson) return null;
  if (storageProvider() !== 'gcs') {
    if (lesson.videoPublicId) {
      await local.deleteFromLocal(lesson.videoPublicId);
    }
    if (lesson.rawVideoPublicId) {
      await local.deleteFromLocal(lesson.rawVideoPublicId);
    }
    return { ok: true };
  }
  return gcs.deleteLessonVideoAssets(lesson);
}

module.exports = {
  uploadImage,
  uploadVideo,
  uploadResourceFile,
  deleteStoredFile,
  deleteLessonVideoAssets,
};
