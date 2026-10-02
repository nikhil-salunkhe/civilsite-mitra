const mongoose = require('mongoose');
const { DOCUMENT_TYPES } = require('../config/constants');

const documentSchema = new mongoose.Schema(
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
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    /**
     * Key of the object inside the configured storage provider
     * (see services/storageService.js). For the local provider this is a path
     * relative to UPLOAD_PATH; for S3/R2 it is the object key. Historical rows
     * only have fileName, so readers fall back to it.
     */
    storageKey: {
      type: String,
      trim: true,
      default: null,
    },
    /** 'local' | 's3' - which backend the row was written to. */
    storageProvider: {
      type: String,
      trim: true,
      default: 'local',
    },
    originalName: {
      type: String,
      required: [true, 'Original name is required'],
      trim: true,
    },
    fileType: {
      type: String,
      enum: [DOCUMENT_TYPES.AGREEMENT, DOCUMENT_TYPES.BILL, DOCUMENT_TYPES.INVOICE,
             DOCUMENT_TYPES.MATERIAL_INVOICE, DOCUMENT_TYPES.SITE_PHOTO, DOCUMENT_TYPES.OTHER],
      required: [true, 'File type is required'],
    },
    mimeType: {
      type: String,
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    uploadedDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
documentSchema.index({ site: 1, fileType: 1 });
documentSchema.index({ uploadedDate: -1 });

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
