/**
 * Section 6 — aggregates lesson stream + media chunk routes under `/api`.
 * - `routes/lessons.js` → `/api/lessons/:lessonId/stream`
 * - `routes/media.js` → `/api/media/chunk`
 */
const express = require('express');
const lessonsRouter = require('./lessons');
const mediaRouter = require('./media');

const router = express.Router();

router.use('/lessons', lessonsRouter);
router.use('/media', mediaRouter);

module.exports = router;
