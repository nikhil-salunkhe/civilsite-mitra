const PDFDocument = require('pdfkit');
const { formatIndianNumber, formatDate } = require('../utils/format');

/**
 * ---------------------------------------------------------------------------
 * Professional A4 "SITE PROJECT REPORT"
 * ---------------------------------------------------------------------------
 * Design notes:
 *  - PDFKit's built-in Helvetica font uses WinAnsi encoding, which does NOT
 *    include the rupee glyph (U+20B9). Rendering it would produce garbage, so
 *    currency is shown as "Rs. 12,34,567" (Indian digit grouping).
 *  - The layout avoids nested boxes: it uses section headings, hairline rules
 *    and aligned tables, like a real construction financial statement.
 */

const PAGE = { size: 'A4', margin: 38, layout: 'portrait' };
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = 595.28 - PAGE.margin * 2;

const COLORS = {
  primary: '#1d4ed8',
  navy: '#0f172a',
  text: '#1e293b',
  muted: '#64748b',
  band: '#f1f5f9',
  line: '#e2e8f0',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
};

/**
 * Renders the report and returns the PDFKit document (a readable stream).
 * @param {object} data site, summary, engineer, installments, payments, workers,
 *   workerPayments, materials, vendors, vendorPayments, expenses, activities
 */
