const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  feedback: {
    type: String,
    required: true,
    trim: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  fileUrl: {
    type: String,
    default: null,
  },
  filePublicId: {
    type: String,
    default: null,
  },
  rememberTop: {
    type: Boolean,
    default: false,
  },
  rememberBottom: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Index for efficient queries
feedbackSchema.index({ userId: 1, courseId: 1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;
