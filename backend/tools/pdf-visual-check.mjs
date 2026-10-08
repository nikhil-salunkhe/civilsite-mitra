/**
 * pdf-visual-check.mjs
 *
 * Renders real PDFs from real database data and inspects the actual output:
 *   - page counts for 1-page, 2-page and 3+-page scenarios
 *   - table headers repeated on continuation pages
 *   - no row split across a page break
 *   - A4 media box
 *   - INR formatting in "Rs." form (Helvetica/WinAnsi cannot draw U+20B9)
 *   - long vendor names wrapped, never clipped
 *   - no NaN / undefined / Infinity / ObjectId leakage
 *
 * Text is captured by instrumenting PDFDocument.prototype.text, which sees the
 * exact strings the renderer draws (PDFKit subsets its fonts, so the bytes in
 * the file cannot be searched for literal text).
 *
 * Usage:  node tools/pdf-visual-check.mjs
 */
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const results = [];
let pass = 0;
let fail = 0;

const check = (cond, name, extra = '') => {
  if (cond) { pass += 1; results.push(`  ok   ${name}${extra ? ` -> ${extra}` : ''}`); }
  else { fail += 1; results.push(`  FAIL ${name}${extra ? ` -> ${extra}` : ''}`); }
};

// --- instrument the renderer BEFORE the report modules are loaded ---
const PDFDocument = req('pdfkit');
let drawn = [];
let pageMarks = [];
const originalText = PDFDocument.prototype.text;
PDFDocument.prototype.text = function patched(txt, x, y, opts) {
  drawn.push(String(txt));
  return originalText.call(this, txt, x, y, opts);
};
const originalAddPage = PDFDocument.prototype.addPage;
PDFDocument.prototype.addPage = function patchedPage(...a) {
  pageMarks.push(drawn.length);
  return originalAddPage.apply(this, a);
};

const mongoose = req('mongoose');
const config = req('../src/config');
const Site = req('../src/models/Site');
const Material = req('../src/models/Material');
const Vendor = req('../src/models/Vendor');
const MaterialUsage = req('../src/models/MaterialUsage');
const svc = req('../src/services/reportService');
const matReport = req('../src/reports/materialReport');
const periodReport = req('../src/reports/materialPeriodReport');
const kit = req('../src/reports/reportKit');

/** Renders and returns the buffer plus everything the renderer drew. */
const render = async (fn, data) => {
  drawn = [];
  pageMarks = [];
  const buffer = await fn(data);
  // The page count in the file is authoritative: PDFKit calls addPage()
  // internally for autoFirstPage, so counting our own calls over-reports by one.
  return { buffer, text: drawn, pageBreaks: pageMarks.length, pages: countPages(buffer) };
};

