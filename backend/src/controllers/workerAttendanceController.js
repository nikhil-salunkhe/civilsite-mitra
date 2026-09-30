const mongoose = require('mongoose');
const WorkerAttendance = require('../models/WorkerAttendance');
const Worker = require('../models/Worker');
const WorkerPayment = require('../models/WorkerPayment');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/**
 * WORKER ATTENDANCE
 * ----------------------------------------------------------------------------
 * Supplementary work-day ledger. One row per worker per day (enforced by a
 * unique index) so re-marking a day updates it instead of duplicating it.
 *
 * FINANCIAL RULE - DO NOT DOUBLE COUNT
 * The site investment figure (services/financialService.js) is built from
 * WorkerPayment records (totalAmount = committed, paidAmount = paid). This
 * controller therefore never feeds financialService. It reports attendance
 * earnings separately, and the site-level payable stays the worker-payment
 * `pendingAmount`. Worker summaries surface both figures explicitly so an
 * engineer can see days worked against money billed without either number
 * silently including the other.
 */

// Wage-day multiplier - mirrors WAGE_DAY_FACTOR on the model.
const WAGE_FACTOR = { Present: 1, 'Half Day': 0.5, Absent: 0, Leave: 0 };

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Aggregate results can hand back Decimal128 / null, so normalise before maths.
const toNum = (n) => (n && typeof n.toNumber === 'function' ? n.toNumber() : Number(n) || 0);

const earnedFor = (status, dailyWage) =>
  round2((Number(dailyWage) || 0) * (WAGE_FACTOR[status] ?? 0));

// Attendance is a daily concept, so all date filters work on day boundaries.
// Storing the normalized midnight date is also what makes the unique
// { worker, date } index collapse repeated marks for the same day.
const startOfDay = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (value) => {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
};

const isInvalidDate = (value) => Number.isNaN(new Date(value).getTime());

const assertStatus = (status) => {
  if (!Object.prototype.hasOwnProperty.call(WAGE_FACTOR, status)) {
    throw new ApiError('Status must be Present, Absent, Half Day or Leave', 400);
  }
};

const buildDateRange = ({ date, from, to }) => {
  if (date) {
    if (isInvalidDate(date)) throw new ApiError('Invalid date filter', 400);
    return { $gte: startOfDay(date), $lte: endOfDay(date) };
  }

  const range = {};
  if (from) {
    if (isInvalidDate(from)) throw new ApiError('Invalid from date', 400);
    range.$gte = startOfDay(from);
  }
  if (to) {
    if (isInvalidDate(to)) throw new ApiError('Invalid to date', 400);
    range.$lte = endOfDay(to);
  }
  return Object.keys(range).length ? range : null;
};

// Confirms the worker exists AND belongs to the site in the URL. The site
// itself has already been tenant-checked by loadSite().
const assertWorkerOnSite = async (workerId, siteId) => {
  const worker = await Worker.findById(workerId);
  if (!worker || worker.site.toString() !== siteId.toString()) {
    throw new ApiError('Invalid worker for this site', 400);
  }
  return worker;
};

