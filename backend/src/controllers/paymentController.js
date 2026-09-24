const Payment = require('../models/Payment');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get payments for a site
const getPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  const payments = await Payment.find({ site: req.params.siteId })
    .populate('recordedBy', 'name')
    .sort({ date: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  const total = await Payment.countDocuments({ site: req.params.siteId });

  res.status(200).json({
    success: true,
    data: {
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Create payment
const createPayment = asyncHandler(async (req, res) => {
  const { amount, date, paymentMode, notes, installment } = req.body;
  // `transactionNumber` is accepted as an alias so older clients keep working.
  const transactionRef = req.body.transactionRef ?? req.body.transactionNumber ?? null;

  if (!amount || !date || !paymentMode) {
    throw new ApiError('Amount, date, and payment mode are required', 400);
  }

  if (amount <= 0) {
    throw new ApiError('Amount must be positive', 400);
  }

  const payment = new Payment({
    site: req.params.siteId,
    engineer: req.userId,
    amount,
    date: new Date(date),
    paymentMode,
    transactionRef: transactionRef || null,
    notes: notes || '',
    installment: installment || null,
    recordedBy: req.userId,
  });

  await payment.save();

  res.status(201).json({
    success: true,
    data: payment,
    message: 'Payment recorded successfully',
  });
});

// Update payment
const updatePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    throw new ApiError('Payment not found', 404);
  }

  if (payment.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const { amount, date, paymentMode, notes } = req.body;
  const transactionRef = req.body.transactionRef ?? req.body.transactionNumber;

  if (amount) payment.amount = amount;
  if (date) payment.date = new Date(date);
  if (paymentMode) payment.paymentMode = paymentMode;
  if (transactionRef !== undefined) payment.transactionRef = transactionRef;
  if (notes !== undefined) payment.notes = notes;

  await payment.save();

  res.status(200).json({
    success: true,
    data: payment,
    message: 'Payment updated successfully',
  });
});

// Delete payment
const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    throw new ApiError('Payment not found', 404);
  }

  if (payment.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  await payment.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Payment deleted successfully',
  });
});

module.exports = { getPayments, createPayment, updatePayment, deletePayment };
