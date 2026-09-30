const Site = require('../models/Site');
const Installment = require('../models/Installment');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { SITE_STATUS, DEFAULT_INSTALLMENTS } = require('../config/constants');
const { findOwnedSite } = require('../utils/siteAccess');
const { escapeRegex } = require('../utils/query');
const {
  calculateSiteFinancialSummary,
  calculateEngineerFinancialSummary,
  round2,
} = require('../services/financialService');

/**
 * Normalises the optional geo-tag sent by the Google Maps picker.
 *
 * Returns `{}` for an un-pinned site so `new Site({...spread})` / `Object.assign`
 * leave the schema defaults (nulls) in place. When a pin IS present, the two
 * halves of the coordinate pair are validated together: a latitude without a
 * longitude is meaningless, so it is dropped rather than stored half-formed.
 * Mirrors the Joi `siteSchema` rules in src/validators/index.js.
 */
const geoFields = (body = {}) => {
  const hasLat = body.latitude !== undefined && body.latitude !== null && body.latitude !== '';
  const hasLng = body.longitude !== undefined && body.longitude !== null && body.longitude !== '';

  // Clearing a pin is intentional and supported (both explicitly null/empty).
  if (!hasLat && !hasLng) {
    return body.latitude === null || body.longitude === null
      ? { latitude: null, longitude: null, locationLabel: '', geoSource: null, locationCapturedAt: null }
      : {};
  }

  if (!hasLat || !hasLng) {
    throw new ApiError('Latitude and longitude must be provided together', 400);
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ApiError('Latitude must be a number between -90 and 90', 400);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ApiError('Longitude must be a number between -180 and 180', 400);
  }

  const source = ['gps', 'map', 'manual'].includes(body.geoSource) ? body.geoSource : 'map';

  return {
    latitude,
    longitude,
    locationLabel: (body.locationLabel || '').trim(),
    geoSource: source,
    locationCapturedAt: new Date(),
  };
};

// GET /api/sites
const getSites = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    city,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    includeArchived = 'false',
  } = req.query;

  const query = { engineer: req.userId };

  if (includeArchived !== 'true') {
    query.isArchived = false;
  }

  if (status && Object.values(SITE_STATUS).includes(status)) {
    query.status = status;
  }

  if (city) {
    query.city = { $regex: escapeRegex(city), $options: 'i' };
  }

  if (search) {
    const s = escapeRegex(search);
    query.$or = [
      { siteName: { $regex: s, $options: 'i' } },
      { ownerName: { $regex: s, $options: 'i' } },
      { ownerMobile: { $regex: s, $options: 'i' } },
      { city: { $regex: s, $options: 'i' } },
      { address: { $regex: s, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  // Whitelisted sort keys - never pass raw user input to the sort spec.
  const allowedSort = ['createdAt', 'siteName', 'status', 'totalArea', 'startDate'];
  const sortKey = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
  const sort = { [sortKey]: sortOrder === 'asc' ? 1 : -1 };

  const [sites, total] = await Promise.all([
    Site.find(query).sort(sort).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Site.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      sites,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    },
  });
});

// POST /api/sites
const createSite = asyncHandler(async (req, res) => {
  const {
    siteName,
    ownerName,
    ownerMobile,
    ownerEmail,
    address,
    city,
    state,
    pincode,
    totalArea,
    areaUnit,
    ratePerArea,
    engineerCharges,
    startDate,
    expectedCompletionDate,
    status,
    notes,
    installments,
    latitude,
    longitude,
    locationLabel,
    geoSource,
  } = req.body;

  if (!siteName || !ownerName || !ownerMobile || !address || !city || totalArea === undefined || ratePerArea === undefined) {
    throw new ApiError('Site name, owner details, address, city, area and rate are required', 400);
  }

  const area = Number(totalArea);
  const rate = Number(ratePerArea);

  if (!Number.isFinite(area) || area <= 0) {
    throw new ApiError('Total area must be a positive number', 400);
  }

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new ApiError('Rate per area must be a positive number', 400);
  }

  // Project value is always derived on the server: area x rate
  const estimatedProjectCost = round2(area * rate);

  const site = new Site({
    engineer: req.userId,
    engineerName: req.user.name,
    siteName,
    ownerName,
    ownerMobile,
    ownerEmail: ownerEmail || undefined,
    address,
    city,
    state: state || '',
    pincode: pincode || '',
    totalArea: area,
    areaUnit: areaUnit || 'Sq.Ft',
    ratePerArea: rate,
    estimatedProjectCost,
    engineerCharges: Number(engineerCharges) || 0,
    startDate: startDate ? new Date(startDate) : new Date(),
    expectedCompletionDate: expectedCompletionDate ? new Date(expectedCompletionDate) : null,
    status: Object.values(SITE_STATUS).includes(status) ? status : SITE_STATUS.PLANNED,
    notes: notes || '',
    ...geoFields(req.body),
  });

  await site.save();

  // Seed the dedicated Progress record (14th collection) for this site so a
  // progress document always exists alongside the Site read-model.
  const Progress = require('../models/Progress');
  await Progress.create({
    site: site._id,
    engineer: req.userId,
    stages: site.progress,
    overallProgress: site.overallProgress,
  });

  // Optionally create the installment plan (1-5 levels) in the same request.
  let createdInstallments = [];
  if (Array.isArray(installments) && installments.length > 0) {
    if (installments.length > 5) {
      throw new ApiError('A maximum of 5 installments is allowed', 400);
    }

    const docs = installments.map((item, index) => ({
      site: site._id,
      engineer: req.userId,
      name: item.name || (DEFAULT_INSTALLMENTS[index] ? DEFAULT_INSTALLMENTS[index].name : `Installment ${index + 1}`),
      description: item.description || '',
      order: item.order || index + 1,
      amount: Number(item.amount) || 0,
      dueDate: item.dueDate ? new Date(item.dueDate) : null,
      notes: item.notes || '',
    }));

    const invalid = docs.find((doc) => !Number.isFinite(doc.amount) || doc.amount < 0);
    if (invalid) {
      throw new ApiError('Installment amounts must be zero or positive', 400);
    }

    createdInstallments = await Installment.insertMany(docs);
  }

  res.status(201).json({
    success: true,
    message: 'Site created successfully',
    data: { site, installments: createdInstallments },
  });
});

