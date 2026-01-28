const User = require('../models/User');

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

module.exports = {
  getAllUsers,
  getProfile,
  updateProfile,
};

