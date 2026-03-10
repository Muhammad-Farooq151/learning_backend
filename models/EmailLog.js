const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
  {
    templateName: {
      type: String,
      default: 'Custom Campaign',
      trim: true,
    },
    templateSource: {
      type: String,
      enum: ['frontend', 'database', 'manual'],
      default: 'manual',
    },
    templateType: {
      type: String,
      default: 'custom',
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    heading: {
      type: String,
      default: '',
      trim: true,
    },
    recipients: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    recipientCount: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

module.exports = EmailLog;
