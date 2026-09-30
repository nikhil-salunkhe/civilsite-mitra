const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const VendorPayment = require('../models/VendorPayment');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get vendors for a site
const getVendors = asyncHandler(async (req, res) => {
  const vendors = await Vendor.find({ site: req.params.siteId })
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: vendors,
  });
});

// Create vendor
const createVendor = asyncHandler(async (req, res) => {
  const { name, mobile, email, address, city, materialCategory, notes } = req.body;

  if (!name) {
    throw new ApiError('Vendor name is required', 400);
  }

  // Check for duplicate vendor name within same site
  const existingVendor = await Vendor.findOne({ site: req.params.siteId, name });
  if (existingVendor) {
    throw new ApiError('Vendor with this name already exists for this site', 400);
  }

  const vendor = new Vendor({
    site: req.params.siteId,
    engineer: req.userId,
    name,
    mobile: mobile || '',
    email: email || '',
    address: address || '',
    city: city || '',
    materialCategory: materialCategory || '',
    notes: notes || '',
  });

  await vendor.save();

  res.status(201).json({
    success: true,
    data: vendor,
    message: 'Vendor added successfully',
  });
});

// Update vendor
const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);

  if (!vendor) {
    throw new ApiError('Vendor not found', 404);
  }

  if (vendor.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const { name, mobile, email, address, city, materialCategory, notes } = req.body;

  if (name) {
    // Check duplicate name
    const existing = await Vendor.findOne({ site: req.params.siteId, name, _id: { $ne: vendor._id } });
    if (existing) {
      throw new ApiError('Vendor with this name already exists', 400);
    }
    vendor.name = name;
  }
  if (mobile !== undefined) vendor.mobile = mobile;
  if (email !== undefined) vendor.email = email;
  if (address !== undefined) vendor.address = address;
  if (city !== undefined) vendor.city = city;
  if (materialCategory !== undefined) vendor.materialCategory = materialCategory;
  if (notes !== undefined) vendor.notes = notes;

  await vendor.save();

  res.status(200).json({
    success: true,
    data: vendor,
    message: 'Vendor updated successfully',
  });
});

// Delete vendor
const deleteVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);

  if (!vendor) {
    throw new ApiError('Vendor not found', 404);
  }

  if (vendor.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  await vendor.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Vendor deleted successfully',
  });
});

// Vendor ledger
//
// This is a READ-ONLY projection over records that already exist:
//   debit  = material purchases attributed to this vendor
//   credit = vendor payments made to this vendor
// It intentionally does NOT create a second financial source, so ledger totals
// cannot double-count against the site investment summary.
const getVendorLedger = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);

  if (!vendor) {
    throw new ApiError('Vendor not found', 404);
  }

  if (vendor.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const [materials, payments] = await Promise.all([
    Material.find({ site: vendor.site, vendor: vendor._id }).lean(),
    VendorPayment.find({ site: vendor.site, vendor: vendor._id }).lean(),
  ]);

  const entries = [];

  materials.forEach((m) => {
    const qty = m.quantity ? ` - ${m.quantity}${m.unit ? ` ${m.unit}` : ''}` : '';
    entries.push({
      date: m.purchaseDate || m.createdAt,
      type: 'PURCHASE',
      description: `${m.name || 'Material'}${qty}`,
      reference: m.invoiceNumber || '',
      debit: Number(m.totalAmount) || 0,
      credit: 0,
    });
  });

  payments.forEach((p) => {
    entries.push({
      date: p.date || p.createdAt,
      type: 'PAYMENT',
      description: p.notes || `Payment${p.materialName ? ` for ${p.materialName}` : ''}`,
      reference: p.transactionRef || '',
      debit: 0,
      credit: Number(p.amount) || 0,
    });
  });

  // Chronological order is required for a meaningful running balance.
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  const openingBalance = Number(vendor.openingBalance) || 0;
  let balance = openingBalance;

  const ledger = entries.map((entry) => {
    balance += entry.debit - entry.credit;
    return { ...entry, balance: Math.round(balance * 100) / 100 };
  });

  const totalPurchases = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalPaid = entries.reduce((sum, e) => sum + e.credit, 0);

  res.status(200).json({
    success: true,
    data: {
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        companyName: vendor.companyName || '',
        mobile: vendor.mobile || '',
        category: vendor.materialCategory || '',
      },
      openingBalance,
      summary: {
        totalPurchases,
        totalPaid,
        outstanding: Math.round((openingBalance + totalPurchases - totalPaid) * 100) / 100,
      },
      ledger,
    },
  });
});

module.exports = {
  getVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorLedger,
};
