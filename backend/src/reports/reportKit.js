/**
 * reportKit.js - shared PDF primitives for the material reports.
 *
 * Kept separate from the site dossier renderer so the letterhead, table and
 * footer styles here cannot drift from the main report, and the material
 * reports do not have to re-implement them. Nothing here knows about business
 * data - it only knows how to draw.
 */
const PDFDocument = require('pdfkit');

/** Vendor identity printed in the footer of every report. */
const COMPANY = {
  name: process.env.VENDOR_NAME || 'TechMitra Technology',
  phone: process.env.VENDOR_PHONE || '9764149564',
  email: process.env.VENDOR_EMAIL || 'techmitrofficial@gmail.com',
  website: process.env.VENDOR_WEBSITE || 'www.techmitr.in',
};

const PAGE_W = 595.28;   // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

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

/** INR with Indian digit grouping. NaN/Infinity collapse to 0, never "NaN". */
const inr = (value) => {
  const n = Number(value);
  const num = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = Math.abs(num).toFixed(0).split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${num < 0 ? '-' : ''}\u20B9${grouped}${decPart ? `.${decPart}` : ''}`;
};

/** 21 Sep 2026 */
const d = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Trim to a budget so a long vendor name can never break the table layout. */
const clip = (value, max = 46) => {
  const s = String(value === null || value === undefined ? '' : value).trim();
  return s.length > max ? `${s.slice(0, max - 1)}...` : s;
};

/** 100 Bags, guarded so a blank quantity never prints "undefined". */
const qty = (value, unit) => {
  const n = Number(value);
  const amount = Number.isFinite(n) ? (Math.round(n * 100) / 100).toLocaleString('en-IN') : '0';
  return unit ? `${amount} ${unit}` : amount;
};

/** New A4 document with the standard margins and buffered pages. */
const createDoc = () => new PDFDocument({
  size: 'A4',
  margins: { top: MARGIN, bottom: 62, left: MARGIN, right: MARGIN },
  bufferPages: true,
  autoFirstPage: true,
});

/** Letterhead for page 1 of a standalone report. Returns the start y. */
const drawHeader = (doc, { title, subtitle, site, engineer, generatedOn }) => {
  doc.rect(0, 0, PAGE_W, 74).fill(COLORS.primary);
  doc.font(F.bold).fontSize(15).fillColor('#ffffff')
    .text('CivilSiteMitra', MARGIN, 16, { width: CONTENT_W * 0.6, height: 20, lineBreak: false });
  doc.font(F.normal).fontSize(8).fillColor('#dbeafe')
    .text('Construction Site Management System', MARGIN, 36, { width: CONTENT_W * 0.6, height: 12, lineBreak: false });
  doc.font(F.normal).fontSize(7.6).fillColor('#e0ecff')
    .text(COMPANY.name, PAGE_W - MARGIN - CONTENT_W * 0.38, 18, {
      width: CONTENT_W * 0.38, height: 10, align: 'right', lineBreak: false,
    })
    .text(`Generated: ${generatedOn}`, PAGE_W - MARGIN - CONTENT_W * 0.38, 31, {
      width: CONTENT_W * 0.38, height: 10, align: 'right', lineBreak: false,
    });

  doc.font(F.bold).fontSize(12).fillColor(COLORS.navy)
    .text(String(title || ''), MARGIN, 84, { width: CONTENT_W, height: 16, ellipsis: true, lineBreak: false });
  if (subtitle) {
    doc.font(F.normal).fontSize(8.6).fillColor(COLORS.muted)
      .text(String(subtitle), MARGIN, 101, { width: CONTENT_W, height: 12, ellipsis: true, lineBreak: false });
  }
  doc.moveTo(MARGIN, 116).lineTo(MARGIN + CONTENT_W, 116)
    .lineWidth(0.8).strokeColor(COLORS.line).stroke();

  const chips = [
    ['Site', clip(site && site.siteName, 34)],
    ['Owner', clip(site && site.ownerName, 26)],
    ['Engineer', clip((engineer && engineer.name) || (site && site.engineerName), 26)],
    ['Location', clip([site && site.city, site && site.state].filter(Boolean).join(', '), 26)],
  ];
  const cw = CONTENT_W / chips.length;
  chips.forEach(([label, value], i) => {
    const x = MARGIN + i * cw;
    doc.font(F.normal).fontSize(6.6).fillColor(COLORS.muted)
      .text(label.toUpperCase(), x, 124, { width: cw - 6, height: 9, lineBreak: false });
    doc.font(F.bold).fontSize(8.4).fillColor(COLORS.navy)
      .text(value || '-', x, 134, { width: cw - 6, height: 11, ellipsis: true, lineBreak: false });
  });
  return 154;
};

/** Section heading with a rule underneath. */
const section = (doc, text, y) => {
  doc.font(F.bold).fontSize(9.4).fillColor(COLORS.navy)
    .text(String(text).toUpperCase(), MARGIN, y, { width: CONTENT_W, height: 13, lineBreak: false });
  doc.moveTo(MARGIN, y + 15).lineTo(MARGIN + CONTENT_W, y + 15)
    .lineWidth(0.7).strokeColor(COLORS.line).stroke();
  return y + 21;
};

/** Two/three-column key/value block (material information style). */
const infoGrid = (doc, pairs, y, perRow = 3) => {
  const rows = Math.ceil(pairs.length / perRow);
  const cw = CONTENT_W / perRow;
  pairs.forEach(([label, value], i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = MARGIN + col * cw;
    const ry = y + row * 30;
    doc.font(F.normal).fontSize(6.6).fillColor(COLORS.muted)
      .text(String(label).toUpperCase(), x, ry, { width: cw - 8, height: 9, lineBreak: false });
    doc.font(F.bold).fontSize(8.4).fillColor(COLORS.navy)
      .text(String(value === null || value === undefined || value === '' ? '-' : value), x, ry + 10, {
        width: cw - 8, height: 11, ellipsis: true, lineBreak: false,
      });
  });
  return y + rows * 30;
};


/**
 * Draws a table. Header rows repeat on every page and a row is never split
 * across a page break, so nothing is ever clipped. Returns the new y.
 */
const table = (doc, opts) => {
  const { columns, rows, pageH = PAGE_H } = opts;
  let y = opts.y;
  const bottom = opts.bottom || pageH - 62;
  const empty = opts.empty || 'No records available';
  const gap = 6;
  const usable = CONTENT_W - gap * (columns.length - 1);

  const header = () => {
    doc.rect(MARGIN, y, CONTENT_W, 17).fill(COLORS.band);
    doc.font(F.bold).fontSize(7).fillColor(COLORS.navy);
    let x = MARGIN;
    for (const col of columns) {
      doc.text(String(col.label).toUpperCase(), x + 4, y + 5, {
        width: col.w * usable - 8, height: 9,
        align: col.align || 'left', ellipsis: true, lineBreak: false,
      });
      x += col.w * usable + gap;
    }
    y += 17;
  };

  header();

  if (!rows || !rows.length) {
    doc.font(F.italic).fontSize(8).fillColor(COLORS.muted)
      .text(empty, MARGIN + 4, y + 6, { width: CONTENT_W - 8, height: 12, lineBreak: false });
    return y + 24;
  }

  rows.forEach((cells, i) => {
    const heights = columns.map((col, ci) =>
      doc.font(F.normal).fontSize(7.6).heightOfString(String(cells[ci] ?? ''), { width: col.w * usable - 8 }));
    const rowH = Math.max(15, Math.max(...heights) + 8);

    if (y + rowH > bottom) {
      doc.addPage();
      y = 60;
      header();
    }

    if (i % 2 === 1) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(COLORS.stripe);
    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH)
      .lineWidth(0.3).strokeColor(COLORS.line).stroke();

    let x = MARGIN;
    columns.forEach((col, ci) => {
      const isNumeric = col.align === 'right';
      doc.font(isNumeric ? F.bold : F.normal).fontSize(7.6)
        .fillColor(col.color || COLORS.text)
        .text(String(cells[ci] ?? ''), x + 4, y + 4, {
          width: col.w * usable - 8, height: rowH - 8, align: col.align || 'left', lineBreak: true,
        });
      x += col.w * usable + gap;
    });
    y += rowH;
  });

  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
    .lineWidth(0.5).strokeColor(COLORS.line).stroke();
  return y;
};

/** Highlighted total block, used for every money subtotal. */
const totalRow = (doc, y, lines) => {
  const boxH = 16 + lines.length * 15;
  doc.rect(MARGIN, y, CONTENT_W, boxH).fill(COLORS.primarySoft);
  doc.rect(MARGIN, y, 3, boxH).fill(COLORS.primary);
  let ty = y + 7;
  for (const [label, value] of lines) {
    doc.font(F.normal).fontSize(8).fillColor(COLORS.muted)
      .text(String(label), MARGIN + 10, ty, { width: CONTENT_W * 0.6, height: 12, ellipsis: true, lineBreak: false });
    doc.font(F.bold).fontSize(8.4).fillColor(COLORS.navy)
      .text(String(value), MARGIN, ty, { width: CONTENT_W - 12, height: 12, align: 'right', lineBreak: false });
    ty += 15;
  }
  return y + boxH;
};

/** Painter applied to every page once pagination is complete. */
const paintFooter = (doc, subtitle) => {
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(i);
    doc.moveTo(MARGIN, PAGE_H - 44).lineTo(MARGIN + CONTENT_W, PAGE_H - 44)
      .lineWidth(0.6).strokeColor(COLORS.line).stroke();

    doc.font(F.bold).fontSize(6.6).fillColor(COLORS.navy)
      .text(COMPANY.name, MARGIN, PAGE_H - 39, { width: CONTENT_W * 0.7, height: 9, lineBreak: false });
    doc.font(F.normal).fontSize(6.4).fillColor(COLORS.muted)
      .text(`Phone: ${COMPANY.phone}   |   Email: ${COMPANY.email}   |   Web: ${COMPANY.website}`,
        MARGIN, PAGE_H - 31, { width: CONTENT_W * 0.7, height: 9, lineBreak: false });

    doc.font(F.normal).fontSize(6.6).fillColor(COLORS.muted)
      .text(`CivilSiteMitra  |  ${subtitle}`, MARGIN, PAGE_H - 22, {
        width: CONTENT_W * 0.7, height: 9, ellipsis: true, lineBreak: false,
      });
    doc.font(F.bold).fontSize(6.6).fillColor(COLORS.navy)
      .text(`Page ${i + 1} of ${total}`, MARGIN, PAGE_H - 22, {
        width: CONTENT_W, height: 9, align: 'right', lineBreak: false,
      });
  }
};

module.exports = {
  PDFDocument, COMPANY, PAGE_W, PAGE_H, MARGIN, CONTENT_W, COLORS, F,
  inr, d, clip, qty, createDoc,
  drawHeader, section, infoGrid, table, totalRow, paintFooter,
};
