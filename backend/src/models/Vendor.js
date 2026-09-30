const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
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
      required: [true, 'Vendor name is required'],
      trim: true,
      // NOTE: deliberately NOT `unique: true` - vendor names only have to be
      // unique *within a site*. A global unique index would prevent two
      // different engineers from both having a vendor called "Sharma Traders".
    },
    mobile: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    materialCategory: {
      type: String,
      trim: true,
    },
    // Optional business/compliance fields. Deliberately all optional: most local
    // contractors deal with small traders who have no GST/PAN on record.
    companyName: {
      type: String,
      trim: true,
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    openingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    creditLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentTerms: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
vendorSchema.index({ site: 1 });
vendorSchema.index({ name: 1 });
vendorSchema.index({ materialCategory: 1 });
vendorSchema.index({ name: 'text' });
// Multi-tenant duplicate guard: same vendor name is only blocked per site.
vendorSchema.index({ site: 1, name: 1 }, { unique: true });

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;
