const Site = require('../models/Site');
const { SITE_REPORT_SECTIONS } = require('../reports/reportSchema');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Worker = require('../models/Worker');
const WorkerPayment = require('../models/WorkerPayment');
const WorkerAttendance = require('../models/WorkerAttendance');
const Material = require('../models/Material');
const MaterialUsage = require('../models/MaterialUsage');
const Vendor = require('../models/Vendor');
const VendorPayment = require('../models/VendorPayment');
const Expense = require('../models/Expense');
const Activity = require('../models/Activity');
const Document = require('../models/Document');
const Progress = require('../models/Progress');
const { calculateSiteFinancialSummary } = require('./financialService');

/**
 * ---------------------------------------------------------------------------
 * assembleSiteReportData
 * ---------------------------------------------------------------------------
 * Collects every record needed by the PDF report, the Excel workbook and the
 * CSV bundle in ONE place, so all three outputs are guaranteed to show the
 * same numbers.
 *
 * SECURITY: the caller (reportController) resolves the site through the
 * tenant-guarded lookup first, so `site` here is already known to belong to the
 * authenticated engineer. Every sub-query is additionally scoped by site id.
 *
 * @param {object} site Mongoose site document (ownership already verified)
 * @returns {Promise<object>} report payload
 */
const assembleSiteReportData = async (site, filters = {}) => {
  const siteId = site._id;
  const { from, to } = filters;

  // Optional record-level date filter (spec section 22: report filters).
  // Masters (site/workers/vendors/installments) and the financial SUMMARY stay
  // project-to-date on purpose - only the dated record lists are narrowed.
  const hasRange = Boolean(from || to);
  const range = (field) => {
    if (!hasRange) return {};
    const q = {};
    if (from) q.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      if (String(to).length <= 10) end.setHours(23, 59, 59, 999);
      q.$lte = end;
    }
    return { [field]: q };
  };

  const [
    summary,
    installments,
    payments,
    workers,
    workerPayments,
    attendance,
    materials,
    materialUsage,
    materialStock,
    vendors,
    vendorPayments,
    expenses,
    activities,
    documents,
    progressEntries,
  ] = await Promise.all([
    calculateSiteFinancialSummary(site),
    Installment.find({ site: siteId }).sort({ order: 1 }).lean(),
    Payment.find({ site: siteId, ...range('date') }).sort({ date: -1 }).lean(),
    Worker.find({ site: siteId }).sort({ name: 1 }).lean(),
    WorkerPayment.find({ site: siteId, ...range('date') }).populate('worker', 'name workerType').sort({ date: -1 }).lean(),
    WorkerAttendance.find({ site: siteId, ...range('date') }).populate('worker', 'name workerType').sort({ date: -1 }).lean(),
    Material.find({ site: siteId, ...range('purchaseDate') }).populate('vendor', 'name').sort({ purchaseDate: -1 }).lean(),
    MaterialUsage.find({ site: siteId, ...range('date') }).sort({ date: -1 }).lean(),
    Material.aggregate([
      { $match: { site: site._id } },
      {
        $group: {
          _id: { name: '$name', unit: { $ifNull: ['$unit', ''] } },
          purchased: { $sum: { $ifNull: ['$quantity', 0] } },
          purchaseCost: { $sum: { $ifNull: ['$totalAmount', 0] } },
          openingStock: { $sum: { $ifNull: ['$openingStock', 0] } },
        },
      },
    ]).then(async (purchaseRows) => {
      const usageRows = await MaterialUsage.aggregate([
        { $match: { site: site._id } },
        {
          $group: {
            _id: { name: '$materialName', unit: { $ifNull: ['$unit', ''] } },
            used: { $sum: { $ifNull: ['$quantity', 0] } },
          },
        },
      ]);
      const key = (name, unit) => `${String(name || '').trim().toLowerCase()}||${String(unit || '').trim()}`;
      const usedByKey = new Map(usageRows.map((row) => [key(row._id.name, row._id.unit), row.used]));
      return purchaseRows
        .map((row) => {
          const k = key(row._id.name, row._id.unit);
          const available = (Number(row.openingStock) || 0) + (Number(row.purchased) || 0);
          const used = Number(usedByKey.get(k)) || 0;
          return {
            name: row._id.name,
            unit: row._id.unit,
            openingStock: Number(row.openingStock) || 0,
            purchased: Number(row.purchased) || 0,
            used,
            balance: available - used,
            purchaseCost: Number(row.purchaseCost) || 0,
          };
        })
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }),
    Vendor.find({ site: siteId }).sort({ name: 1 }).lean(),
    VendorPayment.find({ site: siteId, ...range('date') }).populate('vendor', 'name').sort({ date: -1 }).lean(),
    Expense.find({ site: siteId, ...range('expenseDate') }).sort({ expenseDate: -1 }).lean(),
    Activity.find({ site: siteId, ...range('date') }).sort({ date: -1 }).lean(),
    Document.find({ site: siteId }).sort({ createdAt: -1 }).lean(),
    Document.find({ site: siteId, isActive: true }).sort({ uploadedDate: -1 }).lean(),
    // Progress keeps exactly one live document per site (read-model snapshot);
    // the stage-wise values themselves travel on the site document.
    Progress.findOne({ site: siteId }).lean().catch(() => null),
  ]);

  // Attendance rollup per worker: present / half-day / absent counts plus the
  // earned wage - the daily muster record the engineer keeps on file.
  const attendanceSummary = workers.map((worker) => {
    const rows = attendance.filter((row) => String(row.worker?._id || row.worker) === String(worker._id));
    const present = rows.filter((row) => row.status === 'Present').length;
    const halfDay = rows.filter((row) => row.status === 'Half Day').length;
    const absent = rows.filter((row) => ['Absent', 'Leave'].includes(row.status)).length;
    const wageDays = rows.reduce((acc, row) => {
      if (row.status === 'Present') return acc + 1;
      if (row.status === 'Half Day') return acc + 0.5;
      return acc;
    }, 0);
    return {
      ...worker,
      attendanceDays: rows.length,
      present,
      halfDay,
      absent,
      wageDays,
      earnedAmount: rows.reduce((acc, row) => acc + (Number(row.earnedAmount) || 0), 0),
    };
  });
  const attendanceTotals = attendance.reduce(
    (acc, row) => {
      acc.records += 1;
      if (row.status === 'Present') acc.present += 1;
      else if (row.status === 'Half Day') acc.halfDay += 1;
      else acc.absent += 1;
      acc.earned += Number(row.earnedAmount) || 0;
      return acc;
    },
    { records: 0, present: 0, halfDay: 0, absent: 0, earned: 0 }
  );

  // Worker-wise rollup used by the worker report/export.
  const workerSummary = workers.map((worker) => {
    const rows = workerPayments.filter((wp) => String(wp.worker?._id || wp.worker) === String(worker._id));
    const totalWorkDays = rows.reduce((acc, row) => acc + (Number(row.workDays) || 0), 0);
    const totalAmount = rows.reduce((acc, row) => acc + (Number(row.totalAmount) || 0), 0);
    const paidAmount = rows.reduce((acc, row) => acc + (Number(row.paidAmount) || 0), 0);

    return {
      ...worker,
      totalWorkDays,
      totalAmount,
      paidAmount,
      pendingAmount: Math.max(0, totalAmount - paidAmount),
    };
  });

  // Vendor-wise rollup (purchase obligation + cash paid to that vendor).
  const vendorSummary = vendors.map((vendor) => {
    const vendorMaterials = materials.filter((m) => String(m.vendor?._id || m.vendor) === String(vendor._id));
    const totalPurchases = vendorMaterials.reduce((acc, m) => acc + (Number(m.totalAmount) || 0), 0);
    const materialPaid = vendorMaterials.reduce((acc, m) => acc + (Number(m.paidAmount) || 0), 0);
    const vendorCash = vendorPayments
      .filter((vp) => String(vp.vendor?._id || vp.vendor) === String(vendor._id))
      .reduce((acc, vp) => acc + (Number(vp.amount) || 0), 0);
    // Same de-duplication rule as the financial service: never count the same
    // outflow twice (once on the material, once on the vendor payment).
    const paid = Math.min(totalPurchases, Math.max(materialPaid, vendorCash));

    return {
      ...vendor,
      materialCount: vendorMaterials.length,
      totalPurchases,
      paidAmount: paid,
      pendingAmount: Math.max(0, totalPurchases - paid),
    };
  });

  return {
    site,
    engineer: {
      name: site.engineerName || '',
      company: '',
      email: '',
      mobile: '',
    },
    summary,
    installments,
    payments,
    workers: workerSummary,
    workerPayments,
    attendance,
    attendanceSummary,
    attendanceTotals,
    materials,
    materialUsage,
    materialStock,
    vendors: vendorSummary,
    vendorPayments,
    expenses,
    activities,
    documents: documents.map((doc) => ({
      _id: doc._id,
      fileName: doc.originalName || doc.fileName,
      fileType: doc.fileType,
      size: doc.size,
      uploadedDate: doc.uploadedDate,
      notes: doc.notes,
    })),
    documentsCount: documents.length,
    progress: site.progress || null,
    overallProgress: site.overallProgress ?? 0,
    progressSnapshot: progressEntries,
    dateFilter: hasRange ? { from: from || null, to: to || null } : null,
    generatedAt: new Date(),
  };
};

