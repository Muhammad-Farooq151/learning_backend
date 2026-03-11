const User = require('../models/User');
const EmailTemplate = require('../models/EmailTemplate');
const EmailLog = require('../models/EmailLog');
const bcrypt = require('bcrypt');
const { createTransporter } = require('../libs/emailUtils');

const slugifyTemplateName = (value = '') =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const replaceTemplateTokens = (value = '', replacements = {}) =>
  Object.entries(replacements).reduce((result, [key, replacement]) => {
    const safeReplacement = replacement ?? '';
    return result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), safeReplacement);
  }, value || '');

const buildEmailHtml = ({ heading, body, ctaText, ctaUrl }) => {
  const paragraphs = (body || '')
    .split('\n')
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="color: #475569; font-size: 16px; line-height: 1.7; margin: 0 0 18px;">${paragraph}</p>`
    )
    .join('');

  const ctaMarkup =
    ctaText && ctaUrl
      ? `
        <div style="text-align: center; margin-top: 32px;">
          <a
            href="${ctaUrl}"
            style="background: linear-gradient(135deg, #329D7B 0%, #2DB888 100%); color: #ffffff; padding: 14px 28px; border-radius: 999px; text-decoration: none; display: inline-block; font-weight: 700; font-size: 15px;"
          >
            ${ctaText}
          </a>
        </div>
      `
      : '';

  return `
    <div style="margin: 0; padding: 32px 16px; background-color: #F8FAFC; font-family: Arial, sans-serif;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 22px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);">
        <div style="padding: 28px 32px; background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);">
          <div style="display: inline-block; padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.14); color: #D1FAE5; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;">
            LEARNING HUB
          </div>
          <h1 style="color: #ffffff; margin: 18px 0 0; font-size: 28px; line-height: 1.2;">${heading}</h1>
        </div>
        <div style="padding: 32px;">
          ${paragraphs}
          ${ctaMarkup}
        </div>
        <div style="padding: 18px 32px; border-top: 1px solid #E2E8F0; background-color: #F8FAFC;">
          <p style="margin: 0; color: #64748B; font-size: 12px; line-height: 1.6;">
            This email was sent from Learning Hub admin panel.
          </p>
        </div>
      </div>
    </div>
  `;
};

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

// GET /api/admins/email-templates
const getEmailTemplates = async (req, res) => {
  try {
    const templates = await EmailTemplate.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'fullName email');

    res.status(200).json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching email templates',
      error: error.message,
    });
  }
};

// POST /api/admins/email-templates
const createEmailTemplate = async (req, res) => {
  try {
    const { name, category, description, subject, heading, body, ctaText, ctaUrl, type } = req.body;

    if (!name || !subject || !heading || !body) {
      return res.status(400).json({
        success: false,
        message: 'Name, subject, heading, and body are required',
      });
    }

    const baseSlug = slugifyTemplateName(name);
    if (!baseSlug) {
      return res.status(400).json({
        success: false,
        message: 'Template name must contain valid characters',
      });
    }

    let slug = baseSlug;
    let suffix = 1;
    while (await EmailTemplate.exists({ slug })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const template = await EmailTemplate.create({
      name: name.trim(),
      slug,
      category: category?.trim() || 'custom',
      description: description?.trim() || '',
      subject: subject.trim(),
      heading: heading.trim(),
      body: body.trim(),
      ctaText: ctaText?.trim() || '',
      ctaUrl: ctaUrl?.trim() || '',
      type: type?.trim() || 'custom',
      createdBy: req.user.id,
    });

    const populatedTemplate = await EmailTemplate.findById(template._id).populate(
      'createdBy',
      'fullName email'
    );

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: populatedTemplate,
    });
  } catch (error) {
    console.error('Error creating email template:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating email template',
      error: error.message,
    });
  }
};

// GET /api/admins/email-logs
const getEmailLogs = async (req, res) => {
  try {
    const logs = await EmailLog.find()
      .sort({ createdAt: -1 })
      .limit(15)
      .populate('sentBy', 'fullName email');

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Error fetching email logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching email logs',
      error: error.message,
    });
  }
};

// POST /api/admin/send-email
// Send emails to users
const sendEmail = async (req, res) => {
  try {
    const {
      type,
      recipients,
      subject,
      heading,
      body,
      message,
      courseId,
      courseTitle,
      promoCode,
      discount,
      ctaText,
      ctaUrl,
      templateName,
      templateSource,
    } = req.body;

    if (!type || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Email type and recipients are required',
      });
    }

    const normalizedBody = (body || message || '').trim();
    const normalizedHeading = (heading || subject || '').trim();

    if (!subject || !normalizedBody) {
      return res.status(400).json({
        success: false,
        message: 'Subject and body are required',
      });
    }

    const transporter = createTransporter();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const normalizedRecipients = [...new Set(
      recipients
        .map((email) => String(email || '').toLowerCase().trim())
        .filter(Boolean)
    )];
    const userRecords = await User.find({ email: { $in: normalizedRecipients } }).select(
      'fullName email'
    );
    const userMap = new Map(
      userRecords.map((user) => [user.email.toLowerCase(), user.fullName || 'Learner'])
    );

    const defaultCourseUrl = courseId
      ? `${frontendUrl}/user/my-leaning/${courseId}`
      : `${frontendUrl}/user/explore-courses`;

    // Send emails to all recipients
    const results = [];
    for (const recipientEmail of normalizedRecipients) {
      try {
        const recipientName = userMap.get(recipientEmail) || 'Learner';
        const replacements = {
          name: recipientName,
          email: recipientEmail,
          courseTitle: courseTitle || 'your course',
          promoCode: promoCode || '',
          discount: discount ? `${discount}%` : '',
        };
        const personalizedSubject = replaceTemplateTokens(subject, replacements);
        const personalizedHeading = replaceTemplateTokens(normalizedHeading, replacements);
        const personalizedBody = replaceTemplateTokens(normalizedBody, replacements);
        const personalizedCtaText = replaceTemplateTokens(
          ctaText || (type === 'promotion' ? 'Explore Courses' : 'Open Learning Hub'),
          replacements
        );
        const personalizedCtaUrl = replaceTemplateTokens(
          ctaUrl || defaultCourseUrl,
          {
            ...replacements,
            courseUrl: defaultCourseUrl,
          }
        );
        const emailHtml = buildEmailHtml({
          heading: personalizedHeading,
          body: personalizedBody,
          ctaText: personalizedCtaText,
          ctaUrl: personalizedCtaUrl,
        });
        const emailText = `${personalizedHeading}\n\n${personalizedBody}${
          personalizedCtaUrl ? `\n\n${personalizedCtaText}: ${personalizedCtaUrl}` : ''
        }`;

        const mailOptions = {
          from: `"LearningHub" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
          to: recipientEmail,
          subject: personalizedSubject,
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

    await EmailLog.create({
      templateName: templateName?.trim() || 'Custom Campaign',
      templateSource:
        templateSource === 'frontend' || templateSource === 'database'
          ? templateSource
          : 'manual',
      templateType: type || 'custom',
      subject: subject.trim(),
      heading: normalizedHeading,
      recipients: normalizedRecipients,
      recipientCount: normalizedRecipients.length,
      successCount,
      failedCount: failCount,
      sentBy: req.user.id,
    });

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
  getEmailTemplates,
  createEmailTemplate,
  getEmailLogs,
  sendEmail,
};
