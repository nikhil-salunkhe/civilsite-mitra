const Site = require('../models/Site');
const User = require('../models/User');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { findOwnedSite } = require('../utils/siteAccess');
const {
  assembleSiteReportData,
  assembleEngineerReportData,
  assembleMaterialReportData,
  assembleMaterialPeriodData,
  buildReportMeta,
} = require('../services/reportService');
const { buildSiteReportPdf } = require('../reports/siteReport');
const { buildMaterialPdf } = require('../reports/materialReport');
const { buildMaterialPeriodPdf, titleFor } = require('../reports/materialPeriodReport');
const { buildMaterialPeriodWorkbook, buildMaterialPeriodCsv } = require('../exports/materialPeriodExport');
const { buildSiteWorkbook } = require('../exports/excelExport');
const { buildSiteCsv, CSV_TYPES } = require('../exports/csvExport');
const { safeFileSlug, toIsoDate, buildReportFilename } = require('../utils/format');

/**
 * ---------------------------------------------------------------------------
 * Reports, PDF, Excel and CSV exports.
 * ---------------------------------------------------------------------------
 * All four outputs are fed by assembleSiteReportData(), which in turn uses the
 * central financialService - so screen, PDF, Excel and CSV always agree.
 *
 * Ownership: every handler calls findOwnedSite() first. An engineer can only
 * ever export their own site; the Super Admin may export any site.
 */

/**
 * Loads the report payload and enriches it with the engineer's profile details
 * (name / company / email / mobile) so the PDF letterhead is complete.
 */
const loadReportData = async (req) => {
  const site = await findOwnedSite(req);

  // Optional record date filter for reports AND all exports (spec section 22).
  const { from, to } = req.query;
  const filters = {};
  for (const [key, value] of [['from', from], ['to', to]]) {
    if (value) {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new ApiError(`Invalid ${key} date`, 400);
      }
      filters[key] = value;
    }
  }

  const data = await assembleSiteReportData(site, filters);

  const owner = await User.findById(site.engineer).select('name company email mobile').lean();
  if (owner) {
    data.engineer = {
      name: owner.name || site.engineerName || '',
      company: owner.company || '',
      email: owner.email || '',
      mobile: owner.mobile || '',
    };
  }

  return { site, data };
};


/**
 * Resolves the requested reporting window into concrete from/to dates.
 * - type=monthly + month=YYYY-MM  -> first..last day of that month
 * - type=weekly  + week=YYYY-Www  -> the Mon..Sun of that ISO week
 * - explicit from/to             -> used as given (validated)
 * - nothing                      -> entire project, labelled as such
 * The client sends a real selection; no date is ever hard-coded.
 */
const resolvePeriod = (query = {}) => {
  const type = String(query.type || 'all').toLowerCase();
  const iso = (date) => date.toISOString().slice(0, 10);

  if (type === 'monthly' && /^\d{4}-\d{2}$/.test(String(query.month || ''))) {
    const [year, month] = String(query.month).split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    if (Number.isNaN(start.getTime())) throw new ApiError('Invalid month', 400);
    const label = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { type, from: iso(start), to: iso(end), label };
  }

  if (type === 'weekly' && /^\d{4}-W\d{1,2}$/.test(String(query.week || ''))) {
    const [yearStr, weekStr] = String(query.week).split('-W');
    // ISO week: Monday of week 1 is Jan 4th of that year.
    const jan4 = new Date(Date.UTC(Number(yearStr), 0, 4));
    const dayOfWeek = (jan4.getUTCDay() + 6) % 7; // 0 = Monday
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek);
    const start = new Date(week1Monday);
    start.setUTCDate(week1Monday.getUTCDate() + (Number(weekStr) - 1) * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { type, from: iso(start), to: iso(end), label: `Week ${weekStr}, ${yearStr}` };
  }

  const { from, to } = query;
  if (from || to) {
    for (const [key, value] of [['from', from], ['to', to]]) {
      if (value && Number.isNaN(new Date(value).getTime())) {
        throw new ApiError(`Invalid ${key} date`, 400);
      }
    }
    return {
      type: 'custom',
      from: from || null,
      to: to || null,
      label: from && to ? `${toIsoDate(from)} to ${toIsoDate(to)}` : (from || to || 'Selected period'),
    };
  }

  return { type: 'all', from: null, to: null, label: 'Entire project' };
};

