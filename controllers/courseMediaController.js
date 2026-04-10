const path = require('path');
const fs = require('fs');
const Course = require('../models/Course');
const { getBearerToken, assertMediaAccess } = require('../utils/secureMediaAccess');
const { getFileAllowPrefixes } = require('../utils/mediaProxyPrefixes');
const { resolveCourseThumbnailTargetUrl } = require('../utils/redactCourseMediaUrls');
const { parseGcsHttpsUrl } = require('../services/gcsUrlParser');
const { normalizeBucketNameFromEnv } = require('../config/gcsStorage');
const { streamBinaryFromGcs } = require('../utils/mediaProxyExpress');
const localStorage = require('../config/localStorage');

/**
 * GET /api/courses/:courseId/media/thumbnail
 * Streams cover image after JWT + same rules as file-proxy.
 * Uses GCS SDK for private buckets (no anonymous fetch). CDN/public URLs in DB are allowed via prefix list.
 */
async function streamCourseThumbnail(req, res) {
  const secureDisabled = process.env.SECURE_MEDIA_DISABLED === 'true';
  const { courseId } = req.params;
  const storageProvider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

  try {
    const course = await Course.findById(courseId)
      .select('thumbnailUrl thumbnailPublicId status')
      .lean();

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const targetUrl = resolveCourseThumbnailTargetUrl(course);
    if (!targetUrl) {
      return res.status(404).json({ message: 'No thumbnail' });
    }

    const allowPrefixes = getFileAllowPrefixes();
    const token = getBearerToken(req);

    /** Canonical GCS URL for auth + policy (matches assertSecureMediaAccess + object key rules). */
    let canonicalUrl = targetUrl;
    let bucketName;
    let objectName;

    if (storageProvider === 'gcs') {
      const parsed = parseGcsHttpsUrl(targetUrl);
      if (parsed) {
        bucketName = parsed.bucketName;
        objectName = parsed.objectName;
      } else if (course.thumbnailPublicId) {
        const raw = process.env.GCS_BUCKET_STATIC_ASSETS || process.env.GCS_BUCKET_STATIC;
        if (!raw) {
          return res.status(500).json({ message: 'GCS_BUCKET_STATIC_ASSETS is not set' });
        }
        bucketName = normalizeBucketNameFromEnv(raw, 'GCS_BUCKET_STATIC_ASSETS');
        objectName = String(course.thumbnailPublicId).replace(/^\/+/, '');
      } else {
        return res.status(404).json({ message: 'No thumbnail' });
      }
      canonicalUrl = `https://storage.googleapis.com/${bucketName}/${objectName}`;
    }

    const prefixOk =
      allowPrefixes.some((p) => canonicalUrl.startsWith(p)) ||
      allowPrefixes.some((p) => targetUrl.startsWith(p));

    if (storageProvider === 'gcs' && !prefixOk) {
      return res.status(403).json({ message: 'Forbidden URL' });
    }

    if (storageProvider !== 'gcs') {
      const localOk =
        prefixOk ||
        targetUrl.includes('/uploads/') ||
        (course.thumbnailPublicId && String(course.thumbnailPublicId).length > 0);
      if (!localOk) {
        return res.status(403).json({ message: 'Forbidden URL' });
      }
    }

    if (!secureDisabled) {
      const access = await assertMediaAccess(
        storageProvider === 'gcs' ? canonicalUrl : targetUrl,
        token
      );
      if (!access.ok) {
        return res.status(access.status).json({ message: access.message });
      }
    }

    if (storageProvider !== 'gcs') {
      if (!course.thumbnailPublicId) {
        return res.status(404).json({ message: 'No thumbnail' });
      }
      const rel = String(course.thumbnailPublicId).replace(/^\/+/, '').replace(/\.\./g, '');
      const fullPath = path.join(localStorage.UPLOAD_ROOT, rel);
      if (!fullPath.startsWith(localStorage.UPLOAD_ROOT) || !fs.existsSync(fullPath)) {
        return res.status(404).json({ message: 'Thumbnail not found' });
      }
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.sendFile(fullPath);
    }

    return streamBinaryFromGcs(req, res, bucketName, objectName, canonicalUrl);
  } catch (e) {
    console.error('[course-thumbnail]', e);
    return res.status(500).json({ message: e.message || 'Server error' });
  }
}

module.exports = {
  streamCourseThumbnail,
};
