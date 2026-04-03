const User = require('../models/User');
const { getJwtStringFromRequest } = require('../utils/authRequest');
const { verifyJwtToken } = require('../utils/jwtVerify');

/**
 * Middleware to protect admin routes
 * Only allows users with role='admin'
 */
const adminAuth = async (req, res, next) => {
  try {
    const token = getJwtStringFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const decoded = verifyJwtToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid or expired token.',
      });
    }

    // Find user
    const user = await User.findById(decoded.userId).select('role status');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not found.',
      });
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Your account is blocked.',
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      fullName: decoded.fullName,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Token expired.',
      });
    }
    console.error('Admin auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
      error: error.message,
    });
  }
};

module.exports = { adminAuth };
