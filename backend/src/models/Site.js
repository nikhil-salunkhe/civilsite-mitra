const mongoose = require('mongoose');
const { SITE_STATUS } = require('../config/constants');

const siteSchema = new mongoose.Schema(
  {
    engineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    engineerName: {
      type: String,
      required: true,
    },
    siteName: {
      type: String,
      required: [true, 'Site name is required'],
      trim: true,
      maxlength: [100, 'Site name cannot exceed 100 characters'],
      index: true,
    },
    ownerName: {
      type: String,
      required: [true, 'Owner name is required'],
      trim: true,
    },
    ownerMobile: {
      type: String,
      required: [true, 'Owner mobile is required'],
      trim: true,
      match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number'],
    },
    ownerEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      required: [true, 'Site address is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    // Construction details
    totalArea: {
      type: Number,
      required: [true, 'Total area is required'],
      min: [0, 'Area cannot be negative'],
    },
    areaUnit: {
      type: String,
      default: 'Sq.Ft',
    },
    ratePerArea: {
      type: Number,
      required: [true, 'Rate per area is required'],
      min: [0, 'Rate cannot be negative'],
    },
    rateCurrency: {
      type: String,
      default: 'INR',
    },
    estimatedProjectCost: {
      type: Number,
      default: 0,
    },
    engineerCharges: {
      type: Number,
      default: 0,
      min: [0, 'Charges cannot be negative'],
    },
    // Status
    status: {
      type: String,
      enum: [SITE_STATUS.PLANNED, SITE_STATUS.ACTIVE, SITE_STATUS.ON_HOLD, SITE_STATUS.COMPLETED, SITE_STATUS.CLOSED],
      default: SITE_STATUS.PLANNED,
    },
    startDate: {
      type: Date,
    },
    expectedCompletionDate: {
      type: Date,
    },
    actualCompletionDate: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
    // Progress (stored as percentage per stage)
    progress: {
      foundation: { type: Number, default: 0, min: 0, max: 100 },
      plinth: { type: Number, default: 0, min: 0, max: 100 },
      structure: { type: Number, default: 0, min: 0, max: 100 },
      brickwork: { type: Number, default: 0, min: 0, max: 100 },
      electrical: { type: Number, default: 0, min: 0, max: 100 },
      plumbing: { type: Number, default: 0, min: 0, max: 100 },
      flooring: { type: Number, default: 0, min: 0, max: 100 },
      painting: { type: Number, default: 0, min: 0, max: 100 },
      finishing: { type: Number, default: 0, min: 0, max: 100 },
    },
    overallProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
siteSchema.index({ engineer: 1, status: 1 });
siteSchema.index({ engineer: 1, isArchived: 1 });
siteSchema.index({ city: 1 });
siteSchema.index({ status: 1 });
siteSchema.index({ siteName: 'text', ownerName: 'text', address: 'text' });

// Calculate total project value
siteSchema.methods.calculateProjectValue = function () {
  return this.totalArea * this.ratePerArea;
};

// Calculate overall progress from stage progress
siteSchema.methods.calculateOverallProgress = function () {
  const stages = [
    this.progress.foundation,
    this.progress.plinth,
    this.progress.structure,
    this.progress.brickwork,
    this.progress.electrical,
    this.progress.plumbing,
    this.progress.flooring,
    this.progress.painting,
    this.progress.finishing,
  ];
  const sum = stages.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / stages.length);
};

// Update overall progress
siteSchema.methods.updateOverallProgress = function () {
  this.overallProgress = this.calculateOverallProgress();
  return this.overallProgress;
};

const Site = mongoose.model('Site', siteSchema);

module.exports = Site;
