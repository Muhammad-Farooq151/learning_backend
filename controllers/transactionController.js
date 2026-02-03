const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Course = require('../models/Course');

// GET /api/transactions
// Get all transactions with populated user and course data
const getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('userId', 'fullName email')
      .populate('courseId', 'title')
      .sort({ createdAt: -1 }); // Most recent first

    return res.status(200).json({
      success: true,
      transactions,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message,
    });
  }
};

// PUT /api/transactions/:id/status
// Update transaction status
const updateTransactionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['Paid', 'Pending', 'Cancel'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (Paid, Pending, Cancel) is required',
      });
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    transaction.status = status;
    await transaction.save();

    // Populate before returning
    await transaction.populate('userId', 'fullName email');
    await transaction.populate('courseId', 'title');

    return res.status(200).json({
      success: true,
      message: 'Transaction status updated successfully',
      transaction,
    });
  } catch (error) {
    console.error('Error updating transaction status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update transaction status',
      error: error.message,
    });
  }
};

// POST /api/transactions
// Create a new transaction (called after successful payment)
const createTransaction = async (req, res) => {
  try {
    const {
      userId,
      courseId,
      amount,
      originalPrice,
      discountPercentage,
      discountAmount,
      tax,
      total,
      stripePaymentIntentId,
      paymentMethod,
      currency,
      fullName,
      phoneNumber,
    } = req.body;

    if (!userId || !courseId || !amount || !total) {
      return res.status(400).json({
        success: false,
        message: 'userId, courseId, amount, and total are required',
      });
    }

    // Verify user and course exist
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Generate unique transaction ID
    const transactionId = Transaction.generateTransactionId();

    const transaction = new Transaction({
      transactionId,
      userId,
      courseId,
      amount,
      originalPrice: originalPrice || amount,
      discountPercentage: discountPercentage || 0,
      discountAmount: discountAmount || 0,
      tax: tax || 0,
      total,
      status: 'Paid',
      stripePaymentIntentId: stripePaymentIntentId || '',
      paymentMethod: paymentMethod || 'card',
      currency: currency || 'usd',
      fullName: fullName || user.fullName || '',
      phoneNumber: phoneNumber || user.phoneNumber || '',
    });

    await transaction.save();

    // Populate before returning
    await transaction.populate('userId', 'fullName email');
    await transaction.populate('courseId', 'title');

    return res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      transaction,
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create transaction',
      error: error.message,
    });
  }
};

module.exports = {
  getAllTransactions,
  updateTransactionStatus,
  createTransaction,
};
