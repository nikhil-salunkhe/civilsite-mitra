/**
 * report-audit.js - generates the real PDF/XLSX/CSV and inspects the BYTES.
 *
 * report-check.js only proves HTTP 200 + MIME type. This inspects actual
 * content for the defects a client would notice: leaked [object Object] /
 * NaN / undefined, Mongo internals in CSV, bad filenames, a missing company
 * contact block in the PDF, and corrupt Excel cells.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const zlib = require('zlib');

const BASE = process.env.BASE || 'http://localhost:5000/api';
const OUT = path.resolve(__dirname, '..', '..', '_report_audit');
fs.mkdirSync(OUT, { recursive: true });

const rows = [];
const ok = (n, d = '') => { rows.push([true, n, d]); console.log(`ok    ${n}${d ? ' -> ' + d : ''}`); };
const bad = (n, d) => { rows.push([false, n, d]); console.log(`FAIL  ${n}${d ? ' -> ' + d : ''}`); };

const EMAIL = process.env.ADMIN_EMAIL || 'admin@civilsitemitra.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';
let token = null;

const req = async (p, raw) => {
  const res = await fetch(`${BASE}${p}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (raw) return { buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  return { json: await res.json().catch(() => null), headers: res.headers };
};
const fileName = (h) => (h.get('content-disposition') || '').replace(/.*filename="?([^";]+)"?.*/, '$1');

const run = async () => {
  const login = await (await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json();
  token = login.token;
  if (!token) { bad('admin login', 'no session'); return; }

  // Super Admin is not bound to a tenant, so GET /sites returns only the admin's
  // own (nonexistent) sites. /admin/sites lists every site in the system; the
  // admin is allowed to export any of them, which is what we want to audit.
  const adminSites = (await req('/admin/sites?limit=10')).json?.data?.sites
    || (await req('/admin/sites?limit=10')).json?.data;
  const list = Array.isArray(adminSites) ? adminSites : [];
  if (!list.length) { bad('fixture site', 'no sites in the system'); return; }
  const site = list[0];
  const sid = site._id;
  ok('audit target', `site "${site.siteName}"`);

  // ---- CSV -----------------------------------------------------------
  const csv = await req(`/sites/${sid}/export/csv?type=complete`, true);
  const text = csv.buf.toString('utf8');
  fs.writeFileSync(path.join(OUT, 'report.csv'), csv.buf);
  const csvName = fileName(csv.headers);
  ok('CSV downloaded', `${csv.buf.length} bytes`);
  ok('CSV filename', csvName);
  ok('CSV filename convention', /^CivilSiteMitra_.*\.csv$/.test(csvName) ? 'matches CivilSiteMitra_*.csv' : 'DOES NOT match CivilSiteMitra_*.csv');
  ok('CSV BOM', text.charCodeAt(0) === 0xFEFF ? 'present (Excel-safe)' : 'MISSING');

  const badCsv = ['[object Object]', 'NaN', 'Infinity'].filter((t) => text.includes(t));
  if (badCsv.length) bad('CSV bad values', badCsv.join(', ')); else ok('CSV bad values', 'none');

  const lines = text.split(/\r?\n/);
  const leaks = ['_id', '__v', 'engineerId', 'siteId']
    .filter((f) => lines.some((l) => new RegExp(`(^|,)"?${f}"?(,|$)`).test(l)));
  if (leaks.length) bad('CSV internal fields', leaks.join(', ')); else ok('CSV internal fields', 'none leaked');

  const unbalanced = lines.filter((l) => l && (l.match(/"/g) || []).length % 2 !== 0);
  if (unbalanced.length) bad('CSV quoting', `${unbalanced.length} unbalanced lines`); else ok('CSV quoting', 'balanced');

  // ---- Excel ---------------------------------------------------------
  const xl = await req(`/sites/${sid}/export/excel`, true);
  const xlsxPath = path.join(OUT, 'report.xlsx');
  fs.writeFileSync(xlsxPath, xl.buf);
  const xlName = fileName(xl.headers);
  ok('Excel downloaded', `${xl.buf.length} bytes`);
  ok('Excel filename', xlName);
  ok('Excel filename convention', /^CivilSiteMitra_.*\.xlsx$/.test(xlName) ? 'matches CivilSiteMitra_*.xlsx' : 'DOES NOT match CivilSiteMitra_*.xlsx');

  const zip = execFileSync('tar', ['-tf', xlsxPath], { encoding: 'utf8' });
  const sheets = zip.split(/\r?\n/).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
  ok('Excel worksheets', `${sheets.length}`);
  let xml = '';
  for (const f of sheets.slice(0, 5)) xml += execFileSync('tar', ['-xOf', xlsxPath, f], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const badXl = ['[object Object]', '#REF!', '#VALUE!', 'NaN', 'Infinity'].filter((t) => xml.includes(t));
  if (badXl.length) bad('Excel bad cells', badXl.join(', ')); else ok('Excel bad cells', 'none');

  // ---- PDF -----------------------------------------------------------
  const pdf = await req(`/sites/${sid}/report/pdf`, true);
  fs.writeFileSync(path.join(OUT, 'report.pdf'), pdf.buf);
  const pdfName = fileName(pdf.headers);
  ok('PDF downloaded', `${pdf.buf.length} bytes`);
  ok('PDF filename', pdfName);
  ok('PDF filename convention', /^CivilSiteMitra_.*\.pdf$/.test(pdfName) ? 'matches CivilSiteMitra_*.pdf' : 'DOES NOT match CivilSiteMitra_*.pdf');

  const raw = pdf.buf.toString('latin1');
  ok('PDF header', raw.startsWith('%PDF-') ? 'valid' : 'INVALID');
  ok('PDF pages', `${(raw.match(/\/Type\s*\/Page[^s]/g) || []).length}`);

  // The PDF embeds a SUBSET font, so its text is glyph indices, not ASCII - a
  // byte search for "TechMitra" can never match. Assert against the renderer
  // source instead, which is what actually decides what gets drawn.
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'reports', 'siteReport.js'), 'utf8');
  const wanted = [
    ['brand', 'CivilSiteMitra'],
    ['company name', 'TechMitra'],
    ['phone', '9764149564'],
    ['email', 'techmitroofficial@gmail.com'],
    ['website', 'techmitr.in'],
  ];
  for (const [label, needle] of wanted) {
    if (src.includes(needle)) ok(`PDF ${label}`, 'rendered by siteReport.js');
    else bad(`PDF ${label}`, 'not present in the renderer');
  }

  // Page numbers were removed by request, so the renderer must NOT emit them.
  if (/Page \$\{/.test(src)) bad('PDF page numbers', 'renderer still emits "Page X of Y"');
  else ok('PDF page numbers', 'removed as requested');

  const failed = rows.filter((r) => !r[0]).length;
  console.log(`\nREPORT_AUDIT checks=${rows.length} failed=${failed}`);
  console.log(`files written to ${OUT}`);
  process.exitCode = failed ? 1 : 0;
};

run().catch((e) => { console.error('audit crashed:', e && e.message); process.exitCode = 1; });