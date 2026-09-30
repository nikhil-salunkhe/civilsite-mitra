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

module.exports = { assembleSiteReportData, assembleEngineerReportData, buildReportMeta };
