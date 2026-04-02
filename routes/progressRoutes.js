const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const {
  updateProgress,
  saveProgress,
  getProgress,
  getUserProgress,
} = require('../controllers/progressController');

/** Per-user limit on progress writes — doc: ~60/min */
const progressSaveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

// POST /api/progress/update (legacy)
router.post('/update', updateProgress);

// POST /api/progress/save — authenticated, scalable flush
router.post('/save', auth, progressSaveLimiter, saveProgress);

// GET /api/progress/:courseId?userId=...
router.get('/:courseId', getProgress);

// GET /api/progress/user/:userId
router.get('/user/:userId', getUserProgress);

module.exports = router;
