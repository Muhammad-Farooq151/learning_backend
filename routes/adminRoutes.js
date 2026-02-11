const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminMiddleware');
const {
  getAllAdmins,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  sendEmail,
} = require('../controllers/adminController');


// GET /api/admins - Get all admin
router.get('/', adminAuth, getAllAdmins);

// GET /api/admins/:id - Get single admin
router.get('/:id', adminAuth, getAdminById);

// POST /api/admins - Create new admin
router.post('/', adminAuth, createAdmin);

// PUT /api/admins/:id - Update admin
router.put('/:id', adminAuth, updateAdmin);

// DELETE /api/admins/:id - Delete admin
router.delete('/:id', adminAuth, deleteAdmin);

// POST /api/admin/send-email - Send emails to users
router.post('/send-email', adminAuth, sendEmail);

module.exports = router;
