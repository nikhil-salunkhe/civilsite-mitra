const mongoose = require('mongoose');
const MaterialUsage = require('../models/MaterialUsage');
const Material = require('../models/Material');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// MATERIAL USAGE + DERIVED STOCK
// ---------------------------------------------------------------------------
// Usage rows intentionally carry NO money fields. Material cost continues to
// come from the purchase rows only (Material.quantity/rate/totalAmount), so
// consuming material can never produce a second expense for the same material.
//
// Stock is always DERIVED, never stored:
//
//   currentStock = openingStock + purchased - used
//
// grouped per (material name + unit) so "Cement / bags" and "Cement / kg" are
// tracked as separate stock lines.
// ---------------------------------------------------------------------------

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const isInvalidDate = (value) => Number.isNaN(new Date(value).getTime());

// Site ownership is already guaranteed by the loadSite tenant guard on
// ':siteId'. This only asserts the *nested* record belongs to that same site.
const assertMaterialOnSite = async (materialId, siteId) => {
  if (!mongoose.Types.ObjectId.isValid(materialId)) {
    throw new ApiError('Material not found', 404);
  }
  const material = await Material.findOne({ _id: materialId, site: siteId });
  if (!material) {
    throw new ApiError('Material not found', 404);
  }
  return material;
};

// GET /:siteId/material-usage
const getMaterialUsage = asyncHandler(async (req, res) => {
  const { materialId, from, to, page = 1, limit = 100 } = req.query;

  const query = { site: req.params.siteId };
  if (materialId) query.material = materialId;

  if (from || to) {
    query.date = {};
    if (from) {
      if (isInvalidDate(from)) throw new ApiError('Invalid "from" date', 400);
      query.date.$gte = new Date(from);
    }
    if (to) {
      if (isInvalidDate(to)) throw new ApiError('Invalid "to" date', 400);
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      query.date.$lte = end;
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));

  const [usage, total] = await Promise.all([
    MaterialUsage.find(query)
      .populate('material', 'name category unit rate')
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    MaterialUsage.countDocuments(query),
  ]);

  const totalQuantity = usage.reduce((sum, u) => round2(sum + u.quantity), 0);

  res.status(200).json({
    success: true,
    data: {
      usage,
      totalQuantity,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        totalItems: total,
        itemsPerPage: limitNum,
      },
    },
  });
});

// POST /:siteId/material-usage
const createMaterialUsage = asyncHandler(async (req, res) => {
  const { material: materialId, quantity, date, workActivity, notes } = req.body;

  if (!materialId) throw new ApiError('Material is required', 400);
  if (quantity === undefined || quantity === null || quantity === '') {
    throw new ApiError('Quantity is required', 400);
  }

  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty <= 0) {
    throw new ApiError('Quantity must be a positive number', 400);
  }
  if (date && isInvalidDate(date)) {
    throw new ApiError('Please provide a valid usage date', 400);
  }

  const material = await assertMaterialOnSite(materialId, req.params.siteId);

  const usage = new MaterialUsage({
    site: req.params.siteId,
    engineer: req.userId,
    material: material._id,
    materialName: material.name,
    unit: material.unit,
    quantity: qty,
    date: date ? new Date(date) : new Date(),
    workActivity: workActivity || '',
    notes: notes || '',
  });

  await usage.save();

  res.status(201).json({
    success: true,
    data: usage,
    message: 'Material usage recorded successfully',
  });
});

// PUT /:siteId/material-usage/:id
const updateMaterialUsage = asyncHandler(async (req, res) => {
  const usage = await MaterialUsage.findOne({
    _id: req.params.id,
    site: req.params.siteId,
  });

  if (!usage) throw new ApiError('Material usage record not found', 404);

  const { material: materialId, quantity, date, workActivity, notes } = req.body;

  if (materialId !== undefined) {
    const material = await assertMaterialOnSite(materialId, req.params.siteId);
    usage.material = material._id;
    // Keep the denormalised stock-grouping keys in step with the new material.
    usage.materialName = material.name;
    usage.unit = material.unit;
  }

  if (quantity !== undefined) {
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      throw new ApiError('Quantity must be a positive number', 400);
    }
    usage.quantity = qty;
  }

  if (date !== undefined) {
    if (!date || isInvalidDate(date)) {
      throw new ApiError('Please provide a valid usage date', 400);
    }
    usage.date = new Date(date);
  }

  if (workActivity !== undefined) usage.workActivity = workActivity;
  if (notes !== undefined) usage.notes = notes;

  await usage.save();

  res.status(200).json({
    success: true,
    data: usage,
    message: 'Material usage updated successfully',
  });
});

