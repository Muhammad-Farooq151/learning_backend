const mongoose = require('mongoose');

/**
 * Audit log when a user requests a signed HLS playlist URL (GET /api/lessons/:lessonId/stream).
 */
const videoAccessLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    accessedAt: { type: Date, default: Date.now },
    ip: { type: String, default: '' },
  },
  { timestamps: false }
);

module.exports = mongoose.model('VideoAccessLog', videoAccessLogSchema);
