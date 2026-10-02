const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Site = require('../models/Site');
const Activity = require('../models/Activity');
const Document = require('../models/Document');
const Expense = require('../models/Expense');
const Installment = require('../models/Installment');
const Material = require('../models/Material');
const Payment = require('../models/Payment');
const Vendor = require('../models/Vendor');
const VendorPayment = require('../models/VendorPayment');
const Worker = require('../models/Worker');
const WorkerPayment = require('../models/WorkerPayment');
const Progress = require('../models/Progress');
const WorkerAttendance = require('../models/WorkerAttendance');
const MaterialUsage = require('../models/MaterialUsage');
const storage = require('../services/storageService');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ACCOUNT_STATUS, USER_ROLES } = require('../config/constants');
const { calculateSystemFinancialSummary, calculateEngineerFinancialSummary, toObjectId } = require('../services/financialService');
const { escapeRegex } = require('../utils/query');
const crypto = require('crypto');

// Generate secure temporary password
const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Get admin dashboard data
const getDashboard = asyncHandler(async (req, res) => {
  const [engineerStats, siteStats, financialStats] = await Promise.all([
    User.aggregate([
      { $match: { role: USER_ROLES.ENGINEER } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', ACCOUNT_STATUS.ACTIVE] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ['$status', ACCOUNT_STATUS.SUSPENDED] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ['$status', ACCOUNT_STATUS.BLOCKED] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', ACCOUNT_STATUS.INACTIVE] }, 1, 0] } },
        },
      },
    ]),
    Site.aggregate([
      { $match: { isArchived: false } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $or: [{ $eq: ['$status', 'Active'] }, { $eq: ['$status', 'On Hold'] }] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $or: [{ $eq: ['$status', 'Completed'] }, { $eq: ['$status', 'Closed'] }] }, 1, 0] } },
        },
      },
    ]),
    calculateSystemFinancialSummary(),
  ]);

  const engineerData = engineerStats[0] || { total: 0, active: 0, suspended: 0, blocked: 0, inactive: 0 };
  const siteData = siteStats[0] || { total: 0, active: 0, completed: 0 };

  res.status(200).json({
    success: true,
    data: {
      engineers: {
        total: engineerData.total,
        active: engineerData.active,
        suspended: engineerData.suspended,
        blocked: engineerData.blocked,
        inactive: engineerData.inactive,
      },
      sites: {
        total: siteData.total,
        running: siteData.active,
        completed: siteData.completed,
      },
      financials: financialStats,
    },
  });
});

