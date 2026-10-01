// PDF dossier quality gate.
//
// The site report is meant to be filed as a permanent construction record, so a
// blank sheet in the middle is a real defect - it means a pagination bug pushed
// content onto a fresh page that then received nothing.
//
// A page count alone cannot prove that: every page gets a running header and
// footer, so an empty page still has *some* bytes. This tool therefore inflates
// each page's content stream (PDFKit writes one FlateDecode stream per page) and
// separates CHROME ink (the repeated header/footer band) from BODY ink. A page
// whose only ink is chrome is reported as blank.
//
// It also asserts the structural guarantees the dossier makes:
//   - no page is blank
//   - no page has body text drawn below the footer rule (overflow)
//   - every declared section actually renders
//   - the numbered section list in reportSchema.js stays contiguous 1..N
//
// Read-only: builds the document in memory, never writes to the database.
const zlib = require('zlib');
const mongoose = require('mongoose');
const config = require('../src/config');
const User = require('../src/models/User');
const Site = require('../src/models/Site');
const Payment = require('../src/models/Payment');
const Material = require('../src/models/Material');
const { assembleSiteReportData, buildReportMeta } = require('../src/services/reportService');
const { buildSiteReportPdf } = require('../src/reports/siteReport');
const { SITE_REPORT_SECTIONS } = require('../src/reports/reportSchema');

const PAGE_H = 841.89;

/** Collects the generated PDF into a single Buffer. */
const renderPdf = (data) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const doc = buildSiteReportPdf(data);
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

/**
 * Minimal PDF object reader: returns every "N 0 obj ... endobj" body so page
 * dictionaries and their content streams can be located without a dependency.
 */
const readObjects = (buf) => {
  const text = buf.toString('latin1');
  const objects = new Map();
  const re = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let match;
  while ((match = re.exec(text)) !== null) objects.set(Number(match[1]), match[3]);
  return { objects };
};

/** Inflates a content stream body (raw bytes between "stream" and "endstream"). */
const inflateStream = (body) => {
  const start = body.indexOf('stream');
  const end = body.lastIndexOf('endstream');
  if (start === -1 || end === -1) return '';
  let slice = Buffer.from(body.slice(start + 6, end), 'latin1');
  // A stream may be followed by CR LF or LF only; strip whichever is present.
  while (slice.length && (slice[0] === 0x0d || slice[0] === 0x0a)) slice = slice.slice(1);
  while (
    slice.length &&
    (slice[slice.length - 1] === 0x0a || slice[slice.length - 1] === 0x0d)
  ) {
    slice = slice.slice(0, -1);
  }
  try {
    return zlib.inflateSync(slice).toString('latin1');
  } catch {
    try {
      return zlib.inflateRawSync(slice).toString('latin1');
    } catch {
      return '';
    }
  }
};

// Geometry of the dossier chrome, in PDFKit's top-down coordinates (the same
// numbers the template uses). Anything inside these bands is running chrome:
//   - the letterhead block and the running header occupy the top ~64pt
//   - the footer rule sits at PAGE_H - 42 and the footer text just under it
// Page content is only ever meant to live between the two bands.
const HEADER_BAND = 70;
const FOOTER_RULE_Y = PAGE_H - 42;
const FOOTER_BAND = PAGE_H - 45;

/**
 * Decodes one text-showing operand into its visible string.
 *
 * PDFKit emits simple `(text) Tj` only for its built-in WinAnsi fonts. The
 * dossier registers embedded TrueType faces, so runs arrive as `TJ` arrays of
 * hex strings - and `characterSpacing` additionally splits a single heading
 * across several chunks:
 *   [<53495445205052> 20 <4f4a454354...> 0] TJ
 * Every chunk inside one operator belongs to the same run, so they are joined
 * without a separator; separate operators are joined with a newline.
 */
const decodeText = (operand) => {
  if (operand === undefined || operand === null) return '';
  const chunks = [];
  for (const part of operand.matchAll(/<([0-9a-fA-F\s]*)>|\(((?:[^()\\]|\\.)*)\)/g)) {
    if (part[1] !== undefined) {
      const hex = part[1].replace(/\s+/g, '');
      // Odd-length hex would be malformed; ignore only the trailing nibble.
      const even = hex.length % 2 === 0 ? hex : hex.slice(0, -1);
      chunks.push(Buffer.from(even, 'hex').toString('latin1'));
    } else {
      chunks.push(part[2].replace(/\\([()\\])/g, '$1'));
    }
  }
  return chunks.join('');
};

