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

module.exports = {
  getAllUsers,
};