// Get all engineers with pagination and filters
const getEngineers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status, from, to, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const query = { role: USER_ROLES.ENGINEER };

  if (search) {
    const s = escapeRegex(search);
    query.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { mobile: { $regex: s, $options: 'i' } },
      { company: { $regex: s, $options: 'i' } },
    ];
  }

  if (status && ACCOUNT_STATUS[status]) {
    query.status = status;
  }

  // Date-range filter on account creation (spec section 6).
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      if (String(to).length <= 10) end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  // Whitelisted sort keys - never pass raw user input to the sort spec.
  const allowedSort = ['createdAt', 'name', 'status', 'email'];
  const sortKey = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
  const sort = { [sortKey]: sortOrder === 'asc' ? 1 : -1 };

  const [engineers, total] = await Promise.all([
    User.find(query).sort(sort).skip(skip).limit(parseInt(limit)).select('-password -resetToken -resetExpiry'),
    User.countDocuments(query),
  ]);

  const engineersWithSites = await Promise.all(
    engineers.map(async (engineer) => {
      const siteCount = await Site.countDocuments({ engineer: engineer._id, isArchived: false });
      return { ...engineer.toObject(), siteCount };
    })
  );

  res.status(200).json({
    success: true,
    data: {
      engineers: engineersWithSites,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Get single engineer
const getEngineer = asyncHandler(async (req, res) => {
  const engineer = await User.findById(req.params.id).select('-password -resetToken -resetExpiry');

  if (!engineer) {
    throw new ApiError('Engineer not found', 404);
  }

  if (engineer.role !== USER_ROLES.ENGINEER) {
    throw new ApiError('This is not an engineer account', 400);
  }

  const siteCount = await Site.countDocuments({ engineer: engineer._id, isArchived: false });
  const financials = await calculateEngineerFinancialSummary(engineer._id);

  res.status(200).json({
    success: true,
    data: {
      ...engineer.toObject(),
      siteCount,
      financials,
    },
  });
});

// Create new engineer
const createEngineer = asyncHandler(async (req, res) => {
  const { name, email, mobile, company, address, city, state, accountStartDate, status, notes, customPassword } = req.body;

  if (!name || !email || !mobile) {
    throw new ApiError('Name, email, and mobile are required', 400);
  }

  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    throw new ApiError('Email already exists', 400);
  }

  const existingMobile = await User.findOne({ mobile });
  if (existingMobile) {
    throw new ApiError('Mobile number already exists', 400);
  }

  // Use the admin-provided password (Generate Password button) when it's strong enough, otherwise auto-generate
  const tempPassword = customPassword && String(customPassword).length >= 6 ? String(customPassword) : generateTempPassword();

  const engineer = new User({
    name,
    email,
    mobile,
    company: company || '',
    address: { street: address || '', city: city || '', state: state || '' },
    password: tempPassword,
    role: USER_ROLES.ENGINEER,
    status: status || ACCOUNT_STATUS.ACTIVE,
    accountStartDate: accountStartDate || new Date(),
    notes: notes || '',
    mustChangePassword: true,
  });

  if (req.file) {
    engineer.profilePhoto = await storage.saveProfilePhoto(req.file);
  }

  await engineer.save();

  await AuditLog.create({
    admin: req.userId,
    adminName: req.user.name,
    adminEmail: req.user.email,
    action: 'Engineer Created',
    engineer: engineer._id,
    engineerName: engineer.name,
    description: `Created engineer account for ${engineer.email}`,
    newValue: { name: engineer.name, email: engineer.email, mobile: engineer.mobile, status: engineer.status },
  });

  res.status(201).json({
    success: true,
    data: {
      engineer: engineer.getPublicProfile(),
      credentials: { email: engineer.email, temporaryPassword: tempPassword },
    },
    message: 'Engineer created successfully',
  });
});

// Update engineer
const updateEngineer = asyncHandler(async (req, res) => {
  const { name, mobile, company, address, city, state, status, notes, mustChangePassword } = req.body;

  const engineer = await User.findById(req.params.id);

  if (!engineer) {
    throw new ApiError('Engineer not found', 404);
  }

  if (engineer.role !== USER_ROLES.ENGINEER) {
    throw new ApiError('This is not an engineer account', 400);
  }

  const oldData = engineer.toObject();

  if (name) engineer.name = name;
  if (mobile) {
    const existingMobile = await User.findOne({ mobile, _id: { $ne: engineer._id } });
    if (existingMobile) {
      throw new ApiError('Mobile number already in use', 400);
    }
    engineer.mobile = mobile;
  }
  if (company !== undefined) engineer.company = company;
  if (address !== undefined) engineer.address.street = address;
  if (city !== undefined) engineer.address.city = city;
  if (state !== undefined) engineer.address.state = state;
  if (notes !== undefined) engineer.notes = notes;
  if (mustChangePassword !== undefined) engineer.mustChangePassword = mustChangePassword;
  const oldPhoto = engineer.profilePhoto;
  if (req.file) engineer.profilePhoto = await storage.saveProfilePhoto(req.file);

  await engineer.save();

  // Best-effort: remove the replaced photo through storageService, which
  // guards key traversal internally.
  if (req.file && oldPhoto && oldPhoto !== engineer.profilePhoto) {
    await storage.removeProfilePhoto(oldPhoto);
  }

  await AuditLog.create({
    admin: req.userId,
    adminName: req.user.name,
    adminEmail: req.user.email,
    action: 'Engineer Updated',
    engineer: engineer._id,
    engineerName: engineer.name,
    description: `Updated engineer account for ${engineer.email}`,
    previousValue: { name: oldData.name, mobile: oldData.mobile, company: oldData.company, status: oldData.status },
    newValue: { name: engineer.name, mobile: engineer.mobile, company: engineer.company, status: engineer.status },
  });

  res.status(200).json({
    success: true,
    data: engineer.getPublicProfile(),
    message: 'Engineer updated successfully',
  });
});

// Change engineer status
const changeEngineerStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status || !ACCOUNT_STATUS[status]) {
    throw new ApiError('Invalid status', 400);
  }

  const engineer = await User.findById(req.params.id);

  if (!engineer) {
    throw new ApiError('Engineer not found', 404);
  }

  if (engineer.role !== USER_ROLES.ENGINEER) {
    throw new ApiError('This is not an engineer account', 400);
  }

  const oldStatus = engineer.status;
  engineer.status = status;
  await engineer.save();

  const actionMap = {
    [ACCOUNT_STATUS.ACTIVE]: 'Engineer Activated',
    [ACCOUNT_STATUS.SUSPENDED]: 'Engineer Suspended',
    [ACCOUNT_STATUS.BLOCKED]: 'Engineer Blocked',
    [ACCOUNT_STATUS.INACTIVE]: 'Engineer Deactivated',
  };

  await AuditLog.create({
    admin: req.userId,
    adminName: req.user.name,
    adminEmail: req.user.email,
    action: actionMap[status] || 'Engineer Status Changed',
    engineer: engineer._id,
    engineerName: engineer.name,
    description: `Changed engineer status from ${oldStatus} to ${status}`,
    previousValue: { status: oldStatus },
    newValue: { status },
  });

  res.status(200).json({
    success: true,
    message: `Engineer ${status.toLowerCase()} successfully`,
    data: { status: engineer.status },
  });
});

