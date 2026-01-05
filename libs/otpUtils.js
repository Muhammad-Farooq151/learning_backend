const crypto = require('crypto');
const nodemailer = require('nodemailer');

/**
 * Generate a 6-digit OTP
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Store OTP in memory (in production, use Redis or database)
 * Format: { email/phone: { otp, expiresAt, attempts } }
 */
const otpStore = new Map();

/**
 * Store OTP with expiration (default 10 minutes)
 */
const storeOTP = (identifier, type = 'email', expiresInMinutes = 10) => {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  
  otpStore.set(identifier, {
    otp,
    expiresAt,
    type,
    attempts: 0,
    createdAt: new Date(),
  });

  // Clean up expired OTPs periodically
  setTimeout(() => {
    if (otpStore.has(identifier)) {
      const stored = otpStore.get(identifier);
      if (stored.expiresAt < new Date()) {
        otpStore.delete(identifier);
      }
    }
  }, expiresInMinutes * 60 * 1000);

  return otp;
};

/**
 * Verify OTP
 */
const verifyOTP = (identifier, inputOTP) => {
  const stored = otpStore.get(identifier);
  
  if (!stored) {
    return { valid: false, message: 'OTP not found or expired' };
  }

  if (stored.expiresAt < new Date()) {
    otpStore.delete(identifier);
    return { valid: false, message: 'OTP has expired' };
  }

  if (stored.attempts >= 5) {
    otpStore.delete(identifier);
    return { valid: false, message: 'Too many attempts. Please request a new OTP' };
  }

  stored.attempts += 1;

  if (stored.otp !== inputOTP) {
    return { valid: false, message: 'Invalid OTP', attempts: stored.attempts };
  }

  // OTP verified successfully, remove it
  otpStore.delete(identifier);
  return { valid: true, message: 'OTP verified successfully' };
};

/**
 * Get OTP for identifier (for sending)
 */
const getOTP = (identifier) => {
  const stored = otpStore.get(identifier);
  if (!stored || stored.expiresAt < new Date()) {
    return null;
  }
  return stored.otp;
};

/**
 * Clear OTP for identifier
 */
const clearOTP = (identifier) => {
  otpStore.delete(identifier);
};

/**
 * Create nodemailer transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
    },
  });
};

/**
 * Send OTP via email using nodemailer
 */
const sendOTPEmail = async (email, otp) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"LearningHub" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your OTP for LearningHub',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2DB888; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">LearningHub</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Your Verification Code</h2>
            <p style="color: #666; font-size: 16px;">
              Your OTP for verification is:
            </p>
            <div style="background-color: white; border: 2px dashed #2DB888; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #2DB888; font-size: 36px; letter-spacing: 8px; margin: 0;">${otp}</h1>
            </div>
            <p style="color: #666; font-size: 14px;">
              This code will expire in 10 minutes. Please do not share this code with anyone.
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
          <div style="background-color: #1E293B; padding: 15px; text-align: center;">
            <p style="color: #94A3B8; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} LearningHub. All rights reserved.
            </p>
          </div>
        </div>
      `,
      text: `Your OTP for LearningHub is: ${otp}. This code will expire in 10 minutes.`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email}:`, info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
};

/**
 * Send OTP via SMS (placeholder - implement with Twilio or similar)
 */
const sendOTPSMS = async (phoneNumber, otp) => {
  // TODO: Implement SMS sending with Twilio or similar
  console.log(`📱 OTP for ${phoneNumber}: ${otp}`);
  // In production, use:
  // const twilio = require('twilio');
  // Send SMS with OTP
  return true;
};

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  getOTP,
  clearOTP,
  sendOTPEmail,
  sendOTPSMS,
};

