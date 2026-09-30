const mongoose = require('mongoose');

/**
 * MATERIAL USAGE
 * ----------------------------------------------------------------------------
 * Records material consumed on site. Stock is derived, never stored:
 *
 *   currentStock = openingStock + purchased - used
 *
 * where `purchased` is the sum of Material.quantity for the same material
 * name/unit and `openingStock` is the sum of Material.openingStock.
 *
 * This model carries NO money fields on purpose. Material cost continues to
 * come from the purchase rows (Material.totalAmount / paidAmount), so consuming
 * material can never create a second expense for the same material.
 */
const materialUsageSchema = new mongoose.Schema(
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
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
      required: [true, 'Material is required'],
    },
    // Denormalised for fast stock grouping without a populate per record.
    materialName: {
      type: String,
      trim: true,
      required: [true, 'Material name is required'],
    },
    unit: {
      type: String,
      trim: true,
      required: [true, 'Unit is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.01, 'Quantity must be greater than zero'],
    },
    date: {
      type: Date,
      required: [true, 'Usage date is required'],
      default: Date.now,
    },
    // Free-text link to the work item this material was consumed on,
    // e.g. "Slab casting - first floor".
    workActivity: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

materialUsageSchema.index({ site: 1, date: -1 });
materialUsageSchema.index({ material: 1, date: -1 });
materialUsageSchema.index({ engineer: 1, date: -1 });
materialUsageSchema.index({ site: 1, materialName: 1, unit: 1 });

const MaterialUsage = mongoose.model('MaterialUsage', materialUsageSchema);

module.exports = MaterialUsage;
