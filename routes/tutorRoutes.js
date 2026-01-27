const express = require('express');
const router = express.Router();
const {
  createTutor,
  getAllTutors,
  getTutorById,
  updateTutor,
  deleteTutor,
} = require('../controllers/tutorController');
// Create new tutor
router.post('/', createTutor);

// Get all tutors
router.get('/', getAllTutors);

// Get single tutor by ID
router.get('/:id', getTutorById);

// Update tutor
router.put('/:id', updateTutor);

// Delete tutor
router.delete('/:id', deleteTutor);

module.exports = router;