// GET /api/sites/:siteId
const getSite = asyncHandler(async (req, res) => {
  const site = await findOwnedSite(req);

  const summary = await calculateSiteFinancialSummary(site);

  res.status(200).json({
    success: true,
    data: { site, summary },
  });
});

// PUT /api/sites/:siteId
const updateSite = asyncHandler(async (req, res) => {
  const site = await findOwnedSite(req);

  const {
    siteName, ownerName, ownerMobile, ownerEmail,
    address, city, state, pincode,
    totalArea, areaUnit, ratePerArea, engineerCharges,
    startDate, expectedCompletionDate, status, notes,
  } = req.body;
  if (siteName) site.siteName = siteName;
  if (ownerName) site.ownerName = ownerName;
  if (ownerMobile) site.ownerMobile = ownerMobile;
  if (ownerEmail !== undefined) site.ownerEmail = ownerEmail || undefined;
  if (address) site.address = address;
  if (city) site.city = city;
  if (state !== undefined) site.state = state;
  if (pincode !== undefined) site.pincode = pincode;

  if (totalArea !== undefined) {
    const area = Number(totalArea);
    if (!Number.isFinite(area) || area <= 0) {
      throw new ApiError('Total area must be a positive number', 400);
    }
    site.totalArea = area;
  }

  if (areaUnit) site.areaUnit = areaUnit;

  if (ratePerArea !== undefined) {
    const rate = Number(ratePerArea);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new ApiError('Rate per area must be a positive number', 400);
    }
    site.ratePerArea = rate;
  }

  if (engineerCharges !== undefined) site.engineerCharges = Number(engineerCharges) || 0;
  if (startDate !== undefined) site.startDate = startDate ? new Date(startDate) : site.startDate;
  if (expectedCompletionDate !== undefined) {
    site.expectedCompletionDate = expectedCompletionDate ? new Date(expectedCompletionDate) : null;
  }
  if (status && Object.values(SITE_STATUS).includes(status)) {
    site.status = status;
    if (status === SITE_STATUS.COMPLETED && !site.actualCompletionDate) {
      site.actualCompletionDate = new Date();
    }
  }
  if (notes !== undefined) site.notes = notes;

  // Project value follows area x rate - always recalculated server side.
  site.estimatedProjectCost = round2(site.totalArea * site.ratePerArea);
  // Geo-tag: only touched when the request actually carries geo keys, so an
  // edit that has nothing to do with location never wipes an existing pin.
  Object.assign(site, geoFields(req.body));



  await site.save();

  res.status(200).json({
    success: true,
    message: 'Site updated successfully',
    data: site,
  });
});

