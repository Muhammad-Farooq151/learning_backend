/**
 * Google Cloud Storage — uploads and deletes for courses / feedback.
 *
 * Architecture:
 *   GCS_BUCKET_RAW_UPLOADS       — original lesson uploads (input to Transcoder; not served to users)
 *   GCS_BUCKET_PROCESSED_VIDEOS  — HLS output + legacy MP4 when not using pipeline
 *   GCS_BUCKET_STATIC_ASSETS     — thumbnails, PDFs, feedback images
 *   vixhunter-backups          — reserved (backups; not used here yet)
 *
 * Optional CDN: GCS_PUBLIC_CDN_BASE_URL for public object URLs.
 */
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { execSync } = require('child_process');

let _ffprobeWarned = false;

/**
 * Fix common typos (missing hyphens between words) so env matches GCP bucket names:
 * vixhunter-raw-uploads, vixhunter-processed-videos, vixhunter-static-assets
 * Only exact mistaken strings are rewritten — correct names pass through unchanged.
 */
const BUCKET_NAME_TYPOS = {
  'vixhunter-rawuploads': 'vixhunter-raw-uploads',
  'vixhunter-processedvideos': 'vixhunter-processed-videos',
  'vixhunter-staticassets': 'vixhunter-static-assets',
};

function normalizeBucketNameFromEnv(value, envKey) {
  if (value == null || typeof value !== 'string') return value;
  const t = value.trim();
  if (!t) return t;
  const fixed = BUCKET_NAME_TYPOS[t.toLowerCase()];
  if (fixed && fixed !== t) {
    console.warn(
      `[GCS] ${envKey}: corrected bucket name "${t}" → "${fixed}" (must match GCP exactly)`
    );
    return fixed;
  }
  return t;
}

let storageSingleton = null;

/** Resolve GOOGLE_APPLICATION_CREDENTIALS relative to process.cwd() so npm run dev from repo root still finds server/secrets/... */
function resolveGcpKeyFilename() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) return null;
  return path.isAbsolute(keyFile) ? keyFile : path.resolve(process.cwd(), keyFile);
}

function getMergedVideoBucketName() {
  const m = process.env.GCS_MERGED_VIDEO_BUCKET?.trim();
  return m ? normalizeBucketNameFromEnv(m, 'GCS_MERGED_VIDEO_BUCKET') : '';
}

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
  } else {
    const resolvedKey = resolveGcpKeyFilename();
    if (resolvedKey && fs.existsSync(resolvedKey)) {
      storageSingleton = new Storage({
        projectId: projectId || undefined,
        keyFilename: resolvedKey,
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.warn(
        `[GCS] GOOGLE_APPLICATION_CREDENTIALS not found: ${resolvedKey || '(unset)'} (cwd=${process.cwd()}). Set an absolute path to the JSON key.`
      );
      storageSingleton = new Storage({ projectId: projectId || undefined });
    } else {
      storageSingleton = new Storage({ projectId: projectId || undefined });
    }
  }
  return storageSingleton;
}

function bucketVideos() {
  const merged = getMergedVideoBucketName();
  if (merged) return getStorage().bucket(merged);
  const rawName = process.env.GCS_BUCKET_PROCESSED_VIDEOS || process.env.GCS_BUCKET_VIDEOS;
  const name = normalizeBucketNameFromEnv(rawName, 'GCS_BUCKET_PROCESSED_VIDEOS');
  if (!name) throw new Error('GCS_BUCKET_PROCESSED_VIDEOS (or GCS_BUCKET_VIDEOS) is not set');
  return getStorage().bucket(name);
}

function bucketStatic() {
  const rawName = process.env.GCS_BUCKET_STATIC_ASSETS || process.env.GCS_BUCKET_STATIC;
  const name = normalizeBucketNameFromEnv(rawName, 'GCS_BUCKET_STATIC_ASSETS');
  if (!name) throw new Error('GCS_BUCKET_STATIC_ASSETS (or GCS_BUCKET_STATIC) is not set');
  return getStorage().bucket(name);
}

let _rawBucketInferWarned = false;

/**
 * Infer vixhunter-raw-uploads from vixhunter-processed-videos when explicit env is missing.
 */
function inferRawBucketFromProcessed(processedBucket) {
  if (!processedBucket || typeof processedBucket !== 'string') return '';
  const p = normalizeBucketNameFromEnv(processedBucket, 'GCS_BUCKET_PROCESSED_VIDEOS(infer)');
  if (/processed-videos/i.test(p)) {
    return p.replace(/processed-videos/i, 'raw-uploads');
  }
  return '';
}

/**
 * Raw bucket name for uploads. Prefer GCS_BUCKET_RAW_UPLOADS; otherwise infer from processed bucket name.
 */
function resolveRawBucketName() {
  const merged = getMergedVideoBucketName();
  if (merged) return merged;

  const explicit = process.env.GCS_BUCKET_RAW_UPLOADS?.trim();
  if (explicit) return normalizeBucketNameFromEnv(explicit, 'GCS_BUCKET_RAW_UPLOADS');

  const processed =
    process.env.GCS_BUCKET_PROCESSED_VIDEOS || process.env.GCS_BUCKET_VIDEOS;
  const inferred = inferRawBucketFromProcessed(processed);
  if (inferred && !_rawBucketInferWarned) {
    _rawBucketInferWarned = true;
    console.warn(
      `[GCS] GCS_BUCKET_RAW_UPLOADS is not set; inferred "${inferred}" from processed bucket "${processed}". Set GCS_BUCKET_RAW_UPLOADS explicitly.`
    );
  }
  return inferred || '';
}

/** Raw uploads — originals before transcoding (HLS pipeline). */
function bucketRaw() {
  const name = resolveRawBucketName();
  if (!name) {
    throw new Error(
      'Raw uploads bucket unresolved: set GCS_BUCKET_RAW_UPLOADS or use a processed bucket name containing "processed-videos" for inference'
    );
  }
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
    if (!_ffprobeWarned && filePath && fs.existsSync(filePath)) {
      _ffprobeWarned = true;
      console.warn(
        '[GCS] ffprobe failed or not installed — lesson duration will default to 0. Install ffmpeg (includes ffprobe) for accurate duration in production.'
      );
    }
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

/**
 * Upload original file to RAW bucket at a fixed path (e.g. courses/{courseId}/{lessonId}/original.mp4).
 * @returns {{ bucketName: string, objectName: string, publicId: string }}
 */
const uploadRawVideoToGcs = async (filePath, objectName) => {
  const bucket = bucketRaw();
  const ext = path.extname(filePath).toLowerCase();
  const ct =
    ext === '.mov' ? 'video/quicktime' : ext === '.webm' ? 'video/webm' : 'video/mp4';
  const normalized = objectName.replace(/^\/+|\/+$/g, '');
  await uploadFileToBucket(bucket, filePath, normalized, ct);
  console.log(`[GCS] RAW upload OK bucket=${bucket.name} object=${normalized}`);
  return { bucketName: bucket.name, objectName: normalized, publicId: normalized };
};

/** Delete one object in the raw bucket. */
const deleteRawObject = async (publicId) => {
  if (!publicId) return null;
  try {
    await bucketRaw().file(publicId).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error('[GCS] delete raw error:', e.message);
    throw e;
  }
  return { ok: true };
};

/** Content-Type for signed PUT (must match browser upload headers). */
function contentTypeForVideoExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === '.mov') return 'video/quicktime';
  if (e === '.webm') return 'video/webm';
  return 'video/mp4';
}