/** Attaches the engineer's profile so the PDF letterhead is complete. */
const attachEngineer = async (site, data) => {
  const owner = await User.findById(site.engineer).select('name company email mobile').lean();
  if (owner) {
    data.engineer = {
      name: owner.name || site.engineerName || '',
      company: owner.company || '',
      email: owner.email || '',
      mobile: owner.mobile || '',
    };
  }
  return data;
};

/**
 * GET /api/sites/:siteId/reports/material/:materialId/pdf
 * Separate professional PDF for ONE material: its complete purchase history,
 * consumption, balance and vendor breakdown.
 *
 * The material id is scoped to the already ownership-checked site, so swapping
 * in another engineer's material id simply 404s.
 */
const getMaterialPdfReport = asyncHandler(async (req, res) => {
  const site = await findOwnedSite(req);
  const { materialId } = req.params;

  if (!materialId || !/^[a-f\d]{24}$/i.test(materialId)) {
    throw new ApiError('Invalid material reference', 400);
  }

  const data = await assembleMaterialReportData(site, materialId);
  await attachEngineer(site, data);

  const buffer = await buildMaterialPdf(data, { site, engineer: data.engineer });
  const filename = buildReportFilename(`${data.material.name} Material Report`, site.siteName, 'pdf');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `${req.query.view === '1' ? 'inline' : 'attachment'}; filename="${filename}"`);
  res.send(buffer);
});


/**
 * GET /api/sites/:siteId/reports
 * JSON report bundle - powers the Reports tab in the UI (preview + print).
 */
const getReports = asyncHandler(async (req, res) => {
  const { data } = await loadReportData(req);

  res.status(200).json({
    success: true,
    data: {
      site: {
        _id: data.site._id,
        siteName: data.site.siteName,
        ownerName: data.site.ownerName,
        ownerMobile: data.site.ownerMobile,
        address: data.site.address,
        city: data.site.city,
        state: data.site.state,
        status: data.site.status,
        totalArea: data.site.totalArea,
        areaUnit: data.site.areaUnit,
        ratePerArea: data.site.ratePerArea,
        startDate: data.site.startDate,
        expectedCompletionDate: data.site.expectedCompletionDate,
      },
      engineer: data.engineer,
      summary: data.summary,
      dateFilter: data.dateFilter,
      meta: buildReportMeta(data),
      installments: data.installments,
      payments: data.payments,
      workers: data.workers,
      workerPayments: data.workerPayments,
      attendance: data.attendance,
      attendanceSummary: data.attendanceSummary,
      attendanceTotals: data.attendanceTotals,
      materials: data.materials,
      materialUsage: data.materialUsage,
      materialStock: data.materialStock,
      vendors: data.vendors,
      vendorPayments: data.vendorPayments,
      expenses: data.expenses,
      activities: data.activities,
      documents: data.documents,
      documentsCount: data.documentsCount,
      progress: data.progress,
      overallProgress: data.overallProgress,
      generatedAt: data.generatedAt,
      availableReports: [
        { key: 'site', label: 'Site Report', format: 'pdf' },
        { key: 'payments', label: 'Payment Report', format: 'csv' },
        { key: 'installments', label: 'Installment Report', format: 'csv' },
        { key: 'workers', label: 'Worker Report', format: 'csv' },
        { key: 'materials', label: 'Material Report', format: 'csv' },
        { key: 'vendors', label: 'Vendor Report', format: 'csv' },
        { key: 'expenses', label: 'Expense Report', format: 'csv' },
        { key: 'investment', label: 'Investment Report', format: 'excel' },
        { key: 'profit', label: 'Profit Report', format: 'excel' },
        { key: 'complete', label: 'Complete Site Report', format: 'excel' },
      ],
    },
  });
});

/**
 * GET /api/sites/:siteId/report/pdf
 * Streams the one-page A4 site project report.
 */
