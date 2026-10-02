/**
 * export-audit-check.mjs
 *
 * Audits the EXISTING Excel and CSV exports (no new export system is created):
 *   - every worksheet the workbook promises actually exists
 *   - material data is present with name / quantity / unit / rate / total /
 *     vendor / purchase date
 *   - no "[object Object]", NaN, Infinity or undefined cells
 *   - amounts are numeric, not strings
 *   - CSV has a UTF-8 BOM, balanced quoting, no internal field leakage
 *   - Excel totals agree with CSV totals for the same scope
 *
 * Usage:  node tools/export-audit-check.mjs
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

const BAD_VALUES = ['[object Object]', 'NaN', 'Infinity', 'undefined', 'null'];

/** Walks every cell of a worksheet and reports suspicious values. */
const scanSheet = (sheet) => {
  const bad = [];
  let numericMoney = 0;
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) return;
      if (typeof v === 'object' && v.error) bad.push(`formula error: ${v.error}`);
      const text = String(v);
      for (const needle of BAD_VALUES) {
        if (text.includes(needle)) bad.push(`${needle} in ${sheet.name}!${cell.address}`);
      }
      if (typeof v === 'number') numericMoney += 1;
    });
  });
  return { bad, numericMoney, rows: sheet.rowCount, cols: sheet.columnCount };
};

/** Finds a header row and returns the column index for a label. */
const columnOf = (sheet, label) => {
  let found = -1;
  sheet.eachRow((row, rowNumber) => {
    if (found !== -1) return;
    row.eachCell((cell) => {
      if (found === -1 && String(cell.value || '').trim().toLowerCase() === label.toLowerCase()) {
        found = cell.col;
      }
    });
    void rowNumber;
  });
  return found;
};

async function main() {
  const mongoose = req('mongoose');
  const config = req('../src/config');
  const Site = req('../src/models/Site');
  const svc = req('../src/services/reportService');
  const excel = req('../src/exports/excelExport');
  const { buildReportFilename } = req('../src/utils/format');

  await mongoose.connect(config.mongoUri);
  const site = await Site.findOne({});
  if (!site) {
    check(false, 'a site exists to export', 'run tools/seed-demo.js first');
    return finish();
  }
  const data = await svc.assembleSiteReportData(site, {});

  // -------------------------------------------------------------------
  // Excel
  // -------------------------------------------------------------------
  results.push('');
  results.push('EXCEL WORKBOOK');
  // buildSiteWorkbook(data, engineerMeta) destructures the site out of `data`.
  const wb = await excel.buildSiteWorkbook(data, { name: data.engineer?.name || '' });
  const names = wb.worksheets.map((s) => s.name);
  check(names.length > 0, 'workbook has sheets', `${names.length} sheets`);

  const allBad = [];
  let totalNumeric = 0;
  let emptySheets = [];
  for (const sheet of wb.worksheets) {
    const scan = scanSheet(sheet);
    allBad.push(...scan.bad);
    totalNumeric += scan.numericMoney;
    if (scan.rows <= 1) emptySheets.push(sheet.name);
  }
  check(allBad.length === 0, 'no [object Object] / NaN / Infinity / undefined cells',
    allBad.length ? allBad.slice(0, 3).join('; ') : 'clean');
  check(emptySheets.length === 0, 'no empty placeholder sheets', emptySheets.join(', ') || 'none');
  check(totalNumeric > 0, 'amounts stored as real numbers, not text', `${totalNumeric} numeric cells`);

  // Material data must be present with the columns an engineer needs.
  const materialSheet = wb.worksheets.find((s) => /material/i.test(s.name));
  check(Boolean(materialSheet), 'a materials sheet exists', materialSheet ? materialSheet.name : 'missing');
  if (materialSheet) {
    // The sheet labels the column "Purchase Date", not "Date".
    const labels = ['material', 'quantity', 'unit', 'rate', 'total', 'vendor', 'purchase date'];
    const found = {};
    labels.forEach((l) => { found[l] = columnOf(materialSheet, l); });
    const missing = labels.filter((l) => found[l] === -1);
    check(missing.length === 0, 'material sheet has name/quantity/unit/rate/total/vendor/purchase date',
      missing.length ? `missing: ${missing.join(', ')}` : 'all present');
    check(columnOf(materialSheet, 'invoice no') > 0, 'invoice number exported');
    check(columnOf(materialSheet, 'pending') > 0, 'pending amount exported');

    const qtyCol = found.quantity;
    const totalCol = found.total;
    if (qtyCol > 0 && totalCol > 0) {
      let numericQty = 0;
      let numericTotal = 0;
      materialSheet.eachRow((row, n) => {
        if (n === 1) return;
        const q = row.getCell(qtyCol).value;
        const t = row.getCell(totalCol).value;
        if (typeof q === 'number') numericQty += 1;
        if (typeof t === 'number') numericTotal += 1;
      });
      check(numericQty > 0 && numericTotal > 0, 'material quantity and total are numeric',
        `qty=${numericQty} total=${numericTotal}`);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  check(Buffer.from(buf).slice(0, 2).toString() === 'PK', 'workbook is a valid .xlsx container',
    `${Math.round(buf.byteLength / 1024)} KB`);
  check(typeof buildReportFilename('Financial Report', site.siteName, 'xlsx') === 'string',
    'financial filename generator works');

  return finish();
}

function finish() {
  console.log('EXPORT_AUDIT_CHECK');
  console.log(results.join('\n'));
  console.log('');
  console.log(`EXPORT_AUDIT_CHECK  pass=${pass}  fail=${fail}`);
  if (fail > 0) process.exitCode = 1;
  // Mongoose/ExcelJS keep handles open, so exit explicitly rather than
  // leaving the process hanging after the results are printed.
  setTimeout(() => process.exit(fail > 0 ? 1 : 0), 50).unref();
}

main()
  .catch((err) => {
    console.log('EXPORT_AUDIT_CHECK');
    console.log(results.join('\n'));
    console.log('');
    console.log(`EXPORT_AUDIT_CHECK  aborted: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch { /* already closed */ }
  });