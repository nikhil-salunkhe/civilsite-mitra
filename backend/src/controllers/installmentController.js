const Installment = require('../models/Installment');
const { INSTALLMENT_STATUS } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get installments for a site
const getInstallments = asyncHandler(async (req, res) => {
  const installments = await Installment.find({ site: req.params.siteId })
    .sort({ order: 1 });

  // OVERDUE is time-dependent: recompute on read (same rules as the financial
  // service and the UI) and persist any change so stored data never goes stale.
  const now = new Date();
  const dirty = [];
  for (const doc of installments) {
    const pending = (Number(doc.amount) || 0) - (Number(doc.paidAmount) || 0);
    let status;
    if (pending <= 0) status = INSTALLMENT_STATUS.PAID;
    else if (Number(doc.paidAmount) > 0) status = INSTALLMENT_STATUS.PARTIAL;
    else if (doc.dueDate && doc.dueDate < now) status = INSTALLMENT_STATUS.OVERDUE;
    else status = INSTALLMENT_STATUS.PENDING;

    if (doc.status !== status) {
      doc.status = status;
      dirty.push(doc.save());
    }
  }
  if (dirty.length) await Promise.all(dirty);

  res.status(200).json({
    success: true,
    data: installments,
  });
});

// Create installment
const createInstallment = asyncHandler(async (req, res) => {
  const { name, description, order, amount, dueDate, notes } = req.body;

  if (!name || !amount) {
    throw new ApiError('Name and amount are required', 400);
  }

  if (amount <= 0) {
    throw new ApiError('Amount must be positive', 400);
  }

  // `order` positions the installment in the payment schedule. Clients that omit
  // it (the dashboard form does) get the next free position instead of a
  // mongoose "order is required" validation error.
  let position = order;
  if (position === undefined || position === null || position === '') {
    const last = await Installment.findOne({ site: req.params.siteId })
      .sort({ order: -1 })
      .select('order');
    position = (last?.order || 0) + 1;
  }

  const installment = new Installment({
    site: req.params.siteId,
    engineer: req.userId,
    name,
    description: description || '',
    order: position,
    amount,
    dueDate: dueDate ? new Date(dueDate) : null,
    notes: notes || '',
  });

  // Update status
  installment.updateStatus();

  await installment.save();

  res.status(201).json({
    success: true,
    data: installment,
    message: 'Installment created successfully',
  });
});

// Update installment
const updateInstallment = asyncHandler(async (req, res) => {
  const installment = await Installment.findById(req.params.id);

  if (!installment) {
    throw new ApiError('Installment not found', 404);
  }

  if (installment.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const { name, description, order, amount, dueDate, notes } = req.body;

  if (name) installment.name = name;
  if (description !== undefined) installment.description = description;
  if (order !== undefined) installment.order = order;
  if (amount !== undefined) installment.amount = amount;
  if (dueDate !== undefined) installment.dueDate = dueDate ? new Date(dueDate) : null;
  if (notes !== undefined) installment.notes = notes;

  installment.updateStatus();
  await installment.save();

  res.status(200).json({
    success: true,
    data: installment,
    message: 'Installment updated successfully',
  });
});

// Delete installment
const deleteInstallment = asyncHandler(async (req, res) => {
  const installment = await Installment.findById(req.params.id);

  if (!installment) {
    throw new ApiError('Installment not found', 404);
  }

  if (installment.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  await installment.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Installment deleted successfully',
  });
});

module.exports = { getInstallments, createInstallment, updateInstallment, deleteInstallment };
