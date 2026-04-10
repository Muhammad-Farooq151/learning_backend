const mongoose = require('mongoose');
const Course = require('../models/Course');
const { getJwtStringFromRequest } = require('../utils/authRequest');
const { verifyJwtToken } = require('../utils/jwtVerify');
const { assertMediaAccess } = require('../utils/secureMediaAccess');
const { generateSignedUrl, TTL_MS } = require('../utils/streamUrl');
const VideoAccessLog = require('../models/VideoAccessLog');
const { decryptPath, pathCryptoEnabled } = require('../utils/pathCrypto');

function parseGcsHttpsUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.hostname !== 'storage.googleapis.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const bucketName = parts[0];
    const objectKey = parts.slice(1).join('/');
    return { bucketName, objectKey };
  } catch {
    return null;
  }
}

async function findLessonAndCourse(lessonId) {
  const lid = new mongoose.Types.ObjectId(String(lessonId));
  const course = await Course.findOne({ 'lessons._id': lid }).lean();
  if (!course) return null;
  const lesson = course.lessons.find((l) => l._id.equals(lid));
  if (!lesson) return null;
  return { course, lesson };
}

/**
 * Doc §6 — enrolled users get a short-lived signed playlist URL (HLS).
 * GET /api/lessons/:lessonId/stream
 */
async function getLessonStream(req, res) {
  try {
    const token = getJwtStringFromRequest(req);
    const decoded = verifyJwtToken(token);
    if (!decoded?.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { lessonId } = req.params;
    const found = await findLessonAndCourse(lessonId);
    if (!found?.lesson?.videoUrl) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    const { course, lesson } = found;

    if (lesson.videoType !== 'hls') {
      return res.status(400).json({ success: false, message: 'Not an HLS lesson' });
    }
    if (lesson.transcodingStatus && lesson.transcodingStatus !== 'ready') {
      return res.status(409).json({
        success: false,
        message: 'Video is not ready yet',
        transcodingStatus: lesson.transcodingStatus,
      });
    }

    const access = await assertMediaAccess(lesson.videoUrl, token);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const parsed = parseGcsHttpsUrl(lesson.videoUrl);
    if (!parsed) {
      return res.status(500).json({ success: false, message: 'Invalid video URL' });
    }

    const signedUrl = await generateSignedUrl('playlist', parsed.bucketName, parsed.objectKey);
    const expiresAt = new Date(Date.now() + TTL_MS.playlist);

    try {
      await VideoAccessLog.create({
        userId: decoded.userId,
        lessonId: lesson._id,
        courseId: course._id,
        accessedAt: new Date(),
        ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 128),
      });
    } catch (logErr) {
      console.warn('[getLessonStream] VideoAccessLog', logErr.message || logErr);
    }

    return res.json({
      success: true,
      signedUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    console.error('[getLessonStream]', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
}

/**
 * Doc §5.3 — 302 to signed chunk URL (bytes GCS→browser).
 * GET /api/media/chunk?t=… (encrypted) or ?u=… (plain GCS HTTPS URL)
 */
async function getMediaChunk(req, res) {
  try {
    const token = getJwtStringFromRequest(req);
    let bucketName;
    let objectKey;

    const t = req.query.t;
    const u = req.query.u;

    if (t && typeof t === 'string' && pathCryptoEnabled()) {
      try {
        const decrypted = decryptPath(t);
        const pipe = decrypted.indexOf('|');
        if (pipe < 0) {
          return res.status(400).json({ success: false, message: 'Invalid t' });
        }
        bucketName = decrypted.slice(0, pipe);
        objectKey = decrypted.slice(pipe + 1);
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid t' });
      }
    } else if (u && typeof u === 'string') {
      let targetUrl;
      try {
        targetUrl = decodeURIComponent(u);
      } catch {
        return res.status(400).json({ success: false, message: 'Bad u' });
      }
      const parsed = parseGcsHttpsUrl(targetUrl);
      if (!parsed) {
        return res.status(400).json({ success: false, message: 'Invalid URL' });
      }
      bucketName = parsed.bucketName;
      objectKey = parsed.objectKey;
      const targetHttps = `https://storage.googleapis.com/${bucketName}/${objectKey}`;
      const access = await assertMediaAccess(targetHttps, token);
      if (!access.ok) {
        return res.status(access.status).json({ success: false, message: access.message });
      }
      const signedUrl = await generateSignedUrl('chunk', bucketName, objectKey);
      return res.redirect(302, signedUrl);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Provide u= (GCS URL) or t= (encrypted) when PATH_ENCRYPTION_KEY is set',
      });
    }

    const targetHttps = `https://storage.googleapis.com/${bucketName}/${objectKey}`;
    const access = await assertMediaAccess(targetHttps, token);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }
    const signedUrl = await generateSignedUrl('chunk', bucketName, objectKey);
    return res.redirect(302, signedUrl);
  } catch (e) {
    console.error('[getMediaChunk]', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
}

module.exports = {
  getLessonStream,
  getMediaChunk,
};
