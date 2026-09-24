const Vendor = require('../models/Vendor');
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

module.exports = { getVendors, createVendor, updateVendor, deleteVendor };
