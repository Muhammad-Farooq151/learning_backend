const express = require('express');
const router = express.Router();
const {
  updateProgress,
  getProgress,
  getUserProgress,
} = require('../controllers/progressController');

// POST /api/progress/update
router.post('/update', updateProgress);

// GET /api/progress/:courseId?userId=...
router.get('/:courseId', getProgress);

// GET /api/progress/user/:userId
router.get('/user/:userId', getUserProgress);

module.exports = router;
