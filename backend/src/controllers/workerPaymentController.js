const WorkerPayment = require('../models/WorkerPayment');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get worker payments
const getWorkerPayments = asyncHandler(async (req, res) => {
  const { workerId, page = 1, limit = 50 } = req.query;

  const query = { site: req.params.siteId };
  if (workerId) query.worker = workerId;

  const payments = await WorkerPayment.find(query)
    .populate('worker', 'name workerType')
    .sort({ date: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  const total = await WorkerPayment.countDocuments(query);

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

// Create worker payment
const createWorkerPayment = asyncHandler(async (req, res) => {
  const { worker, date, workDays, dailyWage, paymentMode, paymentDate, notes } = req.body;
  // Money actually handed over at creation time. `amount` is accepted as an
  // alias so simple "Pay ₹X" clients don't have to know the canonical name.
  const paidRaw = req.body.paidAmount ?? req.body.amount;

  if (!worker || workDays === undefined || workDays === null || dailyWage === undefined || dailyWage === null) {
    throw new ApiError('Worker, work days, and daily wage are required', 400);
  }

  const days = Number(workDays);
  const wage = Number(dailyWage);
  if (Number.isNaN(days) || days < 0) throw new ApiError('Work days must be zero or more', 400);
  if (Number.isNaN(wage) || wage < 0) throw new ApiError('Daily wage must be zero or more', 400);

  const paid = paidRaw === undefined || paidRaw === null || paidRaw === '' ? 0 : Number(paidRaw);
  if (Number.isNaN(paid) || paid < 0) throw new ApiError('Paid amount must be zero or more', 400);

  const workerData = await require('../models/Worker').findById(worker);
  if (!workerData || workerData.site.toString() !== req.params.siteId) {
    throw new ApiError('Invalid worker for this site', 400);
  }

  const workerPayment = new WorkerPayment({
    worker,
    site: req.params.siteId,
    engineer: req.userId,
    date: date ? new Date(date) : new Date(),
    workDays: days,
    dailyWage: wage,
    totalAmount: days * wage,
    paidAmount: paid,
    paymentMode: paymentMode || null,
    paymentDate: paymentDate ? new Date(paymentDate) : (paid > 0 ? new Date() : null),
    notes: notes || '',
  });

  // Derives pendingAmount + Paid/Partial/Pending status so a payment recorded
  // with cash in hand is immediately consistent with the model's rules.
  workerPayment.calculateTotals();

  await workerPayment.save();

  res.status(201).json({
    success: true,
    data: workerPayment,
    message: 'Worker payment recorded successfully',
  });
});

// Update worker payment
const updateWorkerPayment = asyncHandler(async (req, res) => {
  const workerPayment = await WorkerPayment.findById(req.params.id);

  if (!workerPayment) {
    throw new ApiError('Worker payment not found', 404);
  }

  if (workerPayment.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const { paidAmount, paymentMode, paymentDate, notes, workDays, dailyWage } = req.body;

  if (workDays !== undefined || dailyWage !== undefined) {
    const wd = workDays !== undefined ? workDays : workerPayment.workDays;
    const dw = dailyWage !== undefined ? dailyWage : workerPayment.dailyWage;
    workerPayment.totalAmount = wd * dw;
  }

  if (paidAmount !== undefined) {
    workerPayment.paidAmount = paidAmount;
    workerPayment.pendingAmount = Math.max(0, workerPayment.totalAmount - paidAmount);
    if (workerPayment.pendingAmount === 0) {
      workerPayment.status = 'Paid';
    } else if (paidAmount > 0) {
      workerPayment.status = 'Partial';
    }
    if (paymentDate) workerPayment.paymentDate = new Date(paymentDate);
  }

  if (paymentMode !== undefined) workerPayment.paymentMode = paymentMode;
  if (notes !== undefined) workerPayment.notes = notes;

  await workerPayment.save();

  res.status(200).json({
    success: true,
    data: workerPayment,
    message: 'Worker payment updated successfully',
  });
});

// Delete worker payment
const deleteWorkerPayment = asyncHandler(async (req, res) => {
  const workerPayment = await WorkerPayment.findById(req.params.id);

  if (!workerPayment) {
    throw new ApiError('Worker payment not found', 404);
  }

  if (workerPayment.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  await workerPayment.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Worker payment deleted successfully',
  });
});

module.exports = { getWorkerPayments, createWorkerPayment, updateWorkerPayment, deleteWorkerPayment };