/**
 * Same path convention as uploadRawVideoToGcs / videoPipeline.prepareHlsLessonUpload.
 */
function rawObjectRelForLesson(courseId, lessonId, ext) {
  const e = ext && String(ext).startsWith('.') ? ext : `.${ext || 'mp4'}`;
  const merged = getMergedVideoBucketName();
  return merged
    ? `raw/courses/${courseId}/${lessonId}/original${e}`
    : `courses/${courseId}/${lessonId}/original${e}`;
}

async function rawObjectExists(objectName) {
  const normalized = String(objectName || '').replace(/^\/+|\/+$/g, '');
  if (!normalized) return false;
  const [exists] = await bucketRaw().file(normalized).exists();
  return Boolean(exists);
}

/**
 * v4 signed PUT so the browser uploads bytes directly to the raw bucket (bypasses Cloud Run body limits).
 */
async function getSignedPutUrlForRawObject(objectRel, contentType, expiresMs = 60 * 60 * 1000) {
  const normalized = String(objectRel).replace(/^\/+|\/+$/g, '');
  const bucket = bucketRaw();
  const file = bucket.file(normalized);
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + expiresMs,
    contentType,
  });
  return {
    uploadUrl,
    bucketName: bucket.name,
    objectKey: normalized,
  };
}

/** Delete all objects under prefix in processed-videos bucket (HLS output folder). */
const deleteProcessedVideoPrefix = async (prefix) => {
  if (!prefix) return null;
  const normalized = String(prefix).replace(/^\/+/, '').replace(/([^/])$/, '$1/');
  try {
    await bucketVideos().deleteFiles({ prefix: normalized });
  } catch (e) {
    console.error('[GCS] delete processed prefix error:', e.message);
    throw e;
  }
  return { ok: true };
};

