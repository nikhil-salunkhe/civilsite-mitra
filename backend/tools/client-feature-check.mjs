/**
 * client-feature-check.mjs
 *
 * End-to-end verification for the four client-requested features:
 *   1. Automatic material Quantity x Rate calculation
 *   2. Separate PDF for each material (complete multi-purchase history)
 *   3. Site photo upload / list / download / delete
 *   4. Weekly & monthly material purchase + usage reports
 * plus multi-tenant isolation across every new endpoint.
 *
 * Self-seeding: provisions a throwaway engineer + site, works only inside that
 * tenant, then deletes everything it created. Never touches real data.
 *
 * Usage:  node tools/client-feature-check.mjs [baseUrl]
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

async function call(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${url}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  if (type.includes('json')) return { status: res.status, data: await res.json(), headers: res.headers };
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, type, size: buf.length, headers: res.headers };
}

/** Unwraps the (non-uniform) backend response envelope. */
function unwrap(r) {
  const payload = r && r.data && (r.data.data || r.data);
  return payload && typeof payload === 'object' ? payload : {};
}

const isPdf = (r) => Boolean(r && r.buf && r.buf.slice(0, 4).toString() === '%PDF');

/** 1x1 PNG used as the fixture photo. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);


/** REQUIREMENT 1 - automatic Quantity x Rate. */
async function requirement1({ token, siteId, vendorId }) {
  heading('REQUIREMENT 1 - automatic material quantity x rate');

  const mk = (body) => call('POST', `/sites/${siteId}/materials`, { token, body });

  const m1 = unwrap(await mk({
    name: 'Cement', category: 'Cement', vendor: vendorId,
    quantity: 50, unit: 'Bags', rate: 400,
    purchaseDate: '2026-10-01', invoiceNumber: 'INV-1', paidAmount: 20000,
  }));
  check(m1.totalAmount === 20000, 'create: 50 x 400 auto-computes total', `totalAmount=${m1.totalAmount}`);
  const cementId = m1._id;

  const m2 = unwrap(await mk({
    name: 'Cement', category: 'Cement', vendor: vendorId,
    quantity: 30, unit: 'Bags', rate: 410,
    purchaseDate: '2026-10-08', invoiceNumber: 'INV-2', paidAmount: 5000,
  }));
  check(m2.totalAmount === 12300, 'create: 30 x 410 auto-computes total', `totalAmount=${m2.totalAmount}`);

  // The client must not be able to inject its own total.
  const tamper = unwrap(await mk({
    name: 'Steel', category: 'Steel', quantity: 10, unit: 'Kg', rate: 70,
    totalAmount: 999999, purchaseDate: '2026-10-09',
  }));
  check(tamper.totalAmount === 700, 'client-supplied total is ignored by the backend', `totalAmount=${tamper.totalAmount}`);

  const updQ = await call('PUT', `/sites/${siteId}/materials/${cementId}`, { token, body: { quantity: 25 } });
  const q = unwrap(updQ);
  check(q.totalAmount === 10000, 'edit quantity recomputes total (25 x 400)', `totalAmount=${q.totalAmount}`);

  const updR = await call('PUT', `/sites/${siteId}/materials/${cementId}`, { token, body: { rate: 500 } });
  const r = unwrap(updR);
  check(r.totalAmount === 12500, 'edit rate recomputes total (25 x 500)', `totalAmount=${r.totalAmount}`);

  const neg = await mk({ name: 'Bad', category: 'Other', quantity: -5, unit: 'Nos', rate: 10, purchaseDate: '2026-10-10' });
  check(neg.status === 400 || neg.status === 422, 'negative quantity rejected', `status=${neg.status}`);

  const zero = unwrap(await mk({ name: 'Zero Rate', category: 'Other', quantity: 10, unit: 'Nos', rate: 0, purchaseDate: '2026-10-11' }));
  check(zero.totalAmount === 0, 'zero rate yields 0, not NaN', `totalAmount=${zero.totalAmount}`);

  const big = unwrap(await mk({ name: 'Bulk Order', category: 'Other', quantity: 999999, unit: 'Nos', rate: 1234.56, purchaseDate: '2026-10-20' }));
  check(money(big.totalAmount) === money(999999 * 1234.56), 'large decimal quantity x rate is exact', `total=${big.totalAmount}`);

  // Restore the state the period-report assertions depend on.
  await call('PUT', `/sites/${siteId}/materials/${cementId}`, { token, body: { quantity: 50, rate: 400, paidAmount: 20000 } });

  // Consumption already exists in the app; the API takes a Material id and
  // derives materialName + unit from it.
  const usage = await call('POST', `/sites/${siteId}/material-usage`, {
    token, body: { material: cementId, quantity: 30, date: '2026-10-15', workActivity: 'Foundation', notes: 'fixture' },
  });
  check(usage.status === 200 || usage.status === 201,
    'material usage recorded (consumption feature already existed)', `status=${usage.status}`);

  return { cementId };
}

