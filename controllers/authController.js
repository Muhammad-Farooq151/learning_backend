const User = require('../models/User');
const VerificationToken = require('../models/VerificationToken');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateVerificationToken, sendVerificationLink, createTransporter } = require('../libs/emailUtils');

/**
 * Signup - Register a new user
 */
const signup = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, password } = req.body;

    // Validation
    if (!fullName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phoneNumber }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email.toLowerCase()
          ? 'Email already registered'
          : 'Phone number already registered',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Generate verification token
    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Delete any existing token for this email and type
    await VerificationToken.deleteMany({ email: normalizedEmail, type: 'signup' });

    // Create new verification token
    let storedToken;
    try {
      storedToken = await VerificationToken.create({
        email: normalizedEmail,
        token,
        type: 'signup',
        payload: {
          fullName,
          phoneNumber,
          password: hashedPassword,
        },
        expiresAt,
      });

      console.log('✅ Verification token created:', {
        email: normalizedEmail,
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 10),
        expiresAt: expiresAt.toISOString(),
        _id: storedToken._id,
        collection: storedToken.collection.name,
      });
    } catch (createError) {
      console.error('❌ Error creating verification token:', createError);
      console.error('Error details:', {
        message: createError.message,
        code: createError.code,
        keyPattern: createError.keyPattern,
        keyValue: createError.keyValue,
      });
      throw createError;
    }

    // Verify the token was stored correctly
    const verifyStored = await VerificationToken.findOne({
      email: normalizedEmail,
      token,
      type: 'signup',
    });

    if (!verifyStored) {
      console.error('❌ Token storage verification failed!');
      console.error('Attempted to store:', {
        email: normalizedEmail,
        tokenPrefix: token.substring(0, 10),
        type: 'signup',
      });
      throw new Error('Failed to store verification token');
    }

    console.log('✅ Verification token stored and verified:', {
      email: normalizedEmail,
      storedEmail: verifyStored.email,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 10),
      expiresAt: expiresAt.toISOString(),
      _id: verifyStored._id,
    });

    // Send verification link
    await sendVerificationLink(email, fullName, token);

    res.status(201).json({
      success: true,
      message: 'Verification link sent to your email address',
      data: {
        email: email.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during signup',
      error: error.message,
    });
  }
};

/**
 * Login - Send OTP to user's email/phone
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification pending. Please verify your email before logging in.',
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is blocked. Please contact support.',
      });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'default_dev_jwt_secret_change_me';
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message,
    });
  }
};

/**
 * Verify OTP - Verify OTP and return JWT token
 */
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required',
      });
    }

    // Verify OTP
    const verification = verifyOTPFromUtils(email.toLowerCase(), otp);

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message,
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Generate JWT token (you'll need to install jsonwebtoken)
    // For now, returning user data
    // TODO: Implement JWT token generation
    const token = 'temp_token_' + user._id; // Replace with actual JWT

    // Update email verification status if it's a signup verification
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
        },
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during OTP verification',
      error: error.message,
    });
  }
};

/**
 * Resend Verification Link
 */
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Check if verification token exists
    const verificationToken = await VerificationToken.findOne({
      email: email.toLowerCase(),
      type: 'signup',
    });

    if (!verificationToken) {
      return res.status(404).json({
        success: false,
        message: 'No pending verification found. Please sign up again.',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      await VerificationToken.deleteOne({ _id: verificationToken._id });
      return res.status(400).json({
        success: false,
        message: 'Email already verified. You can login now.',
      });
    }

    // Generate new token
    const newToken = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update verification token
    verificationToken.token = newToken;
    verificationToken.expiresAt = expiresAt;
    verificationToken.createdAt = new Date();
    await verificationToken.save();

    // Send new verification link
    await sendVerificationLink(email, verificationToken.payload.fullName || 'User', newToken);

    res.status(200).json({
      success: true,
      message: 'Verification link resent to your email',
    });
  } catch (error) {
    console.error('Resend verification link error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during resend verification link',
      error: error.message,
    });
  }
};

/**
 * Verify Email - Verify email token and create user account
 */
