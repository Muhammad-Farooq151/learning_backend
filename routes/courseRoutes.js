const express = require('express');
const router = express.Router();
const {
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
} = require('../controllers/courseController');
const { uploadCourseFiles } = require('../middleware/upload');

// Create new course (with thumbnail and videos)
router.post(
  '/',
  uploadCourseFiles,
  createCourse
);

// Get all courses
router.get('/', getAllCourses);

// Get single course by ID
router.get('/:id', getCourseById);

// Update course (with optional thumbnail and videos)
router.put(
  '/:id',
  uploadCourseFiles,
  updateCourse
);

// Delete course
router.delete('/:id', deleteCourse);

module.exports = router;
