const mongoose = require('mongoose');

const watchedRangeSchema = new mongoose.Schema({
  start: { type: Number, required: true }, // Start time in seconds
  end: { type: Number, required: true },   // End time in seconds
}, { _id: false });

const lessonProgressSchema = new mongoose.Schema({
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course.lessons',
    required: true,
  },
  watched: {
    type: Number,
    default: 0, // Resume position (alias: currentTime)
  },
  /** Lesson video length in seconds (denominator for %) */
  duration: {
    type: Number,
    default: 0,
  },
  /** 0–100 from unique watched coverage / duration */
  watchedPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  watchedSeconds: {
    type: Number,
    default: 0, // Total watched seconds (calculated from watchedRanges)
  },
  watchedRanges: {
    type: [watchedRangeSchema],
    default: [], // Array of {start, end} ranges for accurate tracking
  },
  completed: {
    type: Boolean,
    default: false,
  },
  lastWatchedAt: {
    type: Date,
    default: Date.now,
  },
  lastTimestamp: {
    type: Date,
    default: Date.now,
  },
  watchSessions: [{
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    duration: { type: Number, default: 0 },
  }],
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
  /** Same as overallProgress — completed lessons / total lessons in course × 100 */
  coursePercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  courseCompleted: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
    default: null,
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

/**
 * @param {number} totalLessonsInCourse — from Course.lessons.length
 */
courseProgressSchema.methods.recalculateCourseProgress = function (totalLessonsInCourse) {
  const total = Math.max(1, Number(totalLessonsInCourse) || 1);
  const completedLessons = (this.lessons || []).filter((l) => l.completed).length;
  const pct = Math.min(100, Math.round((completedLessons / total) * 100));
  this.overallProgress = pct;
  this.coursePercent = pct;
  const allDone = completedLessons >= total;
  this.courseCompleted = allDone;
  if (allDone && !this.completedAt) {
    this.completedAt = new Date();
  }
  if (!allDone) {
    this.completedAt = null;
  }
};

// Pre-save: touch lastAccessedAt only (course % set in controller with course lesson count)
courseProgressSchema.pre('save', function () {
  this.lastAccessedAt = new Date();
});

const CourseProgress = mongoose.model('CourseProgress', courseProgressSchema);

module.exports = CourseProgress;
