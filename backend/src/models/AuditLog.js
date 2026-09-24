const mongoose = require('mongoose');
const { USER_ROLES } = require('../config/constants');

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adminName: {
      type: String,
      required: true,
    },
    adminEmail: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'Engineer Created',
        'Engineer Updated',
        'Engineer Viewed',
        'Engineer Activated',
        'Engineer Suspended',
        'Engineer Blocked',
        'Engineer Unblocked',
        'Engineer Deactivated',
        'Engineer Deleted',
        'Password Reset',
        'Site Created',
        'Site Updated',
        'Site Viewed',
        'Site Deleted',
        'Payment Recorded',
        'Installment Created',
        'Worker Added',
        'Worker Payment Recorded',
        'Material Added',
        'Vendor Added',
        'Expense Added',
        'Activity Logged',
        'Report Generated',
        'Document Uploaded',
        'Settings Changed',
      ],
    },
    engineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    engineerName: {
      type: String,
      default: null,
    },
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
    },
    siteName: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      trim: true,
    },
    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ engineer: 1, createdAt: -1 });
auditLogSchema.index({ site: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
