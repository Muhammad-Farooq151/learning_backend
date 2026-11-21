const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminMiddleware');
const {
  getAllCourseLevels,
  createCourseLevel,
  updateCourseLevel,
  deleteCourseLevel,
} = require('../controllers/courseLevelController');

router.get('/', getAllCourseLevels);
router.post('/', adminAuth, createCourseLevel);
router.put('/:id', adminAuth, updateCourseLevel);
router.delete('/:id', adminAuth, deleteCourseLevel);

module.exports = router;
