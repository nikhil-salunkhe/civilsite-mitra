/* CivilSiteMitra E2E smoke test — self-healing: creates its own fixtures,
 * runs all checks, then cleans up. Requires MongoDB + API on port 5000. */
const BASE = process.env.API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@civilsitemitra.com';
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456';

const RUN_ID = Date.now().toString(36);
// Mobiles must differ per run: an interrupted run leaves fixtures behind and the
// admin API rejects a duplicate mobile number.
const RUN_SUFFIX = String(Date.now()).slice(-8);
// Smallest valid PNG (1x1, transparent) - used for the photo/document upload checks.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);
const ORIGIN = BASE.replace(/\/api\/?$/, '');
// Upload-file accounting for the profile-photo lifecycle checks.
const fs = require('fs');
const path = require('path');
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const countUploads = () => {
  try {
    return fs.readdirSync(UPLOADS_DIR).filter((f) => !f.startsWith('.')).length;
  } catch (e) {
    return 0;
  }
};
const ENGINEER_A = {
  name: 'Priya Sharma', email: `priya.${RUN_ID}@test.com`, mobile: `91${RUN_SUFFIX}`,
  company: 'PS Constructions', password: 'Priya@1234', customPassword: 'Priya@1234', status: 'ACTIVE',
};
const ENGINEER_B = {
  name: 'Vikram Rao', email: `vikram.${RUN_ID}@test.com`, mobile: `92${RUN_SUFFIX}`,
  company: 'VR Builders', password: 'Vikram@1234', customPassword: 'Vikram@1234', status: 'ACTIVE',
};

let passCount = 0;
let failCount = 0;
const createdIds = { engineers: [], site: null };

const pass = (m) => { passCount++; console.log('PASS ', m); };
const fail = (m, e) => {
  failCount++;
  console.log('FAIL ', m, e ? '-> ' + (e.message || e) : '');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function req(method, path, { token, body, retries = 2 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* empty body */ }

    // This suite fires far more requests than a human session would. If the API
    // throttles us, honour Retry-After (capped) and retry rather than reporting
    // a legitimate rate limit as a product bug.
    if (res.status === 429 && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Math.min(retryAfter ? retryAfter * 1000 : 1000 * (attempt + 1), 5000));
      continue;
    }

    return { status: res.status, data };
  }
}

async function expect(label, cond, detail) {
  if (cond) { pass(label); return true; }
  fail(label, detail);
  return false;
}

// The list endpoints are paginated wrappers (data.activities, data.payments,
// ...), so pull the first array out of the payload without hard-coding keys.
const firstArray = (payload) => {
  const d = payload?.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const value of Object.values(d)) if (Array.isArray(value)) return value;
  }
  return [];
};

// Drives the same five calls every site-dashboard tab performs:
// create -> list -> update -> delete -> list-again.
async function crud(label, base, createBody, updateBody, token) {
  const created = await req('POST', base, { token, body: createBody });
  const id = created.data?.data?.item?._id || created.data?.data?._id;
  await expect(`${label}: create`, created.status < 300 && Boolean(id),
    created.data?.message || `status ${created.status}`);
  if (!id) return null;

  const list = await req('GET', base, { token });
  await expect(`${label}: list shows the new record`, firstArray(list.data).length === 1,
    `count=${firstArray(list.data).length}`);

  const updated = await req('PUT', `${base}/${id}`, { token, body: updateBody });
  await expect(`${label}: update`, updated.status < 300, updated.data?.message || `status ${updated.status}`);

  const removed = await req('DELETE', `${base}/${id}`, { token });
  await expect(`${label}: delete`, removed.status < 300, removed.data?.message || `status ${removed.status}`);

  const after = await req('GET', base, { token });
  await expect(`${label}: list empty after delete`, firstArray(after.data).length === 0,
    `count=${firstArray(after.data).length}`);
  return id;
}

