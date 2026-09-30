const PDFDocument = require('pdfkit');
const { formatIndianNumber, formatDate } = require('../utils/format');

/**
 * ---------------------------------------------------------------------------
 * Consolidated (admin) project report PDF
 * ---------------------------------------------------------------------------
 * A single portfolio-level statement: filters applied, headline totals, the
 * site-status breakdown and the per-engineer breakdown.
 *
 * Like the site report, currency is written as "Rs. 12,34,567" - PDFKit's
 * built-in Helvetica (WinAnsi) has no rupee glyph.
 */

const PAGE = { size: 'A4', margin: 38, layout: 'portrait' };
const PAGE_HEIGHT = 841.89;
const MARGIN = PAGE.margin;
const CONTENT_WIDTH = 595.28 - MARGIN * 2;

const COLORS = {
  primary: '#1d4ed8',
  navy: '#0f172a',
  text: '#1e293b',
  muted: '#64748b',
  band: '#f1f5f9',
  line: '#e2e8f0',
  success: '#15803d',
  danger: '#b91c1c',
};

const money = (value) => `Rs. ${formatIndianNumber(Math.round(Number(value) || 0))}`;

/** Draws a thin divider line at the current y. */
const rule = (doc, color = COLORS.line) => {
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).lineWidth(0.7).strokeColor(color).stroke();
};

/** Section heading with a hairline rule underneath. */
const section = (doc, title) => {
  doc.moveDown(0.8);
  doc.fillColor(COLORS.primary).fontSize(10.5).font('Helvetica-Bold').text(title.toUpperCase());
  doc.moveDown(0.25);
  rule(doc);
  doc.moveDown(0.45);
};

/** Starts a new page when the next block would not fit. */
const ensureSpace = (doc, needed) => {
  if (doc.y + needed > PAGE_HEIGHT - MARGIN - 30) {
    doc.addPage();
  }
};

/**
 * Renders a table. `widths` are fractions of the content width; the last column
 * absorbs the rounding remainder so columns always align to the right edge.
 */
const table = (doc, columns, rows) => {
  const widths = columns.map((c) => (c.w || 1) / columns.reduce((sum, col) => sum + (col.w || 1), 0));
  const xFor = (index) => MARGIN + widths.slice(0, index).reduce((sum, w) => sum + w * CONTENT_WIDTH, 0);
  const colWidth = (index) => widths[index] * CONTENT_WIDTH;

  const drawRow = (values, opts = {}) => {
    const rowHeight = 17;
    const y = doc.y;
    if (opts.band) {
      doc.rect(MARGIN, y - 3, CONTENT_WIDTH, rowHeight).fill(COLORS.band);
    }
    values.forEach((value, index) => {
      const col = columns[index];
      doc
        .fillColor(opts.header ? '#ffffff' : COLORS.text)
        .font(opts.header || opts.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.6)
        .text(String(value ?? ''), xFor(index) + (opts.header ? 4 : 0), y, {
          width: colWidth(index) - (opts.header ? 8 : 4),
          align: col.align || 'left',
          lineBreak: false,
        });
    });
    doc.y = y + rowHeight;
  };

  // Header band
  const headerY = doc.y;
  doc.rect(MARGIN, headerY - 3, CONTENT_WIDTH, 17).fill(COLORS.primary);
  drawRow(
    columns.map((c) => c.label),
    { header: true }
  );

  rows.forEach((row, index) => {
    ensureSpace(doc, 24);
    drawRow(
      columns.map((c) => (c.render ? c.render(row) : row[c.key])),
      { band: index % 2 === 1 }
    );
  });

  doc.moveDown(0.2);
  rule(doc);
  doc.moveDown(0.4);
};

/**
 * Builds the PDF and returns the PDFKit document (a readable stream).
 * @param {object} payload { filters, totals, sitesByStatus, engineers, engineersTotal, generatedAt }
 */
