const PDFDocument = require('pdfkit');
const { formatIndianNumber, formatDate, formatDateTime } = require('../utils/format');
const { SITE_REPORT_SECTIONS, REPORT_DISCLAIMER } = require('./reportSchema');
const { buildReportMeta } = require('../services/reportService');

/**
 * ---------------------------------------------------------------------------
 * SITE PROJECT REPORT - A4 professional construction document
 * ---------------------------------------------------------------------------
 * Why this file is written the way it is (each rule prevents a blank page):
 *
 *  1. Every drawing helper reserves space FIRST (`need(h)`) and then draws at
 *     an explicit y. Nothing is ever drawn at a stale cursor.
 *  2. Every `doc.text()` call receives an explicit `height`. Without a height
 *     PDFKit auto-flows long text onto a new page by itself, our manual cursor
 *     goes stale, later content lands below the printable area, and the next
 *     `addPage()` produces a page that looks blank. That was the original bug.
 *  3. `need()` never stacks page breaks - an empty page is reused instead of
 *     adding another one.
 *  4. Empty sections are skipped entirely: no heading, no table header, and no
 *     "No records available" filler.
 *  5. Table headers repeat on every continuation page and can never be orphaned.
 *  6. The running header/footer (page numbers) are painted over the buffered
 *     pages at the very end, so they can never shift the flow.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const TOP = 48;                       // first usable y on continuation pages
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 58;           // keep the footer band clear

const COLORS = {
  primary: '#1d4ed8',
  primarySoft: '#eef4ff',
  navy: '#0f172a',
  text: '#1e293b',
  muted: '#64748b',
  band: '#eef2f7',
  stripe: '#f8fafc',
  line: '#d7dee8',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
};

const F = { bold: 'Helvetica-Bold', normal: 'Helvetica', italic: 'Helvetica-Oblique' };

/**
 * Vendor identity printed in the footer of every generated report, so a client
 * who receives the PDF knows who produced it and how to reach them.
 * Override with the VENDOR_* environment variables if the details change.
 */
const COMPANY = {
  name: process.env.VENDOR_NAME || 'TechMitra Technology',
  phone: process.env.VENDOR_PHONE || '9764149564',
  email: process.env.VENDOR_EMAIL || 'techmitroofficial@gmail.com',
  website: process.env.VENDOR_WEBSITE || 'www.techmitr.in',
};

// Helvetica (WinAnsi) has no rupee glyph, hence "Rs." - see utils/format notes.
const money = (value) => `Rs. ${formatIndianNumber(value)}`;
const plain = (value, suffix = '') => `${formatIndianNumber(value)}${suffix}`;
/**
 * Blank cells must render as blank - table sub-totals rely on `''` staying empty.
 * Only genuinely missing values (null/undefined) become the not-recorded dash.
 */
const dash = (value) => (value === null || value === undefined ? '-' : String(value));

/**
 * Latest recorded purchase rate for a material, matched on name and - when both
 * rows carry one - on unit. `materials` arrives sorted newest-first from
 * assembleSiteReportData(), so the first match is the current rate. Returns 0
 * when the material was never purchased, so a stock row still renders instead
 * of throwing on an undefined rate.
 */
const safeRate = (materials, name, unit) => {
  const target = String(name || '').trim().toLowerCase();
  const unitTarget = String(unit || '').trim().toLowerCase();
  const match = (Array.isArray(materials) ? materials : []).find((m) => {
    if (String(m.name || '').trim().toLowerCase() !== target) return false;
    if (!unitTarget) return true;
    const rowUnit = String(m.unit || '').trim().toLowerCase();
    return !rowUnit || rowUnit === unitTarget;
  });
  return Number(match?.rate) || 0;
};

