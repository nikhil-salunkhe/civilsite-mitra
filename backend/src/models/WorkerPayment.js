const mongoose = require('mongoose');

const workerPaymentSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
    },
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
    date: {
      type: Date,
      required: [true, 'Payment date is required'],
      default: Date.now,
    },
    workDays: {
      type: Number,
      required: true,
      min: [0, 'Work days cannot be negative'],
    },
    dailyWage: {
      type: Number,
      required: true,
      min: [0, 'Wage cannot be negative'],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Amount cannot be negative'],
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
    paymentMode: {
      type: String,
      enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'],
      default: null,
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['Paid', 'Partial', 'Pending'],
      default: 'Pending',
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
workerPaymentSchema.index({ worker: 1, date: -1 });
workerPaymentSchema.index({ site: 1, date: -1 });
workerPaymentSchema.index({ status: 1 });

// Calculate amounts
workerPaymentSchema.methods.calculateTotals = function () {
  this.totalAmount = this.workDays * this.dailyWage;
  this.pendingAmount = Math.max(0, this.totalAmount - this.paidAmount);
  
  if (this.pendingAmount === 0) {
    this.status = 'Paid';
  } else if (this.paidAmount > 0) {
    this.status = 'Partial';
  } else {
    this.status = 'Pending';
  }
  
  return this;
};

const WorkerPayment = mongoose.model('WorkerPayment', workerPaymentSchema);

module.exports = WorkerPayment;
