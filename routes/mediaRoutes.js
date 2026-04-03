const express = require('express');
const rateLimit = require('express-rate-limit');
const { getLessonStream, getMediaChunk } = require('../controllers/mediaController');

const router = express.Router();

/** Doc §4.5 — generous limit for HLS chunk traffic */
const mediaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

router.get('/lessons/:lessonId/stream', mediaLimiter, getLessonStream);
router.get('/media/chunk', mediaLimiter, getMediaChunk);

module.exports = router;
