const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  lessonName: {
    type: String,
    required: true,
    trim: true,
  },
  skills: [{
    type: String,
    trim: true,
  }],
  learningOutcomes: {
    type: String,
    required: true,
    trim: true,
  },
  videoUrl: {
    type: String,
    default: null,
  },
  videoPublicId: {
    type: String,
    default: null,
  },
  duration: {
    type: Number, // Duration in seconds
    default: 0,
  },
  order: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
  },
  answer: {
    type: String,
    required: true,
    trim: true,
  },
}, { timestamps: true });

const resourceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
  fileType: {
    type: String,
    enum: ['PDF', 'JPEG', 'PNG'],
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
}, { timestamps: true });

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  instructor: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: String,
    required: true,
    trim: true,
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  courseLevel: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Expert'],
    trim: true,
  },
  taxPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 70,
  },
  skills: [{
    type: String,
    trim: true,
  }],
  description: {
    type: String,
    required: true,
    trim: true,
  },
  faqs: [faqSchema],
  lessons: [lessonSchema],
  resources: [resourceSchema],
  keywords: [{
    type: String,
    trim: true,
  }],
  thumbnailUrl: {
    type: String,
    default: null,
  },
  thumbnailPublicId: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for better query performance
courseSchema.index({ title: 'text', description: 'text', category: 'text' });
courseSchema.index({ category: 1 });
courseSchema.index({ status: 1 });
courseSchema.index({ createdAt: -1 });

const Course = mongoose.model('Course', courseSchema);

module.exports = Course;
