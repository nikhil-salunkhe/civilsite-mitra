const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get materials for a site
const getMaterials = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, category, paymentStatus } = req.query;

  const query = { site: req.params.siteId };
  if (category) query.category = category;
  if (paymentStatus) query.paymentStatus = paymentStatus;

  const materials = await Material.find(query)
    .populate('vendor', 'name')
    .sort({ purchaseDate: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  const total = await Material.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      materials,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Create material
const createMaterial = asyncHandler(async (req, res) => {
  const {
    name, category, vendor, vendorName, quantity, unit, rate,
    purchaseDate, invoiceNumber, paidAmount, notes, document,
  } = req.body;

  if (!name || !category || !quantity || !unit || !rate) {
    throw new ApiError('Name, category, quantity, unit, and rate are required', 400);
  }

  if (quantity <= 0 || rate < 0) {
    throw new ApiError('Quantity and rate must be positive', 400);
  }

  const material = new Material({
    site: req.params.siteId,
    engineer: req.userId,
    name,
    category,
    vendor: vendor || null,
    vendorName: vendorName || null,
    quantity,
    unit,
    rate,
    totalAmount: quantity * rate,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
    invoiceNumber: invoiceNumber || '',
    paidAmount: paidAmount || 0,
    pendingAmount: Math.max(0, quantity * rate - (paidAmount || 0)),
    paymentStatus: paidAmount && paidAmount >= quantity * rate ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending',
    notes: notes || '',
    document: document || null,
  });

  await material.save();

  res.status(201).json({
    success: true,
    data: material,
    message: 'Material added successfully',
  });
});

// Update material
const updateMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findById(req.params.id);

  if (!material) {
    throw new ApiError('Material not found', 404);
  }

  if (material.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const {
    name, category, vendor, vendorName, quantity, unit, rate,
    purchaseDate, invoiceNumber, paidAmount, notes, document,
  } = req.body;

  if (name) material.name = name;
  if (category) material.category = category;
  if (vendor !== undefined) material.vendor = vendor;
  if (vendorName !== undefined) material.vendorName = vendorName;
  if (quantity !== undefined) material.quantity = quantity;
  if (unit) material.unit = unit;
  if (rate !== undefined) material.rate = rate;
  if (purchaseDate !== undefined) material.purchaseDate = purchaseDate ? new Date(purchaseDate) : material.purchaseDate;
  if (invoiceNumber !== undefined) material.invoiceNumber = invoiceNumber;
  if (paidAmount !== undefined) {
    material.paidAmount = paidAmount;
    material.pendingAmount = Math.max(0, material.totalAmount - paidAmount);
    material.paymentStatus = material.pendingAmount === 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending';
  }
  if (notes !== undefined) material.notes = notes;
  if (document !== undefined) material.document = document;

  // Recalculate total
  material.totalAmount = material.quantity * material.rate;
  material.pendingAmount = Math.max(0, material.totalAmount - material.paidAmount);

  await material.save();

  res.status(200).json({
    success: true,
    data: material,
    message: 'Material updated successfully',
  });
});

// Delete material
const deleteMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findById(req.params.id);

  if (!material) {
    throw new ApiError('Material not found', 404);
  }

  if (material.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  await material.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Material deleted successfully',
  });
});

module.exports = { getMaterials, createMaterial, updateMaterial, deleteMaterial };
