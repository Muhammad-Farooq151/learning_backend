const User = require('../models/User');
const bcrypt = require('bcrypt');

// GET /api/admins
// Get all admins
const getAllAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('fullName email phoneNumber status role createdAt updatedAt')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: admins,
    });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admins',
      error: error.message,
    });
  }
};

// GET /api/admins/:id
// Get single admin by ID
const getAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await User.findOne({ _id: id, role: 'admin' })
      .select('fullName email phoneNumber status role createdAt updatedAt');

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    console.error('Error fetching admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin',
      error: error.message,
    });
  }
};

// POST /api/admins
// Create new admin
const createAdmin = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, password, status } = req.body;

    // Validate required fields
    if (!fullName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fullName, email, phoneNumber, password',
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create admin - ensure role is always 'admin'
    const admin = new User({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      phoneNumber: phoneNumber.trim(),
      password: hashedPassword,
      role: 'admin', // Always set role to 'admin'
      status: status || 'active',
      isEmailVerified: true, // Admins are auto-verified
    });

    await admin.save();

    // Return admin without password
    const adminObj = admin.toObject();
    delete adminObj.password;

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: adminObj,
    });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating admin',
      error: error.message,
    });
  }
};

// PUT /api/admins/:id
// Update admin
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phoneNumber, password, status } = req.body;

    const admin = await User.findOne({ _id: id, role: 'admin' });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    // Update fields - ensure role remains 'admin' (cannot be changed)
    if (fullName) admin.fullName = fullName.trim();
    if (email) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: id }
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists',
        });
      }
      admin.email = email.toLowerCase().trim();
    }
    if (phoneNumber) admin.phoneNumber = phoneNumber.trim();
    if (status && ['active', 'blocked', 'inactive'].includes(status)) {
      admin.status = status;
    }
    if (password) {
      // Hash new password
      const salt = await bcrypt.genSalt(10);
      admin.password = await bcrypt.hash(password, salt);
    }
    
    // Ensure role is always 'admin' (cannot be changed)
    admin.role = 'admin';

    await admin.save();

    // Return admin without password
    const adminObj = admin.toObject();
    delete adminObj.password;

    res.status(200).json({
      success: true,
      message: 'Admin updated successfully',
      data: adminObj,
    });
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating admin',
      error: error.message,
    });
  }
};

// DELETE /api/admins/:id
// Delete admin
const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await User.findOne({ _id: id, role: 'admin' });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Admin deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting admin',
      error: error.message,
    });
  }
};

module.exports = {
  getAllAdmins,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
};
