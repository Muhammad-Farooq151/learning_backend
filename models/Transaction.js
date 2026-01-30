const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    unique: true,
    trim: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  originalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  tax: {
    type: Number,
    default: 0,
    min: 0,
  },
  total: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['Paid', 'Pending', 'Cancel'],
    default: 'Paid',
    required: true,
  },
  stripePaymentIntentId: {
    type: String,
    trim: true,
  },
  paymentMethod: {
    type: String,
    default: 'card',
  },
  currency: {
    type: String,
    default: 'usd',
  },
  fullName: {
    type: String,
    trim: true,
  },
  phoneNumber: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
});

// Helper function to generate transaction ID
transactionSchema.statics.generateTransactionId = function() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TXN${timestamp}${random}`;
};

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;
