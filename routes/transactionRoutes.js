const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminMiddleware');
const {
  getAllTransactions,
  updateTransactionStatus,
  createTransaction,
} = require('../controllers/transactionController');

// GET /api/transactions - Get all transactions - Admin only
router.get('/', adminAuth, getAllTransactions);

// POST /api/transactions - Create a new transaction - Public (for checkout)
router.post('/', createTransaction);

// PUT /api/transactions/:id/status - Update transaction status - Admin only
router.put('/:id/status', adminAuth, updateTransactionStatus);

module.exports = router;
