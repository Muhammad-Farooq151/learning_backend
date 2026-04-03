const User = require('../models/User');
const { getJwtStringFromRequest } = require('../utils/authRequest');
const { verifyJwtToken } = require('../utils/jwtVerify');

/**
 * Middleware to protect user routes
 * Verifies JWT token and attaches user to request
 */
const auth = async (req, res, next) => {
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
    const user = await User.findById(decoded.userId).select('_id email fullName role status');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not found.',
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Your account is blocked.',
      });
    }

    // Attach user to request
    req.user = {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.',
      });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
    });
  }
};

module.exports = { auth };
