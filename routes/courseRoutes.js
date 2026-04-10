const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminMiddleware');
const { optionalAuth } = require('../middleware/optionalAuth');
const {
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  presignNewCourseLessonVideos,
  presignExistingCourseLessonVideo,
} = require('../controllers/courseController');
const { streamCourseThumbnail } = require('../controllers/courseMediaController');
const { uploadCourseFiles } = require('../middleware/upload');

// Direct-to-GCS signed PUT (small JSON only; bypasses Cloud Run request size limits)
router.post('/presign-lesson-videos', adminAuth, presignNewCourseLessonVideos);
router.post('/:courseId/presign-lesson-video', adminAuth, presignExistingCourseLessonVideo);

// Create new course (with thumbnail and videos) - Admin only
router.post(
  '/',
  adminAuth,
  uploadCourseFiles,
  createCourse
);

// Get all courses — optional JWT (admin keeps raw URLs in JSON when REDACT_GCS_URLS_IN_COURSE_API is on)
router.get('/', optionalAuth, getAllCourses);

// Cover image: no GCS URL in API JSON; browser loads this path with ?token=
router.get('/:courseId/media/thumbnail', streamCourseThumbnail);

// Get single course by ID
router.get('/:id', optionalAuth, getCourseById);

// Update course (with optional thumbnail and videos) - Admin only
router.put(
  '/:id',
  adminAuth,
  uploadCourseFiles,
  updateCourse
);

// Delete course - Admin only
router.delete('/:id', adminAuth, deleteCourse);

module.exports = router;