// ---------------------------------------------------------------------------
// GET /sites/:siteId/attendance
// ---------------------------------------------------------------------------
const getAttendance = asyncHandler(async (req, res) => {
  const { workerId, status, date, from, to, page = 1, limit = 100 } = req.query;

  const query = { site: req.params.siteId };
  if (workerId) query.worker = workerId;
  if (status) {
    assertStatus(status);
    query.status = status;
  }

  const dateRange = buildDateRange({ date, from, to });
  if (dateRange) query.date = dateRange;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));

  const [records, total] = await Promise.all([
    WorkerAttendance.find(query)
      .populate('worker', 'name workerType mobile dailyWage')
      .sort({ date: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    WorkerAttendance.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      attendance: records,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        totalItems: total,
        itemsPerPage: limitNum,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// POST /sites/:siteId/attendance  (upsert one worker/day)
// ---------------------------------------------------------------------------
const markAttendance = asyncHandler(async (req, res) => {
  const { worker, date, status = 'Present', workHours, notes } = req.body;

  if (!worker || !date) {
    throw new ApiError('Worker and date are required', 400);
  }
  if (isInvalidDate(date)) {
    throw new ApiError('Please provide a valid attendance date', 400);
  }
  assertStatus(status);

  const workerDoc = await assertWorkerOnSite(worker, req.params.siteId);
  const dailyWage = Number(workerDoc.dailyWage) || 0;
  const normalizedDate = startOfDay(date);

  const record = await WorkerAttendance.findOneAndUpdate(
    { worker, date: normalizedDate },
    {
      $set: {
        site: req.params.siteId,
        engineer: req.userId,
        worker,
        date: normalizedDate,
        status,
        workHours:
          workHours === undefined || workHours === '' ? 8 : Number(workHours),
        // Snapshot the wage so a later wage revision cannot rewrite history.
        dailyWage,
        earnedAmount: earnedFor(status, dailyWage),
        notes: notes || '',
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({
    success: true,
    data: record,
    message: 'Attendance marked successfully',
  });
});

// ---------------------------------------------------------------------------
// POST /sites/:siteId/attendance/bulk
// Marks a whole crew for one date in a single call - this is the daily data
// entry path, so it upserts as well.
// ---------------------------------------------------------------------------
const bulkMarkAttendance = asyncHandler(async (req, res) => {
  const { date, entries } = req.body;

  if (!date || isInvalidDate(date)) {
    throw new ApiError('A valid date is required', 400);
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ApiError('At least one attendance entry is required', 400);
  }
  if (entries.length > 500) {
    throw new ApiError('Cannot mark more than 500 workers at once', 400);
  }

  const normalizedDate = startOfDay(date);
  const results = [];

  for (const entry of entries) {
    if (!entry || !entry.worker) {
      throw new ApiError('Each entry requires a worker', 400);
    }

    const status = entry.status || 'Present';
    assertStatus(status);

    const workerDoc = await assertWorkerOnSite(entry.worker, req.params.siteId);
    const dailyWage = Number(workerDoc.dailyWage) || 0;

    const record = await WorkerAttendance.findOneAndUpdate(
      { worker: entry.worker, date: normalizedDate },
      {
        $set: {
          site: req.params.siteId,
          engineer: req.userId,
          worker: entry.worker,
          date: normalizedDate,
          status,
          workHours:
            entry.workHours === undefined || entry.workHours === ''
              ? 8
              : Number(entry.workHours),
          dailyWage,
          earnedAmount: earnedFor(status, dailyWage),
          notes: entry.notes || '',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    results.push(record);
  }

  res.status(201).json({
    success: true,
    data: results,
    message: `Attendance marked for ${results.length} worker(s)`,
  });
});

// ---------------------------------------------------------------------------
// PUT /sites/:siteId/attendance/:id
// ---------------------------------------------------------------------------
const updateAttendance = asyncHandler(async (req, res) => {
  const record = await WorkerAttendance.findOne({
    _id: req.params.id,
    site: req.params.siteId,
  });

  if (!record) {
    throw new ApiError('Attendance record not found', 404);
  }

  const { status, workHours, notes, date } = req.body;

  if (status !== undefined) {
    assertStatus(status);
    record.status = status;
  }

  if (workHours !== undefined) {
    const hours = Number(workHours);
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      throw new ApiError('Work hours must be between 0 and 24', 400);
    }
    record.workHours = hours;
  }

  if (notes !== undefined) {
    record.notes = notes;
  }

  if (date !== undefined) {
    if (isInvalidDate(date)) {
      throw new ApiError('Please provide a valid attendance date', 400);
    }

    const nextDate = startOfDay(date);
    // { worker, date } is unique, so moving a row onto an existing day must be
    // rejected with a clear message instead of a raw E11000 duplicate error.
    const clash = await WorkerAttendance.findOne({
      _id: { $ne: record._id },
      worker: record.worker,
      date: nextDate,
    });
    if (clash) {
      throw new ApiError('Attendance for this worker and date already exists', 409);
    }
    record.date = nextDate;
  }

  // dailyWage stays snapshotted; only the wage-day factor is recalculated.
  record.calculateEarned();
  await record.save();

  res.json({
    success: true,
    data: record,
    message: 'Attendance updated successfully',
  });
});

// ---------------------------------------------------------------------------
// DELETE /sites/:siteId/attendance/:id
// ---------------------------------------------------------------------------
const deleteAttendance = asyncHandler(async (req, res) => {
  const record = await WorkerAttendance.findOneAndDelete({
    _id: req.params.id,
    site: req.params.siteId,
  });

  if (!record) {
    throw new ApiError('Attendance record not found', 404);
  }

  res.json({ success: true, message: 'Attendance record deleted successfully' });
});

// ---------------------------------------------------------------------------
// GET /sites/:siteId/attendance/summary
// Per-worker wage-day rollup for the site, optionally date-bounded.
// This reports DAYS WORKED and EARNED amounts only - money actually paid stays
// in the worker-payments endpoint, so the two figures are never conflated.
// ---------------------------------------------------------------------------
const getAttendanceSummary = asyncHandler(async (req, res) => {
  const { from, to, workerId } = req.query;

  const match = { site: new mongoose.Types.ObjectId(String(req.params.siteId)) };
  const range = buildDateRange({ from, to });
  if (range) match.date = range;
  if (workerId) match.worker = new mongoose.Types.ObjectId(String(workerId));

  const rows = await WorkerAttendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$worker',
        presentDays: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
        halfDays: { $sum: { $cond: [{ $eq: ['$status', 'Half Day'] }, 1, 0] } },
        absentDays: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } },
        leaveDays: { $sum: { $cond: [{ $eq: ['$status', 'Leave'] }, 1, 0] } },
        totalMarked: { $sum: 1 },
        totalEarned: { $sum: '$earnedAmount' },
        lastDate: { $max: '$date' },
      },
    },
    {
      $lookup: {
        from: 'workers',
        localField: '_id',
        foreignField: '_id',
        as: 'workerDoc',
      },
    },
    { $unwind: { path: '$workerDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        worker: '$_id',
        name: '$workerDoc.name',
        workerType: '$workerDoc.workerType',
        employmentType: '$workerDoc.employmentType',
        dailyWage: '$workerDoc.dailyWage',
        presentDays: 1,
        halfDays: 1,
        absentDays: 1,
        leaveDays: 1,
        totalMarked: 1,
        totalEarned: 1,
        lastDate: 1,
      },
    },
    { $sort: { name: 1 } },
  ]);

  const totals = rows.reduce(
    (acc, row) => ({
      presentDays: acc.presentDays + toNum(row.presentDays),
      halfDays: acc.halfDays + toNum(row.halfDays),
      absentDays: acc.absentDays + toNum(row.absentDays),
      leaveDays: acc.leaveDays + toNum(row.leaveDays),
      totalMarked: acc.totalMarked + toNum(row.totalMarked),
      totalEarned: round2(acc.totalEarned + toNum(row.totalEarned)),
    }),
    {
      presentDays: 0,
      halfDays: 0,
      absentDays: 0,
      leaveDays: 0,
      totalMarked: 0,
      totalEarned: 0,
    }
  );

  res.json({
    success: true,
    data: { workers: rows, totals: { ...totals, workerCount: rows.length } },
  });
});

module.exports = {
  getAttendance,
  markAttendance,
  bulkMarkAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary,
};