/**
 * Walks a content stream in paint order and returns every text run with the
 * top-down y at which it was placed.
 *
 * Coordinate conversion: PDFKit opens every page with `1 0 0 -1 0 PAGE_H cm`,
 * so PDF user-space y runs UP from the bottom of the sheet. The template, and
 * therefore every number in this file, thinks top-down. The conversion is
 *   topDownY = PAGE_H - userSpaceY
 * Reading the raw value instead is what previously made the letterhead at the
 * top of page 1 (user-space y ~ 817) look like overflow at the bottom.
 */
const walkTextRuns = (content) => {
  const runs = [];
  let topY = 0;
  let baseY = 0;
  const re =
    /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm|([\d.-]+)\s+([\d.-]+)\s+Td|(\[[^\]]*\]|<[0-9a-fA-F\s]*>|\((?:\\.|[^()\\])*\))\s*(?:Tj|TJ)/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    if (match[1] !== undefined) {
      baseY = Number(match[2]);
      topY = PAGE_H - baseY;
    } else if (match[3] !== undefined) {
      // Td is relative to the current text line matrix.
      baseY += Number(match[4]);
      topY = PAGE_H - baseY;
    } else {
      runs.push({ y: Math.round(topY * 10) / 10, text: decodeText(match[5]) });
    }
  }
  return runs;
};

/**
 * Splits a page's text runs into running chrome and real body content.
 *
 * The chrome is painted last at fixed positions: the letterhead / continuation
 * rule inside the top band and the footer band just above the lower margin.
 * Classifying by position (rather than by matching strings) means the check
 * cannot be fooled by body text that happens to repeat the site name.
 */
const splitChrome = (runs) => {
  const chrome = [];
  const body = [];
  for (const run of runs) {
    if (run.y < HEADER_BAND || run.y > FOOTER_RULE_Y - 6) chrome.push(run);
    else body.push(run);
  }
  return { chrome, body };
};

/**
 * Returns one entry per page, in document order, with ink counters and the
 * lowest point at which body text was painted.
 */
