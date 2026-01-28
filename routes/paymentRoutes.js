const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const Course = require('../models/Course');
const User = require('../models/User');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Create Payment Intent for a specific course and user
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { courseId, userId } = req.body;

    if (!courseId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'courseId and userId are required',
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Calculate amount securely on server
    const originalPrice = parseFloat(course.price) || 0;
    const discountPercentage = course.discountPercentage || 0;
    const discountAmount =
      discountPercentage > 0
        ? (originalPrice * discountPercentage) / 100
        : 0;
    const priceAfterDiscount = originalPrice - discountAmount;

    if (priceAfterDiscount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course price configuration',
      });
    }

    // Tax 8% same as frontend
    const tax = priceAfterDiscount * 0.08;
    const total = priceAfterDiscount + tax;

    const amountInCents = Math.round(total * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        courseId: course._id.toString(),
        userId: user._id.toString(),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      amount: amountInCents,
      currency: 'usd',
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: error.message,
    });
  }
});

module.exports = router;