const getSitePdfReport = asyncHandler(async (req, res) => {
  const { site, data } = await loadReportData(req);

  const filename = buildReportFilename('Site Report', site.siteName, 'pdf');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Let the browser show the PDF inline when requested (?inline=1)
  if (req.query.inline === '1') {
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  }

  const doc = buildSiteReportPdf(data);
  doc.pipe(res);
});

/**
 * GET /api/sites/:siteId/export/excel
 * Sends a multi-sheet .xlsx workbook for the site.
 *
 * The workbook is rendered to a Buffer first (not streamed) so Content-Length
 * is known up front - the browser can then size the download, and a generation
 * failure can still be reported as a normal JSON error instead of corrupting
 * an already-started binary response.
 */
const exportExcel = asyncHandler(async (req, res) => {
  const { site, data } = await loadReportData(req);

  const workbook = await buildSiteWorkbook(data, data.engineer);
  const buffer = await workbook.xlsx.writeBuffer();

  const filename = buildReportFilename('Financial Report', site.siteName, 'xlsx');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  res.status(200).send(Buffer.from(buffer));
});

/**
 * ---------------------------------------------------------------------------
 * CSV EXPORT
 * ---------------------------------------------------------------------------
 * GET /api/sites/:siteId/export/csv?type=payments
 *
 * Supported types:
 *   site | summary | payments | installments | workers | worker-payments |
 *   materials | vendors | vendor-payments | expenses | activities |
 *   progress | documents | complete
 *
 * Comma separated types are combined into one downloadable file; "complete"
 * emits every dataset (the Complete Site Report) as ONE rectangular table
 * with a leading "Section" column - real CSV, parseable by any tool.
 */

/**
 * GET /api/sites/:siteId/export/csv
 * ?type=payments            -> single dataset
 * ?type=payments,workers    -> multiple datasets in one file
 * ?type=complete (default)  -> every dataset (Complete Site Report)
 */
const exportCsv = asyncHandler(async (req, res) => {
  const { site, data } = await loadReportData(req);

  const requested = String(req.query.type || 'complete')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const types = requested.includes('complete')
    ? CSV_TYPES
    : requested.filter((type) => CSV_TYPES.includes(type));

  if (types.length === 0) {
    throw new ApiError(
      `Unknown CSV type. Allowed values: ${CSV_TYPES.join(', ')}, complete`,
      400
    );
  }

  // Rectangular CSV (UTF-8 BOM + RFC-4180 escaping) built by csvExport.js:
  // one dataset -> its own narrow table; several/complete -> a single unified
  // table where every row has the same column count.
  const csv = buildSiteCsv(data, types);

  // A single-dataset export is named after that dataset; the full bundle is the
  // "Site Data" report. Both follow CivilSiteMitra_<Kind>_<Site>_<Date>.csv.
  const kind = requested.includes('complete') || types.length > 1
    ? 'Site Data'
    : `${types[0]} Data`;
  const filename = buildReportFilename(kind, site.siteName, 'csv');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8'));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csv);
});


/**
 * GET /api/sites/:siteId/reports/material-period
 * Weekly / monthly / custom material purchase + usage report as a PDF.
 *
 * Filters: ?type=weekly&week=2026-W41 | ?type=monthly&month=2026-10
 *          | ?from=2026-10-01&to=2026-10-07 | (none = entire project)
 *          optional &material=&vendor= to narrow further.
 */
const getMaterialPeriodPdfReport = asyncHandler(async (req, res) => {
  const site = await findOwnedSite(req);
  const period = resolvePeriod(req.query);

  const data = await assembleMaterialPeriodData(site, {
    from: period.from,
    to: period.to,
    type: period.type,
    label: period.label,
    material: req.query.material ? String(req.query.material).slice(0, 80) : null,
    vendor: req.query.vendor ? String(req.query.vendor).slice(0, 80) : null,
  });
  await attachEngineer(site, data);

  const buffer = await buildMaterialPeriodPdf(data, { site, engineer: data.engineer });
  const scope = period.type === 'monthly' ? 'Monthly'
    : period.type === 'weekly' ? 'Weekly' : 'Material';
  const filename = buildReportFilename(`${scope} Material Report`, site.siteName, 'pdf');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `${req.query.view === '1' ? 'inline' : 'attachment'}; filename="${filename}"`);
  res.send(buffer);
});