/** Converts a stored byte size into a compact human-readable string. */
const bytes = (value) => {
  const size = Number(value) || 0;
  if (size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * @param {object} data output of assembleSiteReportData()
 * @returns {PDFDocument} a readable stream, already finalised
 */
const buildSiteReportPdf = (data) => {
  const {
    site,
    summary = {},
    engineer = {},
    installments = [],
    payments = [],
    workers = [],
    workerPayments = [],
    attendanceSummary = [],
    attendanceTotals = { records: 0, present: 0, halfDay: 0, absent: 0, earned: 0 },
    materials = [],
    materialUsage = [],
    materialStock = [],
    vendors = [],
    vendorPayments = [],
    expenses = [],
    activities = [],
    documents = [],
    progress = null,
    overallProgress = 0,
    generatedAt = new Date(),
  } = data;

  const generated = new Date(generatedAt);
  const idTail = String(site?._id || '0000').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  const reportNo = `CSM-${generated.getFullYear()}-${idTail.padStart(4, '0')}`;

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `Site Project Report - ${site.siteName}`,
      Author: engineer.company || 'CivilSiteMitra',
      Subject: 'Construction Site Financial and Progress Report',
      Creator: 'CivilSiteMitra',
    },
  });

  let y = TOP;
  let inked = false;                 // has anything been drawn on this page?
  doc.on('pageAdded', () => {
    y = TOP;
    inked = false;
  });

  /** Reserves `h` points, moving to a fresh page only when this one has ink. */
  const need = (h) => {
    if (inked && y + h > BOTTOM) doc.addPage();
  };

  /** One clipped line. Cannot overflow, therefore cannot auto-paginate. */
  const line = (text, x, at, opts = {}) => {
    const {
      font = F.normal,
      size = 8,
      color = COLORS.text,
      width = CONTENT_W,
      align = 'left',
    } = opts;
    doc.font(font).fontSize(size).fillColor(color).text(dash(text), x, at, {
      width,
      height: size + 3,
      align,
      ellipsis: true,
      lineBreak: true,
    });
    inked = true;
  };

  /** A measured, clipped paragraph. */
  const para = (text, opts = {}) => {
    const {
      font = F.normal,
      size = 8,
      color = COLORS.text,
      width = CONTENT_W,
      gap = 0,
      maxLines = 3,
    } = opts;
    const value = dash(text);
    doc.font(font).fontSize(size);
    const cap = (size + 3) * maxLines;
    const wanted = Math.min(doc.heightOfString(value, { width }), cap);
    need(wanted + gap);
    y += gap;
    doc.font(font).fontSize(size).fillColor(color).text(value, MARGIN, y, {
      width,
      height: wanted,
      ellipsis: '...',
    });
    y += wanted;
    inked = true;
  };

  const rule = (color = COLORS.line, width = 0.6, gap = 4) => {
    need(gap + 2);
    y += gap;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
      .lineWidth(width).strokeColor(color).stroke();
    y += 2;
    inked = true;
  };

  /**
   * Numbered section heading. The numbers come from reportSchema (single
   * source). Front-matter blocks pass `null` and print an unnumbered heading.
   */
  const section = (no, title) => {
    need(34);
    y += 10;
    doc.rect(MARGIN, y - 1, 3, 11).fill(COLORS.primary);
    line(`${no ? `${no}.  ` : ''}${String(title).toUpperCase()}`, MARGIN + 8, y, {
      font: F.bold, size: 9, color: COLORS.primary,
    });
    y += 13;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
      .lineWidth(0.8).strokeColor(COLORS.primary).stroke();
    y += 6;
    inked = true;
  };

  /** Proportional column widths so every table always spans the full width. */
  const cols = (specs) => {
    const total = specs.reduce((acc, spec) => acc + spec[0], 0);
    return specs.map(([weight, label, align = 'left']) => ({
      label,
      align,
      w: (weight / total) * CONTENT_W,
    }));
  };

  const ROW_H = 13.4;
  const HEAD_H = 14.5;

  /**
   * A register table.
   *  - every cell is a clipped single line, so no cell can auto-paginate
   *  - the header repeats on each continuation page
   *  - the header can never be left alone at the foot of a page (need() reserves
   *    header + one row before it is drawn)
   */
  const table = (columns, rows, opts = {}) => {
    const { totals = null, note = null } = opts;

    const drawHead = (continued) => {
      need(HEAD_H + ROW_H);
      doc.rect(MARGIN, y, CONTENT_W, HEAD_H).fill(COLORS.band);
      let x = MARGIN;
      columns.forEach((col) => {
        doc.font(F.bold).fontSize(7.2).fillColor(COLORS.navy)
          .text(String(col.label).toUpperCase(), x + 4, y + 4, {
            width: col.w - 8,
            height: 10,
            align: col.align,
            ellipsis: true,
            lineBreak: false,
          });
        x += col.w;
      });
      y += HEAD_H;
      if (continued) rule(COLORS.band, 0.5, 0);
      inked = true;
    };

    drawHead(false);

    rows.forEach((cells, index) => {
      if (y + ROW_H > BOTTOM) {
        doc.addPage();
        drawHead(true);
      }
      if (index % 2 === 1) {
        doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(COLORS.stripe);
      }
      let x = MARGIN;
      cells.forEach((value, cellIndex) => {
        const col = columns[cellIndex];
        if (!col) return;
        const numeric = col.align === 'right';
        line(
          value,
          x + 4,
          y + 3.4,
          {
            font: numeric ? F.normal : F.normal,
            size: 7.8,
            color: COLORS.text,
            width: col.w - 8,
            align: col.align,
          }
        );
        x += col.w;
      });
      y += ROW_H;
      if (y < BOTTOM) {
        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
          .lineWidth(0.3).strokeColor(COLORS.line).stroke();
      }
      inked = true;
    });

    if (Array.isArray(totals)) {
      need(ROW_H + 3);
      doc.rect(MARGIN, y, CONTENT_W, ROW_H + 1).fill(COLORS.band);
      let x = MARGIN;
      totals.forEach((value, cellIndex) => {
        const col = columns[cellIndex];
        if (col) {
          line(value, x + 4, y + 3.4, {
            font: F.bold,
            size: 7.8,
            color: COLORS.navy,
            width: col.w - 8,
            align: col.align,
          });
          x += col.w;
        }
      });
      y += ROW_H + 1;
      inked = true;
    }

    if (note) {
      need(12);
      y += 2;
      line(note, MARGIN, y, { font: F.italic, size: 6.8, color: COLORS.muted });
      y += 9;
    }

    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
      .lineWidth(0.5).strokeColor(COLORS.line).stroke();
    y += 2;
  };

  /** Two-column label/value grid (site particulars, metadata blocks). */
  const kvGrid = (entries, opts = {}) => {
    const { columns = 2, labelRatio = 0.42 } = opts;
    const colW = CONTENT_W / columns;
    const labelW = colW * labelRatio;

    for (let i = 0; i < entries.length; i += columns) {
      const slice = entries.slice(i, i + columns).filter(Boolean);
      if (slice.length === 0) continue;
      const rowH = 14.2;
      need(rowH + 2);
      slice.forEach(([label, value], index) => {
        const x = MARGIN + index * colW;
        line(String(label).toUpperCase(), x, y + 3.6, {
          font: F.bold,
          size: 6.6,
          color: COLORS.muted,
          width: labelW - 6,
        });
        line(value, x + labelW, y + 3, {
          font: F.normal,
          size: 8.4,
          color: COLORS.text,
          width: colW - labelW - 6,
        });
      });
      y += rowH;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
        .lineWidth(0.3).strokeColor(COLORS.line).stroke();
      y += 2;
      inked = true;
    }
  };

  /** Horizontal progress bar with label + percentage. */
  const progressBar = (label, percent) => {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    need(26);
    line(label, MARGIN, y, { font: F.bold, size: 8, color: COLORS.navy, width: CONTENT_W - 60 });
    line(`${value.toFixed(1)}%`, MARGIN + CONTENT_W - 60, y, {
      font: F.bold, size: 8, color: COLORS.primary, width: 60, align: 'right',
    });
    y += 12;
    doc.roundedRect(MARGIN, y, CONTENT_W, 6, 3).fill(COLORS.band);
    if (value > 0) {
      doc.roundedRect(MARGIN, y, Math.max(4, (CONTENT_W * value) / 100), 6, 3).fill(COLORS.success);
    }
    y += 14;
    inked = true;
  };

  // ============================================================ DOCUMENT CONTROL
  const meta = buildReportMeta(data);
  const generatedOn = formatDateTime(generated);
  const fullAddress = [site.address, site.city, site.state, site.pincode]
    .filter(Boolean)
    .join(', ');
  const area = [plain(site.totalArea, ''), site.areaUnit || ''].filter(Boolean).join(' ');
  const statusTone =
    site.status === 'Completed'
      ? COLORS.success
      : site.status === 'On Hold'
        ? COLORS.warning
        : COLORS.primary;

  // ---------------------------------------------------------------- LETTERHEAD
  const letterhead = () => {
    doc.rect(0, 0, PAGE_W, 62).fill(COLORS.navy);
    doc.rect(0, 62, PAGE_W, 2.4).fill(COLORS.primary);
    doc.font(F.bold).fontSize(15).fillColor('#ffffff')
      .text('CivilSiteMitra', MARGIN, 17, { width: CONTENT_W * 0.6, height: 18, lineBreak: false });
    doc.font(F.normal).fontSize(7).fillColor('#c7d2fe')
      .text('CONSTRUCTION PROJECT MANAGEMENT', MARGIN, 37, {
        width: CONTENT_W * 0.6, height: 10, characterSpacing: 0.8, lineBreak: false,
      });
    doc.font(F.bold).fontSize(9).fillColor('#ffffff')
      .text('SITE PROJECT DOSSIER', MARGIN, 18, {
        width: CONTENT_W, height: 12, align: 'right', lineBreak: false,
      });
    doc.font(F.normal).fontSize(7).fillColor('#c7d2fe')
      .text(`Report No. ${reportNo}   |   Generated ${generatedOn}`, MARGIN, 37, {
        width: CONTENT_W, height: 10, align: 'right', lineBreak: false,
      });
    y = 78;
    inked = true;
  };

  /** Four headline figures (used on the cover and as a running summary). */
  const figureStrip = () => {
    const figures = [
      ['Project Value', money(summary.projectValue), COLORS.navy],
      ['Received from Owner', money(summary.totalReceived), COLORS.success],
      ['Total Investment', money(summary.totalInvestment), COLORS.primary],
      ['Estimated Profit', money(summary.estimatedProfit), site.status === 'Completed' ? COLORS.success : COLORS.warning],
    ];
    const boxW = CONTENT_W / 4;
    const boxH = 42;
    need(boxH + 8);
    figures.forEach(([label, value, tone], index) => {
      const x = MARGIN + index * boxW;
      const w = boxW - 6;
      doc.roundedRect(x, y, w, boxH, 4).fill(COLORS.primarySoft);
      doc.roundedRect(x, y, 2.6, boxH, 1).fill(tone);
      doc.font(F.bold).fontSize(6.4).fillColor(COLORS.muted)
        .text(String(label).toUpperCase(), x + 9, y + 8, {
          width: w - 16, height: 9, ellipsis: true, lineBreak: false,
        });
      doc.font(F.bold).fontSize(11).fillColor(tone)
        .text(value, x + 9, y + 21, { width: w - 16, height: 15, ellipsis: true, lineBreak: false });
    });
    y += boxH + 10;
    inked = true;
  };

  // ==================================================================== COVER
  letterhead();

  line(site.siteName, MARGIN, y, { font: F.bold, size: 17, color: COLORS.navy, width: CONTENT_W });
  y += 21;
  line(
    `Construction Project Report  |  ${site.ownerName || 'Owner not recorded'}`,
    MARGIN,
    y,
    { font: F.normal, size: 8.6, color: COLORS.muted, width: CONTENT_W }
  );
  y += 14;
  doc.roundedRect(MARGIN, y, 74, 15, 7.5).fill(statusTone);
  doc.font(F.bold).fontSize(7.4).fillColor('#ffffff')
    .text(String(site.status || 'Active').toUpperCase(), MARGIN + 6, y + 4, {
      width: 62, height: 10, align: 'center', lineBreak: false,
    });
  line(`Overall Progress ${(Number(data.overallProgress) || 0).toFixed(1)}%`, MARGIN + 84, y + 4, {
    font: F.normal, size: 8, color: COLORS.muted, width: CONTENT_W - 84,
  });
  y += 22;
  inked = true;

  figureStrip();

  section(null, 'Document Control');
  kvGrid(
    [
      ['Report No.', reportNo],
      ['Report Date', generatedOn],
      ['Site Code', String(site._id || '').slice(-8).toUpperCase() || '-'],
      ['Record Scope', meta.scope],
      ['Prepared By', engineer.name || site.engineerName || '-'],
      ['Company', engineer.company || '-'],
      ['Contact', [engineer.mobile, engineer.email].filter(Boolean).join('  | ') || '-'],
      ['Total Records', plain(meta.recordCount)],
    ],
    { columns: 2 }
  );

  section(null, 'Site Particulars');
  kvGrid([
    ['Site Name', site.siteName],
    ['Site Status', site.status],
    ['Owner / Client', site.ownerName],
    ['Owner Mobile', site.ownerMobile],
    ['Address', fullAddress || '-'],
    ['City / State', [site.city, site.state].filter(Boolean).join(', ') || '-'],
    ['Total Area', area || '-'],
    ['Rate per Unit', site.ratePerArea ? money(site.ratePerArea) : '-'],
    ['Project Value', money(summary.projectValue)],
    ['Start Date', formatDate(site.startDate)],
    ['Expected Completion', formatDate(site.expectedCompletionDate)],
    ['Overall Progress', `${(Number(data.overallProgress) || 0).toFixed(1)}%`],
  ]);

  // Ground location: coordinates are optional and only shown when captured.
  const lat = site.latitude;
  const lng = site.longitude;
  const hasGeo = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  if (hasGeo) {
    section(null, 'Site Ground Location');
    kvGrid([
      ['Latitude', Number(lat).toFixed(6)],
      ['Longitude', Number(lng).toFixed(6)],
      ['Google Maps', `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`],
      ['Captured On', formatDate(site.locationCapturedAt)],
    ], { columns: 2 });
  }

  // Progress bar for the site (stage-aware percentages live on the site doc).
  progressBar('Overall project progress', data.overallProgress);

  // ============================================================== CONTENTS
  section(null, 'Contents');
  table(
    cols([
      [1.4, 'Section'],
      [8, 'Register / Statement'],
      [2.4, 'Records', 'right'],
    ]),
    SITE_REPORT_SECTIONS.map(([no, , title]) => {
      const entry = meta.sections.find((s) => s.no === no);
      return [
        String(no).padStart(2, '0'),
        title,
        no === 1 ? 'Cover' : plain(entry ? entry.records : 0),
      ];
    })
  );

  // ================================================================= SECTION 1
  // Site particulars are printed in full on the cover page above.
  section(1, 'Site Particulars');
  para(
    'Site particulars, owner details, project value and the ground location of the works are recorded in the "Site Particulars" block on the cover page of this dossier.',
    { size: 8, maxLines: 2, color: COLORS.muted }
  );
  y += 4;

  // ================================================================= SECTION 2
  const s = summary || {};
  const costHeads = [
    ['Material cost', s.materialCost],
    ['Labour / worker cost', s.workerCost],
    ['Vendor cost (not linked to a material)', s.vendorCost],
    ['Other site expenses', s.otherExpenses],
  ];
  const shareOf = (value) =>
    s.totalInvestment ? `${((Number(value) / Number(s.totalInvestment)) * 100).toFixed(1)}%` : '-';
  const margin = Number(s.projectValue)
    ? `${((Number(s.estimatedProfit) / Number(s.projectValue)) * 100).toFixed(2)}%`
    : '-';

  section(2, 'Financial Summary');
  table(
    cols([
      [8, 'Particulars'],
      [3.4, 'Amount (Rs.)', 'right'],
      [2.2, 'Share', 'right'],
    ]),
    [
      ['Project value (area x rate)', money(s.projectValue), '100.0%'],
      ['Amount received from owner', money(s.totalReceived), shareOf(s.totalReceived)],
      ['Pending receivable from owner', money(s.pendingReceivable), '-'],
      ['', '', ''],
      ['INVESTMENT - COMMITTED COST', '', ''],
      ...costHeads.map(([label, value]) => [label, money(value), shareOf(value)]),
      ['', '', ''],
      ['CASH POSITION', '', ''],
      ['Total investment (committed)', money(s.totalInvestment), '100.0%'],
      ['Cash paid against investment', money(s.totalPaid), shareOf(s.totalPaid)],
      ['Outstanding payable', money(s.outstandingPayable), '-'],
    ],
    {
      totals: ['TOTAL INVESTMENT', money(s.totalInvestment), '100.0%'],
      note: `Estimated profit (committed basis): ${money(s.estimatedProfit)}  (${margin} of project value)   |   Profit realised (received minus paid): ${money(s.realizedProfit)}`,
    }
  );

  // ================================================================= SECTION 3
  if (installments.length) {
    const dues = installments.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
    const paid = installments.reduce(
      (acc, i) => acc + (Number(i.paidAmount ?? i.paid) || 0),
      0
    );
    section(3, 'Installment Schedule');
    table(
      cols([
        [0.8, '#', 'right'],
        [4, 'Installment'],
        [2.4, 'Amount', 'right'],
        [2.4, 'Paid', 'right'],
        [2.4, 'Balance', 'right'],
        [2, 'Status'],
        [2.2, 'Due Date'],
      ]),
      installments.map((inst, index) => {
        const amount = Number(inst.amount) || 0;
        const instPaid = Number(inst.paidAmount ?? inst.paid) || 0;
        return [
          String(index + 1),
          inst.name,
          money(amount),
          money(instPaid),
          money(Math.max(0, amount - instPaid)),
          inst.status,
          formatDate(inst.dueDate),
        ];
      }),
      {
        totals: ['', 'TOTAL', money(dues), money(paid), money(Math.max(0, dues - paid)), '', ''],
      }
    );
  }

  // ================================================================= SECTION 4
  if (payments.length) {
    const total = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    section(4, 'Owner Payments Received');
    table(
      cols([
        [2.2, 'Receipt Date'],
        [2.4, 'Amount', 'right'],
        [2.2, 'Mode'],
        [3.4, 'Reference'],
        [3.4, 'Notes'],
      ]),
      payments.map((p) => [
        formatDate(p.date || p.paymentDate),
        money(p.amount),
        p.paymentMode || p.mode,
        p.referenceNumber || p.transactionNumber,
        p.notes,
      ]),
      { totals: ['TOTAL RECEIVED', money(total), '', '', ''] }
    );
  }


  // ================================================================= SECTION 5
  if (workers.length) {
    const labourDue = workers.reduce((acc, w) => acc + (Number(w.totalAmount) || 0), 0);
    const labourPaid = workers.reduce((acc, w) => acc + (Number(w.paidAmount) || 0), 0);
    section(5, 'Labour Register & Payments');
    table(
      cols([
        [4, 'Worker'],
        [2.2, 'Type'],
        [1.7, 'Daily Wage', 'right'],
        [1.6, 'Days', 'right'],
        [2.3, 'Total Payable', 'right'],
        [2.2, 'Paid', 'right'],
        [2.2, 'Balance', 'right'],
      ]),
      workers.map((w) => [
        w.name,
        w.workerType,
        money(w.dailyWage),
        plain(w.totalWorkDays),
        money(w.totalAmount),
        money(w.paidAmount),
        money(w.pendingAmount),
      ]),
      {
        totals: [
          'TOTAL LABOUR', '', '', '',
          money(labourDue), money(labourPaid), money(Math.max(0, labourDue - labourPaid)),
        ],
        note: `${workers.length} worker(s) on the muster roll. Days worked and amounts are rolled up from the worker payment register.`,
      }
    );
  }

  // ================================================================= SECTION 6
  if (attendanceSummary && attendanceSummary.length) {
    const t = attendanceTotals || { present: 0, absent: 0, halfDay: 0, earned: 0, records: 0 };
    section(6, 'Attendance Register');
    table(
      cols([
        [4.4, 'Worker'],
        [2, 'Present Days', 'right'],
        [1.9, 'Absent Days', 'right'],
        [1.9, 'Half Days', 'right'],
        [2, 'Total Days', 'right'],
      ]),
      attendanceSummary.map((row) => [
        row.name,
        plain(row.present),
        plain(row.absent),
        plain(row.halfDay),
        plain(row.attendanceDays),
      ]),
      {
        totals: [
          'TOTAL',
          plain(t.present),
          plain(t.absent),
          plain(t.halfDay),
          plain(t.present + t.halfDay + t.absent),
        ],
        note: `Wages earned across all attendance entries: ${money(t.earned)}  |  ${plain(t.records)} daily muster record(s).`,
      }
    );
  }

  // ================================================================= SECTION 7
  if (materials.length) {
    const purchaseTotal = materials.reduce((acc, m) => acc + (Number(m.totalAmount) || 0), 0);
    const purchasePaid = materials.reduce((acc, m) => acc + (Number(m.paidAmount) || 0), 0);
    section(7, 'Material Purchases');
    table(
      cols([
        [1.9, 'Date'],
        [2.8, 'Material'],
        [2.6, 'Vendor'],
        [1.5, 'Qty', 'right'],
        [1.8, 'Rate', 'right'],
        [2, 'Total', 'right'],
        [1.8, 'Paid', 'right'],
        [1.8, 'Balance', 'right'],
      ]),
      materials.map((m) => [
        formatDate(m.purchaseDate),
        m.name,
        m.vendor?.name || m.vendorName,
        `${plain(m.quantity)}${m.unit ? ` ${m.unit}` : ''}`,
        money(m.rate),
        money(m.totalAmount),
        money(m.paidAmount),
        money(m.pendingAmount),
      ]),
      {
        totals: ['TOTAL PURCHASES', '', '', '', '', money(purchaseTotal), money(purchasePaid), money(Math.max(0, purchaseTotal - purchasePaid))],
        note: 'Category, invoice number and payment status for every purchase line are included in the Excel/CSV export.',
      }
    );
  }

  // ================================================================= SECTION 8
  if (materialUsage.length) {
    const consumedValue = materialUsage.reduce((acc, u) => acc + (Number(u.totalCost) || 0), 0);
    section(8, 'Material Consumption');
    table(
      cols([
        [2, 'Date'],
        [3.4, 'Material'],
        [1.7, 'Quantity', 'right'],
        [1.3, 'Unit'],
        [3.6, 'Used For'],
        [2, 'Cost', 'right'],
      ]),
      materialUsage.map((u) => [
        formatDate(u.date),
        u.materialName,
        plain(u.quantity),
        u.unit,
        u.workActivity || u.notes,
        money(u.totalCost),
      ]),
      {
        totals: ['TOTAL', '', '', '', '', money(consumedValue)],
      }
    );
  }

  // ================================================================= SECTION 9
  if (materialStock && materialStock.length) {
    section(9, 'Material Stock Position');
    table(
      cols([
        [4, 'Material'],
        [1.5, 'Unit'],
        [2, 'Opening', 'right'],
        [2, 'Purchased', 'right'],
        [2, 'Consumed', 'right'],
        [2.2, 'Balance', 'right'],
        [2.3, 'Stock Value', 'right'],
      ]),
      materialStock.map((row) => [
        row.name,
        row.unit,
        plain(row.openingStock),
        plain(row.purchased),
        plain(row.used),
        plain(row.balance),
        money(row.balance * safeRate(materials, row.name, row.unit)),
      ]),
      {
        note: 'Opening stock + purchases - consumption = balance. Stock value is the balance multiplied by the latest recorded purchase rate.',
      }
    );
  }


  // ================================================================ SECTION 10
  if (vendors.length) {
    const vendorPurchases = vendors.reduce((acc, v) => acc + (Number(v.totalPurchases) || 0), 0);
    const vendorPaid = vendors.reduce((acc, v) => acc + (Number(v.paidAmount) || 0), 0);
    section(10, 'Vendor Register');
    table(
      cols([
        [4, 'Vendor'],
        [2.2, 'Mobile'],
        [2.6, 'Category'],
        [2.4, 'Purchases', 'right'],
        [2.2, 'Paid', 'right'],
        [2.2, 'Balance', 'right'],
      ]),
      vendors.map((v) => [
        v.name,
        v.mobile,
        v.materialCategory,
        money(v.totalPurchases),
        money(v.paidAmount),
        money(v.pendingAmount),
      ]),
      {
        totals: [
          'TOTAL VENDORS', '', '',
          money(vendorPurchases),
          money(vendorPaid),
          money(Math.max(0, vendorPurchases - vendorPaid)),
        ],
        note: `${vendors.length} vendor(s) supply this site. Balance is the purchase obligation still unpaid after deducting material-level payments and cash paid to the vendor.`,
      }
    );
  }

  // ================================================================ SECTION 11
  if (vendorPayments.length) {
    const vendorCash = vendorPayments.reduce((acc, vp) => acc + (Number(vp.amount) || 0), 0);
    section(11, 'Vendor Payments');
    table(
      cols([
        [1.9, 'Date'],
        [3, 'Vendor'],
        [2.6, 'Material'],
        [1.6, 'Qty', 'right'],
        [2.2, 'Amount', 'right'],
        [2, 'Mode'],
        [2.6, 'Reference'],
        [2.4, 'Notes'],
      ]),
      vendorPayments.map((vp) => [
        formatDate(vp.date),
        vp.vendor?.name || vp.vendorName,
        vp.material?.name || vp.materialName,
        `${plain(vp.quantity)}${vp.unit ? ` ${vp.unit}` : ''}`,
        money(vp.amount),
        vp.paymentMode,
        vp.transactionRef,
        vp.notes,
      ]),
      {
        totals: ['TOTAL CASH PAID', '', '', '', money(vendorCash), '', '', ''],
        note: 'Cash actually disbursed to vendors. A payment may be recorded against a material line or as a general vendor settlement.',
      }
    );
  }

  // ================================================================ SECTION 12
  if (expenses.length) {
    const expenseTotal = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const expensePaid = expenses.reduce((acc, e) => acc + (Number(e.paidAmount) || 0), 0);
    section(12, 'Other Expenses');
    table(
      cols([
        [1.9, 'Date'],
        [2.6, 'Category'],
        [4.4, 'Description'],
        [2.2, 'Amount', 'right'],
        [2.2, 'Paid', 'right'],
        [2.2, 'Balance', 'right'],
        [2, 'Status'],
        [1.8, 'Mode'],
      ]),
      expenses.map((e) => [
        formatDate(e.expenseDate),
        e.category,
        e.description,
        money(e.amount),
        money(e.paidAmount),
        money(e.pendingAmount),
        e.paymentStatus,
        e.paymentMode,
      ]),
      {
        totals: [
          'TOTAL EXPENSES', '', '',
          money(expenseTotal),
          money(expensePaid),
          money(Math.max(0, expenseTotal - expensePaid)),
          '', '',
        ],
        note: 'Site overheads outside material purchases and labour - transport, equipment hire, permits and similar running costs.',
      }
    );
  }

  // ================================================================ SECTION 13
  section(13, 'Daily Work Diary');
  if (activities.length) {
    const diaryExpense = activities.reduce((acc, a) => acc + (Number(a.todayExpense) || 0), 0);
    const diaryWorkers = activities.reduce((acc, a) => acc + (Number(a.workersPresent) || 0), 0);
    table(
      cols([
        [1.9, 'Date'],
        [4.2, 'Work Description'],
        [3.8, 'Work Completed'],
        [1.5, 'Workers', 'right'],
        [3.2, 'Materials Received'],
        [3.2, 'Issues / Remarks'],
        [2.2, "Day's Expense", 'right'],
      ]),
      activities.map((a) => [
        formatDate(a.date),
        a.workDescription,
        a.workCompleted,
        plain(a.workersPresent),
        a.materialsReceived,
        a.issues || a.notes,
        money(a.todayExpense),
      ]),
      {
        totals: ['TOTAL', '', '', plain(diaryWorkers), '', '', money(diaryExpense)],
        note: `${activities.length} diary entr${activities.length === 1 ? 'y' : 'ies'} in this period. Cells are clipped to the column width - the full narrative for each day is retained in the application's Site Diary.`,
      }
    );
  } else {
    para('No site diary entries were recorded for this project in the selected period.', {
      size: 8,
      color: COLORS.muted,
      maxLines: 2,
    });
  }
  y += 4;

  // ================================================================ SECTION 14
  section(14, 'Documents Register');
  if (documents.length) {
    table(
      cols([
        [0.8, '#', 'right'],
        [5.4, 'Document'],
        [3, 'Type'],
        [1.6, 'Size', 'right'],
        [2.4, 'Uploaded'],
        [6, 'Notes'],
      ]),
      documents.map((d, index) => [
        String(index + 1),
        d.fileName,
        d.fileType,
        bytes(d.size),
        formatDate(d.uploadedDate),
        d.notes,
      ]),
      {
        totals: [plain(documents.length), 'DOCUMENTS ON FILE', '', '', '', ''],
        note: 'Agreements, bills, invoices and site photographs held against this project. Digital copies remain available in the Documents tab of the site record.',
      }
    );
  } else {
    para('No documents have been uploaded against this project so far.', {
      size: 8,
      color: COLORS.muted,
      maxLines: 2,
    });
  }
  y += 4;

  // ============================================================== DECLARATION
  // A dossier filed as a permanent site record closes with the control block
  // the industry expects: what the figures mean, who prepared it, and where the
  // wet signatures and stamp go.
  rule(COLORS.line, 0.8, 12);
  y += 7;
  line('DECLARATION', MARGIN, y, { font: F.bold, size: 8, color: COLORS.navy });
  y += 12;
  para(REPORT_DISCLAIMER, { size: 7.6, color: COLORS.muted, maxLines: 3 });
  y += 12;

  // Three ruled signature boxes: engineer, owner and reviewing authority. Drawn
  // as one unbreakable block so a box can never be split across two pages.
  const signBoxW = CONTENT_W / 3;
  const signBoxH = 36;
  need(signBoxH + 14);
  [
    ['Prepared by (Engineer)', engineer.name || site.engineerName || ''],
    ['Approved by (Owner / Client)', site.ownerName || ''],
    ['Reviewed by (Authority)', ''],
  ].forEach(([label, person], index) => {
    const x = MARGIN + index * signBoxW;
    const w = signBoxW - 8;
    doc.rect(x, y, w, signBoxH).lineWidth(0.6).strokeColor(COLORS.line).stroke();
    line(label, x + 6, y + 6, { font: F.bold, size: 6.2, color: COLORS.muted, width: w - 12 });
    line(person || ' ', x + 6, y + 16, { font: F.bold, size: 7.6, color: COLORS.navy, width: w - 12 });
    doc.moveTo(x + 6, y + 27).lineTo(x + w - 6, y + 27)
      .lineWidth(0.4).strokeColor(COLORS.line).stroke();
    line('Signature, date & stamp', x + 6, y + 28, {
      font: F.italic, size: 6, color: COLORS.muted, width: w - 12,
    });
  });
  y += signBoxH + 8;
  inked = true;

  // =========================================================== RUNNING CHROME
  // Painted LAST, over the already-buffered pages. Because it is drawn after
  // pagination is finished it can never push content onto a new page - the
  // failure mode that used to leave blank sheets in the middle of the report.
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = range.start; i < range.start + totalPages; i += 1) {
    doc.switchToPage(i);
    const isFirst = i === range.start;

    // The cover carries the letterhead; continuation pages get a compact rule.
    if (!isFirst) {
      doc.rect(0, 0, PAGE_W, 26).fill(COLORS.stripe);
      doc.moveTo(0, 26).lineTo(PAGE_W, 26).lineWidth(0.6).strokeColor(COLORS.line).stroke();
      doc.font(F.bold).fontSize(7.4).fillColor(COLORS.navy)
        .text(site.siteName, MARGIN, 9, {
          width: CONTENT_W * 0.6, height: 10, ellipsis: true, lineBreak: false,
        });
      doc.font(F.normal).fontSize(6.8).fillColor(COLORS.muted)
        .text(`SITE PROJECT DOSSIER  |  Report No. ${reportNo}`, MARGIN, 9, {
          width: CONTENT_W * 0.4, height: 10, align: 'right', ellipsis: true, lineBreak: false,
        });
    }

    // Footer band, drawn at a fixed y so the column flow cannot collide with it.
    doc.moveTo(MARGIN, PAGE_H - 44).lineTo(MARGIN + CONTENT_W, PAGE_H - 44)
      .lineWidth(0.6).strokeColor(COLORS.line).stroke();

    // Company contact block - every report carries it so a client who receives
    // the PDF knows who produced it and how to reach the vendor.
    doc.font(F.bold).fontSize(6.6).fillColor(COLORS.navy)
      .text(COMPANY.name, MARGIN, PAGE_H - 39, {
        width: CONTENT_W * 0.68, height: 9, lineBreak: false,
      });
    doc.font(F.normal).fontSize(6.4).fillColor(COLORS.muted)
      .text(
        `Phone: ${COMPANY.phone}   |   Email: ${COMPANY.email}   |   Web: ${COMPANY.website}`,
        MARGIN, PAGE_H - 31, { width: CONTENT_W * 0.68, height: 9, lineBreak: false }
      );

    doc.font(F.normal).fontSize(6.6).fillColor(COLORS.muted)
      .text(
        `CivilSiteMitra  |  Construction Project Management  |  Generated ${generatedOn}`,
        MARGIN, PAGE_H - 22, { width: CONTENT_W * 0.68, height: 9, ellipsis: true, lineBreak: false }
      );
    doc.font(F.bold).fontSize(6.6).fillColor(COLORS.navy)
      .text(`Page ${i - range.start + 1} of ${totalPages}`, MARGIN, PAGE_H - 22, {
        width: CONTENT_W * 0.32, height: 9, align: 'right', lineBreak: false,
      });
  }

  doc.end();
  return doc;
};

module.exports = { buildSiteReportPdf };

