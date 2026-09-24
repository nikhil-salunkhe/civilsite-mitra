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

  if (!worker || !workDays || !dailyWage) {
    throw new ApiError('Worker, work days, and daily wage are required', 400);
  }

  const workerData = await require('../models/Worker').findById(worker);
  if (!workerData || workerData.site.toString() !== req.params.siteId) {
    throw new ApiError('Invalid worker for this site', 400);
  }

  const totalAmount = workDays * dailyWage;

  const workerPayment = new WorkerPayment({
    worker,
    site: req.params.siteId,
    engineer: req.userId,
    date: date ? new Date(date) : new Date(),
    workDays,
    dailyWage,
    totalAmount,
    paidAmount: 0,
    pendingAmount: totalAmount,
    paymentMode: paymentMode || null,
    paymentDate: paymentDate ? new Date(paymentDate) : null,
    status: 'Pending',
    notes: notes || '',
  });

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
