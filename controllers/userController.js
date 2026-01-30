const User = require('../models/User');
const Course = require('../models/Course');

// GET /api/users
// Returns users for admin listing
const getAllUsers = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status && ['active', 'blocked', 'inactive'].includes(String(status).toLowerCase())) {
      query.status = String(status).toLowerCase();
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .select('fullName email status role createdAt');

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message,
    });
  }
};

// POST /api/users/profile
// Get user profile by userId
const getProfile = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User id is required',
      });
    }

    const user = await User.findById(userId).select('fullName email phoneNumber createdAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        fullName: user.fullName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message,
    });
  }
};

// PUT /api/users/profile
// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { userId, fullName, phoneNumber } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User id is required',
      });
    }

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required',
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber || '',
        updatedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
      }
    ).select('fullName email phoneNumber createdAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        fullName: user.fullName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message,
    });
  }
};

// POST /api/users/enroll
// Enroll user in a course after successful payment
const enrollInCourse = async (req, res) => {
  try {
    const { userId, courseId } = req.body;

    if (!userId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'userId and courseId are required',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const alreadyEnrolled = user.enrolledCourses?.some(
      (cId) => cId.toString() === courseId.toString()
    );

    if (alreadyEnrolled) {
      return res.status(200).json({
        success: true,
        message: 'User already enrolled in this course',
      });
    }

    user.enrolledCourses = user.enrolledCourses || [];
    user.enrolledCourses.push(course._id);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User enrolled in course successfully',
    });
  } catch (error) {
    console.error('Error enrolling user in course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to enroll in course',
      error: error.message,
    });
  }
};

// GET /api/users/my-courses?userId=...
// Return enrolled courses for a user
const getMyCourses = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const user = await User.findById(userId).populate({
      path: 'enrolledCourses',
      select: 'title description thumbnailUrl skills price discountPercentage',
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const courses = (user.enrolledCourses || []).map((course) => ({
      id: course._id.toString(),
      title: course.title || '',
      description: course.description || '',
      thumbnailUrl: course.thumbnailUrl || '',
      skills: course.skills || [],
      price: course.price,
      discountPercentage: course.discountPercentage || 0,
    }));

    return res.status(200).json({
      success: true,
      data: courses,
    });
  } catch (error) {
    console.error('Error fetching my courses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch enrolled courses',
      error: error.message,
    });
  }
};

// GET /api/users/dashboard-stats?userId=...
// Return dashboard statistics for a user
const getDashboardStats = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const user = await User.findById(userId).populate({
      path: 'enrolledCourses',
      select: 'title category lessons createdAt',
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const enrolledCourses = user.enrolledCourses || [];

    // Calculate courses completed (all enrolled courses)
    const coursesCompleted = enrolledCourses.length;

    // Calculate total learning time (sum of all lesson durations)
    let totalLearningTime = 0; // in seconds
    enrolledCourses.forEach((course) => {
      if (course.lessons && Array.isArray(course.lessons)) {
        course.lessons.forEach((lesson) => {
          totalLearningTime += lesson.duration || 0;
        });
      }
    });
    const totalHours = Math.floor(totalLearningTime / 3600);
    const totalMinutes = Math.floor((totalLearningTime % 3600) / 60);
    const totalLearningTimeFormatted = totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : `${totalMinutes}m`;

    // Calculate overall progress (average, for now assume 50% for enrolled courses)
    const overallProgress = enrolledCourses.length > 0 ? Math.round(50) : 0;

    // Calculate monthly learning progress (based on enrollment dates)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    const monthlyData = new Array(12).fill(0);

    enrolledCourses.forEach((course) => {
      if (course.createdAt) {
        const courseDate = new Date(course.createdAt);
        if (courseDate.getFullYear() === currentYear) {
          const monthIndex = courseDate.getMonth();
          monthlyData[monthIndex] += 1;
        }
      }
    });

    // Convert to percentage (max value = 100)
    const maxEnrollments = Math.max(...monthlyData, 1);
    const monthlyProgressData = months.map((month, index) => ({
      month,
      value: maxEnrollments > 0 ? Math.round((monthlyData[index] / maxEnrollments) * 100) : 0,
    }));

    // Calculate category breakdown
    const categoryCount = {};
    enrolledCourses.forEach((course) => {
      const category = course.category || 'Uncategorized';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    const totalCategories = enrolledCourses.length;
    const categoryBreakdown = Object.entries(categoryCount).map(([name, count]) => ({
      name,
      value: totalCategories > 0 ? Math.round((count / totalCategories) * 100) : 0,
    }));

    // Assign colors to categories
    const categoryColors = {
      'Programming': '#4F7BFF',
      'Design': '#FFC657',
      'Data Science': '#8CD867',
      'AI/ML': '#FF6B6B',
      'AI Agents & Agentic AI': '#9B59B6',
      'Uncategorized': '#95A5A6',
    };

    const categoryBreakdownWithColors = categoryBreakdown.map((item) => ({
      ...item,
      color: categoryColors[item.name] || '#95A5A6',
    }));

    return res.status(200).json({
      success: true,
      data: {
        coursesCompleted: coursesCompleted,
        totalLearningTime: totalLearningTimeFormatted,
        totalLearningTimeSeconds: totalLearningTime,
        overallProgress: overallProgress,
        monthlyProgress: monthlyProgressData,
        categoryBreakdown: categoryBreakdownWithColors,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message,
    });
  }
};

module.exports = {
  getAllUsers,
  getProfile,
  updateProfile,
  enrollInCourse,
  getMyCourses,
  getDashboardStats,
};