async function adminLogin() {
  const { data } = await req('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  return data?.token || data?.data?.token;
}

// Fixtures from an interrupted run would collide with the next run (mobile is
// unique per run but stale rows still pile up), so harness accounts are swept
// before and after every run.
async function sweepStaleEngineers(token) {
  if (!token) return 0;
  const list = await req('GET', '/admin/engineers?limit=200', { token });
  const engineers = firstArray(list.data);
  let removed = 0;
  for (const eng of engineers) {
    const email = eng?.email || '';
    if (!/^(priya|vikram)\.[a-z0-9]+@test\.com$/.test(email)) continue;
    const r = await req('DELETE', `/admin/engineers/${eng._id}`, { token });
    if (r.status < 300) removed++;
  }
  return removed;
}

async function cleanup() {
  try {
    const token = await adminLogin();
    if (!token) return;
    for (const id of createdIds.engineers) {
      await req('DELETE', `/admin/engineers/${id}`, { token });
    }
    await sweepStaleEngineers(token);
  } catch (_) { /* best effort */ }
}

async function main() {
  console.log(`\n=== CivilSiteMitra smoke test vs ${BASE} ===\n`);

  const health = await req('GET', '/health');
  await expect('Server responds over HTTP', health.status < 500, `status ${health.status}`);

  // Monitoring probes must never be throttled, otherwise uptime checks report
  // an outage whenever the API is simply busy.
  {
    let throttled = 0;
    for (let i = 0; i < 8; i++) {
      const r = await req('GET', '/health');
      if (r.status !== 200) throttled++;
    }
    await expect('Health endpoint survives a burst (not throttled)', throttled === 0,
      `${throttled} of 8 requests throttled`);
  }

  const login = await req('POST', '/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = login.data?.token || login.data?.data?.token;
  await expect('Admin login', Boolean(adminToken), login.data?.message || `status ${login.status}`);
  if (!adminToken) throw new Error('Cannot continue without admin login');

  // Clear anything an interrupted earlier run left behind.
  try {
    const stale = await sweepStaleEngineers(adminToken);
    if (stale) console.log(`INFO  removed ${stale} stale fixture engineer(s) from an earlier run\n`);
  } catch (_) { /* best effort */ }

  const ra = await req('POST', '/admin/engineers', { token: adminToken, body: ENGINEER_A });
  const engA = ra.data?.data?.engineer || ra.data?.data?.user;
  await expect('Create engineer A (Priya)', ra.status < 300 && Boolean(engA?._id),
    ra.data?.message || `status ${ra.status}`);
  if (engA?._id) createdIds.engineers.push(engA._id);

  const rb = await req('POST', '/admin/engineers', { token: adminToken, body: ENGINEER_B });
  const engB = rb.data?.data?.engineer || rb.data?.data?.user;
  await expect('Create engineer B (Vikram)', rb.status < 300 && Boolean(engB?._id),
    rb.data?.message || `status ${rb.status}`);
  if (engB?._id) createdIds.engineers.push(engB._id);
  if (!engA?._id || !engB?._id) throw new Error('Cannot continue without engineer fixtures');

  const loginA = await req('POST', '/auth/login', { body: { email: ENGINEER_A.email, password: ENGINEER_A.password } });
  const tokenA = loginA.data?.token || loginA.data?.data?.token;
  await expect('Engineer A login', Boolean(tokenA), loginA.data?.message || `status ${loginA.status}`);
  if (!tokenA) throw new Error('Cannot continue without engineer A login');

  // Engineer B's token is reused later by the cross-tenant attendance checks.
  let tokenB = null;

  // --- Site creation by engineer A ---
  {
    const body = {
      siteName: `Smoke Site ${RUN_ID}`,
      ownerName: 'Rahul Patil',
      ownerMobile: '9876543210',
      address: '12, Smoke Street',
      city: 'Pune',
      state: 'Maharashtra',
      totalArea: 2000,
      ratePerArea: 1800,          // controller field: area x rate -> estimatedProjectCost
      status: 'Active',           // SITE_STATUS.ACTIVE (title-case enum)
    };
    const r = await req('POST', '/sites', { token: tokenA, body });
    const site = r.data?.data?.site || r.data?.data;
    createdIds.site = site?._id;
    await expect('Engineer A creates site', r.status < 300 && Boolean(createdIds.site),
      r.data?.message || `status ${r.status}`);
  }

  // --- Site geo-tag (Google Maps / live location picker) -------------------
  {
    const G = { latitude: 18.5204, longitude: 73.8567, locationLabel: 'Pune, Maharashtra, India', geoSource: 'map' };
    const r = await req('PUT', `/sites/${createdIds.site}`, { token: tokenA, body: G });
    const site = r.data?.data?.site || r.data?.data;
    await expect('Site accepts geo-tag', r.status < 300, r.data?.message || `status ${r.status}`);
    await expect('Geo-tag persisted with source + timestamp',
      Number(site?.latitude) === G.latitude
      && Number(site?.longitude) === G.longitude
      && site?.geoSource === 'map'
      && Boolean(site?.locationCapturedAt),
      `lat=${site?.latitude} lng=${site?.longitude} source=${site?.geoSource}`);

    // GET /sites/:id is what the edit form prefills from.
    const read = await req('GET', `/sites/${createdIds.site}`, { token: tokenA });
    const shown = read.data?.data?.site || read.data?.data;
    await expect('GET /sites/:id returns geo fields for edit prefill',
      Number(shown?.latitude) === G.latitude && Number(shown?.longitude) === G.longitude,
      `lat=${shown?.latitude} lng=${shown?.longitude}`);

    // Half a coordinate pair must be rejected, never stored.
    const half = await req('PUT', `/sites/${createdIds.site}`, { token: tokenA, body: { latitude: 12.345 } });
    await expect('Half coordinate pair rejected with 400', half.status === 400, `status=${half.status}`);

    // Out-of-range latitude must be rejected by the Joi boundary.
    const oob = await req('PUT', `/sites/${createdIds.site}`, { token: tokenA, body: { latitude: 91, longitude: 10 } });
    await expect('Out-of-range latitude rejected', oob.status >= 400 && oob.status < 500, `status=${oob.status}`);

    // Clearing the pin is a supported, explicit action.
    const cleared = await req('PUT', `/sites/${createdIds.site}`, {
      token: tokenA, body: { latitude: null, longitude: null },
    });
    const clearedSite = cleared.data?.data?.site || cleared.data?.data;
    await expect('Pin can be cleared',
      cleared.status < 300 && clearedSite?.latitude == null && clearedSite?.longitude == null,
      `lat=${clearedSite?.latitude} lng=${clearedSite?.longitude}`);

    // Restore the pin so the report/export checks below see a geolocated site.
    await req('PUT', `/sites/${createdIds.site}`, { token: tokenA, body: G });
  }

  // --- Admin sees engineer A and their site ---
  {
    const r = await req('GET', `/admin/engineers/${engA._id}`, { token: adminToken });
    const payload = r.data?.data || {};
    const shown = payload.engineer || payload;
    await expect('Admin views engineer A detail', r.status < 300 && shown?._id === engA._id,
      r.data?.message || `status ${r.status}`);
    const siteCount = payload.siteCount ?? payload.sites?.length;
    await expect('Engineer A has 1 site visible to admin', siteCount === 1, `siteCount=${siteCount}`);
  }

  // --- Admin resets engineer B password; B logs in with it ---
  const NEW_PW_B = `NewPw.${RUN_ID}.9`;
  {
    const r = await req('POST', `/admin/engineers/${engB._id}/reset-password`, {
      token: adminToken, body: { password: NEW_PW_B },   // adminResetPassword reads req.body.password
    });
    await expect('Admin resets engineer B password', r.status < 300,
      r.data?.message || `status ${r.status}`);
    const r2 = await req('POST', '/auth/login', { body: { email: ENGINEER_B.email, password: NEW_PW_B } });
    await expect('Engineer B login after reset', Boolean(r2.data?.token || r2.data?.data?.token),
      r2.data?.message || `status ${r2.status}`);
  }

  // --- Data isolation: engineer B cannot see engineer A's site ---
  if (createdIds.site) {
    const rB = await req('POST', '/auth/login', { body: { email: ENGINEER_B.email, password: NEW_PW_B } });
    tokenB = rB.data?.token || rB.data?.data?.token;
    const r2 = await req('GET', `/sites/${createdIds.site}`, { token: tokenB });
    await expect('Cross-engineer site access blocked (404)', r2.status === 404, `status ${r2.status}`);
    const r3 = await req('GET', `/sites/${createdIds.site}/summary`, { token: tokenB });
    await expect('Cross-engineer summary blocked (404)', r3.status === 404, `status ${r3.status}`);
  }

  // --- Account status enforcement ---
  {
    const r = await req('PATCH', `/admin/engineers/${engA._id}/status`, {
      token: adminToken, body: { status: 'SUSPENDED' },
    });
    await expect('Admin suspends engineer A', r.status < 300, r.data?.message || `status ${r.status}`);
    const r2 = await req('POST', '/auth/login', { body: { email: ENGINEER_A.email, password: ENGINEER_A.password } });
    await expect('Suspended engineer cannot log in', r2.status >= 400,
      `status ${r2.status} ${r2.data?.message || ''}`);

    const r3 = await req('PATCH', `/admin/engineers/${engA._id}/status`, {
      token: adminToken, body: { status: 'ACTIVE' },
    });
    await expect('Admin reactivates engineer A', r3.status < 300, r3.data?.message || `status ${r3.status}`);
    const r4 = await req('POST', '/auth/login', { body: { email: ENGINEER_A.email, password: ENGINEER_A.password } });
    await expect('Reactivated engineer can log in', Boolean(r4.data?.token || r4.data?.data?.token),
      r4.data?.message || `status ${r4.status}`);
  }

  // --- Auth rejections ---
  {
    const r = await req('GET', '/sites');
    await expect('No-token request rejected (401)', r.status === 401, `status ${r.status}`);
    const r2 = await req('POST', '/auth/login', { body: { email: ENGINEER_A.email, password: 'definitely-wrong' } });
    await expect('Invalid login rejected (401)', r2.status === 401 || r2.status === 400, `status ${r2.status}`);
  }

  // --- Site dashboard tabs: full CRUD on every sub-resource ---
  if (createdIds.site) {
    const sid = createdIds.site;
    const today = new Date().toISOString();

    await crud('Activities', `/sites/${sid}/activities`,
      { date: today, type: 'Concrete Pour', workersPresent: 8, workDescription: 'Slab pour',
        workCompleted: 'Slab', materialsReceived: 'Cement 40 bags', issues: 'None', todayExpense: 1200 },
      { type: 'Slab Work', workDescription: 'Slab pour (revised)', todayExpense: 1500 },
      tokenA);

    await crud('Payments', `/sites/${sid}/payments`,
      { amount: 50000, date: today, paymentMode: 'UPI', transactionRef: `TXN${RUN_ID}`, notes: 'Advance' },
      { amount: 60000, notes: 'Advance (revised)' },
      tokenA);

    await crud('Installments', `/sites/${sid}/installments`,
      { name: 'Foundation', order: 1, amount: 100000, dueDate: today },
      { amount: 120000 },
      tokenA);

    await crud('Workers', `/sites/${sid}/workers`,
      { name: 'Ramesh Yadav', mobile: '9111111111', workerType: 'Mason', dailyWage: 800 },
      { dailyWage: 900 },
      tokenA);

    await crud('Materials', `/sites/${sid}/materials`,
      { name: 'Cement OPC 53', category: 'Cement', quantity: 10, unit: 'bag', rate: 380, paidAmount: 1000 },
      { quantity: 12, rate: 390 },
      tokenA);

    await crud('Vendors', `/sites/${sid}/vendors`,
      { name: `Sharma Traders ${RUN_ID}`, mobile: '9222222222', materialCategory: 'Cement' },
      { city: 'Pune' },
      tokenA);

    await crud('Expenses', `/sites/${sid}/expenses`,
      { category: 'Transportation', description: 'Material trip', amount: 1500, expenseDate: today, paidAmount: 500 },
      { amount: 1600 },
      tokenA);
  }

  // --- Material usage + derived stock projection ---
  if (createdIds.site) {
    const sid = createdIds.site;
    const today = new Date().toISOString().slice(0, 10);
    const m = await req('POST', `/sites/${sid}/materials`, {
      token: tokenA,
      body: {
        name: `TMT Steel ${RUN_ID}`, category: 'Steel', quantity: 100, unit: 'Kg', rate: 60,
        openingStock: 50, minStockLevel: 40, trackStock: true,
      },
    });
    const materialId = m.data?.data?._id;
    await expect('Material usage: create tracked material', m.status < 300 && Boolean(materialId),
      m.data?.message || `status ${m.status}`);

    if (materialId) {
      const findRow = (payload, name, unit) =>
        (payload?.data?.stock || []).find((r) => r.materialName === name && r.unit === unit);

      // Stock before usage: opening 50 + purchased 100 = 150, not low (min 40).
      const s1 = await req('GET', `/sites/${sid}/material-stock`, { token: tokenA });
      const row1 = findRow(s1.data, `TMT Steel ${RUN_ID}`, 'Kg');
      await expect('Material usage: stock projection (opening+purchased)',
        s1.status < 300 && row1 && Number(row1.currentStock) === 150 && row1.isLowStock === false,
        `row=${JSON.stringify(row1)}`);

      // Consume 30 kg.
      const u = await req('POST', `/sites/${sid}/material-usage`, {
        token: tokenA,
        body: { material: materialId, quantity: 30, date: today, workActivity: 'Slab binding' },
      });
      const usageId = u.data?.data?._id;
      await expect('Material usage: create',
        u.status < 300 && Boolean(usageId) && u.data?.data?.materialName === `TMT Steel ${RUN_ID}`,
        u.data?.message || `status ${u.status}`);

      if (usageId) {
        const list = await req('GET', `/sites/${sid}/material-usage`, { token: tokenA });
        await expect('Material usage: list', firstArray(list.data).length === 1,
          `count=${firstArray(list.data).length}`);

        const s2 = await req('GET', `/sites/${sid}/material-stock`, { token: tokenA });
        const row2 = findRow(s2.data, `TMT Steel ${RUN_ID}`, 'Kg');
        await expect('Material usage: stock drops by used qty (150-30=120)',
          row2 && Number(row2.currentStock) === 120 && Number(row2.used) === 30,
          `row=${JSON.stringify(row2)}`);

        const upd = await req('PUT', `/sites/${sid}/material-usage/${usageId}`, {
          token: tokenA, body: { quantity: 50 },
        });
        await expect('Material usage: update',
          upd.status < 300 && Number(upd.data?.data?.quantity) === 50,
          upd.data?.message || `status ${upd.status}`);

        const s3 = await req('GET', `/sites/${sid}/material-stock`, { token: tokenA });
        const row3 = findRow(s3.data, `TMT Steel ${RUN_ID}`, 'Kg');
        await expect('Material usage: stock follows update (150-50=100)',
          row3 && Number(row3.currentStock) === 100,
          `row=${JSON.stringify(row3)}`);

        const del = await req('DELETE', `/sites/${sid}/material-usage/${usageId}`, { token: tokenA });
        await expect('Material usage: delete', del.status < 300,
          del.data?.message || `status ${del.status}`);
      }

      // Raise min level above current stock -> low-stock flag + count.
      await req('PUT', `/sites/${sid}/materials/${materialId}`, {
        token: tokenA, body: { minStockLevel: 500 },
      });
      const s4 = await req('GET', `/sites/${sid}/material-stock`, { token: tokenA });
      const row4 = findRow(s4.data, `TMT Steel ${RUN_ID}`, 'Kg');
      await expect('Material usage: low-stock flag raised',
        row4 && row4.isLowStock === true && (s4.data?.data?.lowStockCount || 0) >= 1,
        `row=${JSON.stringify(row4)} low=${s4.data?.data?.lowStockCount}`);

      await req('DELETE', `/sites/${sid}/materials/${materialId}`, { token: tokenA });
    }
  }

  // --- Worker wages tab: nested worker payment lifecycle ---
  if (createdIds.site) {
    const sid = createdIds.site;
    const w = await req('POST', `/sites/${sid}/workers`, {
      token: tokenA,
      body: { name: 'Sunil Patil', mobile: '9333333333', workerType: 'Helper', dailyWage: 700 },
    });
    const workerId = w.data?.data?._id;
    await expect('Workers: create parent for wage payment', w.status < 300 && Boolean(workerId),
      w.data?.message || `status ${w.status}`);

    if (workerId) {
      const wp = await req('POST', `/sites/${sid}/worker-payments`, {
        token: tokenA,
        body: { worker: workerId, date: new Date().toISOString(), workDays: 5, dailyWage: 700, paidAmount: 3500 },
      });
      const wpId = wp.data?.data?._id;
      await expect('Worker payments: create (auto total)', wp.status < 300 && Boolean(wpId),
        wp.data?.message || `status ${wp.status}`);

      // paidAmount is honoured at creation: 5 x 700 = 3500 owed, 3500 paid -> Paid.
      await expect('Worker payments: create honours paidAmount (Paid)',
        wp.status < 300 && wp.data?.data?.status === 'Paid'
          && Number(wp.data?.data?.paidAmount) === 3500
          && Number(wp.data?.data?.pendingAmount) === 0,
        `status=${wp.data?.data?.status} paid=${wp.data?.data?.paidAmount} pending=${wp.data?.data?.pendingAmount}`);

      if (wpId) {
        const list = await req('GET', `/sites/${sid}/worker-payments`, { token: tokenA });
        await expect('Worker payments: list', firstArray(list.data).length === 1,
          `count=${firstArray(list.data).length}`);

        const upd = await req('PUT', `/sites/${sid}/worker-payments/${wpId}`, {
          token: tokenA, body: { paidAmount: 2100 },
        });
        await expect('Worker payments: update', upd.status < 300, upd.data?.message || `status ${upd.status}`);

        const del = await req('DELETE', `/sites/${sid}/worker-payments/${wpId}`, { token: tokenA });
        await expect('Worker payments: delete', del.status < 300, del.data?.message || `status ${del.status}`);
      }

      await req('DELETE', `/sites/${sid}/workers/${workerId}`, { token: tokenA });
    }
  }

  // --- Attendance tab: single mark, bulk mark, summary, update, delete ---
  if (createdIds.site) {
    const sid = createdIds.site;
    const w = await req('POST', `/sites/${sid}/workers`, {
      token: tokenA,
      body: { name: 'Attendance Worker', mobile: '9555555555', workerType: 'Mason', dailyWage: 800 },
    });
    const w2 = await req('POST', `/sites/${sid}/workers`, {
      token: tokenA,
      body: { name: 'Attendance Helper', mobile: '9666666666', workerType: 'Helper', dailyWage: 600 },
    });
    const workerId = w.data?.data?._id;
    const workerId2 = w2.data?.data?._id;
    await expect('Attendance: create workers for marking', Boolean(workerId && workerId2),
      w.data?.message || `status ${w.status}`);

    if (workerId && workerId2) {
      const day = new Date().toISOString().slice(0, 10);

      // Single mark: Present = 1x daily wage, computed server-side.
      const one = await req('POST', `/sites/${sid}/attendance`, {
        token: tokenA,
        body: { worker: workerId, date: day, status: 'Present', workHours: 8, notes: 'Day 1' },
      });
      await expect('Attendance: single mark (Present)', one.status < 300 && Number(one.data?.data?.earnedAmount) === 800,
        `status ${one.status} earned=${one.data?.data?.earnedAmount}`);

      // Re-marking the same worker/day must upsert, never duplicate.
      await req('POST', `/sites/${sid}/attendance`, {
        token: tokenA,
        body: { worker: workerId, date: day, status: 'Half Day' },
      });
      const afterUpsert = await req('GET', `/sites/${sid}/attendance?workerId=${workerId}`, { token: tokenA });
      const upserted = firstArray(afterUpsert.data);
      await expect('Attendance: re-marking same day upserts (no duplicate)', upserted.length === 1,
        `count=${upserted.length}`);
      await expect('Attendance: Half Day earns 0.5x wage', Number(upserted[0]?.earnedAmount) === 400,
        `earned=${upserted[0]?.earnedAmount}`);

      // Invalid status is rejected by the backend enum.
      const bad = await req('POST', `/sites/${sid}/attendance`, {
        token: tokenA, body: { worker: workerId, date: day, status: 'On Vacation' },
      });
      await expect('Attendance: invalid status rejected (400)', bad.status === 400, `status ${bad.status}`);

      // Bulk mark the second worker as Absent -> earns nothing.
      const bulk = await req('POST', `/sites/${sid}/attendance/bulk`, {
        token: tokenA,
        body: { date: day, entries: [{ worker: workerId2, status: 'Absent', workHours: 0 }] },
      });
      await expect('Attendance: bulk mark (Absent)', bulk.status < 300,
        bulk.data?.message || `status ${bulk.status}`);

      // Summary rollup for the day.
      const sum = await req('GET', `/sites/${sid}/attendance/summary?from=${day}&to=${day}`, { token: tokenA });
      const totals = sum.data?.data?.totals || {};
      await expect('Attendance: summary totals', sum.status < 300 && totals.workerCount === 2
        && Number(totals.halfDays) === 1 && Number(totals.absentDays) === 1
        && Number(totals.totalEarned) === 400,
        `status=${sum.status} msg=${sum.data?.message} totals=${JSON.stringify(totals)}`);

      // Date filter excludes other days.
      const filtered = await req('GET', `/sites/${sid}/attendance?from=${day}&to=${day}`, { token: tokenA });
      await expect('Attendance: date range filter', filtered.status < 300 && firstArray(filtered.data).length === 2,
        `count=${firstArray(filtered.data).length}`);

      // Cross-tenant protection: engineer B cannot mark attendance on engineer A's site.
      const foreign = await req('POST', `/sites/${sid}/attendance`, {
        token: tokenB, body: { worker: workerId, date: day, status: 'Present' },
      });
      await expect('Attendance: cross-engineer mark blocked (404)', foreign.status === 404, `status ${foreign.status}`);

      const foreignList = await req('GET', `/sites/${sid}/attendance`, { token: tokenB });
      await expect('Attendance: cross-engineer list blocked (404)', foreignList.status === 404, `status ${foreignList.status}`);

      // Update status -> earnings recalculated.
      const recId = upserted[0]?._id;
      if (recId) {
        const upd = await req('PUT', `/sites/${sid}/attendance/${recId}`, {
          token: tokenA, body: { status: 'Present' },
        });
        await expect('Attendance: update recalculates earnings', upd.status < 300
          && Number(upd.data?.data?.earnedAmount) === 800,
          `status ${upd.status} earned=${upd.data?.data?.earnedAmount}`);

        const del = await req('DELETE', `/sites/${sid}/attendance/${recId}`, { token: tokenA });
        await expect('Attendance: delete', del.status < 300, del.data?.message || `status ${del.status}`);
      }

      // Clean up remaining attendance + both workers.
      const leftover = await req('GET', `/sites/${sid}/attendance`, { token: tokenA });
      for (const row of firstArray(leftover.data)) {
        await req('DELETE', `/sites/${sid}/attendance/${row._id}`, { token: tokenA });
      }
      const after = await req('GET', `/sites/${sid}/attendance`, { token: tokenA });
      await expect('Attendance: register empty after cleanup', firstArray(after.data).length === 0,
        `count=${firstArray(after.data).length}`);

      await req('DELETE', `/sites/${sid}/workers/${workerId}`, { token: tokenA });
      await req('DELETE', `/sites/${sid}/workers/${workerId2}`, { token: tokenA });
    }
  }

  // --- Vendor payments tab: nested vendor payment lifecycle ---
  if (createdIds.site) {
    const sid = createdIds.site;
    const v = await req('POST', `/sites/${sid}/vendors`, {
      token: tokenA,
      body: { name: `Patil Suppliers ${RUN_ID}`, mobile: '9444444444', materialCategory: 'Steel' },
    });
    const vendorId = v.data?.data?._id;
    await expect('Vendors: create parent for vendor payment', v.status < 300 && Boolean(vendorId),
      v.data?.message || `status ${v.status}`);

    if (vendorId) {
      const vp = await req('POST', `/sites/${sid}/vendor-payments`, {
        token: tokenA,
        body: { vendor: vendorId, amount: 25000, date: new Date().toISOString(), paymentMode: 'Cheque', materialName: 'TMT Steel' },
      });
      const vpId = vp.data?.data?._id;
      await expect('Vendor payments: create', vp.status < 300 && Boolean(vpId),
        vp.data?.message || `status ${vp.status}`);

      if (vpId) {
        const list = await req('GET', `/sites/${sid}/vendor-payments`, { token: tokenA });
        await expect('Vendor payments: list', firstArray(list.data).length === 1,
          `count=${firstArray(list.data).length}`);

        // Ledger: purchases (debit) + payments (credit) with running balance.
        const led = await req('GET', `/sites/${sid}/vendors/${vendorId}/ledger`, { token: tokenA });
        await expect('Vendor ledger: loads with payment credit',
          led.status < 300 && Number(led.data?.data?.summary?.totalPaid) === 25000
            && Array.isArray(led.data?.data?.ledger),
          `status ${led.status} paid=${led.data?.data?.summary?.totalPaid}`);

        const del = await req('DELETE', `/sites/${sid}/vendor-payments/${vpId}`, { token: tokenA });
        await expect('Vendor payments: delete', del.status < 300, del.data?.message || `status ${del.status}`);
      }

      await req('DELETE', `/sites/${sid}/vendors/${vendorId}`, { token: tokenA });
    }
  }

  // --- Documents tab: multipart upload -> list -> download -> delete ---
  if (createdIds.site) {
    const sid = createdIds.site;
    const fd = new FormData();
    fd.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'site-photo.png');
    fd.append('notes', 'Smoke test upload');

    const up = await fetch(`${BASE}/sites/${sid}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: fd,
    });
    const upData = await up.json().catch(() => ({}));
    const docId = upData?.data?._id;
    await expect('Documents: upload', up.status < 300 && Boolean(docId),
      upData?.message || `status ${up.status}`);

    if (docId) {
      const list = await req('GET', `/sites/${sid}/documents`, { token: tokenA });
      await expect('Documents: list shows the upload', firstArray(list.data).length === 1,
        `count=${firstArray(list.data).length}`);

      const dl = await fetch(`${BASE}/sites/${sid}/documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      await expect('Documents: download returns the file', dl.status === 200, `status ${dl.status}`);
      await dl.arrayBuffer().catch(() => {});

      const del = await req('DELETE', `/sites/${sid}/documents/${docId}`, { token: tokenA });
      await expect('Documents: delete', del.status < 300, del.data?.message || `status ${del.status}`);
    }
  }

  // --- Profile (self-service): JSON edit, then multipart photo upload ---
  {
    const r = await req('PUT', '/auth/profile', {
      token: tokenA,
      body: {
        name: 'Priya S. Sharma',
        company: 'PS Constructions',
        address: { street: '9 Test Lane', city: 'Pune', state: 'Maharashtra' },
      },
    });
    await expect('Engineer updates own profile (JSON)', r.status < 300, r.data?.message || `status ${r.status}`);
    await expect('Profile address stored as nested object', r.data?.data?.address?.city === 'Pune',
      JSON.stringify(r.data?.data?.address));

    const me = await req('GET', '/auth/me', { token: tokenA });
    await expect('Profile change visible via /auth/me', me.data?.data?.user?.name === 'Priya S. Sharma',
      me.data?.data?.user?.name);

    // Multipart request - exactly what ProfilePage posts when a file is picked.
    const fd = new FormData();
    fd.append('name', 'Priya S. Sharma');
    fd.append('mobile', ENGINEER_A.mobile);
    fd.append('company', 'PS Constructions');
    fd.append('address', JSON.stringify({ street: '9 Test Lane', city: 'Pune', state: 'Maharashtra' }));
    fd.append('photo', new Blob([PNG_1X1], { type: 'image/png' }), 'avatar.png');

    const up = await fetch(`${BASE}/auth/profile`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: fd,
    });
    const upData = await up.json().catch(() => ({}));
    const photo = upData?.data?.profilePhoto || '';
    await expect('Engineer uploads profile photo (multipart)', up.status < 300 && photo.startsWith('/uploads/'),
      upData?.message || `status ${up.status} photo=${photo}`);

    if (photo) {
      // Static host is mounted at the server root, not under /api.
      const img = await fetch(`${ORIGIN}${photo}`);
      await expect('Uploaded profile photo is served over HTTP', img.status === 200, `status ${img.status}`);
    }
  }

  // --- Progress tracking, site update, reports and exports ---
  if (createdIds.site) {
    const sid = createdIds.site;

    const prog = await req('PUT', `/sites/${sid}/progress`, {
      token: tokenA,
      body: { foundation: 100, plinth: 50, structure: 25 },
    });
    await expect('Site progress update', prog.status < 300 && prog.data?.data?.overallProgress > 0,
      prog.data?.message || `overall=${prog.data?.data?.overallProgress}`);

    const summary = await req('GET', `/sites/${sid}/summary`, { token: tokenA });
    await expect('Site summary loads for the owner', summary.status < 300,
      summary.data?.message || `status ${summary.status}`);

    const upd = await req('PUT', `/sites/${sid}`, {
      token: tokenA,
      body: { siteName: `Smoke Site ${RUN_ID} (updated)`, totalArea: 2200, ratePerArea: 1900 },
    });
    await expect('Site update (PUT)', upd.status < 300, upd.data?.message || `status ${upd.status}`);

    const reports = await req('GET', `/sites/${sid}/reports`, { token: tokenA });
    await expect('Reports endpoint', reports.status < 300, reports.data?.message || `status ${reports.status}`);

    const exports = [
      ['PDF report', `/sites/${sid}/report/pdf`],
      ['Excel export', `/sites/${sid}/export/excel`],
      ['CSV export', `/sites/${sid}/export/csv`],
    ];
    for (const [label, path] of exports) {
      const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tokenA}` } });
      await expect(`${label} generates a file`, res.status === 200, `status ${res.status}`);
      await res.arrayBuffer().catch(() => {});
    }
  }

  // --- Admin deletes engineer B (cascade) ---
  {
    const r = await req('DELETE', `/admin/engineers/${engB._id}`, { token: adminToken });
    await expect('Admin deletes engineer B', r.status < 300, r.data?.message || `status ${r.status}`);
    if (r.status < 300) {
      createdIds.engineers = createdIds.engineers.filter((id) => id !== engB._id);
      const r2 = await req('POST', '/auth/login', { body: { email: ENGINEER_B.email, password: NEW_PW_B } });
      await expect('Deleted engineer cannot log in', r2.status >= 400, `status ${r2.status}`);
    }
  }

  // --- Admin area: dashboard, all sites, audit logs, role guard ---
  {
    const dash = await req('GET', '/admin/dashboard', { token: adminToken });
    await expect('Admin dashboard loads', dash.status < 300, dash.data?.message || `status ${dash.status}`);

    const sites = await req('GET', '/admin/sites', { token: adminToken });
    const listed = firstArray(sites.data);
    await expect('Admin All Sites lists the engineer site',
      sites.status < 300 && listed.some((s) => String(s._id) === String(createdIds.site)),
      `status ${sites.status} count=${listed.length}`);

    const logs = await req('GET', '/admin/audit-logs', { token: adminToken });
    await expect('Admin audit logs load', logs.status < 300 && firstArray(logs.data).length > 0,
      `status ${logs.status} count=${firstArray(logs.data).length}`);

    const notAdmin = await req('GET', '/admin/sites', { token: tokenA });
    await expect('Engineer blocked from the admin area (403)', notAdmin.status === 403, `status ${notAdmin.status}`);
  }

  // --- Global reports + overdue installment derivation ---
  {
    const reports = await req('GET', '/admin/reports', { token: adminToken });
    await expect('Admin reports: totals load',
      reports.status < 300 && typeof reports.data?.data?.totals?.projectValue === 'number',
      `status ${reports.status}`);

    const filtered = await req('GET', `/admin/reports?engineerId=${engA._id}`, { token: adminToken });
    const rows = filtered.data?.data?.engineers || [];
    await expect('Admin reports: engineer filter returns only that engineer',
      filtered.status < 300 && rows.length > 0 && rows.every((r) => String(r.engineerId) === String(engA._id)),
      `status ${filtered.status} rows=${rows.length}`);

    const badId = await req('GET', '/admin/reports?engineerId=not-an-id', { token: adminToken });
    await expect('Admin reports: invalid id rejected (400)', badId.status === 400, `status ${badId.status}`);

    const notAdmin = await req('GET', '/admin/reports', { token: tokenA });
    await expect('Admin reports blocked for engineers (403)', notAdmin.status === 403, `status ${notAdmin.status}`);

    // Overdue is time-dependent: a past-due installment must read back as
    // Overdue (derived + persisted on GET), not the stale Pending default.
    const due = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const made = await req('POST', `/sites/${createdIds.site}/installments`, {
      token: tokenA,
      body: { name: `Overdue ${RUN_ID}`, amount: 50000, dueDate: due },
    });
    await expect('Installment with past due date created',
      made.status < 300, made.data?.message || `status ${made.status}`);
    const instId = made.data?.data?._id;

    const list = await req('GET', `/sites/${createdIds.site}/installments`, { token: tokenA });
    const row = firstArray(list.data).find((i) => String(i._id) === String(instId));
    await expect('Past-due installment reads back as Overdue',
      list.status < 300 && row?.status === 'Overdue',
      `status ${list.status} got=${row?.status}`);

    if (instId) {
      await req('DELETE', `/sites/${createdIds.site}/installments/${instId}`, { token: tokenA });
    }
  }

  // --- Site lifecycle: complete -> reopen -> archive -> delete ---
  if (createdIds.site) {
    const sid = createdIds.site;

    const done = await req('PATCH', `/sites/${sid}/complete`, { token: tokenA, body: {} });
    await expect('Site marked complete', done.status < 300, done.data?.message || `status ${done.status}`);

    const active = await req('PUT', `/sites/${sid}`, { token: tokenA, body: { status: 'Active' } });
    await expect('Site reopened after completion', active.status < 300, active.data?.message || `status ${active.status}`);

    const archived = await req('PATCH', `/sites/${sid}/archive`, { token: tokenA, body: {} });
    await expect('Site archived', archived.status < 300, archived.data?.message || `status ${archived.status}`);

    const unarchive = await req('PUT', `/sites/${sid}`, { token: tokenA, body: { status: 'Active' } });
    await expect('Site unarchived', unarchive.status < 300, unarchive.data?.message || `status ${unarchive.status}`);

    // The API requires an explicit confirmation flag so a stray click cannot
    // wipe a site (and its cascade) by accident.
    const delSite = await req('DELETE', `/sites/${sid}?confirm=true`, { token: tokenA });
    await expect('Site deleted', delSite.status < 300, delSite.data?.message || `status ${delSite.status}`);
    if (delSite.status < 300) {
      const gone = await req('GET', `/sites/${sid}`, { token: tokenA });
      await expect('Deleted site is no longer readable (404)', gone.status === 404, `status ${gone.status}`);
      createdIds.site = null;
    }
  }

  // --- Global sidebar records + engineer date filter (spec sections 38/6) ---
  {
    const rec = await req('GET', '/engineer/workers', { token: tokenA });
    await expect('Global workers page loads for engineer',
      rec.status < 300 && Array.isArray(rec.data?.data?.items),
      `status ${rec.status}`);

    // A foreign site id must yield an empty list (engineer scope), never data.
    const foreign = await req('GET', '/engineer/workers?siteId=000000000000000000000000', { token: tokenA });
    await expect('Global records ignore foreign site ids (empty)',
      foreign.status < 300 && (foreign.data?.data?.items || []).length === 0,
      `status ${foreign.status}`);

    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const excl = await req('GET', `/admin/engineers?from=${future}`, { token: adminToken });
    const exclRows = excl.data?.data?.engineers || [];
    await expect('Engineer date filter excludes earlier records',
      excl.status < 300 && !exclRows.some((e) => String(e._id) === String(engA._id)),
      `status ${excl.status} rows=${exclRows.length}`);

    const past = await req('GET', '/admin/engineers?from=2000-01-01&sortBy=name&sortOrder=asc', { token: adminToken });
    await expect('Engineer date filter + sorting accepted',
      past.status < 300 && (past.data?.data?.engineers || []).some((e) => String(e._id) === String(engA._id)),
      `status ${past.status}`);
  }

  // --- Profile photo lifecycle: upload -> replace -> cascade delete ---
  {
    const uploadPhoto = async () => {
      const fd = new FormData();
      fd.append(
        'photo',
        new Blob([PNG_1X1], { type: 'image/png' }),
        `${RUN_ID}-${Math.random().toString(36).slice(2, 8)}.png`
      );
      const res = await fetch(`${BASE}/admin/engineers/${engA._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: fd,
      });
      let data = null;
      try { data = await res.json(); } catch (_) { /* empty body */ }
      return { status: res.status, data };
    };

    // Engineer A may already own a photo from the self-profile check earlier
    // in this suite, so compute the expected delta instead of assuming +1.
    const findPhoto = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (typeof obj.profilePhoto === 'string' && obj.profilePhoto) return obj.profilePhoto;
      for (const v of Object.values(obj)) {
        const r = findPhoto(v);
        if (r) return r;
      }
      return null;
    };
    const before = await req('GET', `/admin/engineers/${engA._id}`, { token: adminToken });
    const hadPhoto = Boolean(findPhoto(before.data));

    const count0 = countUploads();
    const first = await uploadPhoto();
    const count1 = countUploads();
    await expect('Profile photo upload succeeds (file accounted for)',
      first.status < 300 && count1 === (hadPhoto ? count0 : count0 + 1),
      `status ${first.status} ${count0}->${count1} hadPhoto=${hadPhoto}`);

    const second = await uploadPhoto();
    const count2 = countUploads();
    await expect('Second photo replaces the first (old file removed)',
      second.status < 300 && count2 === count1,
      `status ${second.status} ${count1}->${count2}`);

    const del = await req('DELETE', `/admin/engineers/${engA._id}`, { token: adminToken });
    const count3 = countUploads();
    await expect('Deleting the engineer removes their profile photo file',
      del.status < 300 && count3 === count2 - 1,
      `status ${del.status} ${count2}->${count3}`);
    if (del.status < 300) {
      createdIds.engineers = createdIds.engineers.filter((id) => String(id) !== String(engA._id));
    }
  }

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===\n`);
  process.exitCode = failCount === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.log('FAIL  smoke test crashed ->', e.message);
    process.exitCode = 1;
  })
  .finally(cleanup);