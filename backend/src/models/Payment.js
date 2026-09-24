const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
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
    installment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Installment',
      default: null,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    date: {
      type: Date,
      required: [true, 'Payment date is required'],
      default: Date.now,
    },
    paymentMode: {
      type: String,
      enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'],
      required: [true, 'Payment mode is required'],
    },
    transactionRef: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
paymentSchema.index({ site: 1, date: -1 });
paymentSchema.index({ site: 1, installment: 1 });
paymentSchema.index({ date: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
