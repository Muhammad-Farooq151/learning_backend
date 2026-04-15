/**
 * Course Level — shared helpers (separate from HTTP controller).
 * Schema: ../models/CourseLevel.js · Routes: ../routes/courseLevelRoutes.js
 */
const CourseLevel = require('../models/CourseLevel');

const DEFAULT_LEVELS = ['Beginner', 'Intermediate', 'Expert'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Seed defaults when collection is empty */
async function ensureDefaultLevels() {
  const count = await CourseLevel.countDocuments();
  if (count === 0) {
    await CourseLevel.insertMany(DEFAULT_LEVELS.map((name) => ({ name })));
  }
}

/**
 * @param {string} [value]
 * @returns {Promise<boolean>}
 */
async function validateCourseLevelValue(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return true;
  }
  await ensureDefaultLevels();
  const n = String(value).trim();
  const exists = await CourseLevel.exists({ name: new RegExp(`^${escapeRegex(n)}$`, 'i') });
  return Boolean(exists);
}

module.exports = {
  DEFAULT_LEVELS,
  escapeRegex,
  ensureDefaultLevels,
  validateCourseLevelValue,
};
