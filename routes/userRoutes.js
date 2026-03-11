const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  getProfile,
  updateProfile,
  updatePassword,
  enrollInCourse,
  getMyCourses,
  getDashboardStats,
} = require('../controllers/userController');

// GET /api/users
router.get('/', getAllUsers);

// POST /api/users/profile - Get user profile
router.post('/profile', getProfile);

// PUT /api/users/profile - Update user profile
router.put('/profile', updateProfile);

// PUT /api/users/password - Update user password
router.put('/password', updatePassword);

// POST /api/users/enroll - Enroll user in a course after payment
router.post('/enroll', enrollInCourse);

// GET /api/users/my-courses?userId=... - Get enrolled courses for user
router.get('/my-courses', getMyCourses);

// GET /api/users/dashboard-stats?userId=... - Get dashboard statistics for user
router.get('/dashboard-stats', getDashboardStats);

module.exports = router;

