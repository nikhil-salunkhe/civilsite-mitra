const { toIsoDate } = require('../utils/format');

/**
 * ---------------------------------------------------------------------------
 * Site CSV export builder
 * ---------------------------------------------------------------------------
 * Produces REAL CSV - a plain rectangular table - never a visually formatted
 * pseudo-CSV. Two shapes exist:
 *
 *   1. One dataset requested (?type=materials) -> a narrow table whose header
 *      row describes exactly that dataset. Example:
 *        Purchase Date,Material,Category,Vendor,...,Status
 *        2026-10-01,Cement,Construction,ABC Suppliers,...,PENDING
 *
 *   2. Several datasets / ?type=complete       -> ONE unified table with a
 *      leading "Section" column. Every physical row carries the same number of
 *      columns, so Excel / Sheets / pandas can all parse the file directly.
 *
 * Rules enforced here (validated by tools/csv-validation-check.mjs):
 *   - RFC-4180 escaping: quotes doubled, fields with , " CR LF are quoted.
 *   - UTF-8 BOM so Microsoft Excel detects the encoding (rupee glyph, Marathi).
 *   - Money is a plain number (never "Rs. 5,000"); dates are ISO yyyy-mm-dd.
 *   - No "#" comment lines, no blank filler, no HTML, no NaN/undefined.
 *   - Total = the backend-calculated amount; client totals are never trusted.
 *
 * The financial figures come from the SAME assembled payload (and therefore
 * the same central financialService) as the PDF, the dashboard and Excel.
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

const num = (value) => (Number(value) || 0).toFixed(2);

/** A CSV file body: BOM + rows joined with CRLF + final newline. */
const csvBody = (rows) => `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

// ---------------------------------------------------------------------------
// Unified table (complete / multi-dataset exports)
// ---------------------------------------------------------------------------

const UNIFIED_HEADERS = [
  'Section',
  'Date',
  'Name',
  'Category / Type',
  'Vendor / Party',
  'Mobile',
  'Quantity',
  'Unit',
  'Rate (INR)',
  'Amount (INR)',
  'Paid (INR)',
  'Pending (INR)',
  'Due Date',
  'Payment Date',
  'Payment Mode',
  'Reference',
  'Status',
  'Notes',
];

/** Column indexes so the row builders below stay readable. */
const U = Object.fromEntries(UNIFIED_HEADERS.map((header, index) => [header, index]));

/** Builds one unified row: section label + sparse {header: value} cells. */
const unifiedRow = (section, cells = {}) => {
  const row = Array(UNIFIED_HEADERS.length).fill('');
  row[U.Section] = section;
  for (const [header, value] of Object.entries(cells)) {
    row[U[header]] = value ?? '';
  }
  return row;
};

const stageLabel = (key) => String(key || '').replace(/[-_]/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

const joinNotes = (...parts) => parts.filter((p) => String(p ?? '').trim() !== '').join(' | ');

// ---------------------------------------------------------------------------
// Per-dataset section builders. Each has a narrow `rows` shape for a solo
// export and a `unified` shape for the complete table. Order matters: they
// run in CSV_TYPES order.
// ---------------------------------------------------------------------------

const SECTIONS = {
  site: {
    label: 'Site Information',
    headers: ['Field', 'Value'],
    rows: (data) => [
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
    ],
    unified: (data) => [
      unifiedRow('Site Information', { Name: 'Site Name', Notes: data.site.siteName }),
      unifiedRow('Site Information', { Name: 'Owner Name', Notes: data.site.ownerName }),
      unifiedRow('Site Information', { Name: 'Owner Mobile', Mobile: data.site.ownerMobile }),
      unifiedRow('Site Information', { Name: 'Address', Notes: data.site.address }),
      unifiedRow('Site Information', { Name: 'City', Notes: data.site.city }),
      unifiedRow('Site Information', { Name: 'State', Notes: data.site.state }),
      unifiedRow('Site Information', { Name: 'Status', Status: data.site.status }),
      unifiedRow('Site Information', {
        Name: 'Area',
        Quantity: data.site.totalArea ?? '',
        Unit: data.site.areaUnit || 'Sq.Ft',
      }),
      unifiedRow('Site Information', { Name: 'Rate per Area', 'Rate (INR)': num(data.site.ratePerArea) }),
      unifiedRow('Site Information', { Name: 'Project Value', 'Amount (INR)': num(data.summary.projectValue) }),
      unifiedRow('Site Information', { Name: 'Start Date', Date: toIsoDate(data.site.startDate) }),
      unifiedRow('Site Information', { Name: 'Expected Completion', 'Due Date': toIsoDate(data.site.expectedCompletionDate) }),
      unifiedRow('Site Information', { Name: 'Overall Progress %', Notes: `${data.site.overallProgress || 0}%` }),
      unifiedRow('Site Information', { Name: 'Engineer', Notes: data.engineer.name }),
      unifiedRow('Site Information', { Name: 'Company', Notes: data.engineer.company }),
    ],
  },

  summary: {
    label: 'Investment & Profit',
    headers: ['Head', 'Amount (INR)'],
    rows: (data) => {
      const s = data.summary;
      return [
        ['Project Value (INR)', num(s.projectValue)],
        ['Total Received (INR)', num(s.totalReceived)],
        ['Pending Receivable (INR)', num(s.pendingReceivable)],
        ['Material Cost (INR)', num(s.materialCost)],
        ['Worker Cost (INR)', num(s.workerCost)],
        ['Vendor Cost (INR)', num(s.vendorCost)],
        ['Other Expenses (INR)', num(s.otherExpenses)],
        ['Total Investment Committed (INR)', num(s.totalInvestment)],
        ['Investment Paid (INR)', num(s.totalPaid)],
        ['Outstanding Payable (INR)', num(s.outstandingPayable)],
        ['Estimated Profit (INR)', num(s.estimatedProfit)],
        ['Profit Margin (%)', num(s.profitMargin)],
      ];
    },
    unified: (data) => SECTIONS.summary.rows(data).map(([head, amount]) => (
      unifiedRow('Investment & Profit', { Name: head, 'Amount (INR)': amount })
    )),
  },

  payments: {
    label: 'Payments Received',
    headers: ['Date', 'Amount', 'Mode', 'Reference', 'Notes'],
    rows: (data) => data.payments.map((p) => [
      toIsoDate(p.date), num(p.amount), p.paymentMode,
      p.transactionRef || '', p.notes || '',
    ]),
    unified: (data) => data.payments.map((p) => unifiedRow('Payments Received', {
      Date: toIsoDate(p.date),
      Name: 'Owner payment received',
      'Amount (INR)': num(p.amount),
      'Payment Mode': p.paymentMode || '',
      Reference: p.transactionRef || '',
      Notes: p.notes || '',
    })),
  },

  installments: {
    label: 'Installments',
    headers: ['Order', 'Name', 'Amount', 'Paid', 'Pending', 'Due Date', 'Payment Date', 'Mode', 'Status'],
    rows: (data) => data.installments.map((i) => [
      i.order,
      i.name,
      num(i.amount),
      num(i.paidAmount),
      num(Math.max(0, (i.amount || 0) - (i.paidAmount || 0))),
      toIsoDate(i.dueDate),
      toIsoDate(i.paymentDate),
      i.paymentMode || '',
      i.status,
    ]),
    unified: (data) => data.installments.map((i) => unifiedRow('Installments', {
      Name: i.name,
      'Amount (INR)': num(i.amount),
      'Paid (INR)': num(i.paidAmount),
      'Pending (INR)': num(Math.max(0, (i.amount || 0) - (i.paidAmount || 0))),
      'Due Date': toIsoDate(i.dueDate),
      'Payment Date': toIsoDate(i.paymentDate),
      'Payment Mode': i.paymentMode || '',
      Reference: i.order ?? '',
      Status: i.status,
      Notes: i.description || '',
    })),
  },

  workers: {
    label: 'Workers',
    headers: ['Name', 'Mobile', 'Type', 'Daily Wage', 'Work Days', 'Total Amount', 'Paid', 'Pending', 'Joining Date', 'Status'],
    rows: (data) => data.workers.map((w) => [
      w.name, w.mobile, w.workerType, num(w.dailyWage), w.totalWorkDays,
      num(w.totalAmount), num(w.paidAmount), num(w.pendingAmount), toIsoDate(w.joiningDate), w.status,
    ]),
    unified: (data) => data.workers.map((w) => unifiedRow('Workers', {
      Name: w.name,
      'Category / Type': w.workerType,
      Mobile: w.mobile,
      Quantity: w.totalWorkDays ?? '',
      Unit: 'Days',
      'Rate (INR)': num(w.dailyWage),
      'Amount (INR)': num(w.totalAmount),
      'Paid (INR)': num(w.paidAmount),
      'Pending (INR)': num(w.pendingAmount),
      Date: toIsoDate(w.joiningDate),
      Status: w.status,
    })),
  },

  'worker-payments': {
    label: 'Worker Payments',
    headers: ['Date', 'Worker', 'Work Days', 'Daily Wage', 'Total', 'Paid', 'Pending', 'Status', 'Payment Date', 'Mode', 'Notes'],
    rows: (data) => data.workerPayments.map((wp) => [
      toIsoDate(wp.date), wp.worker?.name || wp.workerName || '', wp.workDays, num(wp.dailyWage),
      num(wp.totalAmount), num(wp.paidAmount), num(wp.pendingAmount), wp.status,
      toIsoDate(wp.paymentDate), wp.paymentMode || '', wp.notes || '',
    ]),
    unified: (data) => data.workerPayments.map((wp) => unifiedRow('Worker Payments', {
      Date: toIsoDate(wp.date),
      Name: wp.worker?.name || wp.workerName || '',
      Quantity: wp.workDays ?? '',
      Unit: 'Days',
      'Rate (INR)': num(wp.dailyWage),
      'Amount (INR)': num(wp.totalAmount),
      'Paid (INR)': num(wp.paidAmount),
      'Pending (INR)': num(wp.pendingAmount),
      'Payment Date': toIsoDate(wp.paymentDate),
      'Payment Mode': wp.paymentMode || '',
      Status: wp.status,
      Notes: wp.notes || '',
    })),
  },

  materials: {
    label: 'Materials',
    headers: ['Purchase Date', 'Material', 'Category', 'Vendor', 'Quantity', 'Unit', 'Rate', 'Total', 'Paid', 'Pending', 'Invoice', 'Status'],
    rows: (data) => data.materials.map((m) => [
      toIsoDate(m.purchaseDate), m.name, m.category,
      m.vendor?.name || m.vendorName || '', m.quantity, m.unit, num(m.rate),
      num(m.totalAmount), num(m.paidAmount), num(m.pendingAmount),
      m.invoiceNumber || '', m.paymentStatus,
    ]),
    unified: (data) => data.materials.map((m) => unifiedRow('Materials', {
      Date: toIsoDate(m.purchaseDate),
      Name: m.name,
      'Category / Type': m.category,
      'Vendor / Party': m.vendor?.name || m.vendorName || '',
      Quantity: m.quantity ?? '',
      Unit: m.unit,
      'Rate (INR)': num(m.rate),
      'Amount (INR)': num(m.totalAmount),
      'Paid (INR)': num(m.paidAmount),
      'Pending (INR)': num(m.pendingAmount),
      Reference: m.invoiceNumber || '',
      Status: m.paymentStatus,
    })),
  },

  vendors: {
    label: 'Vendors',
    headers: ['Name', 'Mobile', 'Email', 'City', 'Category', 'Materials', 'Total Purchases', 'Paid', 'Pending'],
    rows: (data) => data.vendors.map((v) => [
      v.name, v.mobile || '', v.email || '', v.city || '', v.materialCategory || '',
      v.materialCount, num(v.totalPurchases), num(v.paidAmount), num(v.pendingAmount),
    ]),
    unified: (data) => data.vendors.map((v) => unifiedRow('Vendors', {
      Name: v.name,
      'Category / Type': v.materialCategory || '',
      Mobile: v.mobile || '',
      Quantity: v.materialCount ?? '',
      Unit: 'Materials',
      'Amount (INR)': num(v.totalPurchases),
      'Paid (INR)': num(v.paidAmount),
      'Pending (INR)': num(v.pendingAmount),
      Notes: joinNotes(v.email, v.city),
    })),
  },

  'vendor-payments': {
    label: 'Vendor Payments',
    headers: ['Date', 'Vendor', 'Material', 'Quantity', 'Unit', 'Amount', 'Mode', 'Reference', 'Notes'],
    rows: (data) => data.vendorPayments.map((vp) => [
      toIsoDate(vp.date), vp.vendor?.name || vp.vendorName || '',
      vp.material?.name || vp.materialName || '', vp.quantity || '', vp.unit || '',
      num(vp.amount), vp.paymentMode || '', vp.transactionRef || '', vp.notes || '',
    ]),
    unified: (data) => data.vendorPayments.map((vp) => unifiedRow('Vendor Payments', {
      Date: toIsoDate(vp.date),
      Name: vp.material?.name || vp.materialName || '',
      'Vendor / Party': vp.vendor?.name || vp.vendorName || '',
      Quantity: vp.quantity ?? '',
      Unit: vp.unit || '',
      'Amount (INR)': num(vp.amount),
      'Payment Mode': vp.paymentMode || '',
      Reference: vp.transactionRef || '',
      Notes: vp.notes || '',
    })),
  },

  expenses: {
    label: 'Site Expenses',
    headers: ['Date', 'Category', 'Description', 'Amount', 'Paid', 'Pending', 'Status', 'Mode', 'Notes'],
    rows: (data) => data.expenses.map((e) => [
      toIsoDate(e.expenseDate), e.category, e.description, num(e.amount),
      num(e.paidAmount), num(e.pendingAmount), e.paymentStatus, e.paymentMode || '',
      e.notes || '',
    ]),
    unified: (data) => data.expenses.map((e) => unifiedRow('Site Expenses', {
      Date: toIsoDate(e.expenseDate),
      Name: e.description,
      'Category / Type': e.category,
      'Amount (INR)': num(e.amount),
      'Paid (INR)': num(e.paidAmount),
      'Pending (INR)': num(e.pendingAmount),
      'Payment Date': toIsoDate(e.paymentDate),
      'Payment Mode': e.paymentMode || '',
      Status: e.paymentStatus,
      Notes: e.notes || '',
    })),
  },

  activities: {
    label: 'Activities',
    headers: ['Date', 'Workers Present', 'Work Description', 'Work Completed', 'Materials Received', 'Issues', "Today's Expense", 'Notes'],
    rows: (data) => data.activities.map((a) => [
      toIsoDate(a.date), a.workersPresent ?? '', a.workDescription || '',
      a.workCompleted || '', a.materialsReceived || '', a.issues || '',
      num(a.todayExpense), a.notes || '',
    ]),
    unified: (data) => data.activities.map((a) => unifiedRow('Activities', {
      Date: toIsoDate(a.date),
      Name: a.workDescription || '',
      'Category / Type': a.workCompleted || '',
      'Vendor / Party': a.materialsReceived || '',
      Quantity: a.workersPresent ?? '',
      Unit: 'Workers',
      'Amount (INR)': num(a.todayExpense),
      Notes: joinNotes(a.issues, a.notes),
    })),
  },

  progress: {
    label: 'Progress',
    headers: ['Stage', 'Progress (%)'],
    rows: (data) => [
      ...Object.entries(data.site.progress || {}).map(([stage, pct]) => [stageLabel(stage), Number(pct) || 0]),
      ['Overall Progress', Number(data.site.overallProgress ?? data.overallProgress) || 0],
    ],
    unified: (data) => SECTIONS.progress.rows(data).map(([stage, pct]) => unifiedRow('Progress', {
      Name: stage,
      Quantity: pct,
      Unit: '%',
    })),
  },

  documents: {
    label: 'Documents',
    headers: ['Upload Date', 'File Name', 'Type', 'Size (Bytes)', 'Notes'],
    rows: (data) => (data.documents || []).map((doc) => [
      toIsoDate(doc.uploadedDate), doc.fileName || '', doc.fileType || '',
      Number(doc.size) || 0, doc.notes || '',
    ]),
    unified: (data) => (data.documents || []).map((doc) => unifiedRow('Documents', {
      Date: toIsoDate(doc.uploadedDate),
      Name: doc.fileName || '',
      'Category / Type': doc.fileType || '',
      Quantity: Number(doc.size) || 0,
      Unit: 'Bytes',
      Notes: doc.notes || '',
    })),
  },
};

/** Public list of dataset keys accepted by ?type=... (plus "complete"). */
const CSV_TYPES = Object.keys(SECTIONS);

/** One dataset as its own narrow table (header row + data rows). */
const singleSectionRows = (type, data) => {
  const section = SECTIONS[type];
  return [section.headers, ...section.rows(data)];
};

/**
 * Full CSV text for the requested dataset list.
 * - one dataset  -> narrow table
 * - several      -> unified table with a Section column (every row same width)
 * Always returns UTF-8 text starting with the BOM; the caller sends it as
 * `text/csv; charset=utf-8`.
 */
const buildSiteCsv = (data, types) => {
  const wanted = (types && types.length ? types : CSV_TYPES).filter((t) => SECTIONS[t]);
  const rows = wanted.length === 1
    ? singleSectionRows(wanted[0], data)
    : [UNIFIED_HEADERS, ...wanted.flatMap((t) => SECTIONS[t].unified(data))];
  return csvBody(rows);
};

module.exports = {
  buildSiteCsv,
  csvCell,
  csvBody,
  UNIFIED_HEADERS,
  CSV_TYPES,
};
