/**
 * Section 6 — `GET /chunk` → `/api/media/chunk` when mounted under `/api/media` (see `mediaRoutes.js`).
 * 302 redirect to short-lived GCS signed URL after JWT + enrollment check.
 */
const express = require('express');
const { getMediaChunk } = require('../controllers/mediaController');
const { hlsTrafficLimiter } = require('./mediaLimiters');

const router = express.Router();

router.get('/chunk', hlsTrafficLimiter, getMediaChunk);

module.exports = router;
