const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const {
  signup,
  login,
  adminLogin,
  logout,
  verifyOTP,
  verifyEmail,
  resendOTP,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');

/** Doc §4.5 — strict limit on credential endpoints */
const authRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts — try again later' },
});

// POST /api/auth/signup
router.post('/signup', signup);

// POST /api/auth/login
router.post('/login', authRouteLimiter, login);

// POST /api/auth/admin-login
router.post('/admin-login', authRouteLimiter, adminLogin);

// POST /api/auth/logout — clear httpOnly cookie (Doc §3.4)
router.post('/logout', logout);

// POST /api/auth/verify-otp
router.post('/verify-otp', verifyOTP);

// POST /api/auth/verify-email
router.post('/verify-email', verifyEmail);

// POST /api/auth/resend-otp
router.post('/resend-otp', resendOTP);

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', resetPassword);

module.exports = router;

