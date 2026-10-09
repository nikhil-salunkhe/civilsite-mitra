/**
 * csv-validation-check.mjs
 *
 * Proves the CSV export is REAL machine-readable CSV (strict RFC-4180) and
 * that its money matches the JSON report (same source as PDF / Excel):
 *
 *   A. HTTP contract  - 200, text/csv charset, Content-Disposition *.csv,
 *      Content-Length == bytes, UTF-8 BOM present, strict UTF-8 decodable.
 *   B. Shape          - complete export header == UNIFIED_HEADERS (18 cols),
 *      EVERY row the same width, no '#' banners, no blank filler rows.
 *   C. Escaping       - RFC-4180 round-trip: commas, doubled quotes, embedded
 *      CRLF all survive a real state-machine parser cell-exactly.
 *   D. Parity         - section row counts == JSON counts; Estimated Profit /
 *      Project Value / material Amount sums == summary (same financialService).
 *   E. Narrow export  - ?type=materials is a rectangular 12-col table.
 *   F. Validation     - ?type=bogus -> 400 with allowed list; period CSV valid.
 *   G. Synthetic load - hostile payload (Cement, PPC / ABC "Builders" /
 *      multiline / Marathi) round-trips through buildSiteCsv unchanged.
 *
 * Usage:  node tools/csv-validation-check.mjs [baseUrl]
 */
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve('..', '.env') });
dotenv.config();

const BASE = (process.argv[2] || 'http://localhost:5000/api').replace(/\/$/, '');

const results = [];
let pass = 0;
let fail = 0;

const check = (cond, name, extra = '') => {
  if (cond) { pass += 1; results.push(`  ok   ${name}${extra ? ` -> ${extra}` : ''}`); }
  else { fail += 1; results.push(`  FAIL ${name}${extra ? ` -> ${extra}` : ''}`); }
};
const heading = (t) => results.push('', t);

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const BAD_TOKENS = [/NaN/, /\bundefined\b/, /\[object Object\]/, /<html/i, /<!doctype/i];

/** Strict UTF-8 decode - throws when bytes are NOT valid UTF-8. */
const decodeUtf8 = (buf) => new TextDecoder('utf-8', { fatal: true }).decode(buf);

/**
 * Strict RFC-4180 parser (state machine). Handles:
 *   - fields wrapped in double quotes
 *   - "" inside quoted fields as a literal quote
 *   - CR LF, LF row separators; CRLF/LF inside quoted fields preserved
 * Returns rows of cell strings (BOM must be stripped by the caller).
 */
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let cellWasQuoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '' && !cellWasQuoted) {
      inQuotes = true;
      cellWasQuoted = true;
      continue;
    }
    if (ch === ',') { row.push(cell); cell = ''; cellWasQuoted = false; continue; }
    if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; cellWasQuoted = false; i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; cellWasQuoted = false;
      continue;
    }
    cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
};

/** Parses a downloaded CSV buffer: BOM check + strict decode + parse. */
const parseBuffer = (buf) => {
  const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  const text = hasBom ? decodeUtf8(buf.subarray(3)) : decodeUtf8(buf);
  return { hasBom, text, rows: parseCsv(text) };
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

const getText = async (url, token) => {
  const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, headers: res.headers };
};

