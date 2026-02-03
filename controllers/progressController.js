const CourseProgress = require('../models/CourseProgress');
const User = require('../models/User');
const Course = require('../models/Course');

// POST /api/progress/update
// Update lesson progress for a user and course
const updateProgress = async (req, res) => {
  try {
    const { userId, courseId, lessonId, watched, completed } = req.body;

    if (!userId || !courseId || !lessonId) {
      return res.status(400).json({
        success: false,
        message: 'userId, courseId, and lessonId are required',
      });
    }

    // Verify user exists and is enrolled in the course
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const isEnrolled = user.enrolledCourses?.some(
      (id) => id.toString() === courseId.toString()
    );

    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'User is not enrolled in this course',
      });
    }

    // Find or create progress document
    let progress = await CourseProgress.findOne({ userId, courseId });

    if (!progress) {
      // Create new progress document
      progress = new CourseProgress({
        userId,
        courseId,
        lessons: [],
      });
    }

    // Find or update lesson progress
    const lessonIndex = progress.lessons.findIndex(
      (l) => l.lessonId.toString() === lessonId.toString()
    );

    if (lessonIndex >= 0) {
      // Update existing lesson progress
      progress.lessons[lessonIndex].watched = watched || progress.lessons[lessonIndex].watched;
      progress.lessons[lessonIndex].completed = completed !== undefined ? completed : progress.lessons[lessonIndex].completed;
      progress.lessons[lessonIndex].lastWatchedAt = new Date();
    } else {
      // Add new lesson progress
      progress.lessons.push({
        lessonId,
        watched: watched || 0,
        completed: completed || false,
        lastWatchedAt: new Date(),
      });
    }

    // Calculate overall progress
    progress.calculateOverallProgress();
    progress.lastAccessedAt = new Date();

    await progress.save();

    res.status(200).json({
      success: true,
      message: 'Progress updated successfully',
      data: progress,
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating progress',
      error: error.message,
    });
  }
};

// GET /api/progress/:courseId?userId=...
// Get progress for a user and course
const getProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userId } = req.query;

    if (!userId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'userId and courseId are required',
      });
    }

    const progress = await CourseProgress.findOne({ userId, courseId });

    if (!progress) {
      return res.status(200).json({
        success: true,
        data: {
          userId,
          courseId,
          lessons: [],
          overallProgress: 0,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: progress,
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching progress',
      error: error.message,
    });
  }
};

// GET /api/progress/user/:userId
// Get all progress for a user
const getUserProgress = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const progressList = await CourseProgress.find({ userId })
      .populate('courseId', 'title thumbnailUrl')
      .sort({ lastAccessedAt: -1 });

    res.status(200).json({
      success: true,
      data: progressList,
    });
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user progress',
      error: error.message,
    });
  }
};

module.exports = {
  updateProgress,
  getProgress,
  getUserProgress,
};
