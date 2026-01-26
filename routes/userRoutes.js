const express = require('express');
const router = express.Router();

const { getAllUsers, getProfile, updateProfile } = require('../controllers/userController');

// GET /api/users
router.get('/', getAllUsers);

// POST /api/users/profile - Get user profile
router.post('/profile', getProfile);

// PUT /api/users/profile - Update user profile
router.put('/profile', updateProfile);

module.exports = router;

