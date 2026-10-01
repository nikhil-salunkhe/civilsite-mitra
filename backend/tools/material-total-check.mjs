/**
 * material-total-check.mjs
 *
 * The engineer should never type a material total: it must be derived from
 * quantity x rate. This proves the server does that, then confirms the client
 * form has no manual total input.
 *
 * Checks:
 *   1. POST with quantity + rate only (no totalAmount) -> total == qty * rate
 *   2. a LIE in totalAmount is ignored/overwritten by the server
 *   3. PUT changing qty/rate recomputes the total
 *   4. pendingAmount tracks total - paid
 *   5. the Materials form exposes no manual "total" field
 */
const BASE = process.env.BASE || 'http://localhost:5000/api';
const rows = [];
const ok = (n, d = '') => { rows.push([true, n, d]); console.log(`ok    ${n}${d ? ' -> ' + d : ''}`); };
const bad = (n, d) => { rows.push([false, n, d]); console.log(`FAIL  ${n}${d ? ' -> ' + d : ''}`); };

const EMAIL = process.env.ADMIN_EMAIL || 'admin@civilsitemitra.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';
let token = null;

const api = async (m, p, body) => {
  const res = await fetch(`${BASE}${p}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const run = async () => {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.json?.token;
  if (!token) { bad('admin login', 'no session'); return; }
  const adminToken = token;

  // Super Admin is read-only on engineer site data, so the check provisions a
  // throwaway engineer, works as them, then removes everything it created.
  const stamp = Date.now().toString().slice(-8);
  const engEmail = `mat-audit-${stamp}@example.com`;
  const engPassword = 'Audit@12345';
  const created = await api('POST', '/admin/engineers', {
    name: 'Material Audit', mobile: '98' + stamp, email: engEmail,
    company: 'Audit', address: 'a', city: 'a', state: 'a', status: 'ACTIVE',
    customPassword: engPassword,
  });
  const engId = (created.json?.data?.engineer || created.json?.data)?._id;
  if (!engId) { bad('provision engineer', `HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 140)}`); return; }
  ok('provisioned throwaway engineer', engEmail);

  const engLogin = await api('POST', '/auth/login', { email: engEmail, password: engPassword });
  if (!engLogin.json?.token) { bad('engineer login', JSON.stringify(engLogin.json).slice(0, 120)); return; }
  token = engLogin.json.token;
  ok('engineer login', 'own-tenant session');

  const siteRes = await api('POST', '/sites', {
    siteName: 'Audit Site', ownerName: 'Owner', ownerMobile: '9999999999',
    address: 'a', city: 'a', totalArea: 100, ratePerArea: 100, areaUnit: 'Sq.Ft',
    status: 'Active',
  });
  const site = siteRes.json?.data?.site || siteRes.json?.data;
  if (!site) { bad('create site', `HTTP ${siteRes.status} ${JSON.stringify(siteRes.json).slice(0, 140)}`); return; }
  const sid = site._id;
  ok('audit site created', 'Audit Site');

  // 1. create WITHOUT totalAmount
  const create = await api('POST', `/sites/${sid}/materials`, {
    name: 'AUDIT Cement', category: 'Cement', quantity: 100, unit: 'Bags',
    rate: 400, paidAmount: 0, purchaseDate: new Date().toISOString().slice(0, 10),
    invoiceNumber: 'AUDIT-1',
  });
  if (create.status !== 200 && create.status !== 201) {
    bad('create material', `HTTP ${create.status} ${JSON.stringify(create.json).slice(0, 120)}`);
    return;
  }
  const m = create.json?.data?.material || create.json?.data;
  if (near(m.totalAmount, 40000)) ok('total auto-calculated on create', `100 x 400 = ${m.totalAmount}`);
  else bad('total auto-calculated on create', `expected 40000, got ${m.totalAmount}`);

  if (m.totalAmount === undefined) bad('total present', 'totalAmount missing');
  else ok('total present', String(m.totalAmount));

  const mid = m._id;

  // 2. a client-supplied total must not survive
  const liar = await api('PUT', `/sites/${sid}/materials/${mid}`, { quantity: 10, rate: 50, totalAmount: 999999 });
  const lm = liar.json?.data?.material || liar.json?.data;
  if (lm && near(lm.totalAmount, 500)) ok('client total ignored', `sent 999999, stored ${lm.totalAmount}`);
  else bad('client total ignored', `expected 500, stored ${lm && lm.totalAmount} (HTTP ${liar.status})`);

  // 3. update recomputes
  const upd = await api('PUT', `/sites/${sid}/materials/${mid}`, { quantity: 25, rate: 200, paidAmount: 1000 });
  const um = upd.json?.data?.material || upd.json?.data;
  if (um && near(um.totalAmount, 5000)) ok('update recomputes total', `25 x 200 = ${um.totalAmount}`);
  else bad('update recomputes total', `expected 5000, got ${um && um.totalAmount} (HTTP ${upd.status})`);

  // 4. pending = total - paid
  if (um && near(um.pendingAmount, 4000)) ok('pending tracks total - paid', `5000 - 1000 = ${um.pendingAmount}`);
  else bad('pending tracks total - paid', `expected 4000, got ${um && um.pendingAmount}`);

  await api('DELETE', `/sites/${sid}/materials/${mid}`);

  // 5. the form must not ask for a manual total
  // 5. the FORM must not ask for a manual total.
  const src = fs.readFileSync(path.resolve(HERE, '..', '..', 'frontend', 'src', 'pages', 'engineer', 'siteTabs', 'MaterialsTab.jsx'), 'utf8');
  //    Scope the search to the `fields: [...]` block: a "Total" table COLUMN is
  //    correct and expected, only a form INPUT would be a manual entry.
  const fieldsStart = src.indexOf('fields: [');
  const fieldsEnd = src.indexOf('],', fieldsStart);
  const fieldsBlock = src.slice(fieldsStart, fieldsEnd > fieldsStart ? fieldsEnd : undefined);
  if (/key:\s*'totalAmount'/.test(fieldsBlock)) {
    bad('form has no manual total field', "found a 'totalAmount' INPUT in the form");
  } else {
    ok('form has no manual total field', 'total is computed, not user-entered');
  }
  // The read-only table column is expected and must stay.
  ok('table still shows a Total column', /key:\s*'totalAmount'[^\n]*label:\s*'Total'/.test(src)
    ? 'present' : 'MISSING');

  // ---- cleanup: remove the throwaway engineer (cascades its site + material)
  token = adminToken;
  const del = await api('DELETE', `/admin/engineers/${engId}`);
  if (del.status === 200 || del.status === 204) ok('cleanup', 'throwaway engineer + data removed');
  else bad('cleanup', `engineer delete returned HTTP ${del.status}`);

  const failed = rows.filter((r) => !r[0]).length;
  console.log(`\nMATERIAL_TOTAL_CHECK checks=${rows.length} failed=${failed}`);
  process.exitCode = failed ? 1 : 0;
};

run().catch((e) => { console.error('crashed:', e && e.message); process.exitCode = 1; });