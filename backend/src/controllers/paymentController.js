const Payment = require('../models/Payment');
const Installment = require('../models/Installment');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// Installment paid-amount synchronisation.
// Payments are the source of truth; an installment's cached paidAmount/status
// are refreshed whenever a linked payment changes so the Installments tab,
// reports and status badges can never drift apart.
// ---------------------------------------------------------------------------
const installmentPaidExcept = async (installmentId, excludeId) => {
  const match = { installment: installmentId };
  if (excludeId) match._id = { $ne: excludeId };
  const rows = await Payment.aggregate([
    { $match: match },
    { $group: { _id: null, paid: { $sum: '$amount' } } },
  ]);
  return rows[0] ? rows[0].paid : 0;
};

const syncInstallment = async (installmentId) => {
  const inst = await Installment.findById(installmentId);
  if (!inst) return;
  const paid = await installmentPaidExcept(inst._id, null);
  inst.paidAmount = Math.round(Math.min(Number(inst.amount) || 0, paid) * 100) / 100;
  inst.updateStatus();
  await inst.save();
};

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

  // Business rule (spec section 42): a payment tied to an installment can
  // never exceed what is still pending on that installment.
  if (installment) {
    const inst = await Installment.findById(installment);
    if (!inst || inst.site.toString() !== String(req.params.siteId)) {
      throw new ApiError('Installment not found for this site', 404);
    }
    const alreadyPaid = await installmentPaidExcept(inst._id, null);
    const pending = (Number(inst.amount) || 0) - alreadyPaid;
    if (Number(amount) > pending + 0.009) {
      throw new ApiError(
        `Payment exceeds the pending installment balance (${Math.round(pending * 100) / 100})`,
        400
      );
    }
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
  if (payment.installment) await syncInstallment(payment.installment);

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

  if (amount !== undefined) {
    if (Number(amount) <= 0) throw new ApiError('Amount must be positive', 400);
    if (payment.installment) {
      const inst = await Installment.findById(payment.installment);
      if (inst) {
        const others = await installmentPaidExcept(inst._id, payment._id);
        const allowed = (Number(inst.amount) || 0) - others;
        if (Number(amount) > allowed + 0.009) {
          throw new ApiError(
            `Payment exceeds the pending installment balance (${Math.round(allowed * 100) / 100})`,
            400
          );
        }
      }
    }
  }

  if (amount) payment.amount = amount;
  if (date) payment.date = new Date(date);
  if (paymentMode) payment.paymentMode = paymentMode;
  if (transactionRef !== undefined) payment.transactionRef = transactionRef;
  if (notes !== undefined) payment.notes = notes;

  await payment.save();
  if (payment.installment) await syncInstallment(payment.installment);

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

  const linkedInstallment = payment.installment;
  await payment.deleteOne();
  if (linkedInstallment) await syncInstallment(linkedInstallment);

  res.status(200).json({
    success: true,
    message: 'Payment deleted successfully',
  });
});

module.exports = { getPayments, createPayment, updatePayment, deletePayment };
