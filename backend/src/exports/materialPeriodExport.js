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

const section = (title, headers, rows) => {
  const lines = [`# ${title}`, headers.map(cell).join(',')];
  rows.forEach((r) => lines.push(r.map(cell).join(',')));
  return lines.join('\r\n');
};

/** CSV twin of the workbook, built from the same rollup. */
const buildMaterialPeriodCsv = (data, opts = {}) => {
  const { rollup, purchases, usages, vendors, totals, period } = data;
  const site = opts.site || data.site || {};

  const header = [
    '# CivilSiteMitra - Material Purchase & Usage Report',
    `# Period: ${period.label}`,
    `# From: ${period.from || 'start'}   To: ${period.to || 'latest'}`,
    `# Site: ${site.siteName || ''}`,
    `# Owner: ${site.ownerName || ''}`,
    `# Engineer: ${(opts.engineer && opts.engineer.name) || site.engineerName || ''}`,
    `# Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
  ].join('\r\n');

  const blocks = [
    section(
      'Material Summary',
      ['Material', 'Category', 'Unit', 'Purchased Qty', 'Used Qty', 'Balance Qty',
        'Purchase Amount (INR)', 'Paid (INR)', 'Outstanding (INR)'],
      rollup.map((r) => [r.name, r.category || '', r.unit || '', num(r.purchased), num(r.used),
        balanceText(r), num(r.amount), num(r.paid), num(r.pending)]),
    ),
    section(
      'Purchase Details',
      ['Date', 'Material', 'Vendor', 'Invoice No', 'Quantity', 'Unit', 'Rate (INR)',
        'Amount (INR)', 'Paid (INR)', 'Outstanding (INR)'],
      purchases.map((p) => [iso(p.purchaseDate), p.name, vendorOf(p), p.invoiceNumber || '',
        num(p.quantity), p.unit || '', num(p.rate), num(p.totalAmount),
        num(p.paidAmount), num(p.pendingAmount)]),
    ),
    section(
      'Usage Details',
      ['Date', 'Material', 'Unit', 'Quantity Used', 'Work / Activity', 'Notes'],
      usages.map((u) => [iso(u.date), u.materialName || '', u.unit || '', num(u.quantity),
        u.workActivity || '', u.notes || '']),
    ),
    section(
      'Vendor Purchase Summary',
      ['Vendor', 'Material', 'Quantity', 'Unit', 'Amount (INR)'],
      vendors.flatMap((v) => v.rows.map((r) => [v.vendor, r.material, num(r.quantity), r.unit || '', num(r.amount)])),
    ),
    section(
      'Total Summary',
      ['Field', 'Value'],
      [
        ['Total Purchase Amount (INR)', num(totals.totalPurchaseAmount)],
        ['Total Paid (INR)', num(totals.totalPaid)],
        ['Total Outstanding (INR)', num(totals.totalPending)],
        ['Total Materials Purchased', num(totals.totalQuantityPurchased)],
        ['Total Materials Used', num(totals.totalQuantityUsed)],
        ['Balance', totals.balanceAvailable ? num(totals.totalBalance) : 'Balance not available'],
      ],
    ),
  ];

  // BOM so Excel opens the file as UTF-8 (needed for the rupee glyph).
  return `\uFEFF${header}${blocks.join('\r\n\r\n')}\r\n`;
};

module.exports = { buildMaterialPeriodWorkbook, buildMaterialPeriodCsv, balanceText };