const VendorPayment = require('../models/VendorPayment');
const Material = require('../models/Material');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get vendor payments
const getVendorPayments = asyncHandler(async (req, res) => {
  const { vendorId, page = 1, limit = 50 } = req.query;

  const query = { site: req.params.siteId };
  if (vendorId) query.vendor = vendorId;

  const payments = await VendorPayment.find(query)
    .populate('vendor', 'name')
    .populate('material', 'name')
    .sort({ date: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  const total = await VendorPayment.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Create vendor payment
const createVendorPayment = asyncHandler(async (req, res) => {
  const { vendor, material, materialName, quantity, unit, amount, date, paymentMode, transactionRef, notes } = req.body;

  if (!vendor || !amount) {
    throw new ApiError('Vendor and amount are required', 400);
  }

  if (amount <= 0) {
    throw new ApiError('Amount must be positive', 400);
  }

  const vendorData = await require('../models/Vendor').findById(vendor);
  if (!vendorData || vendorData.site.toString() !== req.params.siteId) {
    throw new ApiError('Invalid vendor for this site', 400);
  }

  const vendorPayment = new VendorPayment({
    vendor,
    site: req.params.siteId,
    engineer: req.userId,
    material: material || null,
    materialName: materialName || null,
    quantity: quantity || 0,
    unit: unit || '',
    amount,
    date: date ? new Date(date) : new Date(),
    paymentMode: paymentMode || null,
    transactionRef: transactionRef || null,
    notes: notes || '',
  });

  await vendorPayment.save();

  res.status(201).json({
    success: true,
    data: vendorPayment,
    message: 'Vendor payment recorded successfully',
  });
});

// Delete vendor payment
const deleteVendorPayment = asyncHandler(async (req, res) => {
  const vendorPayment = await VendorPayment.findById(req.params.id);

  if (!vendorPayment) {
    throw new ApiError('Vendor payment not found', 404);
  }

  if (vendorPayment.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  await vendorPayment.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Vendor payment deleted successfully',
  });
});

module.exports = { getVendorPayments, createVendorPayment, deleteVendorPayment };
