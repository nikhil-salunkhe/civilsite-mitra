/**
 * xlsx-validation-check.mjs
 *
 * Proves the Excel export is a GENUINE Office Open XML (.xlsx) file and that
 * its totals match the JSON report (the same source of truth as the PDF):
 *
 *   A. HTTP contract  - 200, spreadsheetml MIME, Content-Disposition with a
 *      safe CivilSiteMitra_*.xlsx filename, Content-Length == actual bytes.
 *   B. ZIP structure  - PK magic, EOCD record, [Content_Types].xml,
 *      xl/workbook.xml, xl/styles.xml present in the container.
 *   C. ExcelJS reopen - the workbook loads and exposes the expected sheets.
 *   D. Cell hygiene   - no NaN / undefined / [object Object] / HTML anywhere,
 *      numeric money cells are real numbers.
 *   E. Money parity   - Profit + Investment sheets equal the JSON summary
 *      (dashboard / PDF / Excel / CSV all read the same financialService).
 *   F. Period export  - material-period Excel is also a valid xlsx.
 *   G. Synthetic load - hostile inputs (commas, quotes, Marathi, missing
 *      optionals) still produce a valid workbook with no NaN cells.
 *
 * Usage:  node tools/xlsx-validation-check.mjs [baseUrl]
 */
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';

dotenv.config({ path: path.resolve('..', '.env') });
dotenv.config();

const BASE = (process.argv[2] || 'http://localhost:5000/api').replace(/\/$/, '');
const OUT_DIR = path.resolve('.export-preview');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
let pass = 0;
let fail = 0;

const check = (cond, name, extra = '') => {
  if (cond) { pass += 1; results.push(`  ok   ${name}${extra ? ` -> ${extra}` : ''}`); }
  else { fail += 1; results.push(`  FAIL ${name}${extra ? ` -> ${extra}` : ''}`); }
};
const heading = (t) => results.push('', t);

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const BAD_TOKENS = [/NaN/, /\bundefined\b/, /\[object Object\]/, /<html/i, /<!doctype/i, /<br\s*\/?>/i];

/** Walks every cell in a workbook; returns { bad, numbers, strings }. */
const scanWorkbook = (wb) => {
  const bad = [];
  let numbers = 0;
  let strings = 0;
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      row.eachCell({ includeEmpty: false }, (cell, colNo) => {
        const v = cell.value;
        if (typeof v === 'number') {
          if (Number.isNaN(v)) bad.push(`${ws.name}!R${rowNo}C${colNo}=NaN`);
          else numbers += 1;
        } else if (v && typeof v === 'object' && v.text !== undefined) {
          strings += 1; // rich text
          if (BAD_TOKENS.some((re) => re.test(String(v.text)))) {
            bad.push(`${ws.name}!R${rowNo}C${colNo}=${String(v.text).slice(0, 40)}`);
          }
        } else if (typeof v === 'string') {
          strings += 1;
          if (BAD_TOKENS.some((re) => re.test(v))) {
            bad.push(`${ws.name}!R${rowNo}C${colNo}=${v.slice(0, 40)}`);
          }
        }
      });
    });
  }
  return { bad, numbers, strings };
};

/** Finds the first row whose first cell matches `label`; returns sheet row. */
const findLabelRow = (ws, label) => {
  let found = null;
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (found) return;
    const head = String(row.getCell(1).value ?? '').trim();
    if (head === label) found = row;
  });
  return found;
};

const login = async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@civilsitemitra.com', password: 'Admin@123456' }),
  });
  const json = await res.json();
  return json.token || json.data?.token;
};

const getJson = async (url, token) => {
  const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const getBinary = async (url, token) => {
  const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, headers: res.headers };
};