/**
 * The canonical numbered section list ([no, JSON key, title]) lives in
 * reports/reportSchema.js - the single source of truth shared by this service,
 * the PDF renderer and the Reports tab. It is imported at the top of this file.
 */

/** Record counters + grand totals shared by every renderer. */
const buildReportMeta = (data) => {
  const count = (v) => (Array.isArray(v) ? v.length : 0);
  const sum = (rows, pick) =>
    Math.round(
      (Array.isArray(rows) ? rows : []).reduce((acc, r) => acc + (Number(pick(r)) || 0), 0) * 100
    ) / 100;

  const sections = SITE_REPORT_SECTIONS.map(([no, key, title]) => {
    let records = 0;
    if (key === 'site') records = data.site ? 1 : 0;
    else if (key === 'summary') records = 1;
    else records = count(data[key]);
    return { no, key, title, records };
  });

  return {
    // e.g. "01 Sep 2026 - 27 Sep 2026" or "Entire project (all records)".
    scope:
      data.dateFilter && (data.dateFilter.from || data.dateFilter.to)
        ? `${data.dateFilter.from || '...'} to ${data.dateFilter.to || '...'}`
        : 'Entire project (all records)',
    generatedAt: data.generatedAt,
    sections,
    recordCount: sections.reduce((acc, s) => acc + s.records, 0),
    totals: {
      ownerReceived: sum(data.payments, (p) => p.amount ?? p.paidAmount),
      labourPaid: sum(data.workerPayments, (w) => w.paidAmount),
      labourDue: sum(data.workerPayments, (w) => w.pendingAmount),
      materialPurchases: sum(data.materials, (m) => m.totalAmount),
      materialPaid: sum(data.materials, (m) => m.paidAmount),
      materialConsumed: sum(data.materialUsage, (u) => u.totalCost),
      vendorPaid: sum(data.vendorPayments, (v) => v.amount),
      expensesPaid: sum(data.expenses, (e) => e.paidAmount),
      attendanceDays: sum(data.attendance, (a) => a.earnedAmount),
    },
  };
};
const assembleEngineerReportData = async (engineerId, engineer) => {
  const sites = await Site.find({ engineer: engineerId, isArchived: false })
    .sort({ createdAt: -1 })
    .lean();

  const siteSummaries = [];
  for (const site of sites) {
    // Sequential on purpose: a smaller number of concurrent aggregations keeps
    // the connection pool healthy on modest production hosts.
    // eslint-disable-next-line no-await-in-loop
    siteSummaries.push({ site, summary: await calculateSiteFinancialSummary(site) });
  }

  return {
    engineer,
    generatedAt: new Date(),
    siteSummaries,
  };
};