/**
 * GET /api/sites/:siteId/reports/material-period/preview
 * JSON companion to the PDF above: the same rollup as data, so the engineer
 * sees the period totals on screen before downloading anything.
 */
const getMaterialPeriodPreview = asyncHandler(async (req, res) => {
  const site = await findOwnedSite(req);
  const period = resolvePeriod(req.query);

  const data = await assembleMaterialPeriodData(site, {
    from: period.from,
    to: period.to,
    type: period.type,
    label: period.label,
    material: req.query.material ? String(req.query.material).slice(0, 80) : null,
    vendor: req.query.vendor ? String(req.query.vendor).slice(0, 80) : null,
  });

  res.json({
    success: true,
    data: {
      period: data.period,
      title: titleFor(period.type),
      totals: data.totals,
      rollup: data.rollup.map((r) => ({
        name: r.name, unit: r.unit, category: r.category,
        purchased: r.purchased, used: r.used, amount: r.amount, paid: r.paid, pending: r.pending,
        balance: r.balance, balanceAvailable: r.balanceAvailable,
      })),
      vendors: data.vendors.map((v) => ({ vendor: v.vendor, amount: v.amount, quantity: v.quantity })),
      purchaseCount: data.purchases.length,
      usageCount: data.usages.length,
    },
  });
});

/**
 * Shared helper for the two period-report exports. Loads the same rollup the
 * PDF uses, so Excel, CSV and PDF can never disagree for one period.
 */
const loadPeriodReport = async (req) => {
  const site = await findOwnedSite(req);
  const period = resolvePeriod(req.query);
  const data = await assembleMaterialPeriodData(site, {
    from: period.from,
    to: period.to,
    type: period.type,
    label: period.label,
    material: req.query.material ? String(req.query.material).slice(0, 80) : null,
    vendor: req.query.vendor ? String(req.query.vendor).slice(0, 80) : null,
  });
  await attachEngineer(site, data);
  const scope = period.type === 'monthly' ? 'Monthly'
    : period.type === 'weekly' ? 'Weekly' : 'Material';
  return { site, data, filename: buildReportFilename(`${scope} Material Report`, site.siteName, 'xlsx') };
};

/**
 * GET /api/sites/:siteId/reports/material-period/excel
 * Same period, same rollup, five worksheets (Summary / Material Summary /
 * Purchases / Usage / Vendor Summary) with frozen headers, filters and real
 * numeric money cells.
 */
const getMaterialPeriodExcel = asyncHandler(async (req, res) => {
  const { site, data, filename } = await loadPeriodReport(req);
  const wb = await buildMaterialPeriodWorkbook(data, { site, engineer: data.engineer });
  const buffer = await wb.xlsx.writeBuffer();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Length', buffer.byteLength);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/\.xlsx$/i, '.xlsx')}"`,
  );
  return res.send(Buffer.from(buffer));
});

/**
 * GET /api/sites/:siteId/reports/material-period/csv
 * UTF-8 (with BOM) so the rupee glyph and any Indian script survive Excel.
 */
const getMaterialPeriodCsv = asyncHandler(async (req, res) => {
  const { site, data } = await loadPeriodReport(req);
  const csv = buildMaterialPeriodCsv(data, { site, engineer: data.engineer });
  const scope = data.period.type === 'monthly' ? 'Monthly'
    : data.period.type === 'weekly' ? 'Weekly' : 'Material';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${buildReportFilename(`${scope} Material Data`, site.siteName, 'csv')}"`);
  return res.status(200).send(csv);
});

module.exports = {
  getReports,
  getSitePdfReport,
  exportExcel,
  exportCsv,
  getMaterialPdfReport,
  getMaterialPeriodPdfReport,
  getMaterialPeriodPreview,
  getMaterialPeriodExcel,
  getMaterialPeriodCsv,
};
