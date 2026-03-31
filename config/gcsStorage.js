/**
 * Google Cloud Storage — uploads and deletes for courses / feedback.
 *
 * Architecture (4 buckets):
 *   vixhunter-raw-uploads      — reserved (direct signed upload + transcoder; not used here yet)
 *   vixhunter-processed-videos — lesson videos (GCS_BUCKET_PROCESSED_VIDEOS)
 *   vixhunter-static-assets    — thumbnails, PDFs, feedback images (GCS_BUCKET_STATIC_ASSETS)
 *   vixhunter-backups          — reserved (backups; not used here yet)
 *
 * Optional CDN: GCS_PUBLIC_CDN_BASE_URL for public object URLs.
 */
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { execSync } = require('child_process');

let storageSingleton = null;

function getStorage() {
  if (storageSingleton) return storageSingleton;
  const { Storage } = require('@google-cloud/storage');
  const projectId = process.env.GCS_PROJECT_ID;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const clientEmail = process.env.GCS_CLIENT_EMAIL;
  const privateKey = process.env.GCS_PRIVATE_KEY;

  if (clientEmail && privateKey && projectId) {
    storageSingleton = new Storage({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: String(privateKey).replace(/\\n/g, '\n'),
      },
    });
  } else if (keyFile && fs.existsSync(keyFile)) {
    storageSingleton = new Storage({
      projectId: projectId || undefined,
      keyFilename: keyFile,
    });
  } else {
    storageSingleton = new Storage({ projectId: projectId || undefined });
  }
  return storageSingleton;
}

function bucketVideos() {
  const name = process.env.GCS_BUCKET_PROCESSED_VIDEOS || process.env.GCS_BUCKET_VIDEOS;
  if (!name) throw new Error('GCS_BUCKET_PROCESSED_VIDEOS (or GCS_BUCKET_VIDEOS) is not set');
  return getStorage().bucket(name);
}

function bucketStatic() {
  const name = process.env.GCS_BUCKET_STATIC_ASSETS || process.env.GCS_BUCKET_STATIC;
  if (!name) throw new Error('GCS_BUCKET_STATIC_ASSETS (or GCS_BUCKET_STATIC) is not set');
  return getStorage().bucket(name);
}

function publicObjectUrl(bucketName, objectName) {
  const cdn = process.env.GCS_PUBLIC_CDN_BASE_URL;
  if (cdn) {
    return `${cdn.replace(/\/$/, '')}/${objectName}`;
  }
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

function getVideoDurationSeconds(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', timeout: 120000 }
    );
    const sec = parseFloat(String(out).trim());
    return Number.isFinite(sec) ? Math.round(sec) : 0;
  } catch {
    return 0;
  }
}

async function uploadFileToBucket(bucket, filePath, objectName, contentType) {
  await bucket.upload(filePath, {
    destination: objectName,
    metadata: contentType ? { contentType } : undefined,
  });
}

const uploadVideoToGCS = async (filePath, folder = 'courses/videos') => {
  const bucket = bucketVideos();
  const ext = path.extname(filePath) || '.mp4';
  const objectName = `${folder.replace(/^\/+|\/+$/g, '')}/${Date.now()}-${randomUUID()}${ext}`;
  const ct = ext.toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4';
  await uploadFileToBucket(bucket, filePath, objectName, ct);
  const bucketName = bucket.name;
  const url = publicObjectUrl(bucketName, objectName);
  const duration = getVideoDurationSeconds(filePath);
  return { url, publicId: objectName, duration };
};

const uploadImageToGCS = async (filePath, folder = 'courses/images') => {
  const bucket = bucketStatic();
  const ext = path.extname(filePath) || '.jpg';
  const objectName = `${folder.replace(/^\/+|\/+$/g, '')}/${Date.now()}-${randomUUID()}${ext}`;
  const ct =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  await uploadFileToBucket(bucket, filePath, objectName, ct);
  return { url: publicObjectUrl(bucket.name, objectName), publicId: objectName };
};

const uploadResourceToGCS = async (filePath, folder = 'courses/resources') => {
  const bucket = bucketStatic();
  const ext = path.extname(filePath).toLowerCase();
  const objectName = `${folder.replace(/^\/+|\/+$/g, '')}/${Date.now()}-${randomUUID()}${ext}`;
  let ct = 'application/octet-stream';
  if (ext === '.pdf') ct = 'application/pdf';
  else if (['.jpg', '.jpeg'].includes(ext)) ct = 'image/jpeg';
  else if (ext === '.png') ct = 'image/png';
  await uploadFileToBucket(bucket, filePath, objectName, ct);
  const url = publicObjectUrl(bucket.name, objectName);
  return { url, downloadUrl: url, publicId: objectName };
};

/**
 * Delete object — publicId is full object path in bucket.
 * kind: 'video' | 'image' | 'resource' — selects bucket.
 */
const deleteFromGCS = async (publicId, kind = 'image') => {
  if (!publicId) return null;
  const bucket =
    kind === 'video' ? bucketVideos() : bucketStatic();
  try {
    await bucket.file(publicId).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error('[GCS] delete error:', e.message);
    throw e;
  }
  return { ok: true };
};

/**
 * Startup check: logs success/failure like MongoDB (call when server boots).
 * Does not throw — server keeps running even if GCS fails (uploads will error later).
 */
async function verifyGcsAtStartup() {
  const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  if (provider !== 'gcs') {
    console.log('✅ Storage: local — files under /uploads (GCS not used)');
    return;
  }

  const videoName =
    process.env.GCS_BUCKET_PROCESSED_VIDEOS || process.env.GCS_BUCKET_VIDEOS;
  const staticName =
    process.env.GCS_BUCKET_STATIC_ASSETS || process.env.GCS_BUCKET_STATIC;

  if (!videoName || !staticName) {
    console.error(
      '❌ GCS: STORAGE_PROVIDER=gcs but GCS_BUCKET_PROCESSED_VIDEOS or GCS_BUCKET_STATIC_ASSETS is missing'
    );
    return;
  }

  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile && !fs.existsSync(keyFile)) {
    console.error('❌ GCS: credentials file not found:', keyFile);
    return;
  }

  try {
    await Promise.all([
      bucketVideos().getMetadata(),
      bucketStatic().getMetadata(),
    ]);
    console.log(
      `✅ GCS: connected — buckets OK → videos: ${videoName} | static: ${staticName}`
    );
    if (process.env.GCS_PROJECT_ID) {
      console.log(`   GCS project: ${process.env.GCS_PROJECT_ID}`);
    }
  } catch (err) {
    console.error('❌ GCS: connection or bucket access failed:', err.message || err);
  }
}

module.exports = {
  uploadVideoToGCS,
  uploadImageToGCS,
  uploadResourceToGCS,
  deleteFromGCS,
  verifyGcsAtStartup,
};
