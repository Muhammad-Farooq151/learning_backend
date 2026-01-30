const express = require('express');
const router = express.Router();
const {
  getAllTransactions,
  updateTransactionStatus,
  createTransaction,
} = require('../controllers/transactionController');

// GET /api/transactions - Get all transactions
router.get('/', getAllTransactions);

// POST /api/transactions - Create a new transaction
router.post('/', createTransaction);

// PUT /api/transactions/:id/status - Update transaction status
router.put('/:id/status', updateTransactionStatus);

module.exports = router;