// ---------------------------------------------------------------------------
// Section G fixture: hostile site payload (offline, no server needed).
// ---------------------------------------------------------------------------
const EVIL = {
  site: {
    siteName: 'Tower "A", Block-B | मराठी साइट',
    ownerName: 'ABC "Builders", Pune',
    ownerMobile: '9876543210',
    address: 'Line 1, Near Pump\nSecond Line',
    city: 'Pune', state: 'MH', status: 'Active',
    totalArea: 1200, areaUnit: 'Sq.Ft', ratePerArea: 420,
    overallProgress: 45,
    startDate: '2026-01-01', expectedCompletionDate: '2026-12-31',
    progress: { foundation: 100, plinth: 80, structure: 40 },
  },
  engineer: { name: 'Ramesh & Sons', company: 'R&S Eng.', email: 'r@example.com', mobile: '9000000000' },
  summary: {
    projectValue: 504000, materialCost: 42000, workerCost: 8000, vendorCost: 21000,
    otherExpenses: 500, totalInvestment: 71500, totalPaid: 55500, outstandingPayable: 16000,
    estimatedProfit: 432500, profitMargin: 85.81, totalReceived: 200000,
    pendingReceivable: 304000, realizedProfit: 144500,
  },
  installments: [{ order: 1, name: 'First, "Opening"', description: '', amount: 252000, paidAmount: 200000, dueDate: '2026-03-31', paymentDate: null, paymentMode: 'Cash', status: 'PARTIAL' }],
  payments: [{ date: '2026-04-01', amount: 200000, paymentMode: 'UPI', transactionRef: 'TXN"1"', notes: 'multi\nline note' }],
  workers: [{ name: 'Ramesh & Sons', mobile: '91', workerType: 'Mason', dailyWage: 800, joiningDate: '2026-01-02', totalWorkDays: 10, totalAmount: 8000, paidAmount: 5000, pendingAmount: 3000, status: 'Partial' }],
  workerPayments: [{ date: '2026-04-02', worker: { name: 'Ramesh & Sons' }, workDays: 2, dailyWage: 800, totalAmount: 1600, paidAmount: 1600, pendingAmount: 0, status: 'Paid', paymentDate: '2026-04-02', paymentMode: 'Cash', notes: 'ok' }],
  materials: [{ purchaseDate: '2026-04-03', name: 'Cement, PPC', category: 'Construction', vendor: { name: 'ABC "Builders", Pune' }, quantity: 100, unit: 'Bag', rate: 420, totalAmount: 42000, paidAmount: 30000, pendingAmount: 12000, invoiceNumber: 'INV,1', paymentStatus: 'PENDING' }],
  vendors: [{ name: 'ABC "Builders", Pune', mobile: '92', email: 'a@b.c', city: 'Pune', materialCategory: 'Construction', materialCount: 1, totalPurchases: 42000, paidAmount: 30000, pendingAmount: 12000 }],
  vendorPayments: [{ date: '2026-04-04', vendor: { name: 'ABC "Builders", Pune' }, material: { name: 'Cement, PPC' }, quantity: 50, unit: 'Bag', amount: 21000, paymentMode: 'Cash', transactionRef: '', notes: '' }],
  expenses: [{ expenseDate: '2026-04-05', category: 'Site, Misc', description: 'Tea & snacks', amount: 500, paidAmount: 500, pendingAmount: 0, paymentStatus: 'PAID', paymentMode: 'Cash', paymentDate: '2026-04-05', notes: 'ok' }],
  activities: [{ date: '2026-04-06', workersPresent: 5, workDescription: 'Slab, poured', workCompleted: 'Yes', materialsReceived: 'Cement, PPC', issues: 'None', notes: '', todayExpense: 1200 }],
  documents: [{ fileName: 'Bill, "April".pdf', fileType: 'PDF', size: 2048, uploadedDate: '2026-04-07', notes: 'checked' }],
  generatedAt: new Date(),
};