// DELETE /:siteId/material-usage/:id
const deleteMaterialUsage = asyncHandler(async (req, res) => {
  const usage = await MaterialUsage.findOne({
    _id: req.params.id,
    site: req.params.siteId,
  });

  if (!usage) throw new ApiError('Material usage record not found', 404);

  await usage.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Material usage deleted successfully',
  });
});

// GET /:siteId/material-stock
// One row per material name+unit with opening / purchased / used / current.
const getMaterialStock = asyncHandler(async (req, res) => {
  const siteId = new mongoose.Types.ObjectId(req.params.siteId);

  const [purchasedRows, usedRows] = await Promise.all([
    Material.aggregate([
      { $match: { site: siteId } },
      {
        $group: {
          _id: { name: '$name', unit: '$unit' },
          purchased: { $sum: { $ifNull: ['$quantity', 0] } },
          openingStock: { $sum: { $ifNull: ['$openingStock', 0] } },
          minStockLevel: { $max: { $ifNull: ['$minStockLevel', 0] } },
          trackStock: { $max: { $ifNull: ['$trackStock', false] } },
          category: { $first: '$category' },
        },
      },
    ]),
    MaterialUsage.aggregate([
      { $match: { site: siteId } },
      {
        $group: {
          _id: { name: '$materialName', unit: '$unit' },
          used: { $sum: { $ifNull: ['$quantity', 0] } },
        },
      },
    ]),
  ]);

  const keyOf = (name, unit) => `${String(name).toLowerCase()}||${unit}`;

  const usedMap = new Map(usedRows.map((r) => [keyOf(r._id.name, r._id.unit), r.used]));

  const stock = purchasedRows.map((row) => {
    const used = usedMap.get(keyOf(row._id.name, row._id.unit)) || 0;
    const opening = row.openingStock || 0;
    const current = round2(opening + row.purchased - used);
    const minLevel = row.minStockLevel || 0;

    return {
      materialName: row._id.name,
      unit: row._id.unit,
      category: row.category || '',
      openingStock: round2(opening),
      purchased: round2(row.purchased),
      used: round2(used),
      currentStock: current,
      minStockLevel: round2(minLevel),
      trackStock: !!row.trackStock,
      // Only flagged when the engineer actually opted into stock tracking for
      // this material, so expense-only projects never see false alarms.
      isLowStock: !!row.trackStock && minLevel > 0 && current <= minLevel,
    };
  });

  // Usage booked against a material name with no purchase row would otherwise
  // be invisible; surface it as a negative position instead of hiding it.
  const purchasedKeys = new Set(
    purchasedRows.map((r) => keyOf(r._id.name, r._id.unit))
  );
  usedRows.forEach((row) => {
    if (!purchasedKeys.has(keyOf(row._id.name, row._id.unit))) {
      stock.push({
        materialName: row._id.name,
        unit: row._id.unit,
        category: '',
        openingStock: 0,
        purchased: 0,
        used: round2(row.used),
        currentStock: round2(-row.used),
        minStockLevel: 0,
        trackStock: false,
        isLowStock: false,
      });
    }
  });

  stock.sort((a, b) => String(a.materialName).localeCompare(String(b.materialName)));

  res.status(200).json({
    success: true,
    data: {
      stock,
      lowStockCount: stock.filter((s) => s.isLowStock).length,
    },
  });
});

module.exports = {
  getMaterialUsage,
  createMaterialUsage,
  updateMaterialUsage,
  deleteMaterialUsage,
  getMaterialStock,
};
