/**
 * Section 6 — `GET /:lessonId/stream` (mounted at `/api/lessons` → `/api/lessons/:lessonId/stream`).
 */
const express = require('express');
const { getLessonStream } = require('../controllers/mediaController');
const { hlsTrafficLimiter } = require('./mediaLimiters');

const router = express.Router();

router.get('/:lessonId/stream', hlsTrafficLimiter, getLessonStream);

module.exports = router;
