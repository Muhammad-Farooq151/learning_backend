const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminMiddleware');
const {
  createTutor,
  getAllTutors,
  getTutorById,
  updateTutor,
  deleteTutor,
} = require('../controllers/tutorController');

// Create new tutor - Admin only
router.post('/', adminAuth, createTutor);

// Get all tutors - Public
router.get('/', getAllTutors);

// Get single tutor by ID - Public
router.get('/:id', getTutorById);

// Update tutor - Admin only
router.put('/:id', adminAuth, updateTutor);

// Delete tutor - Admin only
router.delete('/:id', adminAuth, deleteTutor);

module.exports = router;
