/**
 * materialPeriodExport.js - Excel and CSV for the weekly / monthly material
 * report.
 *
 * Both are fed by the SAME assembleMaterialPeriodData() rollup the PDF uses, so
 * a figure can never differ between the three formats for the same period.
 * Money is stored as real numeric cells (not text) so the engineer can keep
 * working in Excel, and dates as ISO strings so they survive any locale.
 */
const ExcelJS = require('exceljs');
const { MONEY_FMT } = require('./excelExport');

const num = (v) => (Number(v) || 0);
const iso = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const vendorOf = (p) => (p.vendor && p.vendor.name) || p.vendorName || 'Unassigned';

/** "Balance not available" rather than a misleading number. */
const balanceText = (row) => (row.balanceAvailable ? num(row.balance) : 'Balance not available');

const finishSheet = (sheet, lastColLetter, dataRows) => {
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${lastColLetter}${Math.max(1, dataRows + 1)}` };
};

/**
 * @param {object} data from assembleMaterialPeriodData()
 * @param {object} opts { site, engineer }
 */
const buildMaterialPeriodWorkbook = async (data, opts = {}) => {
  const { rollup, purchases, usages, vendors, totals, period } = data;
  const site = opts.site || data.site || {};
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CivilSiteMitra';
  wb.created = new Date();

  // ---- Sheet 1: Summary -------------------------------------------------
  const info = wb.addWorksheet('Summary');
  info.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 26 },
  ];
  [
    ['Report Type', period.type],
    ['Report Period', period.label],
    ['Period From', period.from || ''],
    ['Period To', period.to || ''],
    ['Site Name', site.siteName || ''],
    ['Site Owner', site.ownerName || ''],
    ['Location', [site.city, site.state].filter(Boolean).join(', ')],
    ['Engineer', (opts.engineer && opts.engineer.name) || site.engineerName || ''],
    ['Generated', new Date().toISOString().slice(0, 10)],
    ['', ''],
    ['Total Purchase Amount (INR)', totals.totalPurchaseAmount],
    ['Total Paid (INR)', totals.totalPaid],
    ['Total Outstanding (INR)', totals.totalPending],
    ['Materials Purchased', totals.totalQuantityPurchased],
    ['Materials Used', totals.totalQuantityUsed],
    ['Balance', totals.balanceAvailable ? totals.totalBalance : 'Balance not available'],
  ].forEach(([field, value]) => info.addRow({ field, value: value === '' ? null : value }));
  finishSheet(info, 'B', info.rowCount);
  // Money rows sit after the blank separator row.
  for (let r = 12; r <= 14; r += 1) {
    const c = info.getRow(r).getCell(2);
    if (c.value !== null) c.numFmt = MONEY_FMT;
  }
  info.getColumn(2).alignment = { horizontal: 'right' };

  // ---- Sheet 2: Material Summary ---------------------------------------
  const mat = wb.addWorksheet('Material Summary');
  mat.columns = [
    { header: 'Material', key: 'name', width: 24 },
    { header: 'Category', key: 'category', width: 14 },
    { header: 'Unit', key: 'unit', width: 9 },
    { header: 'Purchased Qty', key: 'purchased', width: 14 },
    { header: 'Used Qty', key: 'used', width: 12 },
    { header: 'Balance Qty', key: 'balance', width: 20 },
    { header: 'Purchase Amount', key: 'amount', width: 16 },
    { header: 'Paid', key: 'paid', width: 14 },
    { header: 'Outstanding', key: 'pending', width: 14 },
  ];
  rollup.forEach((r) => mat.addRow({
    name: r.name,
    category: r.category || null,
    unit: r.unit || null,
    purchased: num(r.purchased),
    used: num(r.used),
    balance: balanceText(r),
    amount: num(r.amount),
    paid: num(r.paid),
    pending: num(r.pending),
  }));
  finishSheet(mat, 'I', rollup.length);
  [7, 8, 9].forEach((c) => { mat.getColumn(c).numFmt = MONEY_FMT; });
  [4, 5, 6, 7, 8, 9].forEach((c) => { mat.getColumn(c).alignment = { horizontal: 'right' }; });
// ---- Sheet 3: Purchases ----------------------------------------------
  const pur = wb.addWorksheet('Purchases');
  pur.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Material', key: 'material', width: 22 },
    { header: 'Category', key: 'category', width: 14 },
    { header: 'Vendor', key: 'vendor', width: 28 },
    { header: 'Invoice No', key: 'invoice', width: 15 },
    { header: 'Quantity', key: 'qty', width: 11 },
    { header: 'Unit', key: 'unit', width: 9 },
    { header: 'Rate', key: 'rate', width: 11 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Paid', key: 'paid', width: 13 },
    { header: 'Outstanding', key: 'pending', width: 14 },
  ];
  purchases.forEach((p) => pur.addRow({
    date: iso(p.purchaseDate),
    material: p.name,
    category: p.category || null,
    vendor: vendorOf(p),
    invoice: p.invoiceNumber || null,
    qty: num(p.quantity),
    unit: p.unit || null,
    rate: num(p.rate),
    amount: num(p.totalAmount),
    paid: num(p.paidAmount),
    pending: num(p.pendingAmount),
  }));
  finishSheet(pur, 'K', purchases.length);
  [8, 9, 10, 11].forEach((c) => { pur.getColumn(c).numFmt = MONEY_FMT; });
  [6, 8, 9, 10, 11].forEach((c) => { pur.getColumn(c).alignment = { horizontal: 'right' }; });

  // ---- Sheet 4: Usage ---------------------------------------------------
  const use = wb.addWorksheet('Usage');
  use.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Material', key: 'material', width: 24 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Quantity Used', key: 'qty', width: 14 },
    { header: 'Work / Activity', key: 'work', width: 30 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  usages.forEach((u) => use.addRow({
    date: iso(u.date),
    material: u.materialName || '',
    unit: u.unit || null,
    qty: num(u.quantity),
    work: u.workActivity || null,
    notes: u.notes || null,
  }));
  finishSheet(use, 'F', usages.length);
  use.getColumn(4).alignment = { horizontal: 'right' };

  // ---- Sheet 5: Vendors -------------------------------------------------
  const ven = wb.addWorksheet('Vendor Summary');
  ven.columns = [
    { header: 'Vendor', key: 'vendor', width: 34 },
    { header: 'Material', key: 'material', width: 24 },
    { header: 'Quantity', key: 'qty', width: 12 },
    { header: 'Unit', key: 'unit', width: 9 },
    { header: 'Amount', key: 'amount', width: 15 },
  ];
  vendors.forEach((v) => v.rows.forEach((r) => ven.addRow({
    vendor: v.vendor,
    material: r.material,
    qty: num(r.quantity),
    unit: r.unit || null,
    amount: num(r.amount),
  })));
  finishSheet(ven, 'E', ven.rowCount);
  ven.getColumn(5).numFmt = MONEY_FMT;
  [3, 5].forEach((c) => { ven.getColumn(c).alignment = { horizontal: 'right' }; });

  return wb;
};

/** RFC-4180 safe cell: quotes doubled, wrapped when needed. */
const cell = (value) => {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Unified column set for the period CSV. ONE rectangular table (exactly like
 * the site CSV): every physical row has the same width, so Excel / Sheets /
 * pandas can parse the file directly. A leading "Section" column says which
 * dataset each row belongs to; "Value" carries report-info / label text.
 */
const PERIOD_HEADERS = [
  'Section',
  'Date',
  'Name',
  'Category / Type',
  'Vendor / Party',
  'Purchased Qty',
  'Used Qty',
  'Balance',
  'Unit',
  'Rate (INR)',
  'Amount (INR)',
  'Paid (INR)',
  'Outstanding (INR)',
  'Invoice No',
  'Work / Activity',
  'Notes',
  'Value',
];

/** Column indexes so the row builders below stay readable. */
const P = Object.fromEntries(PERIOD_HEADERS.map((header, index) => [header, index]));

/** Builds one unified row: section label + sparse {header: value} cells. */
const prow = (section, cells = {}) => {
  const row = Array(PERIOD_HEADERS.length).fill('');
  row[P.Section] = section;
  for (const [header, value] of Object.entries(cells)) {
    row[P[header]] = value ?? '';
  }
  return row;
};

/** INR text with 2 decimals (never "Rs. 5,000"). */
const money2 = (value) => (Number(value) || 0).toFixed(2);

/** CSV twin of the workbook, built from the same rollup. */
const buildMaterialPeriodCsv = (data, opts = {}) => {
  const { rollup, purchases, usages, vendors, totals, period } = data;
  const site = opts.site || data.site || {};

  const rows = [
    // Report metadata (was a `#` comment banner; now parseable data rows).
    prow('Report Info', { Name: 'Report Type', Value: period.type }),
    prow('Report Info', { Name: 'Period', Value: period.label }),
    prow('Report Info', { Name: 'Period From', Value: period.from || '' }),
    prow('Report Info', { Name: 'Period To', Value: period.to || '' }),
    prow('Report Info', { Name: 'Site Name', Value: site.siteName || '' }),
    prow('Report Info', { Name: 'Owner', Value: site.ownerName || '' }),
    prow('Report Info', {
      Name: 'Engineer',
      Value: (opts.engineer && opts.engineer.name) || site.engineerName || '',
    }),
    prow('Report Info', { Name: 'Generated', Value: new Date().toISOString().slice(0, 10) }),

    ...rollup.map((r) => prow('Material Summary', {
      Name: r.name,
      'Category / Type': r.category || '',
      Unit: r.unit || '',
      'Purchased Qty': num(r.purchased),
      'Used Qty': num(r.used),
      Balance: balanceText(r),
      'Amount (INR)': money2(r.amount),
      'Paid (INR)': money2(r.paid),
      'Outstanding (INR)': money2(r.pending),
    })),

    ...purchases.map((p) => prow('Purchase Details', {
      Date: iso(p.purchaseDate),
      Name: p.name,
      'Vendor / Party': vendorOf(p),
      'Invoice No': p.invoiceNumber || '',
      'Purchased Qty': num(p.quantity),
      Unit: p.unit || '',
      'Rate (INR)': money2(p.rate),
      'Amount (INR)': money2(p.totalAmount),
      'Paid (INR)': money2(p.paidAmount),
      'Outstanding (INR)': money2(p.pendingAmount),
    })),

    ...usages.map((u) => prow('Usage Details', {
      Date: iso(u.date),
      Name: u.materialName || '',
      'Used Qty': num(u.quantity),
      Unit: u.unit || '',
      'Work / Activity': u.workActivity || '',
      Notes: u.notes || '',
    })),

    ...vendors.flatMap((v) => v.rows.map((r) => prow('Vendor Purchase Summary', {
      'Vendor / Party': v.vendor,
      Name: r.material,
      'Purchased Qty': num(r.quantity),
      Unit: r.unit || '',
      'Amount (INR)': money2(r.amount),
    }))),

    prow('Total Summary', { Name: 'Total Purchase Amount (INR)', 'Amount (INR)': money2(totals.totalPurchaseAmount) }),
    prow('Total Summary', { Name: 'Total Paid (INR)', 'Amount (INR)': money2(totals.totalPaid) }),
    prow('Total Summary', { Name: 'Total Outstanding (INR)', 'Amount (INR)': money2(totals.totalPending) }),
    prow('Total Summary', { Name: 'Total Materials Purchased', 'Purchased Qty': num(totals.totalQuantityPurchased) }),
    prow('Total Summary', { Name: 'Total Materials Used', 'Used Qty': num(totals.totalQuantityUsed) }),
    prow('Total Summary', {
      Name: 'Balance',
      Balance: totals.balanceAvailable ? money2(totals.totalBalance) : 'Balance not available',
    }),
  ];

  // BOM so Excel opens the file as UTF-8; CRLF + final newline per RFC-4180.
  const text = [PERIOD_HEADERS, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  return `\uFEFF${text}\r\n`;
};

module.exports = { buildMaterialPeriodWorkbook, buildMaterialPeriodCsv, balanceText, PERIOD_HEADERS };