// ---------------------------------------------------------------------------
// Hostile fixture for the offline buildSiteCsv round-trip (section G).
// Every value is chosen to break naive CSV writers.
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
    progress: { foundation: 100, structure: 40 },
  },
  engineer: { name: 'Ramesh & Sons', company: 'R&S Eng.' },
  summary: {
    projectValue: 504000, materialCost: 42000, workerCost: 8000, vendorCost: 21000,
    otherExpenses: 500, totalInvestment: 71500, totalPaid: 55500, outstandingPayable: 16000,
    estimatedProfit: 432500, profitMargin: 85.81, totalReceived: 200000,
    pendingReceivable: 304000, realizedProfit: 144500,
  },
  payments: [{ date: '2026-04-01', amount: 200000, paymentMode: 'UPI', transactionRef: 'TXN"1"', notes: 'multi\nline note' }],
  installments: [{ order: 1, name: 'First, "Opening"', description: '', amount: 252000, paidAmount: 200000, dueDate: '2026-03-31', status: 'PARTIAL' }],
  workers: [{ name: 'Ramesh & Sons', mobile: '91', workerType: 'Mason', dailyWage: 800, totalWorkDays: 10, totalAmount: 8000, paidAmount: 5000, pendingAmount: 3000, status: 'Partial' }],
  workerPayments: [{ date: '2026-04-02', workerName: 'Ramesh & Sons', workDays: 2, dailyWage: 800, totalAmount: 1600, paidAmount: 1600, pendingAmount: 0, status: 'Paid', paymentMode: 'Cash', notes: 'ok' }],
  materials: [{ purchaseDate: '2026-04-03', name: 'Cement, PPC', category: 'Construction', vendor: { name: 'ABC "Builders", Pune' }, quantity: 100, unit: 'Bag', rate: 420, totalAmount: 42000, paidAmount: 30000, pendingAmount: 12000, invoiceNumber: 'INV,1', paymentStatus: 'PENDING' }],
  vendors: [{ name: 'ABC "Builders", Pune', mobile: '92', email: 'a@b.c', city: 'Pune', materialCategory: 'Construction', materialCount: 1, totalPurchases: 42000, paidAmount: 30000, pendingAmount: 12000 }],
  vendorPayments: [{ date: '2026-04-04', vendor: { name: 'ABC "Builders", Pune' }, material: { name: 'Cement, PPC' }, quantity: 50, unit: 'Bag', amount: 21000, paymentMode: 'Cash', transactionRef: '', notes: '' }],
  expenses: [{ expenseDate: '2026-04-05', category: 'Site, Misc', description: 'Tea & snacks', amount: 500, paidAmount: 500, pendingAmount: 0, paymentStatus: 'PAID', paymentMode: 'Cash', notes: 'ok' }],
  activities: [{ date: '2026-04-06', workersPresent: 5, workDescription: 'Slab, poured', workCompleted: 'Yes', materialsReceived: 'Cement, PPC', issues: 'None', notes: '', todayExpense: 1200 }],
  documents: [{ fileName: 'Bill, "April".pdf', fileType: 'PDF', size: 2048, uploadedDate: '2026-04-07', notes: 'checked' }],
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

  // ---- A. HTTP contract (complete CSV) ------------------------------------
  heading('A. HTTP contract (complete CSV)');
  const csv = await getText(`/sites/${site._id}/export/csv?type=complete`, token);
  const ctype = csv.headers.get('content-type') || '';
  const cdisp = csv.headers.get('content-disposition') || '';
  const cname = (cdisp.match(/filename="?([^";]+)"?/) || [])[1] || '';
  check(csv.status === 200, 'status 200', `got ${csv.status}`);
  check(ctype.includes('text/csv'), 'MIME is text/csv', ctype);
  check(/\.csv$/.test(cname), 'Content-Disposition filename ends .csv', cname);
  check(!/[\\/:*?"<>|]/.test(cname), 'filename has no illegal filesystem characters', cname);
  check(Number(csv.headers.get('content-length')) === csv.buf.length, 'Content-Length matches body',
    `${csv.headers.get('content-length')} vs ${csv.buf.length}`);

  const parsed = parseBuffer(csv.buf);
  check(parsed.hasBom, 'UTF-8 BOM present (Excel encoding hint)');
  check(csv.buf.includes(Buffer.from('\r\n')), 'CRLF row separators used');

  // ---- B. Shape -----------------------------------------------------------
  heading('B. Shape (complete export = unified table)');
  const mod = await import('../src/exports/csvExport.js');
  const UNIFIED_HEADERS = mod.UNIFIED_HEADERS || mod.default?.UNIFIED_HEADERS;
  const rows = parsed.rows;
  check(Array.isArray(UNIFIED_HEADERS) && UNIFIED_HEADERS.length === 18, 'UNIFIED_HEADERS has 18 columns',
    String(UNIFIED_HEADERS?.length));
  check(rows.length > 1, 'has header + data rows', `${rows.length} rows`);
  check(JSON.stringify(rows[0]) === JSON.stringify(UNIFIED_HEADERS), 'header row == UNIFIED_HEADERS',
    JSON.stringify(rows[0]?.slice(0, 3)));
  const widths = new Set(rows.map((r) => r.length));
  check(widths.size === 1 && rows[0].length === 18, 'EVERY row has exactly 18 columns',
    `widths=${[...widths].join('/')}`);
  check(!parsed.text.split('\r\n').some((l) => l.startsWith('#')), 'no # comment banner lines');
  check(!rows.some((r) => r.every((c) => c === '')), 'no blank filler rows');
  const bad = [];
  rows.forEach((r, i) => r.forEach((c, j) => {
    if (BAD_TOKENS.some((re) => re.test(c))) bad.push(`r${i + 1}c${j + 1}=${c.slice(0, 30)}`);
  }));
  check(bad.length === 0, 'no NaN / undefined / [object Object] / HTML cells', bad.slice(0, 3).join(' | '));

  // ---- C. Escaping round-trip (RFC-4180) ----------------------------------
  heading('C. Escaping round-trip (RFC-4180)');
  const csvCell = mod.csvCell || mod.default?.csvCell;
  const csvBody = mod.csvBody || mod.default?.csvBody;
  check(typeof csvCell === 'function' && typeof csvBody === 'function', 'csvCell + csvBody importable');
  if (typeof csvBody === 'function') {
    const tricky = [
      ['Cement, PPC', 'ABC "Builders", Pune', 'multi\nline note', 'plain'],
      ['Line 1, Near Pump\r\nSecond Line', 'quote "" doubled', '', '0'],
    ];
    const body = csvBody(tricky).replace(/^\uFEFF/, '');
    check(body.includes('"Cement, PPC"'), 'comma field is quoted in raw text');
    check(body.includes('"ABC ""Builders"", Pune"'), 'quotes are doubled in raw text');
    const roundTrip = parseCsv(body);
    check(JSON.stringify(roundTrip) === JSON.stringify(tricky), 'parse(csvBody(x)) === x cell-exact',
      JSON.stringify(roundTrip[0]?.slice(0, 2)));
  }

  // ---- D. Parity with GET /reports ---------------------------------------
  heading('D. Section counts + money parity with GET /reports');
  const sectionCount = (label) => rows.slice(1).filter((r) => r[0] === label).length;
  const COL = { section: 0, name: 2, amount: 9, paid: 10, pending: 11 };
  const pairs = [
    ['Materials', report.materials?.length ?? 0],
    ['Vendors', report.vendors?.length ?? 0],
    ['Payments Received', report.payments?.length ?? 0],
    ['Vendor Payments', report.vendorPayments?.length ?? 0],
    ['Site Expenses', report.expenses?.length ?? 0],
    ['Activities', report.activities?.length ?? 0],
    ['Workers', report.workers?.length ?? 0],
    ['Installments', report.installments?.length ?? 0],
  ];
  for (const [label, expected] of pairs) {
    check(sectionCount(label) === expected, `section "${label}" row count == JSON count`,
      `${sectionCount(label)} vs ${expected}`);
  }
  const findCell = (section, name, col) => {
    const row = rows.find((r) => r[COL.section] === section && r[COL.name] === name);
    return row ? money(row[col]) : NaN;
  };
  check(findCell('Investment & Profit', 'Estimated Profit (INR)', COL.amount) === money(summary.estimatedProfit),
    'CSV Estimated Profit == summary.estimatedProfit',
    `${findCell('Investment & Profit', 'Estimated Profit (INR)', COL.amount)} vs ${money(summary.estimatedProfit)}`);
  check(findCell('Investment & Profit', 'Total Investment Committed (INR)', COL.amount) === money(summary.totalInvestment),
    'CSV Total Investment == summary.totalInvestment',
    `${findCell('Investment & Profit', 'Total Investment Committed (INR)', COL.amount)} vs ${money(summary.totalInvestment)}`);
  check(findCell('Site Information', 'Project Value', COL.amount) === money(summary.projectValue),
    'CSV Project Value == summary.projectValue');
  const matSum = rows.slice(1)
    .filter((r) => r[COL.section] === 'Materials')
    .reduce((a, r) => a + money(r[COL.amount]), 0);
  const jsonMatSum = (report.materials || []).reduce((a, m) => a + (Number(m.totalAmount) || 0), 0);
  check(money(matSum) === money(jsonMatSum), 'sum of Materials Amount == JSON sum of totalAmount',
    `${money(matSum)} vs ${money(jsonMatSum)}`);

  // ---- E. Narrow single-dataset export -------------------------------------
  heading('E. Narrow export (?type=materials)');
  const narrow = await getText(`/sites/${site._id}/export/csv?type=materials`, token);
  check(narrow.status === 200, 'narrow CSV status 200', `got ${narrow.status}`);
  const np = parseBuffer(narrow.buf);
  check(np.hasBom, 'narrow CSV has BOM');
  const nWidths = new Set(np.rows.map((r) => r.length));
  check(nWidths.size === 1, 'narrow CSV is rectangular', `widths=${[...nWidths].join('/')}`);
  check(np.rows[0]?.[1] === 'Material', 'narrow header is the materials schema', JSON.stringify(np.rows[0]?.slice(0, 3)));
  check(np.rows.length - 1 === (report.materials?.length || 0), 'narrow row count == JSON materials count',
    `${np.rows.length - 1} vs ${report.materials?.length ?? 0}`);

  // ---- F. Validation + period CSV -----------------------------------------
  heading('F. Type validation + material-period CSV');
  const bogus = await getText(`/sites/${site._id}/export/csv?type=bogus`, token);
  check(bogus.status === 400, 'unknown ?type -> 400', `got ${bogus.status}`);
  const bogusJson = JSON.parse(bogus.buf.toString('utf8'));
  check(/Allowed values/.test(bogusJson?.message || ''), '400 message lists allowed values',
    String(bogusJson?.message).slice(0, 60));
  const month = new Date().toISOString().slice(0, 7);
  const period = await getText(`/sites/${site._id}/reports/material-period/csv?type=monthly&month=${month}`, token);
  check(period.status === 200, 'period CSV status 200', `got ${period.status}`);
  check((period.headers.get('content-type') || '').includes('text/csv'), 'period MIME is text/csv',
    period.headers.get('content-type') || '');
  const pp = parseBuffer(period.buf);
  check(pp.hasBom, 'period CSV has BOM');
  check(pp.rows.length > 0, 'period CSV parses to rows', `${pp.rows.length} rows`);
  const pWidths = new Set(pp.rows.map((r) => r.length));
  check(pWidths.size === 1 && pp.rows[0].length === 17, 'period CSV is ONE rectangular 17-col table',
    `widths=${[...pWidths].join('/')}`);
  check(pp.rows[0][0] === 'Section', 'period header starts with Section column',
    JSON.stringify(pp.rows[0]?.slice(0, 3)));
  check(!pp.text.split('\r\n').some((l) => l.startsWith('#')), 'period CSV has no # banner lines');
  const pBad = [];
  pp.rows.forEach((r, i) => r.forEach((c, j) => {
    if (BAD_TOKENS.some((re) => re.test(c))) pBad.push(`r${i + 1}c${j + 1}=${c.slice(0, 30)}`);
  }));
  check(pBad.length === 0, 'period CSV has no bad tokens', pBad.slice(0, 3).join(' | '));

  // Parity against the JSON preview of the SAME period (shared rollup).
  const prevRes = await getJson(
    `/sites/${site._id}/reports/material-period/preview?type=monthly&month=${month}`, token);
  const prev = prevRes.json?.data || {};
  check(prevRes.status === 200 && prev.totals, 'period preview JSON available', `status=${prevRes.status}`);
  if (prev.totals) {
    const pCount = (label) => pp.rows.slice(1).filter((r) => r[0] === label).length;
    const PCOL = { section: 0, name: 2, amount: 10 };
    check(pCount('Report Info') > 0, 'Report Info rows present', String(pCount('Report Info')));
    check(pCount('Material Summary') === (prev.rollup?.length || 0),
      'Material Summary rows == preview.rollup count', `${pCount('Material Summary')} vs ${prev.rollup?.length}`);
    check(pCount('Purchase Details') === (prev.purchaseCount ?? 0),
      'Purchase Details rows == preview.purchaseCount', `${pCount('Purchase Details')} vs ${prev.purchaseCount}`);
    check(pCount('Usage Details') === (prev.usageCount ?? 0),
      'Usage Details rows == preview.usageCount', `${pCount('Usage Details')} vs ${prev.usageCount}`);
    // Preview vendors are aggregates ({vendor, amount}) without row detail:
    // assert the vendor SET and the money sum line up with the CSV rows.
    const csvVendorNames = [...new Set(pp.rows.slice(1)
      .filter((r) => r[0] === 'Vendor Purchase Summary').map((r) => r[4]))].sort();
    const jsonVendorNames = (prev.vendors || []).map((v) => v.vendor).sort();
    check(JSON.stringify(csvVendorNames) === JSON.stringify(jsonVendorNames),
      'Vendor Purchase Summary vendor set == preview vendors',
      `${csvVendorNames.join('|')} vs ${jsonVendorNames.join('|')}`);
    const vendorAmountSum = pp.rows.slice(1)
      .filter((r) => r[0] === 'Vendor Purchase Summary')
      .reduce((a, r) => a + money(r[PCOL.amount]), 0);
    const jsonVendorSum = (prev.vendors || []).reduce((a, v) => a + (Number(v.amount) || 0), 0);
    check(money(vendorAmountSum) === money(jsonVendorSum),
      'Vendor Purchase Summary amount sum == preview vendor amount sum',
      `${money(vendorAmountSum)} vs ${money(jsonVendorSum)}`);
    const totalRow = pp.rows.find((r) => r[0] === 'Total Summary'
      && r[PCOL.name] === 'Total Purchase Amount (INR)');
    check(totalRow && money(totalRow[PCOL.amount]) === money(prev.totals.totalPurchaseAmount),
      'period Total Purchase Amount == preview.totals.totalPurchaseAmount',
      `${totalRow ? money(totalRow[PCOL.amount]) : 'missing'} vs ${money(prev.totals.totalPurchaseAmount)}`);
  }

  // ---- G. Synthetic hostile payload (offline buildSiteCsv) -----------------
  heading('G. Synthetic hostile payload (offline buildSiteCsv)');
  const buildSiteCsv = mod.buildSiteCsv || mod.default?.buildSiteCsv;
  const CSV_TYPES = mod.CSV_TYPES || mod.default?.CSV_TYPES;
  check(typeof buildSiteCsv === 'function' && Array.isArray(CSV_TYPES), 'buildSiteCsv + CSV_TYPES importable');
  if (typeof buildSiteCsv === 'function' && Array.isArray(CSV_TYPES)) {
    const evilText = buildSiteCsv(EVIL, CSV_TYPES);
    check(evilText.startsWith('\uFEFF'), 'offline output starts with BOM');
    const evilBuf = Buffer.from(evilText, 'utf8');
    let decoded = '';
    try { decoded = evilBuf.subarray(3).toString('utf8'); check(true, 'offline output is valid UTF-8'); }
    catch { check(false, 'offline output is valid UTF-8'); }
    check(decoded.includes('मराठी साइट'), 'Marathi text survives encoding');
    check(decoded.includes('"ABC ""Builders"", Pune"'), 'doubled quotes present in raw offline text');
    const erows = parseCsv(decoded);
    const eWidths = new Set(erows.map((r) => r.length));
    check(eWidths.size === 1 && erows[0].length === 18, 'offline unified: every row 18 cols',
      `widths=${[...eWidths].join('/')}`);
    check(JSON.stringify(erows[0]) === JSON.stringify(UNIFIED_HEADERS), 'offline header == UNIFIED_HEADERS');
    const cells = erows.flat();
    check(cells.includes('Cement, PPC'), 'comma material name round-trips as ONE cell');
    check(cells.includes('ABC "Builders", Pune'), 'quoted vendor name round-trips as ONE cell');
    check(cells.some((c) => c.includes('\n')), 'multiline address/note survives as embedded LF');
    check(!cells.some((c) => BAD_TOKENS.some((re) => re.test(c))), 'no bad tokens in offline cells');
    const eFind = (section, name, col) => {
      const row = erows.find((r) => r[0] === section && r[2] === name);
      return row ? row[col] : null;
    };
    check(eFind('Site Information', 'Project Value', 9) === '504000.00',
      'offline Project Value is money-formatted', String(eFind('Site Information', 'Project Value', 9)));
    check(eFind('Investment & Profit', 'Estimated Profit (INR)', 9) === '432500.00',
      'offline Estimated Profit matches fixture', String(eFind('Investment & Profit', 'Estimated Profit (INR)', 9)));
    const narrowText = buildSiteCsv(EVIL, ['materials']);
    const nrows = parseCsv(narrowText.replace(/^\uFEFF/, ''));
    const nW = new Set(nrows.map((r) => r.length));
    check(nW.size === 1 && nrows[0].length === 12, 'offline narrow materials is rectangular 12 cols',
      `widths=${[...nW].join('/')}`);
    check(nrows.some((r) => r[1] === 'Cement, PPC'), 'narrow material name round-trips');
  }

  // ---- summary -------------------------------------------------------------
  results.push('', `CSV validation: ${pass} passed, ${fail} failed`);
  console.log(results.join('\n'));
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => {
  results.push('', `FATAL: ${e.message}`);
  console.log(results.join('\n'));
  process.exit(1);
});