/**
 * ---------------------------------------------------------------------------
 * MATERIAL REPORT DATA (the ONE place material rollups are computed)
 * ---------------------------------------------------------------------------
 * Both the per-material PDF and the weekly/monthly material PDF read from these
 * helpers, so a number can never differ between them, the material list, the
 * dashboard or the site dossier.
 *
 * BALANCE SAFETY: purchased and consumed quantities are only ever subtracted
 * inside a (name + unit) bucket, so "100 Bags - 20 Kg" is structurally
 * impossible. A bucket with nothing to subtract from reports no balance at all
 * rather than a misleading number.
 */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Parses "YYYY-MM-DD" / "YYYY-MM" / full ISO into its UTC calendar parts. */
const utcParts = (value) => {
  const s = String(value || '');
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return { y: +ymd[1], m: +ymd[2], d: +ymd[3], hasDay: true };
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) return { y: +ym[1], m: +ym[2], d: 1, hasDay: false };
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    y: parsed.getUTCFullYear(), m: parsed.getUTCMonth() + 1,
    d: parsed.getUTCDate(), hasDay: true,
  };
};

/** 00:00:00.000 UTC on the given calendar day. */
const startOfUtcDay = (value) => {
  const p = utcParts(value);
  if (!p) return new Date(NaN);
  if (!p.hasDay) return new Date(Date.UTC(p.y, p.m - 1, 1));
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
};

