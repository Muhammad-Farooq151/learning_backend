const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Transaction = require('../models/Transaction');
const Feedback = require('../models/Feedback');
const { verifyJwtToken } = require('../utils/jwtVerify');

function extractCourseIdFromPath(urlString) {
  try {
    const u = new URL(urlString);
    const m = u.pathname.match(/\/courses\/([a-fA-F0-9]{24})\//);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

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
 * Paid purchase (Stripe) — primary gate for course media per product spec.
 * Indexed query: { userId, courseId, status }
 */
async function hasPaidPurchase(userId, courseId) {
  const oid = new mongoose.Types.ObjectId(String(courseId));
  const uid = new mongoose.Types.ObjectId(String(userId));
  const paid = await Transaction.findOne({
    userId: uid,
    courseId: oid,
    status: 'Paid',
  })
    .select('_id')
    .lean();
  return Boolean(paid);
}

/**
 * Enrollment on user document (legacy / admin enrollments).
 */
async function hasEnrollment(userId, courseId) {
  const oid = new mongoose.Types.ObjectId(String(courseId));
  const user = await User.findById(userId).select('enrolledCourses').lean();
  if (!user?.enrolledCourses) return false;
  return user.enrolledCourses.some((c) => c.equals(oid));
}

/**
 * Full media access check: JWT + purchase/enrollment + optional published thumbnail.
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
async function assertSecureMediaAccess(targetUrl, token) {
  if (!token || !String(token).trim()) {
    return { ok: false, status: 401, message: 'Unauthorized — missing token' };
  }

  const decoded = verifyJwtToken(token);
  if (!decoded || !decoded.userId) {
    return { ok: false, status: 401, message: 'Invalid or expired token' };
  }

  const courseId = await resolveCourseIdForUrl(targetUrl);
  if (!courseId) {
    return { ok: false, status: 400, message: 'Cannot resolve course for this URL' };
  }

  const oid = new mongoose.Types.ObjectId(courseId);
  const userId = decoded.userId;
  const role = decoded.role;

  if (role === 'admin') {
    return { ok: true };
  }

  const user = await User.findById(userId).select('enrolledCourses status role').lean();
  if (!user || user.status !== 'active') {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  const purchased = await hasPaidPurchase(userId, courseId);
  if (purchased) {
    return { ok: true };
  }

  const enrolled = await hasEnrollment(userId, courseId);
  if (enrolled) {
    return { ok: true };
  }

  const course = await Course.findById(oid).select('thumbnailUrl thumbnailPublicId status').lean();
  if (!course) {
    return { ok: false, status: 404, message: 'Course not found' };
  }

  const objKey = extractGcsObjectKeyFromUrl(targetUrl);
  const isPublishedThumbnail =
    course.status === 'published' &&
    ((course.thumbnailUrl && course.thumbnailUrl === targetUrl) ||
      (objKey && course.thumbnailPublicId && course.thumbnailPublicId === objKey));

  if (isPublishedThumbnail) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    message: 'Access denied — purchase this course to view this content',
  };
}

module.exports = {
  assertSecureMediaAccess,
  resolveCourseIdForUrl,
  extractCourseIdFromPath,
  hasPaidPurchase,
  hasEnrollment,
};