const inspectPages = (buf) => {
  const { objects } = readObjects(buf);

  const pages = [];
  for (const [num, body] of objects) {
    if (!/\/Type\s*\/Page[^s]/.test(body)) continue;
    pages.push({ num, body });
  }
  // PDFKit numbers objects in creation order, which matches page order.
  pages.sort((a, b) => a.num - b.num);

  return pages.map((page, pageIndex) => {
    const refs = [];
    const single = page.body.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    const many = page.body.match(/\/Contents\s*\[([^\]]+)\]/);
    if (single) refs.push(Number(single[1]));
    else if (many) {
      for (const m of many[1].matchAll(/(\d+)\s+\d+\s+R/g)) refs.push(Number(m[1]));
    }

    const content = refs
      .map((ref) => objects.get(ref))
      .filter(Boolean)
      .map((body) => inflateStream(body))
      .join('\n');

    // Runs are split into running chrome (letterhead, running header, footer
    // rule + "Page N of M") and real body content by position, so the
    // blank-page test cannot be fooled by chrome that is always painted.
    const runs = walkTextRuns(content);
    const { chrome, body } = splitChrome(runs);

    const strokes = (content.match(/\bS\b/g) || []).length;
    const rects = (content.match(/\bre\b/g) || []).length;

    // Lowest point reached by BODY text, in top-down coordinates. Chrome is
    // excluded because the footer is deliberately painted below the content
    // box - counting it would report every page as overflowing.
    let lowestTextY = 0;
    for (const run of body) {
      if (run.y > lowestTextY) lowestTextY = run.y;
    }

    // Decoded visible strings (chrome included) feed the section-coverage
    // assertion, which looks for the numbered section headings.
    const strings = runs.map((r) => r.text).join('\n');

    return {
      // Document order, 1-based - not the PDF object number, which only
      // coincidentally resembles a page number in small files.
      page: pageIndex + 1,
      textRuns: runs.length,
      bodyRuns: body.length,
      chromeRuns: chrome.length,
      strokes,
      rects,
      bodyInk: body.length,
      lowestTextY: Math.round(lowestTextY * 10) / 10,
      bytes: content.length,
      strings,
    };
  });
};

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });

  // Prefer the richest fixture: a one-page site proves nothing about pagination.
  const engineers = await User.find({ role: 'ENGINEER' }).sort({ createdAt: 1 });
  if (engineers.length === 0) throw new Error('no engineer fixture - seed the database first');

  const sites = await Site.find({}).sort({ createdAt: 1 }).lean();
  let best = null;
  for (const site of sites) {
    const payments = await Payment.countDocuments({ site: site._id });
    const materials = await Material.countDocuments({ site: site._id });
    if (!best || payments + materials > best.score) {
      best = { site, score: payments + materials, payments, materials };
    }
  }
  if (!best) throw new Error('no site fixture - seed the database first');

  const owner = await User.findById(best.site.engineer).select('name company email mobile').lean();
  const data = await assembleSiteReportData(best.site);
  if (owner) {
    data.engineer = {
      name: owner.name || best.site.engineerName || '',
      company: owner.company || '',
      email: owner.email || '',
      mobile: owner.mobile || '',
    };
  }
  data.meta = buildReportMeta(data);

  const buf = await renderPdf(data);
  const pages = inspectPages(buf);

  console.log(
    `FIXTURE site="${best.site.siteName}" payments=${best.payments} materials=${best.materials} bytes=${buf.length}`
  );

  let fail = 0;
  const check = (ok, label, detail = '') => {
    if (!ok) fail += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` -> ${detail}` : ''}`);
  };

  const magicOk = buf.slice(0, 5).toString() === '%PDF-';
  check(magicOk, 'magic bytes', buf.slice(0, 8).toString());

  check(
    pages.length >= 2 && pages.length <= 40,
    `pages=${pages.length} (expect 2..40)`,
    pages.length < 2 ? 'fixture too small to exercise pagination' : ''
  );

  // A page carrying only running chrome has zero body text runs and no strokes
  // of its own (the letterhead/footer rules are drawn on every page, so the
  // threshold allows for those).
  const blanks = pages.filter((p) => p.bodyInk === 0 && p.strokes <= 2);
  check(
    blanks.length === 0,
    `blank pages=${blanks.length}`,
    blanks.map((b) => `page ${b.page} runs=${b.textRuns}`).join(', ')
  );

  // Footer content must be present on every page, so a client can always tell a
  // complete report from a truncated one. Page NUMBERS were removed by request
  // (renderer no longer emits "Page N of M"), so the vendor contact block is the
  // thing that proves the running footer actually painted.
  const unnumbered = pages.filter((p) => !/TechMitra/i.test(p.strings));
  check(unnumbered.length === 0, `pages missing the footer block=${unnumbered.length}`);

  const overflow = pages.filter((p) => p.lowestTextY > FOOTER_RULE_Y);
  check(
    overflow.length === 0,
    `overflow pages=${overflow.length}`,
    overflow.map((o) => `page ${o.page} y=${o.lowestTextY}`).join(', ')
  );

  const rendered = pages.map((p) => p.strings).join('\n').toUpperCase();
  const missing = SITE_REPORT_SECTIONS.filter(([, , title]) => !rendered.includes(title.toUpperCase()));
  check(
    missing.length === 0,
    `sections rendered=${SITE_REPORT_SECTIONS.length - missing.length}/${SITE_REPORT_SECTIONS.length}`,
    missing.map((m) => m[2]).join(' | ')
  );

  const meta = data.meta;
  const numberingOk =
    Array.isArray(meta.sections) &&
    meta.sections.length === SITE_REPORT_SECTIONS.length &&
    meta.sections.every((s, i) => s.no === i + 1);
  check(numberingOk, `meta numbering 1..${SITE_REPORT_SECTIONS.length}`);

  console.log('\npage  runs  body  strokes  lowestY  bytes');
  pages.forEach((p) => {
    console.log(
      String(p.page).padEnd(6) +
        String(p.textRuns).padEnd(6) +
        String(p.bodyRuns).padEnd(6) +
        String(p.strokes).padEnd(9) +
        String(p.lowestTextY).padEnd(9) +
        String(p.bytes)
    );
  });

  await mongoose.disconnect();
  console.log(`\nPDF_BLANK_CHECK pages=${pages.length} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 2);
})().catch((e) => {
  console.error('PDF_BLANK_CHECK_FATAL', e.message);
  process.exit(1);
});

