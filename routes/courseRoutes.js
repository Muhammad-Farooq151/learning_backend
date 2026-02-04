const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminMiddleware');
const {
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
} = require('../controllers/courseController');
const { uploadCourseFiles } = require('../middleware/upload');

// Create new course (with thumbnail and videos) - Admin only
router.post(
  '/',
  adminAuth,
  uploadCourseFiles,
  createCourse
);

// Get all courses - Public
router.get('/', getAllCourses);

// Get single course by ID - Public
router.get('/:id', getCourseById);

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
