/**
 * materialPeriodReport.js - weekly / monthly / custom material report.
 *
 * Uses exactly the same assembleMaterialPeriodData() rollup that the per
 * material PDF uses, so the summary block, the detail tables and the grand total
 * can never disagree with each other.
 */
const {
  drawHeader, section, table, totalRow, paintFooter,
  inr, d, clip, qty, COLORS, F, MARGIN, CONTENT_W,
} = require('./reportKit');
const { renderPdf, purchaseColumns, purchaseRows, usageColumns, usageRows, vendorOf } = require('./materialReport');

/** "Weekly Material Report", "Monthly Material Report", "Material Report". */
const titleFor = (type) => {
  const t = String(type || '').toLowerCase();
  if (t === 'weekly') return 'Weekly Material Report';
  if (t === 'monthly') return 'Monthly Material Report';
  return 'Material Purchase & Usage Report';
};

/**
 * @param {object} data  from assembleMaterialPeriodData()
 * @param {object} opts  { site, engineer }
 * @returns {Promise<Buffer>}
 */
const buildMaterialPeriodPdf = (data, opts = {}) => renderPdf((doc) => {
  const { rollup, purchases, usages, vendors, totals, period } = data;

  // Filters are printed in the subtitle so a printed report is self-describing.
  const scope = [
    period.label,
    data.materialFilter ? `Material: ${data.materialFilter}` : null,
    data.vendorFilter ? `Vendor: ${data.vendorFilter}` : null,
  ].filter(Boolean).join('   |   ');

  let y = drawHeader(doc, {
    title: titleFor(period.type),
    subtitle: scope,
    site: opts.site || data.site,
    engineer: opts.engineer,
    generatedOn: d(data.generatedAt),
  });

  // ---- Material summary --------------------------------------------------
  y = section(doc, 'Material Summary', y);
  y = table(doc, {
    y,
    empty: 'No material activity recorded for the selected period.',
    columns: [
      { label: 'Material', w: 0.26 },
      { label: 'Unit', w: 0.10 },
      { label: 'Purchased Qty', w: 0.16, align: 'right' },
      { label: 'Used Qty', w: 0.14, align: 'right' },
      { label: 'Balance Qty', w: 0.15, align: 'right' },
      { label: 'Purchase Amount', w: 0.19, align: 'right' },
    ],
    rows: rollup.map((r) => [
      clip(r.name, 30),
      r.unit || '-',
      qty(r.purchased),
      r.used ? qty(r.used) : '-',
      r.balanceAvailable ? qty(r.balance) : 'Not available',
      inr(r.amount),
    ]),
  });
  y = totalRow(doc, y + 8, [
    ['Total Purchase Amount', inr(totals.totalPurchaseAmount)],
    ['Paid / Outstanding', `${inr(totals.totalPaid)}  /  ${inr(totals.totalPending)}`],
  ]);
  y += 14;

  // ---- Purchase details --------------------------------------------------
  y = section(doc, 'Purchase Details', y);
  y = table(doc, {
    y,
    empty: 'No purchases were made in the selected period.',
    columns: purchaseColumns(),
    rows: purchaseRows(purchases),
  });
  y = totalRow(doc, y + 8, [['Total Purchase Amount', inr(totals.totalPurchaseAmount)]]);
  y += 14;

  // ---- Usage details -----------------------------------------------------
  y = section(doc, 'Usage Details', y);
  y = table(doc, {
    y,
    empty: 'No material usage was recorded in the selected period.',
    columns: usageColumns(),
    rows: usageRows(usages),
  });
  if (usages.length) {
    y = totalRow(doc, y + 8, [['Total Quantity Used', qty(totals.totalQuantityUsed)]]);
  }
  y += 14;

  // ---- Vendor summary ----------------------------------------------------
  y = section(doc, 'Vendor Purchase Summary', y);
  y = table(doc, {
    y,
    empty: 'No vendor purchases in the selected period.',
    columns: [
      { label: 'Vendor', w: 0.32 },
      { label: 'Material', w: 0.24 },
      { label: 'Quantity', w: 0.20, align: 'right' },
      { label: 'Amount', w: 0.24, align: 'right' },
    ],
    rows: vendors.flatMap((v) => v.rows.map((r) => [
      clip(v.vendor, 32), r.material, qty(r.quantity, r.unit), inr(r.amount),
    ])),
  });
  y = totalRow(doc, y + 8, vendors.map((v) => [`Total - ${clip(v.vendor, 40)}`, inr(v.amount)]));

  // ---- Grand total -------------------------------------------------------
  y += 16;
  if (y < 660) {
    y = section(doc, 'Total Summary', y);
    y = totalRow(doc, y, [
      ['Total Purchase Amount', inr(totals.totalPurchaseAmount)],
      ['Total Materials Purchased', qty(totals.totalQuantityPurchased)],
      ['Total Materials Used', totals.totalQuantityUsed ? qty(totals.totalQuantityUsed) : 'None recorded'],
      ['Balance', totals.balanceAvailable
        ? qty(totals.totalBalance)
        : 'Balance not available (insufficient comparable data)'],
    ]);

    doc.font(F.italic).fontSize(7.2).fillColor(COLORS.muted)
      .text(
        'Balance is only calculated where purchased and consumed quantities share a compatible '
        + 'unit. Where they do not, the report states "Balance not available" rather than '
        + 'showing a figure that would be misleading.',
        MARGIN, y + 10, { width: CONTENT_W, height: 24, lineBreak: true },
      );
  }

  paintFooter(doc, titleFor(period.type));
});

module.exports = { buildMaterialPeriodPdf, titleFor };
