/**
 * Removes direct GCS/CDN links from API JSON (non-admin) so DevTools cannot copy
 * storage.googleapis.com URLs. Thumbnails load via GET /api/courses/:id/media/thumbnail + JWT.
 *
 * - Root course: thumbnailUrl / thumbnailPublicId cleared; thumbnailMediaPath added.
 * - Lesson/resource stripping is done in courseController for list endpoint only.
 */

const { publicObjectUrl, normalizeBucketNameFromEnv } = require('../config/gcsStorage');

function redactRootThumbnailFields(courseObj) {
  if (!courseObj || typeof courseObj !== 'object') return courseObj;

  const hadThumb =
    Boolean(courseObj.thumbnailUrl) ||
    Boolean(courseObj.thumbnailPublicId);

  if (typeof courseObj.thumbnailUrl === 'string') courseObj.thumbnailUrl = null;
  if (typeof courseObj.thumbnailPublicId === 'string') courseObj.thumbnailPublicId = null;

  const id = courseObj._id ? String(courseObj._id) : courseObj.id ? String(courseObj.id) : null;
  if (id && hadThumb) {
    courseObj.thumbnailMediaPath = `/api/courses/${id}/media/thumbnail`;
    courseObj.hasThumbnail = true;
  } else {
    courseObj.hasThumbnail = false;
  }

  return courseObj;
}

/**
 * Strip lesson + top-level resource file URLs from a course object (course list / public summaries).
 */
function stripLessonAndResourceMediaUrls(courseObj) {
  if (!courseObj || typeof courseObj !== 'object') return;
  if (Array.isArray(courseObj.lessons)) {
    courseObj.lessons.forEach((lesson) => {
      if (!lesson || typeof lesson !== 'object') return;
      lesson.videoUrl = null;
      lesson.videoPublicId = null;
      lesson.rawVideoPublicId = null;
      if (Array.isArray(lesson.resources)) {
        lesson.resources.forEach((r) => {
          if (r && typeof r === 'object') {
            r.fileUrl = null;
            r.filePublicId = null;
          }
        });
      }
    });
  }
  if (Array.isArray(courseObj.resources)) {
    courseObj.resources.forEach((r) => {
      if (r && typeof r === 'object') {
        r.fileUrl = null;
        r.filePublicId = null;
      }
    });
  }
}

function redactCourseMediaForClient(courseObj) {
  redactRootThumbnailFields(courseObj);
  return courseObj;
}

function resolveCourseThumbnailTargetUrl(course) {
  if (course.thumbnailUrl) return course.thumbnailUrl;
  if (!course.thumbnailPublicId) return null;
  const raw = process.env.GCS_BUCKET_STATIC_ASSETS || process.env.GCS_BUCKET_STATIC;
  if (!raw) return null;
  const bucketName = normalizeBucketNameFromEnv(raw, 'GCS_BUCKET_STATIC_ASSETS');
  return publicObjectUrl(bucketName, course.thumbnailPublicId);
}

module.exports = {
  redactCourseMediaForClient,
  redactRootThumbnailFields,
  stripLessonAndResourceMediaUrls,
  resolveCourseThumbnailTargetUrl,
};