const buildSiteReportPdf = (data) => {
  const {
    site,
    summary,
    engineer,
    installments = [],
    payments = [],
    workers = [],
    workerPayments = [],
    materials = [],
    vendors = [],
    expenses = [],
    activities = [],
    generatedAt = new Date(),
  } = data;

  const doc = new PDFDocument({
    ...PAGE,
    bufferPages: true,
    info: {
      Title: `Site Project Report - ${site.siteName}`,
      Author: 'CivilSiteMitra',
      Subject: 'Construction Site Financial Report',
      Creator: 'CivilSiteMitra by TechMitra Technology',
    },
  });

  let y = PAGE.margin;
  doc.on('pageAdded', () => { y = PAGE.margin; });

  const ensureSpace = (height) => {
    if (y + height > PAGE_HEIGHT - PAGE.margin - 26) doc.addPage();
  };

  const sectionTitle = (label) => {
    ensureSpace(32);
    y += 9;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primary)
      .text(label.toUpperCase(), PAGE.margin, y, { width: CONTENT_WIDTH, characterSpacing: 0.6 });
    y += 13;
    doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + CONTENT_WIDTH, y)
      .lineWidth(0.8).strokeColor(COLORS.primary).stroke();
    y += 7;
  };

  /** Two-column label/value table. Accepts [[label, value], ...] */
  const pairRows = (rows, { labelWidth = 92, columns = 2 } = {}) => {
    const colWidth = CONTENT_WIDTH / columns;
    const valueWidth = colWidth - labelWidth - 12;

    for (let i = 0; i < rows.length; i += columns) {
      const slice = rows.slice(i, i + columns);
      const heights = slice.map(([label, value]) => {
        doc.font('Helvetica-Bold').fontSize(9);
        const lh = doc.heightOfString(String(label), { width: labelWidth });
        doc.font('Helvetica').fontSize(9);
        const vh = doc.heightOfString(String(value ?? '-'), { width: valueWidth });
        return Math.max(lh, vh) + 3;
      });
      const rowHeight = Math.max(...heights, 13);
      ensureSpace(rowHeight + 4);

      slice.forEach(([label, value], index) => {
        const x = PAGE.margin + index * colWidth;
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted)
          .text(String(label), x, y, { width: labelWidth });
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
          .text(String(value ?? '-'), x + labelWidth, y, { width: valueWidth });
      });

      y += rowHeight;
    }
  };

  /** Data table. `meta` entries: { w, align, bold, color } */
  const table = (headers, rows, meta) => {
    const headerHeight = 15;
    ensureSpace(headerHeight + 22);

    doc.rect(PAGE.margin, y, CONTENT_WIDTH, headerHeight).fill(COLORS.band);
    doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLORS.navy);

    let x = PAGE.margin + 5;
    headers.forEach((header, index) => {
      doc.text(String(header).toUpperCase(), x, y + 4.5, {
        width: meta[index].w - 6,
        align: meta[index].align || 'left',
        lineBreak: false,
      });
      x += meta[index].w;
    });

    y += headerHeight;

    if (rows.length === 0) {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text('No records available.', PAGE.margin + 5, y + 4);
      y += 17;
      return;
    }

    rows.forEach((row, rowIndex) => {
      const rowHeight = 14;
      ensureSpace(rowHeight);

      if (rowIndex % 2 === 1) {
        doc.rect(PAGE.margin, y, CONTENT_WIDTH, rowHeight).fill('#fafcff');
      }

      x = PAGE.margin + 5;
      row.forEach((cell, index) => {
        doc.font(meta[index].bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8)
          .fillColor(meta[index].color || COLORS.text)
          .text(String(cell ?? '-'), x, y + 3.5, {
            width: meta[index].w - 6,
            align: meta[index].align || 'left',
            lineBreak: false,
            ellipsis: true,
          });
        x += meta[index].w;
      });

      y += rowHeight;
      doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + CONTENT_WIDTH, y)
        .lineWidth(0.4).strokeColor(COLORS.line).stroke();
    });
  };

  /** Rs. 12,34,567 - PDFKit's Helvetica cannot render the rupee glyph. */
  const money = (value) => `Rs. ${formatIndianNumber(value)}`;

  /** Full-width highlighted total line. */
  const totalsRow = (label, value, { color = COLORS.navy } = {}) => {
    ensureSpace(18);
    doc.rect(PAGE.margin, y, CONTENT_WIDTH, 16).fill('#eef4ff');
    doc.font('Helvetica-Bold').fontSize(8.6).fillColor(color)
      .text(label, PAGE.margin + 5, y + 4, { width: CONTENT_WIDTH * 0.68, lineBreak: false })
      .text(money(value), PAGE.margin + CONTENT_WIDTH * 0.68, y + 4, {
        width: CONTENT_WIDTH * 0.32 - 5,
        align: 'right',
      });
    y += 16;
  };


  // ======================================================== HEADER BAND
  doc.rect(0, 0, 595.28, 62).fill(COLORS.primary);
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff')
    .text('CivilSiteMitra', PAGE.margin, 15, { lineBreak: false });
  doc.font('Helvetica').fontSize(7.5).fillColor('#c7d7fe')
    .text('Build Better  |  Manage Smarter', PAGE.margin, 37, { lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff')
    .text('SITE PROJECT REPORT', PAGE.margin, 21, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(7.5).fillColor('#c7d7fe')
    .text(`Generated: ${formatDate(generatedAt)}`, PAGE.margin, 39, {
      width: CONTENT_WIDTH, align: 'right', lineBreak: false,
    });

  y = 74;

  // ================================================ PROJECT INFORMATION
  sectionTitle('Project Information');
  pairRows([
    ['Site', site.siteName],
    ['Owner', site.ownerName],
    ['Location', [site.city, site.state].filter(Boolean).join(', ') || site.address],
    ['Engineer', engineer?.name || site.engineerName || '-'],
    ['Start Date', formatDate(site.startDate)],
    ['Expected Completion', formatDate(site.expectedCompletionDate)],
    ['Area', `${formatIndianNumber(site.totalArea)} ${site.areaUnit || 'Sq.Ft'}`],
    [`Rate / ${site.areaUnit || 'Sq.Ft'}`, money(site.ratePerArea)],
    ['Status', site.status],
    ['Progress', `${summary.progress?.overall ?? 0}%`],
  ]);

  // ================================================== FINANCIAL SUMMARY
  sectionTitle('Financial Summary');
  table(
    ['Particulars', 'Amount'],
    [
      ['Project Value', money(summary.projectValue)],
      ['Amount Received', money(summary.totalReceived)],
      ['Pending Receivable', money(summary.pendingReceivable)],
      ['Total Investment', money(summary.totalInvestment)],
    ],
    [
      { w: CONTENT_WIDTH - 120 },
      { w: 120, align: 'right' },
    ]
  );
  totalsRow(
    summary.estimatedProfit >= 0 ? 'Estimated Profit' : 'Estimated Loss',
    summary.estimatedProfit,
    { color: summary.estimatedProfit >= 0 ? COLORS.success : COLORS.danger }
  );
  pairRows([
    ['Profit Margin', `${summary.profitMargin ?? 0}%`],
    ['Cash Paid Out', money(summary.totalPaid)],
    ['Outstanding Payable', money(summary.outstandingPayable)],
    ['Realized (Cash) Profit', money(summary.realizedProfit)],
  ]);

  // =============================================== INVESTMENT BREAKDOWN
  sectionTitle('Investment Breakdown');
  const buckets = summary.breakdown || {};
  table(
    ['Head', 'Committed', 'Paid', 'Pending'],
    [
      ['Materials', money(buckets.materials?.committed), money(buckets.materials?.paid), money(buckets.materials?.pending)],
      ['Workers', money(buckets.workers?.committed), money(buckets.workers?.paid), money(buckets.workers?.pending)],
      ['Vendors (unlinked)', money(buckets.vendors?.committed), money(buckets.vendors?.paid), money(buckets.vendors?.pending)],
      ['Other Expenses', money(buckets.otherExpenses?.committed), money(buckets.otherExpenses?.paid), money(buckets.otherExpenses?.pending)],
    ],
    [
      { w: CONTENT_WIDTH - 285 },
      { w: 95, align: 'right' },
      { w: 95, align: 'right' },
      { w: 95, align: 'right' },
    ]
  );
  totalsRow('Total Investment (committed)', summary.totalInvestment);

  // ==================================================== PAYMENT STATUS
  sectionTitle('Payment Status');
  table(
    ['#', 'Installment', 'Due Date', 'Amount', 'Received', 'Balance', 'Status'],
    installments.map((item, index) => [
      index + 1,
      item.name,
      formatDate(item.dueDate),
      money(item.amount),
      money(item.paidAmount),
      money(item.pendingAmount),
      item.status,
    ]),
    [
      { w: 22, align: 'center' },
      { w: 118 },
      { w: 78 },
      { w: 88, align: 'right' },
      { w: 88, align: 'right' },
      { w: 80, align: 'right' },
      { w: 38, align: 'right', bold: true },
    ]
  );

  if (payments.length > 0) {
    y += 4;
    pairRows(
      [
        ['Installment Plan Total', money(summary.installmentAgreed)],
        ['Payments Recorded', `${payments.length} entries`],
      ],
      { columns: 2 }
    );
  }

  // =========================================================== PROGRESS
  sectionTitle('Progress');
  const stages = summary.progress?.stages || {};
  const stageRows = [
    ['Foundation', stages.foundation],
    ['Plinth', stages.plinth],
    ['Structure', stages.structure],
    ['Brickwork', stages.brickwork],
    ['Electrical', stages.electrical],
    ['Plumbing', stages.plumbing],
    ['Flooring', stages.flooring],
    ['Painting', stages.painting],
    ['Finishing', stages.finishing],
  ].map(([label, value]) => [label, `${value || 0}%`]);

  table(
    ['Stage', 'Completion'],
    stageRows,
    [{ w: CONTENT_WIDTH - 90 }, { w: 90, align: 'right', bold: true }]
  );

  y += 3;
  ensureSpace(26);
  // Horizontal progress bar
  const barWidth = CONTENT_WIDTH;
  doc.rect(PAGE.margin, y, barWidth, 11).fill('#e2e8f0');
  const pct = Math.min(100, Math.max(0, summary.progress?.overall || 0));
  doc.rect(PAGE.margin, y, (barWidth * pct) / 100, 11).fill(COLORS.primary);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.text)
    .text(`Overall Project Progress: ${pct}%`, PAGE.margin, y + 15, { width: CONTENT_WIDTH, lineBreak: false });
  y += 30;


  // ======================================================== LABOUR / MEN
  sectionTitle('Labour Summary');
  pairRows(
    [
      ['Total Workers', workers.length],
      ['Contract Workers', workers.filter((w) => w.isContractWorker).length],
      ['Labour Cost (committed)', money(summary.workerCost)],
      ['Labour Paid', money(summary.breakdown?.workers?.paid)],
    ],
    { columns: 2 }
  );
  if (workerPayments.length > 0) {
    table(
      ['Date', 'Worker', 'Days', 'Total', 'Paid', 'Balance'],
      workerPayments.slice(0, 12).map((pay) => [
        formatDate(pay.date),
        pay.worker?.name || '-',
        pay.workDays,
        money(pay.totalAmount),
        money(pay.paidAmount),
        money(pay.pendingAmount),
      ]),
      [
        { w: 70 },
        { w: 142 },
        { w: 42, align: 'right' },
        { w: 100, align: 'right' },
        { w: 100, align: 'right' },
        { w: 87, align: 'right' },
      ]
    );
    if (workerPayments.length > 12) {
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(COLORS.muted)
        .text(`Showing latest 12 of ${workerPayments.length} labour payment entries.`, PAGE.margin, y + 3);
      y += 16;
    }
  }

  // ==================================================== MATERIALSUMMARY
  sectionTitle('Material Summary');
  table(
    ['Date', 'Material', 'Category', 'Qty', 'Rate', 'Total', 'Paid', 'Pending'],
    materials.slice(0, 14).map((mat) => [
      formatDate(mat.purchaseDate),
      mat.name,
      mat.category,
      `${formatIndianNumber(mat.quantity)} ${mat.unit || ''}`.trim(),
      money(mat.rate),
      money(mat.totalAmount),
      money(mat.paidAmount),
      money(mat.pendingAmount),
    ]),
    [
      { w: 62 },
      { w: 112 },
      { w: 72 },
      { w: 72 },
      { w: 66, align: 'right' },
      { w: 84, align: 'right' },
      { w: 76, align: 'right' },
      { w: 59, align: 'right' },
    ]
  );
  if (materials.length > 14) {
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(COLORS.muted)
      .text(`Showing latest 14 of ${materials.length} material entries.`, PAGE.margin, y + 3);
    y += 16;
  }

  // ====================================================== VENDOR SUMMARY
  sectionTitle('Vendor Summary');
  table(
    ['Vendor', 'Mobile', 'Category', 'Purchases'],
    vendors.slice(0, 12).map((vendor) => {
      const vendorMaterials = materials.filter((m) => String(m.vendor) === String(vendor._id));
      const total = vendorMaterials.reduce((acc, m) => acc + (Number(m.totalAmount) || 0), 0);
      return [vendor.name, vendor.mobile || '-', vendor.materialCategory || '-', money(total)];
    }),
    [
      { w: CONTENT_WIDTH - 300 },
      { w: 110 },
      { w: 110 },
      { w: 80, align: 'right' },
    ]
  );

  // ===================================================== EXPENSE SUMMARY
  sectionTitle('Other Expense Summary');
  table(
    ['Date', 'Category', 'Description', 'Amount', 'Paid', 'Status'],
    expenses.slice(0, 12).map((exp) => [
      formatDate(exp.expenseDate),
      exp.category,
      exp.description,
      money(exp.amount),
      money(exp.paidAmount),
      exp.paymentStatus,
    ]),
    [
      { w: 62 },
      { w: 100 },
      { w: 145 },
      { w: 84, align: 'right' },
      { w: 84, align: 'right' },
      { w: 60, align: 'right' },
    ]
  );

  // ================================================== SITE ACTIVITY LOG
  if (activities.length > 0) {
    sectionTitle('Recent Site Activity');
    table(
      ['Date', 'Work Description', 'Workers', 'Expense'],
      activities.slice(0, 8).map((act) => [
        formatDate(act.date),
        act.workDescription,
        act.workersPresent,
        money(act.todayExpense),
      ]),
      [
        { w: 70 },
        { w: CONTENT_WIDTH - 220 },
        { w: 60, align: 'right' },
        { w: 90, align: 'right' },
      ]
    );
  }

  // ============================================================== FOOTER
  ensureSpace(40);
  y += 8;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + CONTENT_WIDTH, y)
    .lineWidth(0.6).strokeColor(COLORS.line).stroke();
  y += 6;
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
    .text(
      'Estimated figures are based on records entered in CivilSiteMitra and are provisional until the project is completed and all costs are finalized.',
      PAGE.margin, y, { width: CONTENT_WIDTH }
    );
  y += 18;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.primary)
    .text('CivilSiteMitra', PAGE.margin, y, { width: CONTENT_WIDTH * 0.5, lineBreak: false });
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
    .text('Generated by CivilSiteMitra  |  TechMitra Technology', PAGE.margin + CONTENT_WIDTH * 0.5, y, {
      width: CONTENT_WIDTH * 0.5, align: 'right', lineBreak: false,
    });

  // Page numbers (kept at the bottom of every page)
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
      .text(`Page ${i + 1} of ${range.count}`, PAGE.margin, PAGE_HEIGHT - 26, {
        width: CONTENT_WIDTH, align: 'center', lineBreak: false,
      });
  }

  doc.end();
  return doc;
};

module.exports = { buildSiteReportPdf };

