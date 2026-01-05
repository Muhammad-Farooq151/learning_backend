const nodemailer = require('nodemailer');
const crypto = require('crypto');

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
 * Generate verification token
 */
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Send verification link via email
 */
const sendVerificationLink = async (email, fullName, token) => {
  try {
    const transporter = createTransporter();
    
    // Normalize email for the link (should match what's stored in DB)
    const normalizedEmail = email.toLowerCase().trim();
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verificationLink = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    const mailOptions = {
      from: `"LearningHub" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email - LearningHub',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2DB888; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">LearningHub</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Email Verification</h2>
            <p style="color: #666; font-size: 16px;">
              Hello ${fullName},
            </p>
            <p style="color: #666; font-size: 16px;">
              Welcome to LearningHub! Click the button below to verify your email address and activate your account.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" style="background-color: #2DB888; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px;">
                Verify Email
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              This link will expire in 24 hours. If you didn't sign up for this account, please ignore this email.
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #666; font-size: 12px; word-break: break-all;">
              ${verificationLink}
            </p>
          </div>
          <div style="background-color: #1E293B; padding: 15px; text-align: center;">
            <p style="color: #94A3B8; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} LearningHub. All rights reserved.
            </p>
          </div>
        </div>
      `,
      text: `Hello ${fullName},\n\nWelcome to LearningHub! Click the link below to verify your email:\n\n${verificationLink}\n\nThis link will expire in 24 hours.`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

module.exports = {
  createTransporter,
  generateVerificationToken,
  sendVerificationLink,
};