const buildAdminReportPdf = (payload) => {
  const {
    filters = {},
    totals = {},
    sitesByStatus = [],
    engineers = [],
    engineersTotal = 0,
    generatedAt = new Date(),
  } = payload;

  const doc = new PDFDocument({
    ...PAGE,
    bufferPages: true,
    info: {
      Title: 'Consolidated Project Report',
      Author: 'CivilSiteMitra',
      Subject: 'System-wide construction portfolio report',
      Creator: 'CivilSiteMitra by TechMitra Technology',
      CreationDate: generatedAt,
    },
  });

  // ---- Letterhead --------------------------------------------------------
  doc.rect(0, 0, 595.28, 92).fill(COLORS.primary);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('CivilSiteMitra', MARGIN, 30);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#dbeafe')
    .text('Construction Project Management', MARGIN, 56);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#ffffff')
    .text('CONSOLIDATED PROJECT REPORT', MARGIN, 34, { width: CONTENT_WIDTH, align: 'right' });

  doc.y = 108;

  // ---- Applied filters ---------------------------------------------------
  const filterItems = [];
  if (filters.from) filterItems.push(`From ${formatDate(filters.from)}`);
  if (filters.to) filterItems.push(`To ${formatDate(filters.to)}`);
  if (filters.status) filterItems.push(`Status ${filters.status}`);
  if (filters.engineerName) filterItems.push(`Engineer ${filters.engineerName}`);

  doc
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .fontSize(8.8)
    .text(filterItems.length ? `Filters — ${filterItems.join('   •   ')}` : 'Filters — none (all records)');
  doc
    .fontSize(8)
    .text(
      `Generated ${formatDate(generatedAt)} ${new Date(generatedAt).toLocaleTimeString('en-IN')}   •   ${engineersTotal} engineer account(s)`
    );

  // ---- Portfolio totals --------------------------------------------------
  section(doc, 'Portfolio summary');
  const cards = [
    ['Total Project Value', money(totals.projectValue)],
    ['Total Received', money(totals.totalReceived)],
    ['Pending Receivable', money(totals.pendingReceivable)],
    ['Total Investment', money(totals.totalInvestment)],
    ['Outstanding Payable', money(totals.outstandingPayable)],
    ['Estimated Profit', money(totals.estimatedProfit)],
  ];
  const totalRows = [];
  for (let i = 0; i < cards.length; i += 2) {
    totalRows.push({
      a: cards[i][0],
      b: cards[i][1],
      c: cards[i + 1] ? cards[i + 1][0] : '',
      d: cards[i + 1] ? cards[i + 1][1] : '',
    });
  }
  table(
    doc,
    [
      { label: 'Metric', key: 'a', w: 1.5 },
      { label: 'Amount', key: 'b', w: 1, align: 'right' },
      { label: 'Metric', key: 'c', w: 1.5 },
      { label: 'Amount', key: 'd', w: 1, align: 'right' },
    ],
    totalRows
  );

  // ---- Sites by status ---------------------------------------------------
  section(doc, 'Sites by status');
  if (sitesByStatus.length === 0) {
    doc.fillColor(COLORS.muted).fontSize(9).text('No sites match the selected filters.');
  } else {
    table(
      doc,
      [
        { label: 'Status', key: 'status', w: 1.4 },
        { label: 'Sites', key: 'count', w: 0.7, align: 'right' },
        { label: 'Project Value', key: 'projectValue', w: 1.3, align: 'right', render: (r) => money(r.projectValue) },
      ],
      sitesByStatus
    );
  }

  // ---- Engineer breakdown ------------------------------------------------
  section(doc, 'Engineer breakdown');
  if (engineers.length === 0) {
    doc.fillColor(COLORS.muted).fontSize(9).text('No engineer data available.');
  } else {
    table(
      doc,
      [
        { label: 'Engineer', key: 'name', w: 1.8 },
        { label: 'Company', key: 'company', w: 1.4 },
        { label: 'Account', key: 'status', w: 0.9 },
        { label: 'Sites', key: 'siteCount', w: 0.6, align: 'right' },
        { label: 'Running', key: 'running', w: 0.7, align: 'right' },
        { label: 'Done', key: 'completed', w: 0.6, align: 'right' },
        { label: 'Project Value', key: 'projectValue', w: 1.4, align: 'right', render: (r) => money(r.projectValue) },
      ],
      engineers
    );
  }

  // ---- Footers (page numbers) -------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(
        `CivilSiteMitra — Consolidated Project Report    •    Page ${i + 1} of ${range.count}`,
        MARGIN,
        PAGE_HEIGHT - MARGIN - 8,
        { width: CONTENT_WIDTH, align: 'center' }
      );
  }

  doc.flushPages();
  return doc;
};

module.exports = { buildAdminReportPdf };
