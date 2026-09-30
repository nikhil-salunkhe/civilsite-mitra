const Site = require('../models/Site');
const User = require('../models/User');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { findOwnedSite } = require('../utils/siteAccess');
const {
  assembleSiteReportData,
  assembleEngineerReportData,
  buildReportMeta,
} = require('../services/reportService');
const { buildSiteReportPdf } = require('../reports/siteReport');
const { buildSiteWorkbook } = require('../exports/excelExport');
const { safeFileSlug, toIsoDate } = require('../utils/format');

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

  const filename = `Site-Report-${safeFileSlug(site.siteName)}-${toIsoDate(new Date())}.pdf`;

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
 * Streams a multi-sheet .xlsx workbook for the site.
 */
const exportExcel = asyncHandler(async (req, res) => {
  const { site, data } = await loadReportData(req);

  const workbook = await buildSiteWorkbook(data, data.engineer);

  const filename = `CivilSiteMitra-${safeFileSlug(site.siteName)}-${toIsoDate(new Date())}.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
});

/**
 * ---------------------------------------------------------------------------
 * CSV EXPORT
 * ---------------------------------------------------------------------------
 * GET /api/sites/:siteId/export/csv?type=payments
 *
 * Supported types:
 *   site | payments | installments | workers | worker-payments |
 *   materials | vendors | vendor-payments | expenses | summary | complete
 *
 * Comma separated types are combined into one downloadable file; "complete"
 * emits every dataset (the Complete Site Report).
 */

/** RFC-4180 safe cell: quotes are doubled and the value wrapped when needed. */
const csvCell = (value) => {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

/** Builds a CSV block from a title, a header row and data rows. */
const csvSection = (title, headers, rows) => {
  const lines = [`# ${title}`, headers.map(csvCell).join(',')];
  rows.forEach((row) => lines.push(row.map(csvCell).join(',')));
  return lines.join('\r\n');
};

const num = (value) => (Number(value) || 0).toFixed(2);

/** Each builder maps the assembled report payload to CSV sections. */
const CSV_BUILDERS = {
  site: (data) => [
    csvSection(
      'Site Information',
      ['Field', 'Value'],
      [
        ['Site Name', data.site.siteName],
        ['Owner Name', data.site.ownerName],
        ['Owner Mobile', data.site.ownerMobile],
        ['Address', data.site.address],
        ['City', data.site.city],
        ['State', data.site.state],
        ['Status', data.site.status],
        ['Area', `${data.site.totalArea} ${data.site.areaUnit || 'Sq.Ft'}`],
        ['Rate', num(data.site.ratePerArea)],
        ['Project Value', num(data.summary.projectValue)],
        ['Start Date', toIsoDate(data.site.startDate)],
        ['Expected Completion', toIsoDate(data.site.expectedCompletionDate)],
        ['Overall Progress %', data.site.overallProgress || 0],
        ['Engineer', data.engineer.name],
        ['Company', data.engineer.company],
      ]
    ),
  ],

  summary: (data) => {
    const s = data.summary;
    return [
      csvSection(
        'Investment & Profit',
        ['Head', 'Amount'],
        [
          ['Project Value', num(s.projectValue)],
          ['Total Received', num(s.totalReceived)],
          ['Pending Receivable', num(s.pendingReceivable)],
          ['Material Cost', num(s.materialCost)],
          ['Worker Cost', num(s.workerCost)],
          ['Vendor Cost', num(s.vendorCost)],
          ['Other Expenses', num(s.otherExpenses)],
          ['Total Investment (Committed)', num(s.totalInvestment)],
          ['Investment Paid', num(s.totalPaid)],
          ['Outstanding Payable', num(s.outstandingPayable)],
          ['Estimated Profit', num(s.estimatedProfit)],
          ['Profit Margin %', num(s.profitMargin)],
        ]
      ),
    ];
  },

  payments: (data) => [
    csvSection(
      'Payments Received',
      ['Date', 'Amount', 'Mode', 'Reference', 'Notes'],
      data.payments.map((p) => [
        toIsoDate(p.date), num(p.amount), p.paymentMode,
        p.transactionRef || '', p.notes || '',
      ])
    ),
  ],

  installments: (data) => [
    csvSection(
      'Installments',
      ['Order', 'Name', 'Amount', 'Paid', 'Pending', 'Due Date', 'Payment Date', 'Mode', 'Status'],
      data.installments.map((i) => [
        i.order,
        i.name,
        num(i.amount),
        num(i.paidAmount),
        num(Math.max(0, (i.amount || 0) - (i.paidAmount || 0))),
        toIsoDate(i.dueDate),
        toIsoDate(i.paymentDate),
        i.paymentMode || '',
        i.status,
      ])
    ),
  ],

  workers: (data) => [
    csvSection(
      'Workers',
      ['Name', 'Mobile', 'Type', 'Daily Wage', 'Work Days', 'Total Amount', 'Paid', 'Pending', 'Joining Date', 'Status'],
      data.workers.map((w) => [
        w.name, w.mobile, w.workerType, num(w.dailyWage), w.totalWorkDays,
        num(w.totalAmount), num(w.paidAmount), num(w.pendingAmount),
        toIsoDate(w.joiningDate), w.status,
      ])
    ),
  ],

  'worker-payments': (data) => [
    csvSection(
      'Worker Payments',
      ['Date', 'Worker', 'Work Days', 'Daily Wage', 'Total', 'Paid', 'Pending', 'Status', 'Payment Date', 'Mode'],
      data.workerPayments.map((wp) => [
        toIsoDate(wp.date), wp.worker?.name || '', wp.workDays, num(wp.dailyWage),
        num(wp.totalAmount), num(wp.paidAmount), num(wp.pendingAmount), wp.status,
        toIsoDate(wp.paymentDate), wp.paymentMode || '',
      ])
    ),
  ],

  materials: (data) => [
    csvSection(
      'Materials',
      ['Purchase Date', 'Material', 'Category', 'Vendor', 'Quantity', 'Unit', 'Rate', 'Total', 'Paid', 'Pending', 'Invoice', 'Status'],
      data.materials.map((m) => [
        toIsoDate(m.purchaseDate), m.name, m.category,
        m.vendor?.name || m.vendorName || '', m.quantity, m.unit, num(m.rate),
        num(m.totalAmount), num(m.paidAmount), num(m.pendingAmount),
        m.invoiceNumber || '', m.paymentStatus,
      ])
    ),
  ],

  vendors: (data) => [
    csvSection(
      'Vendors',
      ['Name', 'Mobile', 'Email', 'City', 'Category', 'Materials', 'Total Purchases', 'Paid', 'Pending'],
      data.vendors.map((v) => [
        v.name, v.mobile || '', v.email || '', v.city || '', v.materialCategory || '',
        v.materialCount, num(v.totalPurchases), num(v.paidAmount), num(v.pendingAmount),
      ])
    ),
  ],

  'vendor-payments': (data) => [
    csvSection(
      'Vendor Payments',
      ['Date', 'Vendor', 'Material', 'Quantity', 'Unit', 'Amount', 'Mode', 'Reference', 'Notes'],
      data.vendorPayments.map((vp) => [
        toIsoDate(vp.date), vp.vendor?.name || '',
        vp.material?.name || vp.materialName || '', vp.quantity || '', vp.unit || '',
        num(vp.amount), vp.paymentMode || '', vp.transactionRef || '', vp.notes || '',
      ])
    ),
  ],

  expenses: (data) => [
    csvSection(
      'Site Expenses',
      ['Date', 'Category', 'Description', 'Amount', 'Paid', 'Pending', 'Status', 'Mode'],
      data.expenses.map((e) => [
        toIsoDate(e.expenseDate), e.category, e.description, num(e.amount),
        num(e.paidAmount), num(e.pendingAmount), e.paymentStatus, e.paymentMode || '',
      ])
    ),
  ],
};

const CSV_TYPES = Object.keys(CSV_BUILDERS);

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

  const blocks = types.flatMap((type) => CSV_BUILDERS[type](data));

  const header = [
    '# CivilSiteMitra - Site Project Report',
    `# Site: ${site.siteName}`,
    `# Owner: ${site.ownerName}`,
    `# Engineer: ${data.engineer.name}`,
    `# Generated: ${toIsoDate(data.generatedAt)}`,
    '',
  ].join('\r\n');

  // The BOM makes Excel open the file as UTF-8 (needed for the rupee symbol).
  const csv = `\uFEFF${header}${blocks.join('\r\n\r\n')}\r\n`;

  const suffix = requested.includes('complete') ? 'Complete-Report' : types.join('-');
  const filename = `CivilSiteMitra-${safeFileSlug(site.siteName)}-${safeFileSlug(suffix)}-${toIsoDate(new Date())}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csv);
});

module.exports = {
  getReports,
  getSitePdfReport,
  exportExcel,
  exportCsv,
};



