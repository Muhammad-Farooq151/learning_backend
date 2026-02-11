const express = require('express');
const router = express.Router();
const { submitFeedback, getUserFeedbacks, getCourseFeedbacks } = require('../controllers/feedbackController');
const { uploadFeedbackFile } = require('../middleware/upload');
const { auth } = require('../middleware/authMiddleware');

// POST /api/feedback - Submit feedback (requires authentication)
router.post('/', auth, uploadFeedbackFile, submitFeedback);

// GET /api/feedback/user/:userId - Get all feedbacks for a user
router.get('/user/:userId', getUserFeedbacks);

// GET /api/feedback/course/:courseId - Get all feedbacks for a course
router.get('/course/:courseId', getCourseFeedbacks);

module.exports = router;
