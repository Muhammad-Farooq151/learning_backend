const mongoose = require('mongoose');

const lessonProgressSchema = new mongoose.Schema({
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course.lessons',
    required: true,
  },
  watched: {
    type: Number,
    default: 0, // Time watched in seconds
  },
  completed: {
    type: Boolean,
    default: false,
  },
  lastWatchedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const courseProgressSchema = new mongoose.Schema({
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
  lessons: [lessonProgressSchema],
  overallProgress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Index for efficient queries
courseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// Method to calculate overall progress
courseProgressSchema.methods.calculateOverallProgress = function() {
  if (!this.lessons || this.lessons.length === 0) {
    this.overallProgress = 0;
    return;
  }
  
  const completedLessons = this.lessons.filter(l => l.completed).length;
  this.overallProgress = Math.round((completedLessons / this.lessons.length) * 100);
};

// Pre-save hook to calculate progress
courseProgressSchema.pre('save', function() {
  this.calculateOverallProgress();
  this.lastAccessedAt = new Date();
});

const CourseProgress = mongoose.model('CourseProgress', courseProgressSchema);

module.exports = CourseProgress;