// DELETE /api/sites/:siteId
// Hard delete removes the site together with all dependent records so no orphan
// financial data is left behind. The caller must confirm with ?confirm=true.
const deleteSite = asyncHandler(async (req, res) => {
  const site = await findOwnedSite(req);

  if (req.query.confirm !== 'true') {
    throw new ApiError('Please confirm site deletion with ?confirm=true', 400);
  }

  const models = [
    require('../models/Payment'),
    require('../models/Installment'),
    require('../models/Worker'),
    require('../models/WorkerPayment'),
    require('../models/Material'),
    require('../models/Vendor'),
    require('../models/VendorPayment'),
    require('../models/Expense'),
    require('../models/Activity'),
    require('../models/Document'),
    require('../models/Progress'),
    require('../models/WorkerAttendance'),
    require('../models/MaterialUsage'),
  ];

  await Promise.all(models.map((Model) => Model.deleteMany({ site: site._id })));
  await site.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Site and all related records deleted successfully',
  });
});

// PATCH /api/sites/:siteId/archive
const archiveSite = asyncHandler(async (req, res) => {
  const site = await findOwnedSite(req);

  site.isArchived = req.body.isArchived === undefined ? true : Boolean(req.body.isArchived);
  await site.save();

  res.status(200).json({
    success: true,
    message: site.isArchived ? 'Site archived successfully' : 'Site restored successfully',
    data: { isArchived: site.isArchived },
  });
});

// PATCH /api/sites/:siteId/complete
const completeSite = asyncHandler(async (req, res) => {
  const site = await findOwnedSite(req);

  site.status = SITE_STATUS.COMPLETED;
  site.overallProgress = 100;
  site.actualCompletionDate = new Date();
  await site.save();

  res.status(200).json({
    success: true,
    message: 'Site marked as completed',
    data: site,
  });
});

// GET /api/sites/latest
const getLatestSite = asyncHandler(async (req, res) => {
  const site = await Site.findOne({ engineer: req.userId, isArchived: false }).sort({ createdAt: -1 }).lean();

  res.status(200).json({
    success: true,
    data: site,
  });
});

/**
 * GET /api/sites/summary         -> engineer-wide dashboard payload
 * GET /api/sites/:siteId/summary -> single site financial summary
 *
 * The engineer dashboard in the UI consumes exactly this shape, and the numbers
 * come from the central financial service (never recomputed on the client).
 */
const getSiteSummary = asyncHandler(async (req, res) => {
  // --- Single site mode -----------------------------------------------------
  if (req.params.siteId) {
    const site = await findOwnedSite(req);
    const summary = await calculateSiteFinancialSummary(site);
    return res.status(200).json({ success: true, data: summary });
  }

  // --- Engineer dashboard mode ---------------------------------------------
  const [financials, statusRows, recentSites] = await Promise.all([
    calculateEngineerFinancialSummary(req.userId),
    Site.aggregate([
      { $match: { engineer: req.user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          projectValue: { $sum: { $multiply: ['$totalArea', '$ratePerArea'] } },
        },
      },
    ]),
    Site.find({ engineer: req.userId, isArchived: false })
      .select('siteName ownerName city status totalArea ratePerArea overallProgress')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const stats = {
    total: 0,
    active: 0,
    completed: 0,
    onHold: 0,
    planned: 0,
    closed: 0,
  };

  statusRows.forEach((row) => {
    stats.total += row.count;
    if (row._id === SITE_STATUS.ACTIVE) stats.active += row.count;
    else if (row._id === SITE_STATUS.COMPLETED) stats.completed += row.count;
    else if (row._id === SITE_STATUS.ON_HOLD) stats.onHold += row.count;
    else if (row._id === SITE_STATUS.PLANNED) stats.planned += row.count;
    else if (row._id === SITE_STATUS.CLOSED) stats.closed += row.count;
  });

  const { sites, ...financialTotals } = financials;

  res.status(200).json({
    success: true,
    data: {
      user: { name: req.user.name, company: req.user.company },
      stats,
      financials: financialTotals,
      // Recent sites for the dashboard table (siteCount === stats.total)
      sites: recentSites,
      totalSitesIncluded: sites.length,
    },
  });
});

module.exports = {
  getSites,
  createSite,
  getSite,
  updateSite,
  deleteSite,
  archiveSite,
  completeSite,
  getLatestSite,
  getSiteSummary,
};


