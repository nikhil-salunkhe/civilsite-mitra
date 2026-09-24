const mongoose = require('mongoose');
const { EXPENSE_CATEGORIES } = require('../config/constants');

const expenseSchema = new mongoose.Schema(
  {
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
    },
    engineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      enum: [EXPENSE_CATEGORIES.TRANSPORTATION, EXPENSE_CATEGORIES.JCB, EXPENSE_CATEGORIES.MACHINERY,
             EXPENSE_CATEGORIES.ELECTRICITY, EXPENSE_CATEGORIES.WATER, EXPENSE_CATEGORIES.GOVERNMENT_FEES,
             EXPENSE_CATEGORIES.PERMISSIONS, EXPENSE_CATEGORIES.ARCHITECT, EXPENSE_CATEGORIES.ENGINEER,
             EXPENSE_CATEGORIES.TRAVEL, EXPENSE_CATEGORIES.MISCELLANEOUS],
      required: [true, 'Category is required'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    expenseDate: {
      type: Date,
      required: [true, 'Expense date is required'],
      default: Date.now,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount cannot be negative'],
    },
    pendingAmount: {
      type: Number,
      default: 0,
      min: [0, 'Pending amount cannot be negative'],
    },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Partial', 'Pending'],
      default: 'Pending',
    },
    paymentMode: {
      type: String,
      enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'],
      default: null,
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
expenseSchema.index({ site: 1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ paymentStatus: 1 });

// Calculate totals
expenseSchema.methods.calculateTotals = function () {
  this.pendingAmount = Math.max(0, this.amount - this.paidAmount);
  
  if (this.pendingAmount === 0) {
    this.paymentStatus = 'Paid';
  } else if (this.paidAmount > 0) {
    this.paymentStatus = 'Partial';
  } else {
    this.paymentStatus = 'Pending';
  }
  
  return this;
};

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
