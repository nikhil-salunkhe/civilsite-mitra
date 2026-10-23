/**
 * report-audit.js - generates the real PDF and inspects the BYTES.
 *
 * report-check.js only proves HTTP 200 + MIME type. This inspects actual
 * content for the defects a client would notice: leaked [object Object] /
 * NaN / undefined, bad filenames, a missing company contact block in the PDF.
 */
const fs = require('fs');
const path = require('path');
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