const verifyEmail = async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification token are required',
      });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedToken = token.trim();

    console.log('🔍 Verifying email:', {
      receivedEmail: email,
      normalizedEmail: normalizedEmail,
      tokenLength: normalizedToken.length,
      tokenPrefix: normalizedToken.substring(0, 10),
    });

    // Find verification token
    const verificationToken = await VerificationToken.findOne({
      email: normalizedEmail,
      token: normalizedToken,
      type: 'signup',
    });

    if (!verificationToken) {
      // Log for debugging
      console.log('❌ Verification token not found with email and token');
      
      // Check if token exists at all
      const tokenCheck = await VerificationToken.findOne({
        token: normalizedToken,
        type: 'signup',
      });
      
      if (tokenCheck) {
        console.log('⚠️ Token found but email mismatch:', {
          requestedEmail: normalizedEmail,
          storedEmail: tokenCheck.email,
          emailsMatch: normalizedEmail === tokenCheck.email,
        });
      } else {
        console.log('❌ Token not found in database at all');
        
        // Check all tokens for this email
        const emailCheck = await VerificationToken.find({
          email: normalizedEmail,
          type: 'signup',
        });
        console.log('📧 Tokens found for this email:', emailCheck.length);
        if (emailCheck.length > 0) {
          console.log('📧 Latest token for email:', {
            tokenPrefix: emailCheck[0].token.substring(0, 10),
            expiresAt: emailCheck[0].expiresAt,
          });
        }
      }
      
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification link',
      });
    }

    console.log('✅ Verification token found:', {
      email: verificationToken.email,
      expiresAt: verificationToken.expiresAt,
      isExpired: new Date() > verificationToken.expiresAt,
    });

    // Check if token has expired
    if (new Date() > verificationToken.expiresAt) {
      await VerificationToken.deleteOne({ _id: verificationToken._id });
      return res.status(400).json({
        success: false,
        message: 'Verification link has expired. Please request a new one.',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      // Delete verification token
      await VerificationToken.deleteOne({ _id: verificationToken._id });
      
      // If user exists but email not verified, update it
      if (!existingUser.isEmailVerified) {
        existingUser.isEmailVerified = true;
        await existingUser.save();
        
        return res.status(200).json({
          success: true,
          message: 'Email verified successfully. Your account has been activated.',
          data: {
            user: {
              id: existingUser._id,
              fullName: existingUser.fullName,
              email: existingUser.email,
              phoneNumber: existingUser.phoneNumber,
              isEmailVerified: existingUser.isEmailVerified,
            },
          },
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Email already verified. You can login now.',
        data: {
          user: {
            id: existingUser._id,
            fullName: existingUser.fullName,
            email: existingUser.email,
            phoneNumber: existingUser.phoneNumber,
            isEmailVerified: existingUser.isEmailVerified,
          },
        },
      });
    }

    // Get payload from verification token
    const payload = verificationToken.payload || {};

    if (!payload.password || !payload.fullName || !payload.phoneNumber) {
      await VerificationToken.deleteOne({ _id: verificationToken._id });
      return res.status(400).json({
        success: false,
        message: 'Signup data is incomplete. Please register again.',
      });
    }

    // Create user account with default role 'user'
    try {
      const user = await User.create({
        fullName: payload.fullName,
        email: normalizedEmail,
        phoneNumber: payload.phoneNumber,
        password: payload.password,
        isEmailVerified: true,
        isPhoneVerified: false,
        role: 'user', // Default role for all signups
      });

      // Delete verification token
      await VerificationToken.deleteOne({ _id: verificationToken._id });

      res.status(200).json({
        success: true,
        message: 'Email verified successfully. Your account has been created.',
        data: {
          user: {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            isEmailVerified: user.isEmailVerified,
          },
        },
      });
    } catch (createError) {
      // Handle duplicate key error
      if (createError.code === 11000) {
        // User was created between check and create (race condition)
        const user = await User.findOne({ email: normalizedEmail });
        await VerificationToken.deleteOne({ _id: verificationToken._id });
        
        if (user) {
          // Update email verification if needed
          if (!user.isEmailVerified) {
            user.isEmailVerified = true;
            await user.save();
          }
          
          return res.status(200).json({
            success: true,
            message: 'Email verified successfully. Your account has been activated.',
            data: {
              user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                isEmailVerified: user.isEmailVerified,
              },
            },
          });
        }
      }
      throw createError; // Re-throw if it's a different error
    }
  } catch (error) {
    console.error('Verify email error:', error);
    
    // Only send response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Server error during email verification',
        error: error.message,
      });
    }
  }
};

/**
 * Forgot Password - Send password reset link
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
      });
    }

    // Generate reset token
    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // Store reset token
    await VerificationToken.findOneAndUpdate(
      { email: email.toLowerCase(), type: 'password-reset' },
      {
        email: email.toLowerCase(),
        token,
        type: 'password-reset',
        payload: {},
        expiresAt,
        createdAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Send reset link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/create-new-password?token=${token}&email=${encodeURIComponent(email)}`;

    const transporter = createTransporter();
    const mailOptions = {
      from: `"LearningHub" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset Your Password - LearningHub',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2DB888; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">LearningHub</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
            <p style="color: #666; font-size: 16px;">
              Hello ${user.fullName},
            </p>
            <p style="color: #666; font-size: 16px;">
              We received a request to reset your password. Click the button below to create a new password.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #2DB888; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              This link will expire in 1 hour. If you didn't request this, please ignore this email.
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #666; font-size: 12px; word-break: break-all;">
              ${resetLink}
            </p>
          </div>
          <div style="background-color: #1E293B; padding: 15px; text-align: center;">
            <p style="color: #94A3B8; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} LearningHub. All rights reserved.
            </p>
          </div>
        </div>
      `,
      text: `Hello ${user.fullName},\n\nClick this link to reset your password: ${resetLink}\n\nThis link will expire in 1 hour.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}`);

    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset request',
      error: error.message,
    });
  }
};

/**
 * Reset Password - Reset password using token
 */
const resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, token, and password are required',
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    // Find verification token
    const verificationToken = await VerificationToken.findOne({
      email: email.toLowerCase(),
      token,
      type: 'password-reset',
    });

    if (!verificationToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link',
      });
    }

    // Check if token has expired
    if (new Date() > verificationToken.expiresAt) {
      await VerificationToken.deleteOne({ _id: verificationToken._id });
      return res.status(400).json({
        success: false,
        message: 'Reset link has expired. Please request a new one.',
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      await VerificationToken.deleteOne({ _id: verificationToken._id });
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    user.password = hashedPassword;
    await user.save();

    // Delete verification token
    await VerificationToken.deleteOne({ _id: verificationToken._id });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset',
      error: error.message,
    });
  }
};

module.exports = {
  signup,
  login,
  verifyOTP,
  verifyEmail,
  resendOTP,
  forgotPassword,
  resetPassword,
};

