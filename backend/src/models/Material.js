const mongoose = require('mongoose');
const { MATERIAL_CATEGORIES } = require('../config/constants');

const materialSchema = new mongoose.Schema(
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
      required: [true, 'Material name is required'],
      trim: true,
    },
    category: {
      type: String,
      enum: [MATERIAL_CATEGORIES.CEMENT, MATERIAL_CATEGORIES.STEEL, MATERIAL_CATEGORIES.SAND,
             MATERIAL_CATEGORIES.BRICKS, MATERIAL_CATEGORIES.TILES, MATERIAL_CATEGORIES.ELECTRICAL,
             MATERIAL_CATEGORIES.PLUMBING, MATERIAL_CATEGORIES.PAINT, MATERIAL_CATEGORIES.HARDWARE,
             MATERIAL_CATEGORIES.WOOD, MATERIAL_CATEGORIES.OTHER],
      required: [true, 'Category is required'],
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null,
    },
    vendorName: {
      type: String,
      trim: true,
      default: null,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative'],
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      trim: true,
    },
    rate: {
      type: Number,
      required: [true, 'Rate is required'],
      min: [0, 'Rate cannot be negative'],
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    invoiceNumber: {
      type: String,
      trim: true,
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
    notes: {
      type: String,
      trim: true,
    },
    document: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
materialSchema.index({ site: 1 });
materialSchema.index({ category: 1 });
materialSchema.index({ purchaseDate: -1 });
materialSchema.index({ paymentStatus: 1 });

// Calculate total
materialSchema.methods.calculateTotal = function () {
  this.totalAmount = this.quantity * this.rate;
  this.pendingAmount = Math.max(0, this.totalAmount - this.paidAmount);
  
  if (this.pendingAmount === 0) {
    this.paymentStatus = 'Paid';
  } else if (this.paidAmount > 0) {
    this.paymentStatus = 'Partial';
  } else {
    this.paymentStatus = 'Pending';
  }
  
  return this;
};

const Material = mongoose.model('Material', materialSchema);

module.exports = Material;