const run = async () => {
  const token = await login();
  check(Boolean(token), 'admin login yields a token');
  if (!token) throw new Error('cannot login');

  const sitesRes = await getJson('/admin/sites?limit=5', token);
  const site = sitesRes.json?.data?.sites?.[0] || sitesRes.json?.data?.[0] || sitesRes.json?.sites?.[0];
  check(Boolean(site?._id), 'audit site exists', site?.siteName || '');
  if (!site) throw new Error('no site');

  const reportRes = await getJson(`/sites/${site._id}/reports`, token);
  const report = reportRes.json?.data || reportRes.json || {};
  const summary = report.summary;
  check(Boolean(summary), 'GET /reports summary available for parity');

  // ---- A. HTTP contract ---------------------------------------------------
  heading('A. HTTP contract (site Excel)');
  const xls = await getBinary(`/sites/${site._id}/export/excel`, token);
  const xlsType = xls.headers.get('content-type') || '';
  const xlsDisp = xls.headers.get('content-disposition') || '';
  const xlsLen = xls.headers.get('content-length');
  const xlsName = (xlsDisp.match(/filename="?([^";]+)"?/) || [])[1] || '';
  check(xls.status === 200, 'status 200', `got ${xls.status}`);
  check(xlsType.includes('spreadsheetml.sheet'), 'MIME is XLSX', xlsType);
  check(/^attachment; filename=".*\.xlsx"$/.test(xlsDisp), 'Content-Disposition attachment .xlsx', xlsDisp);
  check(/^CivilSiteMitra_.*\.xlsx$/.test(xlsName), 'filename follows CivilSiteMitra_* convention', xlsName);
  check(!/[\\/:*?"<>|]/.test(xlsName), 'filename has no illegal filesystem characters');
  check(Number(xlsLen) === xls.buf.length, 'Content-Length matches body', `${xlsLen} vs ${xls.buf.length}`);
  check(xls.buf.length > 1000, 'body is non-trivial', `${xls.buf.length} bytes`);
  fs.writeFileSync(path.join(OUT_DIR, 'site-report.xlsx'), xls.buf);

  // ---- B. ZIP / OOXML container -------------------------------------------
  heading('B. ZIP / OOXML container');
  check(xls.buf.slice(0, 2).toString('latin1') === 'PK', 'ZIP local-file magic (PK signature)');
  check(xls.buf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])), 'End-of-central-directory record present');
  check(xls.buf.includes(Buffer.from('[Content_Types].xml')), '[Content_Types].xml entry present');
  check(xls.buf.includes(Buffer.from('xl/workbook.xml')), 'xl/workbook.xml entry present');
  check(xls.buf.includes(Buffer.from('xl/styles.xml')), 'xl/styles.xml entry present');
  check(xls.buf.includes(Buffer.from('xl/worksheets/')), 'xl/worksheets/* entry present');
  check(!xls.buf.includes(Buffer.from('<html')), 'not an HTML file masquerading as xlsx');

  // ---- C. ExcelJS reopen ---------------------------------------------------
  heading('C. ExcelJS reopen');
  const wb = new ExcelJS.Workbook();
  let wbOk = true;
  try { await wb.xlsx.load(xls.buf); } catch (e) { wbOk = false; results.push(`       reopen error: ${e.message}`); }
  check(wbOk, 'workbook loads via ExcelJS');
  const sheetNames = wbOk ? wb.worksheets.map((s) => s.name) : [];
  const CORE = ['Site Summary', 'Installments', 'Payments', 'Workers', 'Worker Payments',
    'Materials', 'Vendors', 'Vendor Payments', 'Expenses', 'Activities', 'Investment', 'Profit'];
  check(CORE.every((n) => sheetNames.includes(n)), 'all 12 core sheets present', `${sheetNames.length} sheets`);
  // Progress / Documents sheets only exist when the source data is present.
  // The reports payload exposes `progress` at the TOP level (site summary
  // sub-object does not carry it), so check both shapes.
  const progObj = report.site?.progress || report.progress;
  const hasProgress = Boolean(progObj) && Object.keys(progObj).length > 0;
  const hasDocs = Array.isArray(report.documents) && report.documents.length > 0;
  check(sheetNames.includes('Progress') === hasProgress,
    'Progress sheet matches report data', `expected ${hasProgress}, sheets: ${sheetNames.join('|')}`);
  check(sheetNames.includes('Documents') === hasDocs,
    'Documents sheet matches report data', `expected ${hasDocs}`);
  const firstRows = wbOk ? wb.worksheets[0].actualRowCount : 0;
  check(firstRows > 0, 'first sheet has rows', `${firstRows} rows`);

  // ---- D. Cell hygiene -----------------------------------------------------
  heading('D. Cell hygiene (whole workbook)');
  const scan = wbOk ? scanWorkbook(wb) : { bad: ['not scanned'], numbers: 0, strings: 0 };
  check(scan.bad.length === 0, 'no NaN / undefined / [object Object] / HTML in any cell',
    scan.bad.slice(0, 3).join(' | '));
  check(scan.numbers > 20, 'numeric cells exist (money stored as numbers)', `${scan.numbers} numeric cells`);

  // ---- E. Money parity vs JSON --------------------------------------------
  heading('E. Money parity with GET /reports (same source as PDF)');
  if (wbOk && summary) {
    // Key/value sheets are two columns: Field | Value -> value is column 2.
    const profitRow = findLabelRow(wb.getWorksheet('Profit'), 'ESTIMATED PROFIT');
    const xlProfit = money(profitRow ? profitRow.getCell(2).value : NaN);
    check(xlProfit === money(summary.estimatedProfit), 'Profit!ESTIMATED PROFIT == summary.estimatedProfit',
      `${xlProfit} vs ${money(summary.estimatedProfit)}`);
    const investRow = findLabelRow(wb.getWorksheet('Investment'), 'TOTAL INVESTMENT');
    const xlInvest = money(investRow ? investRow.getCell(2).value : NaN);
    check(xlInvest === money(summary.totalInvestment), 'Investment!TOTAL INVESTMENT (committed) == summary.totalInvestment',
      `${xlInvest} vs ${money(summary.totalInvestment)}`);
    const projRow = findLabelRow(wb.getWorksheet('Site Summary'), 'Project Value');
    const xlValue = money(projRow ? projRow.getCell(2).value : NaN);
    check(xlValue === money(summary.projectValue), 'Site Summary!Project Value == summary.projectValue',
      `${xlValue} vs ${money(summary.projectValue)}`);
    const paidRow = findLabelRow(wb.getWorksheet('Site Summary'), 'Cash Actually Paid');
    const xlPaid = money(paidRow ? paidRow.getCell(2).value : NaN);
    check(xlPaid === money(summary.totalPaid), 'Site Summary!Cash Actually Paid == summary.totalPaid',
      `${xlPaid} vs ${money(summary.totalPaid)}`);
  } else {
    check(false, 'parity block ran (needs summary + reopen)');
  }

  // ---- F. Period export ----------------------------------------------------
  heading('F. Material period Excel');
  const month = new Date().toISOString().slice(0, 7);
  const per = await getBinary(`/sites/${site._id}/reports/material-period/excel?month=${month}`, token);
  check(per.status === 200, 'period Excel status 200', `got ${per.status}`);
  check((per.headers.get('content-type') || '').includes('spreadsheetml.sheet'), 'period MIME is XLSX',
    per.headers.get('content-type') || '');
  check(per.buf.slice(0, 2).toString('latin1') === 'PK', 'period body starts with PK');
  const pwb = new ExcelJS.Workbook();
  let pOk = true;
  try { await pwb.xlsx.load(per.buf); } catch (e) { pOk = false; results.push(`       reopen error: ${e.message}`); }
  check(pOk, 'period workbook reopens', pOk ? `${pwb.worksheets.length} sheets` : '');

  // ---- G. Synthetic hostile payload (offline) ------------------------------
  heading('G. Synthetic hostile payload (offline buildSiteWorkbook)');
  const mod = await import('../src/exports/excelExport.js');
  const buildSiteWorkbook = mod.buildSiteWorkbook || mod.default?.buildSiteWorkbook;
  check(typeof buildSiteWorkbook === 'function', 'buildSiteWorkbook importable');
  if (typeof buildSiteWorkbook === 'function') {
    const ewb = await buildSiteWorkbook(EVIL); // buildSiteWorkbook is async
    const ebuf = Buffer.from(await ewb.xlsx.writeBuffer());
    check(ebuf.slice(0, 2).toString('latin1') === 'PK', 'synthetic workbook is a ZIP');
    check(ebuf.includes(Buffer.from('xl/workbook.xml')), 'synthetic has xl/workbook.xml');
    const rwb = new ExcelJS.Workbook();
    let eOk = true;
    try { await rwb.xlsx.load(ebuf); } catch (e) { eOk = false; results.push(`       reopen error: ${e.message}`); }
    check(eOk, 'synthetic workbook reopens');
    if (eOk) {
      check(rwb.worksheets.length >= 12, 'synthetic has all core sheets', `${rwb.worksheets.length} sheets`);
      check(rwb.worksheets.some((s) => s.name === 'Progress'), 'Progress sheet present with fixture');
      check(rwb.worksheets.some((s) => s.name === 'Documents'), 'Documents sheet present with fixture');
      const es = scanWorkbook(rwb);
      check(es.bad.length === 0, 'no bad tokens in synthetic workbook', es.bad.slice(0, 3).join(' | '));
      let foundMaterial = false;
      rwb.getWorksheet('Materials')?.eachRow({ includeEmpty: false }, (row) => {
        const vals = row.values.map((v) => (v && typeof v === 'object' ? v.text : v));
        if (vals.some((v) => v === 'Cement, PPC')) foundMaterial = true;
      });
      check(foundMaterial, 'comma-containing material name round-trips intact');
      let errCells = 0;
      for (const ws of rwb.worksheets) {
        ws.eachRow({ includeEmpty: false }, (row) => {
          row.eachCell({ includeEmpty: false }, (cell) => {
            const v = cell.value;
            if (v && typeof v === 'object' && v.error !== undefined) errCells += 1;
          });
        });
      }
      check(errCells === 0, 'no formula-error cells', `${errCells} error cells`);
    }
  }

  // ---- summary -------------------------------------------------------------
  results.push('', `XLSX validation: ${pass} passed, ${fail} failed`);
  console.log(results.join('\n'));
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => {
  results.push('', `FATAL: ${e.message}`);
  console.log(results.join('\n'));
  process.exit(1);
});