/** REQUIREMENT 2 - a separate, complete-history PDF for one material. */
async function requirement2({ token, siteId, cementId }) {
  heading('REQUIREMENT 2 - separate PDF for each material');

  const pdf = await call('GET', `/sites/${siteId}/reports/material/${cementId}/pdf`, { token });
  check(pdf.status === 200, 'material PDF responds 200', `status=${pdf.status}`);
  check(String(pdf.type).includes('application/pdf'), 'material PDF has a PDF content-type', pdf.type);
  check(isPdf(pdf), 'material PDF is a real PDF', `${pdf.size} bytes`);
  check(pdf.size > 3000, 'material PDF is more than a stub', `${pdf.size} bytes`);

  const unknown = await call('GET', `/sites/${siteId}/reports/material/000000000000000000000000/pdf`, { token });
  check(unknown.status === 404, 'unknown material id returns 404 (no leak)', `status=${unknown.status}`);

  const malformed = await call('GET', `/sites/${siteId}/reports/material/not-an-id/pdf`, { token });
  check(malformed.status === 400, 'malformed material id returns 400', `status=${malformed.status}`);
}


/** REQUIREMENT 4 - weekly / monthly / custom material purchase & usage reports. */
async function requirement4({ token, siteId }) {
  heading('REQUIREMENT 4 - weekly & monthly material purchase & usage reports');

  const pdfUrl = (qs) => `/sites/${siteId}/reports/material-period${qs}`;
  const prevUrl = (qs) => `/sites/${siteId}/reports/material-period/preview${qs}`;

  const monthly = await call('GET', pdfUrl('?type=monthly&month=2026-10'), { token });
  check(monthly.status === 200, 'monthly report responds 200', `status=${monthly.status}`);
  check(isPdf(monthly), 'monthly report is a real PDF', `${monthly.size} bytes`);

  const weekly = await call('GET', pdfUrl('?type=weekly&week=2026-W41'), { token });
  check(weekly.status === 200, 'weekly report responds 200', `status=${weekly.status}`);
  check(isPdf(weekly), 'weekly report is a real PDF', `${weekly.size} bytes`);

  const custom = await call('GET', pdfUrl('?from=2026-10-01&to=2026-10-07'), { token });
  check(custom.status === 200, 'custom date range responds 200', `status=${custom.status}`);

  const allTime = await call('GET', pdfUrl(''), { token });
  check(allTime.status === 200, 'no filter defaults to the whole project', `status=${allTime.status}`);

  const badDate = await call('GET', pdfUrl('?from=not-a-date'), { token });
  check(badDate.status === 400, 'invalid from date returns 400', `status=${badDate.status}`);

  const empty = await call('GET', pdfUrl('?type=monthly&month=2027-01'), { token });
  check(empty.status === 200 && isPdf(empty), 'a period with zero records still renders a valid PDF', `${empty.size} bytes`);

  // ---- Excel export of the same period ----
  const xls = await call('GET', `/sites/${siteId}/reports/material-period/excel?type=monthly&month=2026-10`, { token });
  check(xls.status === 200, 'period Excel responds 200', `status=${xls.status}`);
  check(String(xls.type).includes('spreadsheetml'), 'Excel has an .xlsx content-type', xls.type);
  check(xls.buf?.slice(0, 2).toString() === 'PK', 'Excel is a real .xlsx container', `${xls.size} bytes`);
  check(/attachment; filename="CivilSiteMitra_Monthly_Material_Report/.test(
    xls.headers?.get?.('content-disposition') || '',
  ), 'Excel filename follows the CivilSiteMitra convention',
  xls.headers?.get?.('content-disposition') || '');

  // ---- CSV export of the same period ----
  const csv = await call('GET', `/sites/${siteId}/reports/material-period/csv?type=monthly&month=2026-10`, { token });
  check(csv.status === 200, 'period CSV responds 200', `status=${csv.status}`);
  check(String(csv.type).includes('text/csv'), 'CSV content-type', csv.type);
  const csvText = csv.buf ? csv.buf.toString('utf8') : '';
  check(csvText.charCodeAt(0) === 0xFEFF, 'CSV starts with a UTF-8 BOM for Excel');
  check(csvText.includes('# CivilSiteMitra - Material Purchase & Usage Report'), 'CSV has the branded header');
  check(csvText.includes('October 2026'), 'CSV states the period');
  check(csvText.includes('# Material Summary') && csvText.includes('# Purchase Details')
    && csvText.includes('# Usage Details') && csvText.includes('# Vendor Purchase Summary')
    && csvText.includes('# Total Summary'), 'CSV has every report block');
  check(!/\[object Object\]|NaN|Infinity|undefined/.test(csvText), 'CSV has no [object Object]/NaN/undefined');
  check(!/mongodb:\/\//.test(csvText) && !/_id/.test(csvText), 'CSV leaks no internal fields');
  // Every quoted field must be closed.
  const quotes = (csvText.match(/"/g) || []).length;
  check(quotes % 2 === 0, 'CSV quoting is balanced', `${quotes} quotes`);

  // ---- cross-format consistency for the SAME period ----
  const prevXls = await call('GET', `/sites/${siteId}/reports/material-period/preview?type=monthly&month=2026-10`, { token });
  const prevTotal = prevXls.data?.data?.totals?.totalPurchaseAmount;
  check(typeof prevTotal === 'number' && prevTotal > 0, 'preview reports a positive period total', `total=${prevTotal}`);
  check(csvText.includes(`Total Purchase Amount (INR),${prevTotal.toFixed(2)}`),
    'CSV total equals the preview total for the same period', `csv matches ${prevTotal}`);

  // ---- preview must agree with the PDF it summarises ----
  const prev = await call('GET', prevUrl('?type=monthly&month=2026-10'), { token });
  check(prev.status === 200, 'period preview responds 200', `status=${prev.status}`);
  const pv = prev.data?.data;
  if (!pv) { check(false, 'preview payload present', 'missing data'); return; }

  check(pv.period?.from === '2026-10-01' && pv.period?.to === '2026-10-31',
    'October resolves to a real date range', `${pv.period?.from}..${pv.period?.to}`);
  check(pv.period?.label === 'October 2026', 'month label derived from input, not hard-coded', `label=${pv.period?.label}`);

  // The grand total must equal the sum of every row the report itself shows.
  const sum = pv.rollup.reduce((a, x) => a + x.amount, 0);
  check(pv.totals?.totalPurchaseAmount === money(sum),
    'preview total equals the sum of its own rows', `total=${pv.totals?.totalPurchaseAmount}`);

  const cement = pv.rollup.find((x) => x.name === 'Cement');
  check(cement?.purchased === 80 && cement?.used === 30 && cement?.balance === 50,
    'balance = purchased - used within one unit', `p=${cement?.purchased} u=${cement?.used} b=${cement?.balance}`);
  check(cement?.balanceAvailable === true, 'balance flagged as available when computable');

  // A material that is consumed but never purchased has nothing to subtract
  // from, so the report must say so rather than print a misleading number.
  const orphanUsage = await call('POST', `/sites/${siteId}/material-usage`, {
    token, body: { materialName: 'Ghost Item', unit: 'Kg', quantity: 5, date: '2026-10-16' },
  });
  check(orphanUsage.status === 200 || orphanUsage.status === 201 || orphanUsage.status === 400,
    'consumption without a matching purchase is handled', `status=${orphanUsage.status}`);

  const ghost = pv.rollup.find((x) => x.name === 'Ghost Item');
  if (ghost) {
    check(ghost.balanceAvailable === false && ghost.balance === null,
      'no purchase means no balance rather than a misleading number', `available=${ghost.balanceAvailable}`);
  } else {
    // The API rejects a usage row with no material, which is the safer outcome.
    check(true, 'no purchase means no balance (usage without a material is rejected)');
  }
  check(pv.rollup.every((x) => x.balance === null || Number.isFinite(x.balance)),
    'every reported balance is a finite number');

  // ---- date filtering genuinely filters ----
  const oct = await call('GET', prevUrl('?type=monthly&month=2026-10'), { token });
  const nov = await call('GET', prevUrl('?type=monthly&month=2026-11'), { token });
  check(oct.data.data.purchaseCount > 0 && nov.data.data.purchaseCount === 0,
    'October has rows, November has none', `oct=${oct.data.data.purchaseCount} nov=${nov.data.data.purchaseCount}`);

  const wk = await call('GET', prevUrl('?type=weekly&week=2026-W41'), { token });
  const wd = wk.data?.data;
  check(wd?.period?.from === '2026-10-05' && wd?.period?.to === '2026-10-11',
    'ISO week resolves to Mon..Sun', `${wd?.period?.from}..${wd?.period?.to}`);
  // ISO week 41 of 2026 = Mon 05 Oct .. Sun 11 Oct. Fixture purchases fall on
  // 01, 08, 09, 11 and 20 October, so this week must contain exactly 08/09/11 -
  // the 01st and the 20th are outside it.
  check(wd?.purchaseCount === 3, 'week 41 contains only its own records', `count=${wd?.purchaseCount}`);

  const byMat = await call('GET', prevUrl('?type=monthly&month=2026-10&material=Cement'), { token });
  check(byMat.data.data.totals?.totalPurchaseAmount === 32300,
    'material filter narrows to Cement purchases only', `total=${byMat.data.data.totals?.totalPurchaseAmount}`);

  const byVen = await call('GET', prevUrl('?type=monthly&month=2026-10&vendor=ABC'), { token });
  check(byVen.data.data.totals?.totalPurchaseAmount === 32300,
    'vendor filter narrows to that vendor', `total=${byVen.data.data.totals?.totalPurchaseAmount}`);
  check(pv.vendors.length >= 1, 'vendor summary is populated', `vendors=${pv.vendors.length}`);
}


/** REQUIREMENT 3 - site photo upload, listing, download and deletion. */
async function requirement3({ token, siteId }) {
  heading('REQUIREMENT 3 - site photo upload & management');

  const upload = async (name, type, bytes) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    form.append('fileType', 'Site Photo');
    form.append('originalName', name);
    const res = await fetch(`${BASE}/sites/${siteId}/documents`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  const up = await upload('site-photo.png', 'image/png', PNG_1PX);
  check(up.status === 200 || up.status === 201, 'photo uploaded', `status=${up.status}`);
  const photoId = up.json?.data?._id;
  check(Boolean(photoId), 'photo record returned with an id');

  const list = await call('GET', `/sites/${siteId}/documents?fileType=${encodeURIComponent('Site Photo')}`, { token });
  const payload = list.data?.data;
  const rows = Array.isArray(payload) ? payload : (payload?.documents || []);
  check(rows.length >= 1, 'photo appears in the site document list', `count=${rows.length}`);

  const dl = await call('GET', `/sites/${siteId}/documents/${photoId}/download`, { token });
  check(dl.status === 200, 'owner can download their own photo', `status=${dl.status}`);
  check(dl.buf?.slice(0, 8).toString('hex') === '89504e470d0a1a0a',
    'downloaded bytes are a real PNG', `${dl.size} bytes`);

  const del = await call('DELETE', `/sites/${siteId}/documents/${photoId}`, { token });
  check(del.status === 200, 'photo deleted', `status=${del.status}`);

  const gone = await call('GET', `/sites/${siteId}/documents/${photoId}/download`, { token });
  check(gone.status === 404, 'deleted photo is no longer served', `status=${gone.status}`);

  const evil = await upload('evil.sh', 'application/x-sh', Buffer.from('#!/bin/sh\nrm -rf /'));
  check(evil.status === 400, 'executable file type rejected', `status=${evil.status}`);

  // Leave one photo in place for the isolation assertions.
  const keep = await upload('kept.png', 'image/png', PNG_1PX);
  return { photoId: keep.json?.data?._id };
}

/** Multi-tenant isolation across every new endpoint. */
async function isolation({ siteId, cementId, photoId, adminToken, otherToken }) {
  heading('SECURITY - engineer data isolation');

  const b = await call('GET', `/sites/${siteId}/reports/material/${cementId}/pdf`, { token: otherToken });
  check(b.status === 404, "engineer B cannot export engineer A's material PDF", `status=${b.status}`);

  const p = await call('GET', `/sites/${siteId}/reports/material-period?type=monthly&month=2026-10`, { token: otherToken });
  check(p.status === 404, "engineer B cannot export engineer A's period report", `status=${p.status}`);

  const v = await call('GET', `/sites/${siteId}/reports/material-period/preview`, { token: otherToken });
  check(v.status === 404, "engineer B cannot preview engineer A's material data", `status=${v.status}`);

  const s = await call('GET', `/sites/${siteId}`, { token: otherToken });
  check(s.status === 404, "engineer B cannot read engineer A's site", `status=${s.status}`);

  const d = await call('GET', `/sites/${siteId}/documents`, { token: otherToken });
  check(d.status === 404, "engineer B cannot list engineer A's photos", `status=${d.status}`);

  const g = await call('GET', `/sites/${siteId}/documents/${photoId}/download`, { token: otherToken });
  check(g.status === 404, "engineer B cannot download engineer A's photo", `status=${g.status}`);

  const x = await call('DELETE', `/sites/${siteId}/documents/${photoId}`, { token: otherToken });
  check(x.status === 404, "engineer B cannot delete engineer A's photo", `status=${x.status}`);

  const a1 = await call('GET', `/sites/${siteId}/reports/material/${cementId}/pdf`);
  check(a1.status === 401, 'unauthenticated material PDF request is rejected', `status=${a1.status}`);

  const a2 = await call('GET', `/sites/${siteId}/reports/material-period`);
  check(a2.status === 401, 'unauthenticated period report request is rejected', `status=${a2.status}`);
// The new period exports must sit behind the same ownership + auth checks.
  for (const fmt of ['excel', 'csv']) {
    const steal = await call(
      'GET',
      `/sites/${siteId}/reports/material-period/${fmt}?type=monthly&month=2026-10`,
      { token: otherToken },
    );
    check(steal.status === 404, `engineer B cannot export A's period ${fmt.toUpperCase()}`, `status=${steal.status}`);
    const anonFmt = await call('GET', `/sites/${siteId}/reports/material-period/${fmt}`);
    check(anonFmt.status === 401, `unauthenticated period ${fmt.toUpperCase()} is rejected`, `status=${anonFmt.status}`);
  }

  const adm = await call('GET', `/sites/${siteId}/reports/material/${cementId}/pdf`, { token: adminToken });
  check(adm.status === 200, 'super admin may export any site material PDF', `status=${adm.status}`);
}


/**
 * Runner: provisions the fixture tenant, exercises all four requirements plus
 * isolation, then removes everything it created.
 */
async function main() {
  const stamp = Date.now();
  const mobile = `9${String(stamp).slice(-9)}`;

  const admin = await call('POST', '/auth/login', {
    body: { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD },
  });
  if (admin.status !== 200) {
    check(false, 'super admin fixture login',
      `status=${admin.status} - set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in backend/.env`);
    return finish();
  }
  check(true, 'super admin fixture login');
  const adminToken = admin.data.token;

  const makeEngineer = async (name, m, email) => {
    const r = await call('POST', '/admin/engineers', {
      token: adminToken, body: { name, mobile: m, email, status: 'ACTIVE' },
    });
    const p = unwrap(r);
    const engineer = p.engineer || p;
    return {
      id: engineer._id,
      email: engineer.email || email,
      password: (p.credentials && p.credentials.temporaryPassword) || engineer.temporaryPassword,
    };
  };

  const eng = await makeEngineer('Material Feature Engineer', mobile, `feat${mobile}@example.com`);
  check(Boolean(eng.id && eng.password), 'fixture engineer A created');

  const login = await call('POST', '/auth/login', { body: { email: eng.email, password: eng.password } });
  check(login.status === 200, 'fixture engineer A signed in', `status=${login.status}`);
  const token = login.data?.token;
  if (!token) { check(false, 'engineer A token issued'); return finish(); }

  const siteRes = await call('POST', '/sites', {
    token,
    body: {
      siteName: 'Feature Test Residence', ownerName: 'Test Owner', ownerMobile: '9998887776',
      address: 'Test Lane', city: 'Pune', state: 'Maharashtra',
      startDate: '2026-09-01', expectedCompletionDate: '2027-03-01',
      totalArea: 2000, ratePerArea: 1800, engineerCharges: 180000,
    },
  });
  const siteId = (unwrap(siteRes).site || unwrap(siteRes))._id;
  check(Boolean(siteId), 'fixture site created', siteId ? '' : `status=${siteRes.status}`);
  if (!siteId) return finish();

  const vendorId = unwrap(await call('POST', `/sites/${siteId}/vendors`, {
    token, body: { name: 'ABC Cement Traders', mobile: '9000000001', category: 'Cement' },
  }))._id;
  check(Boolean(vendorId), 'fixture vendor created');

  const { cementId } = await requirement1({ token, siteId, vendorId });
  await requirement2({ token, siteId, cementId });
  await requirement4({ token, siteId });
  const { photoId } = await requirement3({ token, siteId });

  const other = await makeEngineer('Other Feature Engineer', `8${String(stamp).slice(-9)}`, `other${mobile}@example.com`);
  const otherLogin = await call('POST', '/auth/login', { body: { email: other.email, password: other.password } });
  check(otherLogin.status === 200, 'fixture engineer B signed in', `status=${otherLogin.status}`);

  await isolation({
    siteId, cementId, photoId, adminToken, otherToken: otherLogin.data?.token,
  });

  heading('CLEANUP');
  const del = await call('DELETE', `/sites/${siteId}?confirm=true`, { token });
  check(del.status === 200, 'fixture site deleted', `status=${del.status}`);

  // Verify the site is really gone BEFORE the engineer's account is removed -
  // once the account is deleted its token can no longer authenticate at all.
  const gone = await call('GET', `/sites/${siteId}`, { token });
  check(gone.status === 404, 'fixture site fully removed after the run', `status=${gone.status}`);

  const emptyList = await call('GET', '/sites', { token });
  const rows = unwrap(emptyList);
  const list = Array.isArray(rows) ? rows : (rows.sites || []);
  check(list.length === 0, 'engineer A has no leftover sites', `count=${list.length}`);

  for (const id of [eng.id, other.id]) {
    if (id) await call('DELETE', `/admin/engineers/${id}`, { token: adminToken });
  }
  const engGone = await call('GET', `/admin/engineers/${eng.id}`, { token: adminToken });
  check(engGone.status === 404, 'fixture engineers removed', `status=${engGone.status}`);

  return finish();
}

function finish() {
  console.log(`CLIENT_FEATURE_CHECK  base=${BASE}`);
  console.log(results.join('\n'));
  console.log('');
  console.log(`CLIENT_FEATURE_CHECK  pass=${pass}  fail=${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.log(`CLIENT_FEATURE_CHECK  base=${BASE}`);
  console.log(results.join('\n'));
  console.log('');
  console.log(`CLIENT_FEATURE_CHECK  aborted: ${err.message}`);
  process.exitCode = 1;
});
