const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  getProfile,
  updateProfile,
  enrollInCourse,
  getMyCourses,
} = require('../controllers/userController');

// GET /api/users
router.get('/', getAllUsers);

// POST /api/users/profile - Get user profile
router.post('/profile', getProfile);

// PUT /api/users/profile - Update user profile
router.put('/profile', updateProfile);

// POST /api/users/enroll - Enroll user in a course after payment
router.post('/enroll', enrollInCourse);

// GET /api/users/my-courses?userId=... - Get enrolled courses for user
router.get('/my-courses', getMyCourses);

module.exports = router;

