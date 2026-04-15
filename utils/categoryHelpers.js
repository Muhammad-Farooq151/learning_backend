const Category = require('../models/Category');
const { escapeRegex } = require('./courseLevelHelpers');

/** Match client default list when the collection is empty (same as NewCourse.js). */
const DEFAULT_CATEGORIES = [
  'AI Agents & Agentic AI',
  'Programming',
  'Design',
  'Data Science',
  'AI/ML',
];

async function ensureDefaultCategories() {
  const count = await Category.countDocuments();
  if (count === 0) {
    await Category.insertMany(DEFAULT_CATEGORIES.map((name) => ({ name })));
  }
}

/**
 * @param {string} [value] — display name (not id)
 * @returns {Promise<boolean>}
 */
async function validateCategoryValue(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return true;
  }
  await ensureDefaultCategories();
  const n = String(value).trim();
  const exists = await Category.exists({ name: new RegExp(`^${escapeRegex(n)}$`, 'i') });
  return Boolean(exists);
}

module.exports = {
  DEFAULT_CATEGORIES,
  validateCategoryValue,
  ensureDefaultCategories,
};
