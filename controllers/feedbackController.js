const Feedback = require('../models/Feedback');
const User = require('../models/User');
const Course = require('../models/Course');
const { uploadFileToCloudinary } = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

// POST /api/feedback
// Submit feedback for a course
const submitFeedback = async (req, res) => {
  try {
    // Get userId from authenticated user (from auth middleware)
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      });
    }

    const { courseId, rating, feedback, fullName, rememberTop, rememberBottom } = req.body;

    // Validate required fields
    if (!courseId || !rating || !feedback || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'courseId, rating, feedback, and fullName are required',
      });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Check if user is enrolled in the course
    const isEnrolled = user.enrolledCourses?.some(
      (id) => id.toString() === courseId.toString()
    );

    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'User is not enrolled in this course',
      });
    }

    // Check if feedback already exists for this user and course
    const existingFeedback = await Feedback.findOne({ userId, courseId });
    if (existingFeedback) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted feedback for this course',
        data: {
          existing: true,
          feedbackId: existingFeedback._id,
          rating: existingFeedback.rating,
          createdAt: existingFeedback.createdAt,
        },
      });
    }

    let fileUrl = null;
    let filePublicId = null;

    // Handle file upload if present
    if (req.file) {
      try {
        const filePath = req.file.path;
        const uploadResult = await uploadFileToCloudinary(filePath, 'feedback/images');
        
        fileUrl = uploadResult.url;
        filePublicId = uploadResult.publicId;

        // Delete local file after upload
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (uploadError) {
        console.error('Error uploading file to Cloudinary:', uploadError);
        // Delete local file if upload fails
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        // Continue without file - feedback can still be submitted
      }
    }

    // Create feedback
    const newFeedback = new Feedback({
      userId,
      courseId,
      rating: parseInt(rating),
      feedback: feedback.trim(),
      fullName: fullName.trim(),
      fileUrl,
      filePublicId,
      rememberTop: rememberTop === 'true' || rememberTop === true,
      rememberBottom: rememberBottom === 'true' || rememberBottom === true,
    });

    await newFeedback.save();

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        id: newFeedback._id,
        rating: newFeedback.rating,
        feedback: newFeedback.feedback,
        fullName: newFeedback.fullName,
        fileUrl: newFeedback.fileUrl,
        createdAt: newFeedback.createdAt,
      },
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    
    // Clean up uploaded file if error occurs
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error submitting feedback',
      error: error.message,
    });
  }
};

// GET /api/feedback/user/:userId
// Get all feedbacks for a user
const getUserFeedbacks = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const feedbacks = await Feedback.find({ userId })
      .populate('courseId', 'title thumbnailUrl')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: feedbacks,
    });
  } catch (error) {
    console.error('Error fetching user feedbacks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching feedbacks',
      error: error.message,
    });
  }
};

// GET /api/feedback/course/:courseId
// Get all feedbacks for a course
const getCourseFeedbacks = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: 'courseId is required',
      });
    }

    const feedbacks = await Feedback.find({ courseId })
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: feedbacks,
    });
  } catch (error) {
    console.error('Error fetching course feedbacks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching feedbacks',
      error: error.message,
    });
  }
};

module.exports = {
  submitFeedback,
  getUserFeedbacks,
  getCourseFeedbacks,
};
