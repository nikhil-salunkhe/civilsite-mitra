const Expense = require('../models/Expense');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get expenses for a site
const getExpenses = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, category, paymentStatus } = req.query;

  const query = { site: req.params.siteId };
  if (category) query.category = category;
  if (paymentStatus) query.paymentStatus = paymentStatus;

  const expenses = await Expense.find(query)
    .sort({ expenseDate: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  const total = await Expense.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      expenses,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Create expense
const createExpense = asyncHandler(async (req, res) => {
  const { category, description, amount, expenseDate, paidAmount, paymentMode, paymentDate, notes } = req.body;

  if (!category || !description || !amount) {
    throw new ApiError('Category, description, and amount are required', 400);
  }

  if (amount <= 0) {
    throw new ApiError('Amount must be positive', 400);
  }

  const pendingAmount = amount - (paidAmount || 0);

  const expense = new Expense({
    site: req.params.siteId,
    engineer: req.userId,
    category,
    description,
    amount,
    expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
    paidAmount: paidAmount || 0,
    pendingAmount: pendingAmount > 0 ? pendingAmount : 0,
    paymentStatus: pendingAmount <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending',
    paymentMode: paymentMode || null,
    paymentDate: paymentDate ? new Date(paymentDate) : null,
    notes: notes || '',
  });

  await expense.save();

  res.status(201).json({
    success: true,
    data: expense,
    message: 'Expense recorded successfully',
  });
});

// Update expense
const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    throw new ApiError('Expense not found', 404);
  }

  if (expense.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const { category, description, amount, expenseDate, paidAmount, paymentMode, paymentDate, notes } = req.body;

  if (category) expense.category = category;
  if (description) expense.description = description;
  if (amount !== undefined) expense.amount = amount;
  if (expenseDate !== undefined) expense.expenseDate = expenseDate ? new Date(expenseDate) : expense.expenseDate;
  if (paidAmount !== undefined) {
    expense.paidAmount = paidAmount;
    expense.pendingAmount = Math.max(0, expense.amount - paidAmount);
    expense.paymentStatus = expense.pendingAmount === 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending';
  }
  if (paymentMode !== undefined) expense.paymentMode = paymentMode;
  if (paymentDate !== undefined) expense.paymentDate = paymentDate ? new Date(paymentDate) : expense.paymentDate;
  if (notes !== undefined) expense.notes = notes;

  await expense.save();

  res.status(200).json({
    success: true,
    data: expense,
    message: 'Expense updated successfully',
  });
});

// Delete expense
const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    throw new ApiError('Expense not found', 404);
  }

  if (expense.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  await expense.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Expense deleted successfully',
  });
});

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense };
