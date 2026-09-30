const mongoose = require('mongoose');

// Attendance statuses and the wage-day multiplier each one earns.
// Kept in one place so the model, the controller and the reports all agree.
const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Half Day', 'Leave'];

const WAGE_DAY_FACTOR = {
  Present: 1,
  'Half Day': 0.5,
  Absent: 0,
  Leave: 0,
};

const workerAttendanceSchema = new mongoose.Schema(
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
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: [true, 'Worker is required'],
    },
    date: {
      type: Date,
      required: [true, 'Attendance date is required'],
    },
    status: {
      type: String,
      enum: {
        values: ATTENDANCE_STATUSES,
        message: 'Status must be Present, Absent, Half Day or Leave',
      },
      default: 'Present',
    },
    workHours: {
      type: Number,
      min: [0, 'Work hours cannot be negative'],
      max: [24, 'Work hours cannot exceed 24'],
      default: 8,
    },
    // Snapshot of the wage used for this day so later wage edits do not
    // silently rewrite historical earnings.
    dailyWage: {
      type: Number,
      min: [0, 'Wage cannot be negative'],
      default: 0,
    },
    // dailyWage x WAGE_DAY_FACTOR[status], computed by the controller.
    earnedAmount: {
      type: Number,
      min: [0, 'Earned amount cannot be negative'],
      default: 0,
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

// One attendance row per worker per day - re-marking a day updates it.
workerAttendanceSchema.index({ site: 1, date: -1 });
workerAttendanceSchema.index({ worker: 1, date: -1 });
workerAttendanceSchema.index({ engineer: 1, date: -1 });
workerAttendanceSchema.index({ worker: 1, date: 1 }, { unique: true });

// Earnings for one day of attendance.
workerAttendanceSchema.methods.calculateEarned = function () {
  const factor = WAGE_DAY_FACTOR[this.status] ?? 0;
  this.earnedAmount = Math.round(this.dailyWage * factor * 100) / 100;
  return this;
};

const WorkerAttendance = mongoose.model('WorkerAttendance', workerAttendanceSchema);

module.exports = WorkerAttendance;
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
module.exports.WAGE_DAY_FACTOR = WAGE_DAY_FACTOR;
