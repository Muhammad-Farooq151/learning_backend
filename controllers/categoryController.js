const Category = require('../models/Category');
const Course = require('../models/Course');
const { ensureDefaultCategories } = require('../utils/categoryHelpers');

const getAllCategories = async (req, res) => {
  try {
    await ensureDefaultCategories();
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error('[getAllCategories]', error);
    res.status(500).json({ success: false, message: 'Failed to load categories', error: error.message });
  }
};

const createCategory = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const existing = await Category.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }

    const category = await Category.create({ name });
    res.status(201).json({ success: true, message: 'Category created', data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }
    console.error('[createCategory]', error);
    res.status(500).json({ success: false, message: 'Failed to create category', error: error.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const dup = await Category.findOne({
      _id: { $ne: id },
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    });
    if (dup) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }

    const oldName = category.name;
    category.name = name;
    await category.save();

    if (oldName !== name) {
      await Course.updateMany({ category: oldName }, { $set: { category: name } });
    }

    res.status(200).json({ success: true, message: 'Category updated', data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }
    console.error('[updateCategory]', error);
    res.status(500).json({ success: false, message: 'Failed to update category', error: error.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const inUse = await Course.countDocuments({ category: category.name });
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${inUse} course(s) use this category. Change them first.`,
      });
    }

    await Category.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Category deleted' });
  } catch (error) {
    console.error('[deleteCategory]', error);
    res.status(500).json({ success: false, message: 'Failed to delete category', error: error.message });
  }
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