/** Delete a single processed video file (legacy MP4 path). */
const deleteProcessedVideoFile = async (publicId) => {
  if (!publicId) return null;
  try {
    await bucketVideos().file(publicId).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error('[GCS] delete video file error:', e.message);
    throw e;
  }
  return { ok: true };
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
 * Delete all processed outputs for a lesson: HLS prefix (or single MP4) plus raw upload object when set.
 */
async function deleteLessonVideoAssets(lesson) {
  if (!lesson) return null;
  const videoPublicId = lesson.videoPublicId;
  const rawVideoPublicId = lesson.rawVideoPublicId;
  const videoType = lesson.videoType;

  try {
    if (videoType === 'hls' && videoPublicId) {
      const key = String(videoPublicId).replace(/^\/+/, '');
      const lower = key.toLowerCase();
      if (lower.endsWith('playlist.m3u8')) {
        const prefix = key.slice(0, -'playlist.m3u8'.length);
        await deleteProcessedVideoPrefix(prefix);
      } else {
        await deleteProcessedVideoPrefix(key);
      }
    } else if (videoPublicId) {
      await deleteProcessedVideoFile(videoPublicId);
    }
    if (rawVideoPublicId) {
      await deleteRawObject(rawVideoPublicId);
    }
  } catch (e) {
    console.error('[GCS] deleteLessonVideoAssets', e.message);
    throw e;
  }
  return { ok: true };
}

/**
 * Startup check: logs success/failure like MongoDB (call when server boots).
 * Does not throw — server keeps running even if GCS fails (uploads will error later).
 */

function logMediaCdnStatus() {
  const signOn =
    String(process.env.GCS_SIGN_FOR_CDN || '').toLowerCase() === 'true';
  const base = (process.env.MEDIA_CDN_BASE_URL || '').trim();
  const baseLine = base ? base : '(not set — map LB/CDN in GCP; optional for signed URLs)';
  const rewriteOn =
    String(process.env.MEDIA_CDN_REWRITE_SIGNED_URLS || '').toLowerCase() === 'true';
  const rewriteHint = base
    ? rewriteOn
      ? ' — MEDIA_CDN_REWRITE_SIGNED_URLS=true (signed URLs may be rewritten; risk SignatureDoesNotMatch if host mismatch)'
      : ' — default: signed URLs stay on storage.googleapis.com (Section 4.2)'
    : '';
  console.log(
    `📡 Media CDN: GCS_SIGN_FOR_CDN=${signOn ? 'on' : 'off'} (GET /api/media/signed-read-url) · MEDIA_CDN_BASE_URL=${baseLine}${rewriteHint}`
  );
  try {
    const { getHlsPlaylistCacheTtlMs } = require('./mediaStreamingConfig');
    console.log(
      `   HLS: /api/hls-proxy · playlist text cache ${getHlsPlaylistCacheTtlMs()}ms (HLS_PLAYLIST_CACHE_TTL_MS)`
    );
  } catch (_) {
    /* ignore */
  }
}

async function verifyGcsAtStartup() {
  const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  if (provider !== 'gcs') {
    console.log('✅ Storage: local — files under /uploads (GCS not used)');
    logMediaCdnStatus();
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
    logMediaCdnStatus();
    return;
  }

  const resolvedKey = resolveGcpKeyFilename();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && resolvedKey && !fs.existsSync(resolvedKey)) {
    console.error('❌ GCS: credentials file not found:', resolvedKey, `(cwd=${process.cwd()})`);
    logMediaCdnStatus();
    return;
  }

  try {
    const checks = [
      bucketVideos().getMetadata(),
      bucketStatic().getMetadata(),
    ];
    const rawName = resolveRawBucketName();
    const merged = getMergedVideoBucketName();
    // When GCS_MERGED_VIDEO_BUCKET is set, raw + processed share bucketVideos() — skip duplicate getMetadata
    if (rawName && !merged) {
      checks.push(bucketRaw().getMetadata());
    }
    await Promise.all(checks);
    console.log(
      `✅ GCS: connected — buckets OK → videos: ${videoName} | static: ${staticName}`
    );
    if (rawName) {
      const mergedNote = merged ? ' (same bucket as processed — GCS_MERGED_VIDEO_BUCKET)' : '';
      console.log(`   raw uploads (HLS pipeline): ${rawName}${mergedNote}`);
    } else {
      console.warn(
        '⚠️ GCS: raw bucket not configured — HLS pipeline is OFF; set GCS_MERGED_VIDEO_BUCKET or GCS_BUCKET_RAW_UPLOADS, or rely on MP4 to processed bucket only.'
      );
    }
    if (process.env.GCS_PROJECT_ID) {
      console.log(`   GCS project: ${process.env.GCS_PROJECT_ID}`);
    }
    logMediaCdnStatus();
  } catch (err) {
    console.error('❌ GCS: connection or bucket access failed:', err.message || err);
    logMediaCdnStatus();
  }
}

module.exports = {
  getStorage,
  getMergedVideoBucketName,
  uploadVideoToGCS,
  uploadRawVideoToGcs,
  uploadImageToGCS,
  uploadResourceToGCS,
  deleteFromGCS,
  deleteRawObject,
  deleteProcessedVideoPrefix,
  deleteProcessedVideoFile,
  deleteLessonVideoAssets,
  publicObjectUrl,
  getVideoDurationSeconds,
  bucketVideos,
  bucketRaw,
  resolveRawBucketName,
  inferRawBucketFromProcessed,
  normalizeBucketNameFromEnv,
  verifyGcsAtStartup,
  contentTypeForVideoExt,
  rawObjectRelForLesson,
  rawObjectExists,
  getSignedPutUrlForRawObject,
};
