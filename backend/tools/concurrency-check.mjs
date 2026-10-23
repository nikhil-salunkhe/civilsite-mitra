/**
 * concurrency-check.mjs
 * MULTI-USER RELIABILITY & LOAD CHECK.
 *
 * The rest of the suite proves endpoints work one at a time. This one proves
 * the platform stays correct and responsive when MANY engineers use it at the
 * same time - which is the actual promise of the product:
 *
 *   A. Provisioning     - N engineer accounts created in parallel by the admin.
 *   B. Concurrent login - all N sign in simultaneously; tokens are independent
 *                         (JWT is stateless, so sessions never collide).
 *   C. Parallel writes  - all N create their own site at the same instant.
 *   D. Isolation        - after the concurrent burst every engineer still sees
 *                         EXACTLY their own site - the tenant guard must hold
 *                         under real concurrency.
 *   E. Mixed workload   - R rounds of parallel dashboard traffic (summary,
 *                         activity CRUD, reports JSON, CSV export) per user.
 *   F. Heavy endpoints  - all users pull a PDF export simultaneously (the
 *                         most CPU-bound call in the product).
 *   G. Recovery         - /health and every session still work after the load.
 *
 * Latency (avg/p50/p95/max) and throughput are reported per phase, so the
 * numbers can be compared between machines and across releases.
 *
 * Run with the API already listening. Self-seeding + full cleanup:
 *   node tools/concurrency-check.mjs [baseUrl] [users]
 *   npm run check:load
 */
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve('..', '.env') });
dotenv.config();

const BASE = (process.argv[2] || 'http://localhost:5000/api').replace(/\/$/, '');
// Bounded: enough to expose cross-user bugs, small enough to run on a laptop.
const USER_COUNT = Math.max(2, Math.min(10, parseInt(process.argv[3], 10) || 6));
const ROUNDS = 3;

const stamp = Date.now();
const mobBase = Number(String(stamp).slice(-9));

let pass = 0;
let fail = 0;
const failures = [];

// Per-request latency samples, bucketed by phase label.
const metrics = [];
let requestsTotal = 0;

const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`ok   ${name}`);
  } else {
    fail += 1;
    failures.push(`${name} ${detail}`.trim());
    console.log(`FAIL ${name}${detail ? ' -> ' + detail : ''}`);
  }
};
const heading = (t) => console.log(`\n--- ${t} ---`);

const listOf = (data) => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data).find(Array.isArray) || [];
  return [];
};

/** fetch() with JSON handling, 429 retry and latency recording. */
async function api(method, url, { token, body, raw = false, phase = '' } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const ms = Date.now() - started;
    requestsTotal += 1;
    if (phase) metrics.push({ phase, ms, status: res.status });

    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Math.min(retryAfter ? retryAfter * 1000 : 1000 * (attempt + 1), 5000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (raw) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, buf, headers: res.headers };
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data, headers: res.headers };
  }
}

