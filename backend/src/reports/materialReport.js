/**
 * materialReport.js - "separate PDF for each material".
 *
 * Renders the COMPLETE history of one material (every purchase of that
 * name+unit, from every vendor) as a standalone, client-shareable A4 document.
 * It reads only from assembleMaterialReportData(), so the figures here are
 * identical to the site dossier, the dashboard and the material list.
 */
const {
  createDoc, drawHeader, section, infoGrid, table, totalRow, paintFooter,
  inr, d, clip, qty, COLORS, F, MARGIN, CONTENT_W,
} = require('./reportKit');

/** Human label for a raw stored status, so no DB enum ever reaches a client. */
const prettyStatus = (value) => {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'paid' || s === 'fully paid') return 'PAID';
  if (s === 'partial' || s === 'partially paid' || s === 'part paid') return 'PARTIALLY PAID';
  if (s === 'pending' || s === 'unpaid') return 'PENDING';
  if (s === 'overdue') return 'OVERDUE';
  return String(value || 'PENDING').toUpperCase();
};

const statusColor = (value) => {
  const s = String(value || '').toLowerCase();
  if (s === 'paid') return COLORS.success;
  if (s === 'overdue') return COLORS.danger;
  if (s === 'partial' || s === 'pending' || s === 'unpaid') return COLORS.warning;
  return COLORS.text;
};

const vendorOf = (p) => (p.vendor && p.vendor.name) || p.vendorName || 'Unassigned';

/** The purchase-history table, shared by both material reports. */
const purchaseColumns = () => ([
  { label: 'Date', w: 0.13 },
  { label: 'Vendor', w: 0.27 },
  { label: 'Quantity', w: 0.16, align: 'right' },
  { label: 'Rate', w: 0.15, align: 'right' },
  { label: 'Amount', w: 0.17, align: 'right' },
  { label: 'Status', w: 0.12, align: 'center' },
]);

const purchaseRows = (purchases) => purchases.map((p) => [
  d(p.purchaseDate),
  clip(vendorOf(p), 34),
  qty(p.quantity, p.unit),
  inr(p.rate),
  inr(p.totalAmount),
  prettyStatus(p.status),
]);

const usageColumns = () => ([
  { label: 'Date', w: 0.16 },
  { label: 'Work / Activity', w: 0.42 },
  { label: 'Quantity Used', w: 0.20, align: 'right' },
  { label: 'Notes', w: 0.22 },
]);

const usageRows = (usages) => usages.map((u) => [
  d(u.date),
  clip(u.workActivity || '-', 48),
  qty(u.quantity, u.unit),
  clip(u.notes || '-', 30),
]);

module.exports = {
  prettyStatus, statusColor, vendorOf,
  purchaseColumns, purchaseRows, usageColumns, usageRows,
};

/** Wraps a drawing routine so a PDFKit failure always rejects, never hangs. */
const renderPdf = (draw) => {
  const doc = createDoc();
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Complete history of ONE material.
 * @param {object} data  from assembleMaterialReportData()
 * @param {object} opts  { site, engineer } for the letterhead
 * @returns {Promise<Buffer>}
 */
const buildMaterialPdf = (data, opts = {}) => renderPdf((doc) => {
  const { material, purchases, usages, vendors, totals } = data;

  let y = drawHeader(doc, {
    title: `${material.name} - Material Report`,
    subtitle: 'Complete purchase history, consumption and vendor summary',
    site: opts.site || data.site,
    engineer: opts.engineer,
    generatedOn: d(data.generatedAt),
  });

  y = section(doc, 'Material Information', y);
  y = infoGrid(doc, [
    ['Material Name', material.name],
    ['Category', material.category],
    ['Unit', material.unit || '-'],
    ['Purchase Records', String(totals.purchaseRecords)],
    ['Usage Records', String(totals.usageRecords)],
    ['Opening Stock', material.openingStock ? qty(material.openingStock, material.unit) : '-'],
  ], y + 4);
  y += 6;

  y = section(doc, 'Summary', y);
  y = totalRow(doc, y, [
    ['Total Quantity Purchased', qty(totals.totalQuantityPurchased, material.unit)],
    ['Total Quantity Used', totals.totalQuantityUsed
      ? qty(totals.totalQuantityUsed, material.unit) : 'No usage recorded'],
    ['Balance Quantity', totals.balanceAvailable
      ? qty(totals.totalBalance, material.unit)
      : 'Balance not available (no purchase to measure against)'],
    ['Total Purchase Amount', inr(totals.totalPurchaseAmount)],
    ['Amount Paid / Outstanding', `${inr(totals.totalPaid)}  /  ${inr(totals.totalPending)}`],
  ]);
  y += 14;

  y = section(doc, 'Purchase History', y);
  y = table(doc, {
    y,
    empty: 'No purchase records for this material yet.',
    columns: purchaseColumns(),
    rows: purchaseRows(purchases),
  });
  y = totalRow(doc, y + 8, [['Total Purchase Amount', inr(totals.totalPurchaseAmount)]]);
  y += 14;

  y = section(doc, 'Consumption History', y);
  y = table(doc, {
    y,
    empty: 'No material usage has been recorded for this material.',
    columns: usageColumns(),
    rows: usageRows(usages),
  });
  if (usages.length) {
    y = totalRow(doc, y + 8, [['Total Quantity Used', qty(totals.totalQuantityUsed, material.unit)]]);
  }
  y += 14;

  y = section(doc, 'Vendor Summary', y);
  y = table(doc, {
    y,
    empty: 'No vendor purchases recorded for this material.',
    columns: [
      { label: 'Vendor', w: 0.34 },
      { label: 'Material', w: 0.24 },
      { label: 'Quantity', w: 0.20, align: 'right' },
      { label: 'Amount', w: 0.22, align: 'right' },
    ],
    rows: vendors.flatMap((v) => v.rows.map((r) => [
      clip(v.vendor, 34), r.material, qty(r.quantity, r.unit), inr(r.amount),
    ])),
  });
  y = totalRow(doc, y + 8, vendors.map((v) => [`Total - ${clip(v.vendor, 40)}`, inr(v.amount)]));

  if (y < 700) {
    doc.font(F.italic).fontSize(7.4).fillColor(COLORS.muted)
      .text(
        'Note: figures are derived from recorded purchase and consumption entries. Quantities '
        + 'are only netted off when the unit matches, so a balance is never calculated across '
        + 'incompatible units such as Bags and Kg.',
        MARGIN, y + 16, { width: CONTENT_W, height: 26, lineBreak: true },
      );
  }

  paintFooter(doc, `${material.name} - Material Report`);
});

module.exports.buildMaterialPdf = buildMaterialPdf;
module.exports.renderPdf = renderPdf;
