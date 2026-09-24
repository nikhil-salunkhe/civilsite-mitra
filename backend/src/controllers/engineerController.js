const Worker = require('../models/Worker');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const Expense = require('../models/Expense');
const Activity = require('../models/Activity');
const Document = require('../models/Document');
const Site = require('../models/Site');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Whitelisted modules for the engineer's global sidebar pages (spec section 38).
// Every query is scoped to the authenticated engineer - multi-tenant rule.
const MODULES = {
  workers: { Model: Worker, sort: { createdAt: -1 }, search: ['name', 'mobile', 'workerType'] },
  materials: { Model: Material, sort: { purchaseDate: -1, createdAt: -1 }, search: ['name', 'category', 'invoiceNumber'] },
  vendors: { Model: Vendor, sort: { createdAt: -1 }, search: ['name', 'mobile', 'materialCategory'] },
  expenses: { Model: Expense, sort: { expenseDate: -1, createdAt: -1 }, search: ['category', 'description'] },
  activities: { Model: Activity, sort: { date: -1, createdAt: -1 }, search: ['workDescription', 'issues'] },
  documents: { Model: Document, sort: { uploadedDate: -1 }, search: ['originalName', 'fileType'] },
};

/**
 * GET /api/engineer/:module - cross-site list powering one sidebar page.
 * A siteId belonging to another engineer simply yields an empty list.
 */
const getGlobalRecords = asyncHandler(async (req, res) => {
  const mod = MODULES[req.params.module];
  if (!mod) {
    throw new ApiError('Unknown module', 404);
  }

  const { page = 1, limit = 10, search, siteId } = req.query;
  const query = { engineer: req.userId };
  if (siteId) query.site = siteId;

  if (search) {
    query.$or = mod.search.map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));

  const [items, total, sites] = await Promise.all([
    mod.Model.find(query).sort(mod.sort).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    mod.Model.countDocuments(query),
    Site.find({ engineer: req.userId }).select('siteName').lean(),
  ]);

  const siteNames = {};
  sites.forEach((s) => {
    siteNames[String(s._id)] = s.siteName;
  });

  res.status(200).json({
    success: true,
    data: {
      items,
      siteNames,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    },
  });
});

module.exports = { getGlobalRecords };