/**
 * 23:59:59.999 UTC on the given day - or on the LAST day of the month when only
 * "YYYY-MM" is supplied, so a monthly report always covers the full month.
 */
const endOfUtcDay = (value) => {
  const p = utcParts(value);
  if (!p) return new Date(NaN);
  if (!p.hasDay) return new Date(Date.UTC(p.y, p.m, 0, 23, 59, 59, 999));
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 23, 59, 59, 999));
};

const keyOf = (name, unit) =>
  `${String(name || '').trim().toLowerCase()}__${String(unit || '').trim().toLowerCase()}`;

/** Rolls purchases + usage into one row per (material name, unit). */
const rollupMaterials = (purchases, usages) => {
  const buckets = new Map();

  for (const p of purchases || []) {
    const key = keyOf(p.name, p.unit);
    if (!buckets.has(key)) {
      buckets.set(key, {
        key, name: p.name || '-', unit: p.unit || '', category: p.category || '',
        purchased: 0, used: 0, amount: 0, paid: 0, purchases: 0,
      });
    }
    const b = buckets.get(key);
    b.purchased = round2(b.purchased + (Number(p.quantity) || 0));
    b.amount = round2(b.amount + (Number(p.totalAmount) || 0));
    b.paid = round2(b.paid + (Number(p.paidAmount) || 0));
    b.purchases += 1;
  }

  for (const u of usages || []) {
    const name = u.materialName || (u.material && u.material.name);
    const key = keyOf(name, u.unit);
    if (!buckets.has(key)) {
      // Usage with no matching purchase: keep it visible instead of hiding it.
      buckets.set(key, {
        key, name: name || '-', unit: u.unit || '', category: '',
        purchased: 0, used: 0, amount: 0, paid: 0, purchases: 0,
      });
    }
    buckets.get(key).used = round2(buckets.get(key).used + (Number(u.quantity) || 0));
  }

  return [...buckets.values()].map((b) => ({
    ...b,
    pending: round2(b.amount - b.paid),
    // Units match by construction inside the bucket, so this is always safe.
    balance: b.purchased > 0 ? round2(b.purchased - b.used) : null,
    balanceAvailable: b.purchased > 0,
  })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

/** Vendor -> material rows, for the vendor purchase summary. */
const rollupVendors = (purchases) => {
  const vendors = new Map();
  for (const p of purchases || []) {
    const name = (p.vendor && p.vendor.name) || p.vendorName || 'Unassigned';
    if (!vendors.has(name)) vendors.set(name, { vendor: name, rows: [], quantity: 0, amount: 0 });
    const v = vendors.get(name);
    v.quantity = round2(v.quantity + (Number(p.quantity) || 0));
    v.amount = round2(v.amount + (Number(p.totalAmount) || 0));
    v.rows.push({
      material: p.name || '-',
      unit: p.unit || '',
      quantity: Number(p.quantity) || 0,
      rate: Number(p.rate) || 0,
      amount: Number(p.totalAmount) || 0,
    });
  }
  return [...vendors.values()].sort((a, b) => b.amount - a.amount);
};

/**
 * Full history for ONE material (every purchase of that name+unit, every
 * vendor) - powers the "separate PDF for each material" report.
 * @throws 404 when the material does not belong to the given site.
 */
const assembleMaterialReportData = async (site, materialId) => {
  const Material = require('../models/Material');
  const MaterialUsage = require('../models/MaterialUsage');
  const siteId = site._id;

  const anchor = await Material.findOne({ _id: materialId, site: siteId }).lean();
  if (!anchor) {
    // Explicit 404 - ApiError defaults to 500 when the status is omitted.
    const { ApiError } = require('../middleware/errorHandler');
    throw new ApiError('Material not found for this site', 404);
  }

  // Material identity in this schema: there is no material master/code field,
  // so a Material document IS a purchase line. The engineer's "Cement report"
  // therefore means every purchase of that name AND unit - matching exactly
  // how rollupMaterials() buckets them. Filtering on name alone would pull in
  // a different unit of the same material and make the purchase table disagree
  // with the summary beneath it.
  const nameQuery = {
    $regex: `^${String(anchor.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    $options: 'i',
  };
  const unitQuery = { $regex: `^${String(anchor.unit || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  const purchases = await Material.find({
    site: siteId,
    name: nameQuery,
    unit: unitQuery,
  }).populate('vendor', 'name').sort({ purchaseDate: 1 }).lean();

  const usages = await MaterialUsage.find({
    site: siteId, materialName: anchor.name, unit: anchor.unit,
  }).sort({ date: 1 }).lean();

  const rollup = rollupMaterials(purchases, usages);
  return {
    site,
    material: {
      name: anchor.name,
      category: anchor.category || '-',
      unit: anchor.unit || '',
      openingStock: Number(anchor.openingStock) || 0,
      minimumStock: Number(anchor.minStockLevel) || 0,
    },
    purchases,
    usages,
    rollup,
    vendors: rollupVendors(purchases),
    totals: materialTotals(rollup, purchases, usages),
    period: { from: null, to: null, label: 'Complete history', type: 'all' },
    generatedAt: new Date(),
  };
};

/**
 * Purchases + usage + balance + vendor summary for a site over a period.
 * The rollup is derived from exactly the filtered rows, so the totals can never
 * disagree with the detail tables printed beneath them.
 */
const assembleMaterialPeriodData = async (site, filters = {}) => {
  const Material = require('../models/Material');
  const MaterialUsage = require('../models/MaterialUsage');
  const siteId = site._id;
  const range = periodFilter(filters);

  const [allPurchases, allUsages] = await Promise.all([
    Material.find({ site: siteId }).populate('vendor', 'name').lean(),
    MaterialUsage.find({ site: siteId }).lean(),
  ]);

  const inRange = (value, r) => {
    if (!r) return true;
    if (!value) return false;
    const t = new Date(value).getTime();
    return (!r.$gte || t >= r.$gte.getTime()) && (!r.$lte || t <= r.$lte.getTime());
  };

  const nameFilter = filters.material ? String(filters.material).trim().toLowerCase() : null;
  const vendorFilter = filters.vendor ? String(filters.vendor).trim().toLowerCase() : null;

  const purchases = allPurchases.filter((p) => inRange(p.purchaseDate, range))
    .filter((p) => !nameFilter || String(p.name || '').toLowerCase().includes(nameFilter))
    .filter((p) => !vendorFilter
      || String((p.vendor && p.vendor.name) || p.vendorName || '').toLowerCase().includes(vendorFilter))
    .sort((a, b) => new Date(a.purchaseDate || 0) - new Date(b.purchaseDate || 0));

  const usages = allUsages.filter((u) => inRange(u.date, range))
    .filter((u) => !nameFilter || String(u.materialName || '').toLowerCase().includes(nameFilter))
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  const rollup = rollupMaterials(purchases, usages);
  return {
    site,
    materialFilter: filters.material || null,
    vendorFilter: filters.vendor || null,
    period: {
      from: filters.from || null,
      to: filters.to || null,
      label: filters.label || 'Entire project',
      type: filters.type || 'custom',
    },
    purchases,
    usages,
    rollup,
    vendors: rollupVendors(purchases),
    totals: materialTotals(rollup, purchases, usages),
    generatedAt: new Date(),
  };
};

module.exports.assembleMaterialReportData = assembleMaterialReportData;
module.exports.assembleMaterialPeriodData = assembleMaterialPeriodData;

/** Totals block shared by both material PDFs. */
const materialTotals = (rollup, purchases, usages) => {
  const balanceable = rollup.filter((r) => r.balanceAvailable);
  return {
    materialCount: rollup.length,
    purchaseRecords: (purchases || []).length,
    usageRecords: (usages || []).length,
    totalQuantityPurchased: round2(rollup.reduce((a, r) => a + r.purchased, 0)),
    totalQuantityUsed: round2(rollup.reduce((a, r) => a + r.used, 0)),
    totalPurchaseAmount: round2(rollup.reduce((a, r) => a + r.amount, 0)),
    totalPaid: round2(rollup.reduce((a, r) => a + r.paid, 0)),
    totalPending: round2(rollup.reduce((a, r) => a + r.pending, 0)),
    balanceAvailable: balanceable.length > 0,
    // Summed only across materials that have a purchase to subtract from.
    totalBalance: balanceable.length
      ? round2(balanceable.reduce((a, r) => a + r.balance, 0))
      : null,
  };
};

/**
 * Builds a {from,to} range, or null for "all time".
 *
 * TIMEZONE: purchaseDate / usage date are stored as the UTC instant of the
 * calendar day the engineer typed (e.g. "2026-10-01" -> 2026-10-01T00:00:00Z).
 * The boundaries are therefore built in UTC as well. Using local setHours()
 * here would make results depend on the server's timezone - on a host running
 * IST the month end would roll back to 18:29 UTC and silently drop records
 * entered on the last day of the month.
 */
const periodFilter = (filters = {}) => {
  const { from, to } = filters;
  if (!from && !to) return null;
  const q = {};
  // A bare YYYY-MM-DD (or YYYY-MM) selects the WHOLE day / month in UTC.
  if (from) q.$gte = startOfUtcDay(from);
  if (to) q.$lte = endOfUtcDay(to);
  return q;
};


module.exports = {
  assembleSiteReportData, assembleEngineerReportData, buildReportMeta,
  rollupMaterials, rollupVendors, materialTotals, periodFilter,
  assembleMaterialReportData, assembleMaterialPeriodData,
};
module.exports = {
  assembleSiteReportData, assembleEngineerReportData, buildReportMeta,
  rollupMaterials, rollupVendors, materialTotals, periodFilter,
};


module.exports.assembleMaterialReportData = assembleMaterialReportData;
module.exports.assembleMaterialPeriodData = assembleMaterialPeriodData;
