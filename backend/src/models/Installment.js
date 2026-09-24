const mongoose = require('mongoose');
const { INSTALLMENT_STATUS } = require('../config/constants');

const installmentSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: [true, 'Installment name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: [true, 'Installment amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    dueDate: {
      type: Date,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount cannot be negative'],
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    paymentMode: {
      type: String,
      enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'],
      default: null,
    },
    transactionRef: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: [INSTALLMENT_STATUS.PAID, INSTALLMENT_STATUS.PARTIAL, INSTALLMENT_STATUS.PENDING, INSTALLMENT_STATUS.OVERDUE],
      default: INSTALLMENT_STATUS.PENDING,
    },
    notes: {
      type: String,
      trim: true,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
installmentSchema.index({ site: 1, order: 1 });
installmentSchema.index({ status: 1 });

// Calculate pending amount
installmentSchema.methods.calculatePending = function () {
  return this.amount - this.paidAmount;
};

// Update status based on paid amount
installmentSchema.methods.updateStatus = function () {
  const pending = this.calculatePending();
  if (pending === 0) {
    this.status = INSTALLMENT_STATUS.PAID;
  } else if (this.paidAmount > 0) {
    this.status = INSTALLMENT_STATUS.PARTIAL;
  } else {
    // Check if overdue
    if (this.dueDate && this.dueDate < new Date() && this.status !== INSTALLMENT_STATUS.PAID) {
      this.status = INSTALLMENT_STATUS.OVERDUE;
    } else {
      this.status = INSTALLMENT_STATUS.PENDING;
    }
  }
  return this.status;
};

const Installment = mongoose.model('Installment', installmentSchema);

module.exports = Installment;
