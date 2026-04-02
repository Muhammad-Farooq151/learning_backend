const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Transaction = require('../models/Transaction');
const Feedback = require('../models/Feedback');
const { getJwtStringFromRequest } = require('./authRequest');
const { verifyJwtToken } = require('./jwtVerify');

function getBearerToken(req) {
  return getJwtStringFromRequest(req);
}

function verifyJwt(token) {
  return verifyJwtToken(token);
}

function extractCourseIdFromPath(urlString) {
  try {
    const u = new URL(urlString);
    const m = u.pathname.match(/\/courses\/([a-fA-F0-9]{24})\//);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * GCS JSON API style URL: https://storage.googleapis.com/BUCKET_NAME/object/key/path
 * Returns object key inside the bucket (e.g. courses/images/1775....png).
 * Used when thumbnailUrl string differs slightly but thumbnailPublicId matches.
 */
function extractGcsObjectKeyFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.hostname !== 'storage.googleapis.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return parts.slice(1).join('/');
  } catch {
    return null;
  }
}

async function resolveCourseIdForUrl(targetUrl) {
  const fromPath = extractCourseIdFromPath(targetUrl);
  if (fromPath) return fromPath;

  const objectKey = extractGcsObjectKeyFromUrl(targetUrl);

  const feedbackOr = [{ fileUrl: targetUrl }];
  if (objectKey) {
    feedbackOr.push({ filePublicId: objectKey });
  }
  const fb = await Feedback.findOne({ $or: feedbackOr }).select('courseId').lean();
  if (fb && fb.courseId) return String(fb.courseId);

  const courseOr = [
    { thumbnailUrl: targetUrl },
    { 'lessons.videoUrl': targetUrl },
    { 'lessons.resources.fileUrl': targetUrl },
    { 'resources.fileUrl': targetUrl },
  ];
  if (objectKey) {
    courseOr.push(
      { thumbnailPublicId: objectKey },
      { 'lessons.videoPublicId': objectKey },
      { 'lessons.rawVideoPublicId': objectKey },
      { 'lessons.resources.filePublicId': objectKey },
      { 'resources.filePublicId': objectKey }
    );
  }

  const course = await Course.findOne({ $or: courseOr }).select('_id').lean();

  if (course && course._id) return String(course._id);

  return null;
}

/**
 * All proxy GETs require a valid JWT. No anonymous access.
 * - Admin: full access
 * - Enrolled or paid transaction: lesson video, resources, feedback images, etc.
 * - Logged-in only, not enrolled: published course thumbnail URL only (catalog / explore discovery)
 *
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
async function assertMediaAccess(targetUrl, token) {
  if (!token || !String(token).trim()) {
    return { ok: false, status: 401, message: 'Unauthorized — missing token' };
  }

  const decoded = verifyJwt(token);
  if (!decoded || !decoded.userId) {
    return { ok: false, status: 401, message: 'Invalid or expired token' };
  }

  const courseId = await resolveCourseIdForUrl(targetUrl);
  if (!courseId) {
    return { ok: false, status: 400, message: 'Cannot resolve course for this URL' };
  }

  const oid = new mongoose.Types.ObjectId(courseId);

  const course = await Course.findById(oid).select('thumbnailUrl thumbnailPublicId status').lean();
  if (!course) {
    return { ok: false, status: 404, message: 'Course not found' };
  }

  const userId = decoded.userId;
  const role = decoded.role;

  if (role === 'admin') {
    return { ok: true };
  }

  const user = await User.findById(userId).select('enrolledCourses status role').lean();
  if (!user || user.status !== 'active') {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  const enrolled = user.enrolledCourses && user.enrolledCourses.some((c) => c.equals(oid));
  if (enrolled) {
    return { ok: true };
  }

  const paid = await Transaction.findOne({
    userId: new mongoose.Types.ObjectId(String(userId)),
    courseId: oid,
    status: 'Paid',
  })
    .select('_id')
    .lean();

  if (paid) {
    return { ok: true };
  }

  // Logged-in learners: published course cover only (explore / detail before purchase).
  // Match full URL or GCS object key (same file as thumbnailPublicId — e.g. courses/images/....png)
  const objKey = extractGcsObjectKeyFromUrl(targetUrl);
  const isPublishedThumbnail =
    course.status === 'published' &&
    ((course.thumbnailUrl && course.thumbnailUrl === targetUrl) ||
      (objKey &&
        course.thumbnailPublicId &&
        course.thumbnailPublicId === objKey));

  if (isPublishedThumbnail) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    message: 'Access denied — enroll in this course to view this content',
  };
}

module.exports = {
  getBearerToken,
  assertMediaAccess,
};