// Get audit logs
const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, engineerId, action, startDate, endDate } = req.query;

  const query = {};

  if (engineerId) {
    query.engineer = engineerId;
  }

  if (action) {
    query.action = action;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate('admin', 'name email')
      .populate('engineer', 'name email')
      .populate('site', 'siteName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    AuditLog.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      logs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Get all sites (for admin view)
const getAllSites = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status, engineerId } = req.query;

  const query = { isArchived: false };

  if (search) {
    const s = escapeRegex(search);
    query.$or = [
      { siteName: { $regex: s, $options: 'i' } },
      { ownerName: { $regex: s, $options: 'i' } },
      { city: { $regex: s, $options: 'i' } },
    ];
  }

  if (status) {
    query.status = status;
  }

  if (engineerId) {
    query.engineer = engineerId;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [sites, total] = await Promise.all([
    Site.find(query)
      .populate('engineer', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Site.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      sites,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// GET /api/admin/reports - system-wide analytics with Date/Engineer/Status/Site
// filters (spec STEP 28). Totals come from the shared financial service so the
// numbers always match the dashboard; per-engineer rows are site aggregates
// (deep per-engineer money lives on the engineer detail endpoint).
const getReports = asyncHandler(async (req, res) => {
  const { from, to, engineerId, status, siteId } = req.query;

  const parseId = (value, label) => {
    try {
      return toObjectId(value);
    } catch (err) {
      throw new ApiError(`Invalid ${label}`, 400);
    }
  };

  const siteMatch = {};
  if (engineerId) siteMatch.engineer = parseId(engineerId, 'engineer id');
  if (siteId) siteMatch._id = parseId(siteId, 'site id');
  if (status) siteMatch.status = status;
  if (from) siteMatch.createdAt = { $gte: new Date(from) };
  if (to) {
    const end = new Date(to);
    // A date-only value (YYYY-MM-DD) should cover the whole day.
    if (String(to).length <= 10) end.setHours(23, 59, 59, 999);
    siteMatch.createdAt = { ...(siteMatch.createdAt || {}), $lte: end };
  }

  const [totals, statusRows, engineerRows, engineersTotal] = await Promise.all([
    calculateSystemFinancialSummary(siteMatch),
    Site.aggregate([
      { $match: { ...siteMatch, isArchived: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          projectValue: { $sum: { $multiply: ['$totalArea', '$ratePerArea'] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Site.aggregate([
      { $match: { ...siteMatch, isArchived: false } },
      {
        $group: {
          _id: '$engineer',
          siteCount: { $sum: 1 },
          running: { $sum: { $cond: [{ $in: ['$status', ['Active', 'On Hold']] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Closed']] }, 1, 0] } },
          projectValue: { $sum: { $multiply: ['$totalArea', '$ratePerArea'] } },
        },
      },
      { $sort: { projectValue: -1 } },
      { $limit: 100 },
    ]),
    User.countDocuments({
      role: USER_ROLES.ENGINEER,
      ...(engineerId ? { _id: parseId(engineerId, 'engineer id') } : {}),
    }),
  ]);

  const users = await User.find({ _id: { $in: engineerRows.map((r) => r._id) } }).select(
    'name email status company'
  );
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const engineers = engineerRows.map((row) => {
    const u = byId.get(String(row._id));
    return {
      engineerId: row._id,
      name: u ? u.name : 'Deleted engineer',
      email: u ? u.email : '',
      company: u ? u.company || '' : '',
      status: u ? u.status : ACCOUNT_STATUS.INACTIVE,
      siteCount: row.siteCount,
      running: row.running,
      completed: row.completed,
      projectValue: Math.round(row.projectValue * 100) / 100,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      filters: {
        from: from || null,
        to: to || null,
        engineerId: engineerId || null,
        status: status || null,
        siteId: siteId || null,
      },
      totals,
      sitesByStatus: statusRows.map((r) => ({
        status: r._id,
        count: r.count,
        projectValue: Math.round(r.projectValue * 100) / 100,
      })),
      engineers,
      engineersTotal,
    },
  });
});

// Permanently delete an engineer and all data they own (cascade)
const deleteEngineer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const engineer = await User.findOne({ _id: id, role: USER_ROLES.ENGINEER });
  if (!engineer) {
    throw new ApiError('Engineer not found', 404);
  }

  const sites = await Site.find({ engineer: engineer._id }).select('_id');
  const siteIds = sites.map((s) => s._id);
  const cascade = { sites: siteIds.length };

  // Best-effort: remove uploaded files through storageService so this also works
  // when STORAGE_PROVIDER=s3 (where nothing is on the local disk at all).
  if (siteIds.length > 0) {
    const documents = await Document.find({ site: { $in: siteIds } })
      .select('fileName storageKey storageProvider');
    // eslint-disable-next-line no-restricted-syntax
    for (const doc of documents) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await storage.remove(doc.storageKey || doc.fileName);
      } catch (err) {
        // file cleanup is best-effort; DB records are the source of truth
      }
    }
  }

  // Best-effort: remove the engineer's profile photo too.
  await storage.removeProfilePhoto(engineer.profilePhoto);

  // Delete every site-scoped record owned by this engineer
  if (siteIds.length > 0) {
    const siteCollections = {
      activities: Activity,
      documents: Document,
      expenses: Expense,
      installments: Installment,
      materials: Material,
      payments: Payment,
      vendors: Vendor,
      vendorPayments: VendorPayment,
      workers: Worker,
      workerPayments: WorkerPayment,
      workerAttendance: WorkerAttendance,
      materialUsage: MaterialUsage,
      progress: Progress,
    };
    await Promise.all(
      Object.entries(siteCollections).map(async ([key, Model]) => {
        cascade[key] = await Model.countDocuments({ site: { $in: siteIds } });
        await Model.deleteMany({ site: { $in: siteIds } });
      })
    );
  }

  await Site.deleteMany({ engineer: engineer._id });
  await User.deleteOne({ _id: engineer._id });

  await AuditLog.create({
    admin: req.userId,
    adminName: req.user.name,
    adminEmail: req.user.email,
    action: 'Engineer Deleted',
    engineer: engineer._id,
    engineerName: engineer.name,
    description: `Permanently deleted engineer ${engineer.email} and all associated data`,
    previousValue: { name: engineer.name, email: engineer.email, mobile: engineer.mobile, status: engineer.status },
    metadata: cascade,
  });

  res.status(200).json({
    success: true,
    data: { deleted: cascade },
    message: 'Engineer deleted successfully',
  });
});

module.exports = {
  getDashboard,
  getReports,
  getEngineers,
  getEngineer,
  createEngineer,
  updateEngineer,
  changeEngineerStatus,
  deleteEngineer,
  getAuditLogs,
  getAllSites,
  generateTempPassword,
};