const mongoose = require('mongoose');

const tutorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
  },
  speciality: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
  },
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  }],
}, {
  timestamps: true,
});

// Indexes for better query performance
tutorSchema.index({ email: 1 });
tutorSchema.index({ speciality: 1 });
tutorSchema.index({ createdAt: -1 });

const Tutor = mongoose.model('Tutor', tutorSchema);

module.exports = Tutor;
