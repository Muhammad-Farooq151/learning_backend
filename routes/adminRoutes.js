const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminMiddleware');
const {
  getAllAdmins,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} = require('../controllers/adminController');

// All admin routes require admin authentication
// GET /api/admins - Get all admins
router.get('/', adminAuth, getAllAdmins);

// GET /api/admins/:id - Get single admin
router.get('/:id', adminAuth, getAdminById);

// POST /api/admins - Create new admin
router.post('/', adminAuth, createAdmin);

// PUT /api/admins/:id - Update admin
router.put('/:id', adminAuth, updateAdmin);

// DELETE /api/admins/:id - Delete admin
router.delete('/:id', adminAuth, deleteAdmin);

module.exports = router;
