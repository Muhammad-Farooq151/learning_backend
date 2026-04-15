/**
 * HTTP CRUD only for /api/course-levels — business rules shared in ../utils/courseLevelHelpers.js
 */
const CourseLevel = require('../models/CourseLevel');
const Course = require('../models/Course');
const { escapeRegex, ensureDefaultLevels } = require('../utils/courseLevelHelpers');

const getAllCourseLevels = async (req, res) => {
  try {
    await ensureDefaultLevels();
    const data = await CourseLevel.find().sort({ name: 1 }).lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[getAllCourseLevels]', error);
    res.status(500).json({ success: false, message: 'Failed to load course levels', error: error.message });
  }
};

const createCourseLevel = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const existing = await CourseLevel.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A course level with this name already exists' });
    }

    const row = await CourseLevel.create({ name });
    res.status(201).json({ success: true, message: 'Course level created', data: row });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A course level with this name already exists' });
    }
    console.error('[createCourseLevel]', error);
    res.status(500).json({ success: false, message: 'Failed to create course level', error: error.message });
  }
};

const updateCourseLevel = async (req, res) => {
  try {
    const { id } = req.params;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const row = await CourseLevel.findById(id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Course level not found' });
    }

    const dup = await CourseLevel.findOne({
      _id: { $ne: id },
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    });
    if (dup) {
      return res.status(400).json({ success: false, message: 'A course level with this name already exists' });
    }

    const oldName = row.name;
    row.name = name;
    await row.save();

    if (oldName !== name) {
      await Course.updateMany({ courseLevel: oldName }, { $set: { courseLevel: name } });
    }

    res.status(200).json({ success: true, message: 'Course level updated', data: row });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A course level with this name already exists' });
    }
    console.error('[updateCourseLevel]', error);
    res.status(500).json({ success: false, message: 'Failed to update course level', error: error.message });
  }
};

const deleteCourseLevel = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await CourseLevel.findById(id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Course level not found' });
    }

    const inUse = await Course.countDocuments({ courseLevel: row.name });
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${inUse} course(s) use this level. Change them first.`,
      });
    }

    await CourseLevel.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Course level deleted' });
  } catch (error) {
    console.error('[deleteCourseLevel]', error);
    res.status(500).json({ success: false, message: 'Failed to delete course level', error: error.message });
  }
};

module.exports = {
  getAllCourseLevels,
  createCourseLevel,
  updateCourseLevel,
  deleteCourseLevel,
};
