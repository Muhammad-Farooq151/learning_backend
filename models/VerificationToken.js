const mongoose = require('mongoose');

const verificationTokenSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
    enum: ['signup', 'password-reset', 'email-change'],
    required: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }, // Auto-delete expired documents
  },
}, {
  timestamps: true,
  collection: 'verificationtokens', // Explicit collection name
});

// Index for faster lookups
verificationTokenSchema.index({ email: 1, type: 1 });
verificationTokenSchema.index({ token: 1 });

// Check if model already exists to avoid overwriting
const VerificationToken = mongoose.models.VerificationToken || mongoose.model('VerificationToken', verificationTokenSchema);

module.exports = VerificationToken;

