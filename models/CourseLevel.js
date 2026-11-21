const mongoose = require('mongoose');

const courseLevelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
  },
  { timestamps: true }
);

courseLevelSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('CourseLevel', courseLevelSchema);
