const express = require('express');
const router = express.Router();

const { getAllUsers } = require('../controllers/userController');

// GET /api/users
router.get('/', getAllUsers);

module.exports = router;

