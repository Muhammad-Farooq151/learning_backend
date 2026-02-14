const User = require('../models/User');
const bcrypt = require('bcrypt');
const { createTransporter } = require('../libs/emailUtils');

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

// POST /api/admin/send-email
// Send emails to users
const sendEmail = async (req, res) => {
  try {
    const { type, recipients, subject, message, courseId, courseTitle, promoCode, discount } = req.body;

    if (!type || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Email type and recipients are required',
      });
    }

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required',
      });
    }

    const transporter = createTransporter();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Build email HTML based on type
    let emailHtml = '';
    let emailText = '';

    if (type === 'course-update' && courseTitle) {
      const courseLink = `${frontendUrl}/user/explore-courses/${courseId}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2DB888; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">LearningHub</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">${subject}</h2>
            <p style="color: #666; font-size: 16px; white-space: pre-wrap;">${message}</p>
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Course: ${courseTitle}</h3>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${courseLink}" style="background-color: #2DB888; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px;">
                  View Course
                </a>
              </div>
            </div>
          </div>
          <div style="background-color: #1E293B; padding: 15px; text-align: center;">
            <p style="color: #94A3B8; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} LearningHub. All rights reserved.
            </p>
          </div>
        </div>
      `;
      emailText = `${subject}\n\n${message}\n\nCourse: ${courseTitle}\nView Course: ${courseLink}`;
    } else if (type === 'promotion') {
      const promoInfo = promoCode ? `<p style="color: #666; font-size: 16px;"><strong>Promo Code:</strong> ${promoCode}</p>` : '';
      const discountInfo = discount ? `<p style="color: #666; font-size: 16px;"><strong>Discount:</strong> ${discount}%</p>` : '';
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2DB888; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">LearningHub</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">${subject}</h2>
            <p style="color: #666; font-size: 16px; white-space: pre-wrap;">${message}</p>
            ${promoInfo || discountInfo ? `
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${promoInfo}
              ${discountInfo}
            </div>
            ` : ''}
            <div style="text-align: center; margin: 20px 0;">
              <a href="${frontendUrl}/user/explore-courses" style="background-color: #2DB888; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px;">
                Explore Courses
              </a>
            </div>
          </div>
          <div style="background-color: #1E293B; padding: 15px; text-align: center;">
            <p style="color: #94A3B8; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} LearningHub. All rights reserved.
            </p>
          </div>
        </div>
      `;
      emailText = `${subject}\n\n${message}${promoCode ? `\n\nPromo Code: ${promoCode}` : ''}${discount ? `\nDiscount: ${discount}%` : ''}`;
    } else if (type === 'recommended' && courseTitle) {
      const courseLink = `${frontendUrl}/user/explore-courses/${courseId}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2DB888; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">LearningHub</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">${subject}</h2>
            <p style="color: #666; font-size: 16px; white-space: pre-wrap;">${message}</p>
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Recommended Course: ${courseTitle}</h3>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${courseLink}" style="background-color: #2DB888; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px;">
                  Enroll Now
                </a>
              </div>
            </div>
          </div>
          <div style="background-color: #1E293B; padding: 15px; text-align: center;">
            <p style="color: #94A3B8; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} LearningHub. All rights reserved.
            </p>
          </div>
        </div>
      `;
      emailText = `${subject}\n\n${message}\n\nRecommended Course: ${courseTitle}\nEnroll Now: ${courseLink}`;
    } else {
      // Generic email
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2DB888; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">LearningHub</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">${subject}</h2>
            <p style="color: #666; font-size: 16px; white-space: pre-wrap;">${message}</p>
          </div>
          <div style="background-color: #1E293B; padding: 15px; text-align: center;">
            <p style="color: #94A3B8; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} LearningHub. All rights reserved.
            </p>
          </div>
        </div>
      `;
      emailText = `${subject}\n\n${message}`;
    }

    // Send emails to all recipients
    const results = [];
    for (const recipientEmail of recipients) {
      try {
        const mailOptions = {
          from: `"LearningHub" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
          to: recipientEmail,
          subject: subject,
          html: emailHtml,
          text: emailText,
        };

        const info = await transporter.sendMail(mailOptions);
        results.push({ email: recipientEmail, success: true, messageId: info.messageId });
        console.log(`✅ Email sent to ${recipientEmail}:`, info.messageId);
      } catch (error) {
        console.error(`❌ Error sending email to ${recipientEmail}:`, error);
        results.push({ email: recipientEmail, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.status(200).json({
      success: true,
      message: `Emails sent: ${successCount} successful, ${failCount} failed`,
      data: {
        total: recipients.length,
        successful: successCount,
        failed: failCount,
        results: results,
      },
    });
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending emails',
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
  sendEmail,
};
