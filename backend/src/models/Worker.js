const mongoose = require('mongoose');
const { WORKER_TYPES } = require('../config/constants');

const workerSchema = new mongoose.Schema(
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
      required: [true, 'Worker name is required'],
      trim: true,
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
      match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number'],
    },
    workerType: {
      type: String,
      enum: [WORKER_TYPES.MASON, WORKER_TYPES.HELPER, WORKER_TYPES.CARPENTER,
             WORKER_TYPES.ELECTRICIAN, WORKER_TYPES.PLUMBER, WORKER_TYPES.PAINTER,
             WORKER_TYPES.LABOUR, WORKER_TYPES.OTHER],
      required: [true, 'Worker type is required'],
    },
    isContractWorker: {
      type: Boolean,
      default: false,
    },
    dailyWage: {
      type: Number,
      min: [0, 'Wage cannot be negative'],
      default: 0,
    },
    contractAmount: {
      type: Number,
      min: [0, 'Amount cannot be negative'],
      default: 0,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    address: {
      type: String,
      trim: true,
    },
    aadharNumber: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Left'],
      default: 'Active',
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
workerSchema.index({ site: 1, status: 1 });
workerSchema.index({ workerType: 1 });
workerSchema.index({ name: 'text' });

const Worker = mongoose.model('Worker', workerSchema);

module.exports = Worker;
