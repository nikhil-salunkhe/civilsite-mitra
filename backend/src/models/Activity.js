const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
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
    date: {
      type: Date,
      required: [true, 'Date is required'],
      default: Date.now,
    },
    type: {
      type: String,
      enum: {
        values: ['Site Visit', 'Concrete Pour', 'Slab Work', 'Brick Work', 'Plastering', 'Inspection', 'Material Delivery', 'Measurement', 'Other'],
        message: '{VALUE} is not a valid activity type',
      },
      default: 'Other',
      trim: true,
    },
    workersPresent: {
      type: Number,
      min: [0, 'Cannot be negative'],
      default: 0,
    },
    workDescription: {
      type: String,
      required: [true, 'Work description is required'],
      trim: true,
    },
    workCompleted: {
      type: String,
      trim: true,
    },
    materialsReceived: {
      type: String,
      trim: true,
    },
    issues: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    photos: [
      {
        type: String,
        trim: true,
      },
    ],
    todayExpense: {
      type: Number,
      min: [0, 'Cannot be negative'],
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
activitySchema.index({ site: 1, date: -1 });
activitySchema.index({ date: -1 });

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;