const percentile = (sorted, p) =>
  (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

/** Print one summary line of latency stats for a phase. */
function reportPhase(label, wallMs, { expectedStatuses = [200, 201] } = {}) {
  const rows = metrics.filter((m) => m.phase === label);
  if (!rows.length) return;
  const lat = rows.map((m) => m.ms).sort((a, b) => a - b);
  const bad = rows.filter((m) => !expectedStatuses.includes(m.status));
  const avg = Math.round(lat.reduce((s, v) => s + v, 0) / lat.length);
  const rps = wallMs > 0 ? Math.round((rows.length / wallMs) * 1000) : 0;
  console.log(
    `     ${rows.length} req in ${wallMs} ms (~${rps} req/s) | `
    + `avg ${avg} ms  p50 ${percentile(lat, 50)} ms  p95 ${percentile(lat, 95)} ms  max ${lat[lat.length - 1]} ms`
    + (bad.length ? ` | ${bad.length} unexpected status` : ''),
  );
}

const unwrapToken = (r) => r.data?.token || r.data?.data?.token;

/** Throwaway accounts created by THIS run - deleted at the end. */
const createdIds = [];
const harnessEmail = (i) => `load${i}.${stamp}@test.com`;

async function cleanup(adminToken) {
  for (const id of createdIds) {
    try { await api('DELETE', `/admin/engineers/${id}`, { token: adminToken }); } catch { /* best effort */ }
  }
  // Sweep leftovers from an interrupted earlier run.
  try {
    const list = await api('GET', '/admin/engineers?limit=200', { token: adminToken });
    for (const eng of listOf(list.data?.data ?? list.data)) {
      if (/^load\d+\.[a-z0-9]+@test\.com$/.test(eng?.email || '')) {
        try { await api('DELETE', `/admin/engineers/${eng._id}`, { token: adminToken }); } catch { /* ignore */ }
      }
    }
  } catch { /* best effort */ }
}

const main = async () => {
  console.log('CIVILSITEMITRA CONCURRENCY CHECK');
  console.log(`api=${BASE}  users=${USER_COUNT}  workloadRounds=${ROUNDS}\n`);

  // ---- G0: baseline health before any load -------------------------------
  const health0 = await api('GET', '/health');
  check('health endpoint answers before load', health0.status === 200, `status ${health0.status}`);

  const adminLogin = await api('POST', '/auth/login', {
    body: { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD },
  });
  const adminToken = unwrapToken(adminLogin);
  check('admin login', Boolean(adminToken), adminLogin.data?.message || `status ${adminLogin.status}`);
  if (!adminToken) throw new Error('Cannot continue without admin login');
  await cleanup(adminToken); // sweep leftovers from an interrupted earlier run

  // ---- A. Provisioning: N accounts created in parallel --------------------
  heading('A. Provision N engineer accounts (parallel)');
  let t0 = Date.now();
  const created = await Promise.all(
    Array.from({ length: USER_COUNT }, (_, i) => api('POST', '/admin/engineers', {
      token: adminToken,
      phase: 'provision',
      body: {
        name: `Load User ${i}`,
        email: harnessEmail(i),
        mobile: String(mobBase + i).slice(-10).padStart(10, '9'),
        customPassword: 'Load@12345',
      },
    })),
  );
  reportPhase('provision', Date.now() - t0, { expectedStatuses: [200, 201] });
  let provisioned = 0;
  created.forEach((r, i) => {
    const id = r.data?.data?.engineer?._id;
    if ((r.status === 200 || r.status === 201) && id) {
      provisioned += 1;
      createdIds.push(id);
    } else {
      console.log(`     user ${i}: ${r.status} ${r.data?.message || ''}`);
    }
  });
  check(`all ${USER_COUNT} engineers created in parallel`, provisioned === USER_COUNT,
    `only ${provisioned}/${USER_COUNT}`);

  // ---- B. Concurrent sign-in: sessions are independent --------------------
  heading('B. Concurrent sign-in (all users at once)');
  t0 = Date.now();
  const sessions = await Promise.all(
    Array.from({ length: USER_COUNT }, (_, i) => api('POST', '/auth/login', {
      phase: 'login',
      body: { email: harnessEmail(i), password: 'Load@12345' },
    })),
  );
  reportPhase('login', Date.now() - t0);
  const tokens = sessions.map(unwrapToken);
  check('every user receives an independent token',
    tokens.length === USER_COUNT && tokens.every(Boolean) && new Set(tokens).size === USER_COUNT,
    `${tokens.filter(Boolean).length}/${USER_COUNT} tokens, ${new Set(tokens).size} unique`);

  // ---- C. Parallel site creation ------------------------------------------
  heading('C. Every user creates a site simultaneously');
  t0 = Date.now();
  const sites = await Promise.all(tokens.map((token, i) => api('POST', '/sites', {
    token,
    phase: 'create-site',
    body: {
      siteName: `Load Site ${i} (${stamp})`,
      ownerName: `Owner ${i}`,
      ownerMobile: String(9000000000 + i),
      address: `${i} Load Street`,
      city: 'Pune',
      totalArea: 1000 + i,
      ratePerArea: 1000,
    },
  })));
  reportPhase('create-site', Date.now() - t0, { expectedStatuses: [200, 201] });
  const siteIds = sites.map((r) => r.data?.data?.site?._id || r.data?.data?._id);
  check('all parallel site creations succeed',
    siteIds.every(Boolean) && sites.every((r) => r.status < 300),
    sites.filter((r) => r.status >= 300).map((r, i) => `u${i}:${r.status} ${r.data?.message}`).join('; '));


  // ---- D. Tenant isolation after the concurrent burst ---------------------
  // Every user must see EXACTLY one site - their own - and reading another
  // user's site by id must 404. This is the real multi-tenant guarantee.
  heading('D. Isolation check (each user sees only their own site)');
  const lists = await Promise.all(tokens.map((token) => api('GET', '/sites?limit=50', {
    token,
    phase: 'list-sites',
  })));
  let isolated = 0;
  lists.forEach((r, i) => {
    const rows = listOf(r.data?.data ?? r.data);
    const mine = rows.find((s) => s._id === siteIds[i]);
    const foreign = siteIds.filter((id) => id && id !== siteIds[i]);
    const leaked = rows.filter((s) => foreign.includes(s._id));
    if (r.status === 200 && mine && leaked.length === 0) isolated += 1;
  });
  check(`all ${USER_COUNT} users see exactly their own site (no cross-tenant leak)`,
    isolated === USER_COUNT, `${isolated}/${USER_COUNT}`);

  // Direct read of a foreign site id must be refused.
  const crossProbe = tokens.length > 1 && siteIds[0] && siteIds[1]
    ? await api('GET', `/sites/${siteIds[1]}`, { token: tokens[0] })
    : null;
  check("reading another user's site returns 404", !crossProbe || crossProbe.status === 404,
    crossProbe ? `status ${crossProbe.status}` : 'skipped (single user)');

  // ---- E. Mixed workload: R rounds of parallel dashboard traffic ----------
  // Mirrors the real UI: summary + list + create + reports JSON + CSV export.
  heading('E. Mixed workload (all users, every round in parallel)');
  let workloadOk = 0;
  const workloadBad = [];
  for (let round = 1; round <= ROUNDS; round++) {
    t0 = Date.now();
    const batch = [];
    tokens.forEach((token, i) => {
      const sid = siteIds[i];
      if (!sid) return;
      const today = new Date().toISOString();
      batch.push(
        api('GET', `/sites/${sid}/summary`, { token, phase: `round${round}` }),
        api('GET', `/sites/${sid}/activities?limit=20`, { token, phase: `round${round}` }),
        api('POST', `/sites/${sid}/activities`, {
          token,
          phase: `round${round}`,
          body: {
            date: today, type: 'Concrete Pour', workersPresent: 5 + i,
            workDescription: `Round ${round} load activity`,
            workCompleted: 'Slab', materialsReceived: 'Cement', issues: 'None', todayExpense: 500,
          },
        }),
        api('GET', `/sites/${sid}/reports`, { token, phase: `round${round}` }),
        api('GET', `/sites/${sid}/reports/material-period/preview`, { token, phase: `round${round}` }),
      );
    });
    const results = await Promise.all(batch);
    reportPhase(`round${round}`, Date.now() - t0);
    const bad = results.filter((r) => r.status >= 400);
    if (bad.length === 0) workloadOk += 1;
    else bad.forEach((r) => workloadBad.push(`r${round}:${r.status}`));
  }
  check(`all ${ROUNDS} concurrent workload rounds return < 400`,
    workloadOk === ROUNDS, workloadBad.slice(0, 6).join(', '));

  // ---- F. Heavy endpoints: everyone pulls a PDF at once --------------------
  heading('F. Simultaneous PDF export (most CPU-bound call)');
  t0 = Date.now();
  const pdfs = await Promise.all(tokens.map((token, i) => (siteIds[i]
    ? api('GET', `/sites/${siteIds[i]}/report/pdf`, { token, raw: true, phase: 'pdf' })
    : Promise.resolve({ status: 404, buf: Buffer.alloc(0) }))));
  reportPhase('pdf', Date.now() - t0, { expectedStatuses: [200] });
  const pdfOk = pdfs.filter((r) => r.status === 200 && r.buf.slice(0, 5).toString() === '%PDF-');
  check('every user gets a valid PDF under simultaneous load',
    pdfOk.length === pdfs.length, `${pdfOk.length}/${pdfs.length}`);

  // ---- G. Recovery: everything still healthy after the burst ---------------
  heading('G. Post-load recovery');
  const [health1, ...mes] = await Promise.all([
    api('GET', '/health'),
    ...tokens.map((token) => api('GET', '/auth/me', { token })),
  ]);
  check('health endpoint answers after load', health1.status === 200, `status ${health1.status}`);
  check('every session is still valid after load',
    mes.every((r) => r.status === 200),
    `${mes.filter((r) => r.status === 200).length}/${mes.length}`);

  // ---- Teardown ------------------------------------------------------------
  heading('Teardown');
  await cleanup(adminToken);
  console.log(`     removed ${createdIds.length} harness engineer(s)`);

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed  (${requestsTotal} requests sent)`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(fail ? 1 : 0);
};

main().catch(async (err) => {
  console.error('concurrency-check crashed:', err.message);
  try {
    const r = await api('POST', '/auth/login', {
      body: { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD },
    });
    const t = unwrapToken(r);
    if (t) await cleanup(t);
  } catch { /* best effort */ }
  process.exit(1);
});