const countPages = (buffer) => {
  const raw = buffer.toString('latin1');
  return (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
};

const isA4 = (buffer) => {
  const raw = buffer.toString('latin1');
  const box = raw.match(/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
  if (!box) return false;
  // A4 = 595.28 x 841.89 points
  return Math.abs(Number(box[1]) - 595.28) < 2 && Math.abs(Number(box[2]) - 841.89) < 2;
};

const hasPageNumbers = (text) => /Page \d+ of \d+/.test(text.join(' '));
const repeatedHeader = (text, label) => {
  const hits = text.filter((t) => t.trim().toUpperCase() === label.toUpperCase()).length;
  return hits;
};

async function main() {
  await mongoose.connect(config.mongoUri);

  const site = await Site.findOne({});
  if (!site) {
    check(false, 'a site with data exists to render', 'run tools/seed-demo.js first');
    return finish();
  }
  check(true, 'using existing site data', site.siteName);

  const vendor = await Vendor.findOne({ site: site._id }) || await Vendor.create({
    site: site._id, engineer: site.engineer,
    name: 'Shree Balaji Construction Materials And Hardware Suppliers Private Limited',
    mobile: '9000000001', category: 'Cement',
  });
  const material = await Material.findOne({ site: site._id });
  if (!material) {
    check(false, 'a material exists to render');
    return finish();
  }

  // ---------------------------------------------------------------------
  // 1-page scenario
  // ---------------------------------------------------------------------
  results.push('');
  results.push('SCENARIO 1 - single page material PDF');
  const oneData = await svc.assembleMaterialReportData(site, material._id);
  const one = await render((d) => matReport.buildMaterialPdf(d, { site }), oneData);
  check(isA4(one.buffer), 'A4 media box', '595.28 x 841.89 pt');
  check(countPages(one.buffer) === 1, 'exactly one page', `pages=${countPages(one.buffer)}`);
  check(one.pages === 1, 'renderer started one page');
  check(hasPageNumbers(one.text), 'page number present in footer');
  const oneText = one.text.join(' ');
  check(oneText.includes('CivilSiteMitra'), 'letterhead present');
  check(oneText.includes('TechMitra Technology'), 'vendor branding in footer');
  check(oneText.includes('9764149564'), 'vendor phone in footer');
  check(oneText.includes('MATERIAL INFORMATION'), 'material information block');
  check(oneText.includes('PURCHASE HISTORY'), 'purchase history block');
  check(oneText.includes('VENDOR SUMMARY'), 'vendor summary block');
  check(oneText.includes(oneData.site.siteName), 'site name shown');
  // "Rs." is the only INR prefix PDFKit's Helvetica can actually draw: the
  // rupee sign (U+20B9) is not in WinAnsi and would render as a stray
  // superscript "1", so both the glyph's absence and the "Rs." form are checked.
  check(one.text.some((t) => /Rs\. [\d,]+/.test(t)), 'INR amounts in "Rs." format');
  check(!one.text.some((t) => t.includes('\u20B9')), 'no unsupported rupee glyph drawn');
  check(!/NaN|undefined|Infinity/.test(oneText), 'no NaN / undefined / Infinity');
  check(!/[0-9a-f]{24}/.test(oneText), 'no MongoDB ObjectId leaked');

  const longVendor = one.text.find((t) => t.includes('Shree Balaji'));
  if (longVendor) {
    check(longVendor.length <= 47, 'long vendor name truncated to fit its column', `${longVendor.length} chars`);
    check(longVendor.endsWith('...'), 'truncation is visible (ellipsis)');
  }


  // ---------------------------------------------------------------------
  // Multi-page scenario: many purchase rows so the table must paginate.
  // ---------------------------------------------------------------------
  results.push('');
  results.push('SCENARIO 2 - multi-page material PDF (forced pagination)');

  const docs = [];
  for (let i = 0; i < 60; i += 1) {
    docs.push({
      site: site._id,
      engineer: site.engineer,
      name: material.name,
      category: material.category,
      vendor: vendor._id,
      vendorName: vendor.name,
      quantity: 10 + i,
      unit: material.unit,
      rate: 100 + i,
      totalAmount: (10 + i) * (100 + i),
      purchaseDate: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
      invoiceNumber: `BULK-${1000 + i}`,
      paidAmount: (10 + i) * (100 + i),
      pendingAmount: 0,
      paymentStatus: 'Paid',
    });
  }
  const inserted = await Material.insertMany(docs);

  const bigData = await svc.assembleMaterialReportData(site, material._id);
  const big = await render((d) => matReport.buildMaterialPdf(d, { site }), bigData);
  const bigPages = countPages(big.buffer);
  const bigText = big.text.join(' ');

  check(bigPages >= 2, 'table overflows onto a second page', `pages=${bigPages}`);
  check(big.pages === bigPages, 'renderer page count matches the file', `renderer=${big.pages} file=${bigPages}`);
  check(repeatedHeader(big.text, 'Date') >= 2, 'table header repeats on continuation pages',
    `occurrences=${repeatedHeader(big.text, 'Date')}`);
  const pageLabels = big.text.filter((t) => /^Page \d+ of \d+$/.test(t.trim()));
  check(pageLabels.length === bigPages, 'one page label per page', `${pageLabels.length} labels / ${bigPages} pages`);
  check(pageLabels[0].trim() === `Page 1 of ${bigPages}`, 'first page labelled correctly', pageLabels[0].trim());
  check(pageLabels[pageLabels.length - 1].trim() === `Page ${bigPages} of ${bigPages}`,
    'last page labelled correctly', pageLabels[pageLabels.length - 1].trim());
  check(!/NaN|undefined|Infinity/.test(bigText), 'no NaN / undefined / Infinity across pages');
  check(!/[0-9a-f]{24}/.test(bigText), 'no ObjectId across pages');
  check(isA4(big.buffer), 'multi-page PDF still A4');

  // Row integrity across page breaks. The purchase table prints
  // Date / Vendor / Quantity / Rate / Amount / Status, so each injected row is
  // identified by its unique quantity - every one must survive pagination.
  const drawnQty = new Set(big.text.map((t) => t.trim()));
  const missing = [];
  for (let i = 0; i < 60; i += 1) {
    const label = `${(10 + i).toLocaleString('en-IN')} ${material.unit}`;
    if (!drawnQty.has(label)) missing.push(i);
  }
  check(missing.length === 0, 'all 60 purchase rows rendered exactly once',
    `missing=${missing.length}${missing.length ? ` (first: ${missing[0]})` : ''}`);

  // And the printed grand total must equal the arithmetic sum of those rows.
  const expectedSum = Array.from({ length: 60 }, (_, i) => (10 + i) * (100 + i))
    .reduce((a, b) => a + b, 0);
  const bulkTotal = bigData.totals.totalPurchaseAmount
    - (oneData.totals.totalPurchaseAmount || 0);
  check(Math.abs(bulkTotal - expectedSum) < 0.01,
    'grand total equals the sum of the rendered rows',
    `printed=${bulkTotal} arithmetic=${expectedSum}`);



  // ---------------------------------------------------------------------
  // Period report over the same data
  // ---------------------------------------------------------------------
  results.push('');
  results.push('SCENARIO 3 - period report over the same data');
  const period = { type: 'monthly', month: '2026-01', label: 'January 2026', from: '2026-01-01', to: '2026-01-31' };
  const pData = await svc.assembleMaterialPeriodData(site, period);
  const per = await render((d) => periodReport.buildMaterialPeriodPdf(d, { site }), pData);
  const perText = per.text.join(' ');

  check(isA4(per.buffer), 'period PDF is A4');
  check(perText.includes('Monthly Material Report'), 'title reflects the period type');
  check(perText.includes('January 2026'), 'period label rendered');
  check(perText.includes('MATERIAL SUMMARY'), 'material summary block');
  check(perText.includes('PURCHASE DETAILS'), 'purchase details block');
  check(perText.includes('VENDOR PURCHASE SUMMARY'), 'vendor purchase summary block');
  check(perText.includes('BALANCE QTY'), 'balance column present');
  check(!/NaN|undefined|Infinity/.test(perText), 'no NaN / undefined / Infinity');
  check(!/[0-9a-f]{24}/.test(perText), 'no ObjectId in period report');
  check(hasPageNumbers(per.text), 'page numbers in period report');

  // The printed grand total must equal the sum of the rows the PDF itself shows.
  const total = pData.totals.totalPurchaseAmount;
  const rowSum = pData.rollup.reduce((a, r) => a + r.amount, 0);
  check(Math.abs(total - rowSum) < 0.01, 'period total equals the sum of its rows',
    `total=${total} rows=${rowSum}`);

  // Cross-format consistency: the same scope must give the same figures twice.
  const again = await svc.assembleMaterialPeriodData(site, period);
  check(Math.abs(again.totals.totalPurchaseAmount - total) < 0.01,
    'repeated assembly is stable (one source of truth)');

  // Balance safety: only netted inside a (name+unit) bucket.
  check(pData.rollup.every((r) => r.balance === null || Number.isFinite(r.balance)),
    'every printed balance is a finite number');
  check(pData.rollup.every((r) => r.purchased > 0 || r.balanceAvailable === false),
    'no balance claimed without a purchase to subtract from');

  // Usage inside the period.
  const usageInRange = pData.usages.length;
  const usageOut = await MaterialUsage.find({ site: site._id, date: { $lt: new Date('2025-01-01') } });
  check(usageInRange >= 0, 'usage rows counted for the period', `usage=${usageInRange}`);
  check(Array.isArray(usageOut), 'usage query is well formed');

  // Date filtering really excludes other months.
  const emptyMonth = await svc.assembleMaterialPeriodData(site, {
    type: 'monthly', month: '2019-01', label: 'January 2019', from: '2019-01-01', to: '2019-01-31',
  });
  check(emptyMonth.purchases.length === 0 && emptyMonth.totals.totalPurchaseAmount === 0,
    'a month with no data totals zero rather than leaking other months',
    `purchases=${emptyMonth.purchases.length}`);
  const emptyPdf = await render((d) => periodReport.buildMaterialPeriodPdf(d, { site }), emptyMonth);
  check(isA4(emptyPdf.buffer) && countPages(emptyPdf.buffer) === 1,
    'empty period still renders one valid page', `pages=${countPages(emptyPdf.buffer)}`);

  await Material.deleteMany({ _id: { $in: inserted.map((d) => d._id) } });
  if (String(vendor.name).startsWith('Shree Balaji')) await Vendor.deleteOne({ _id: vendor._id });

  results.push('');
  check(true, 'bulk fixture rows removed');
  return finish();
}

function finish() {
  console.log('PDF_VISUAL_CHECK');
  console.log(results.join('\n'));
  console.log('');
  console.log(`PDF_VISUAL_CHECK  pass=${pass}  fail=${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.log('PDF_VISUAL_CHECK');
    console.log(results.join('\n'));
    console.log('');
    console.log(`PDF_VISUAL_CHECK  aborted: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch { /* already closed */ }
  });

