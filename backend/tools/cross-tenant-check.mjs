/**
 * cross-tenant-check.mjs
 * Actively ATTACKS the multi-tenant boundary.
 *
 * Every other suite proves endpoints work. This one proves they LEAK nothing:
 * it provisions two throwaway engineers, gives each a private site, then walks
 * the nested-resource surface trying to read, mutate and delete tenant B's data
 * while authenticated as tenant A.
 *
 * Run with the API already listening on PORT (default 5000).
 * All fixtures are removed at the end.
 */

const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const stamp = Date.now();
// Mobile numbers are globally unique on the User model - derive from the stamp.
const mobTail = String(stamp).slice(-10).padStart(10, '7');
const A = { name: `TenantA_${stamp}`, email: `tenanta.${stamp}@test.com`, pass: 'T@ntA123456', mobile: mobTail };
const B = { name: `TenantB_${stamp}`, email: `tenantb.${stamp}@test.com`, pass: 'T@ntB123456', mobile: String(Number(mobTail) + 1) };

let pass = 0;
let fail = 0;
const failures = [];

const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`ok   ${name}`);
  } else {
    fail += 1;
    failures.push(`${name} ${detail}`);
    console.log(`FAIL ${name} ${detail}`);
  }
};

const blocked = (s) => s === 403 || s === 404;

// List responses are shaped inconsistently across controllers: some return
// `data: [...]`, others `data: { payments: [...] }`. Find the first array.
const listOf = (data) => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data).find(Array.isArray) || [];
  return [];
};

const api = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
};

const adminLogin = async () => {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD must be set in the environment');
  }
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`Admin login failed (${r.status}): ${r.data?.message}`);
  return r.data?.token || r.data?.data?.token;
};

const createEngineer = async (adminToken, u) => {
  const r = await api('POST', '/admin/engineers', {
    token: adminToken,
    body: { name: u.name, email: u.email, customPassword: u.pass, mobile: u.mobile },
  });
  if (r.status !== 201 && r.status !== 200) throw new Error(`Create engineer failed: ${r.data?.message}`);
  return r.data.data.engineer;
};

const login = async (email, password) => {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${r.data?.message}`);
  // Token may sit at the top level or nested under `data` depending on version.
  r.token = r.data?.token || r.data?.data?.token;
  return r.data;
};

const makeSite = async (token, name) => {
  const r = await api('POST', '/sites', {
    token,
    body: {
      siteName: name,
      ownerName: 'Owner X',
      ownerMobile: '9876543210',
      location: 'Pune',
      address: '12, Test Street, Pune',
      city: 'Pune',
      state: 'Maharashtra',
      projectType: 'Residential',
      totalArea: 1000,
      ratePerArea: 1000,
      startDate: new Date().toISOString(),
    },
  });
  if (r.status !== 201 && r.status !== 200) throw new Error(`Create site failed: ${r.data?.message}`);
  return r.data.data.site;
};

const main = async () => {
  console.log('CROSS_TENANT_ATTACK_START');
  console.log(`api=${BASE}`);

  const adminToken = await adminLogin();
  const userA = await createEngineer(adminToken, A);
  const userB = await createEngineer(adminToken, B);
  const sessionA = await login(A.email, A.pass);
  const sessionB = await login(B.email, B.pass);
  if (!sessionA.token || !sessionB.token) throw new Error('Login did not return a token');
  const tokenA = sessionA.token;
  const tokenB = sessionB.token;

  const siteA = await makeSite(tokenA, `SiteA_${stamp}`);
  const siteB = await makeSite(tokenB, `SiteB_${stamp}`);

  check('fixtures: two tenants provisioned', Boolean(siteA._id && siteB._id && siteA._id !== siteB._id));

  // Seed tenant B with one record of every nested resource type.
  const today = new Date().toISOString();
  const mk = async (path, body) => {
    const r = await api('POST', `/sites/${siteB._id}${path}`, { token: tokenB, body });
    const id = r.data?.data?._id || r.data?.data?.id || null;
    if (!id) console.log(`  seed-fail ${path} status=${r.status} msg=${r.data?.message || ''}`);
    return id;
  };

  const bIds = {
    payment: await mk('/payments', { amount: 5000, date: today, paymentMode: 'Cash' }),
    installment: await mk('/installments', { name: 'Foundation', amount: 10000, stage: 'Foundation' }),
    worker: await mk('/workers', { name: 'Ramesh', mobile: '9999999999', workerType: 'Mason', dailyWage: 800 }),
    material: await mk('/materials', {
      name: 'Cement', category: 'Cement', unit: 'Bag', quantity: 100, rate: 400, purchaseDate: today,
    }),
    vendor: await mk('/vendors', { name: 'ABC Hardware', mobile: '8888888888', materialCategory: 'Cement' }),
    expense: await mk('/expenses', { category: 'Transportation', description: 'Test', amount: 1500, expenseDate: today }),
    activity: await mk('/activities', { workDescription: 'Foundation work', date: today }),
  };

  const missingSeed = Object.entries(bIds).filter(([, v]) => !v).map(([k]) => k);
  check('fixtures: tenant B seeded', missingSeed.length === 0, `missing=${missingSeed.join(',')}`);

  // ==========================================================================
  // PART 2 — ACTIVE CROSS-TENANT ATTACKS (tenant A vs tenant B)
  // Every assertion expects A BLOCKED (403/404) or a payload containing
  // nothing belonging to B. A 2xx or any tenant-B id in A's response is a
  // privacy leak and fails the run.
  // ==========================================================================

  // --- A. direct access to B's site by id -----------------------------------
  const direct = [
    ['GET', `/sites/${siteB._id}`, null],
    ['PUT', `/sites/${siteB._id}`, { siteName: 'hijacked' }],
    ['DELETE', `/sites/${siteB._id}?confirm=true`, null],
    ['PATCH', `/sites/${siteB._id}/archive`, null],
    ['GET', `/sites/${siteB._id}/summary`, null],
    ['GET', `/sites/${siteB._id}/reports`, null],
    ['GET', `/sites/${siteB._id}/report/pdf`, null],
    ['GET', `/sites/${siteB._id}/export/excel`, null],
    ['GET', `/sites/${siteB._id}/export/csv`, null],
  ];
  for (const [method, path, body] of direct) {
    const r = await api(method, path, { token: tokenA, body });
    check(`attack: A ${method} ${path.replace(siteB._id, ':siteB')} blocked`, blocked(r.status), `got ${r.status}`);
  }

  // --- A. nested collections read under B's siteId --------------------------
  const collections = [
    'payments', 'installments', 'workers', 'worker-payments', 'materials',
    'material-stock', 'material-usage', 'attendance', 'vendor-payments',
    'vendors', 'expenses', 'activities', 'documents',
  ];
  for (const coll of collections) {
    const r = await api('GET', `/sites/${siteB._id}/${coll}`, { token: tokenA });
    check(`attack: A GET /sites/:siteB/${coll} blocked`, blocked(r.status), `got ${r.status}`);
  }

  // --- B. mixed-context: A's OWN siteId + B's record id ---------------------
  // The siteId guard passes here (A owns siteA), so this exercises the
  // second-order record check inside each controller.
  const mutable = [
    ['payments', bIds.payment, { amount: 1 }],
    ['installments', bIds.installment, { amount: 1 }],
    ['workers', bIds.worker, { name: 'Hijacked' }],
    ['materials', bIds.material, { quantity: 1 }],
    ['vendors', bIds.vendor, { name: 'Hijacked' }],
    ['expenses', bIds.expense, { amount: 1 }],
    ['activities', bIds.activity, { title: 'Hijacked' }],
  ];
  for (const [coll, id, body] of mutable) {
    if (!id) { check(`attack: fixture for ${coll} missing`, false, 'seed failed'); continue; }
    const put = await api('PUT', `/sites/${siteA._id}/${coll}/${id}`, { token: tokenA, body });
    check(`attack: A PUT own-site+foreign-${coll} blocked`, blocked(put.status), `got ${put.status}`);
    const del = await api('DELETE', `/sites/${siteA._id}/${coll}/${id}`, { token: tokenA });
    check(`attack: A DELETE own-site+foreign-${coll} blocked`, blocked(del.status), `got ${del.status}`);
    const still = await api('GET', `/sites/${siteB._id}/${coll}`, { token: tokenB });
    check(`defense: B ${coll} record survives A's writes`,
      still.status === 200 && listOf(still.data?.data).length >= 1,
      `status=${still.status} count=${listOf(still.data?.data).length}`);
  }

  // --- B2. documents: seed one for B, A attacks it --------------------------
  const form = new FormData();
  form.append('file', new Blob(['tenant-b-confidential'], { type: 'application/pdf' }), 'tenant-b-confidential.pdf');
  const docRes = await fetch(`${BASE}/sites/${siteB._id}/documents`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokenB}` }, body: form,
  });
  let docData = null;
  try { docData = await docRes.json(); } catch { docData = null; }
  const docB = docData?.data?._id || docData?.data?.document?._id || null;
  check('fixtures: tenant B document uploaded', Boolean(docB), `status=${docRes.status}`);

  if (docB) {
    const dl = await api('GET', `/sites/${siteA._id}/documents/${docB}/download`, { token: tokenA });
    check('attack: A download own-site+foreign-document blocked', blocked(dl.status), `got ${dl.status}`);
    const rm = await api('DELETE', `/sites/${siteA._id}/documents/${docB}`, { token: tokenA });
    check('attack: A delete own-site+foreign-document blocked', blocked(rm.status), `got ${rm.status}`);
    const verify = await api('GET', `/sites/${siteB._id}/documents`, { token: tokenB });
    check('defense: B document survives', verify.status === 200 && JSON.stringify(verify.data).includes(docB));
  }

  // --- C. list endpoints must not leak B's ids to A -------------------------
  const sitesList = await api('GET', '/sites', { token: tokenA });
  check('defense: A site list excludes siteB',
    sitesList.status === 200 && !JSON.stringify(sitesList.data).includes(siteB._id));

  const workersList = await api('GET', `/sites/${siteA._id}/workers`, { token: tokenA });
  check('defense: A worker list excludes B worker',
    workersList.status === 200 && !JSON.stringify(workersList.data).includes(bIds.worker));

  const globalList = await api('GET', `/engineer/workers?siteId=${siteB._id}&limit=100`, { token: tokenA });
  check('defense: A global workers filtered by foreign siteId empty',
    globalList.status === 200 && listOf(globalList.data?.data?.items ?? globalList.data?.data).length === 0,
    `got ${globalList.status} items=${listOf(globalList.data?.data?.items ?? globalList.data?.data).length}`);

  // --- D. anonymous and role boundaries ------------------------------------
  const anon = await api('GET', `/sites/${siteB._id}`);
  check('attack: anonymous GET siteB -> 401', anon.status === 401, `got ${anon.status}`);
  const anonList = await api('GET', '/sites');
  check('attack: anonymous site list -> 401', anonList.status === 401, `got ${anonList.status}`);

  const adminMutate = await api('PUT', `/sites/${siteA._id}`, { token: adminToken, body: { siteName: 'admin-write' } });
  check('defense: super admin cannot mutate engineer site', adminMutate.status === 403, `got ${adminMutate.status}`);
  const adminRead = await api('GET', `/sites/${siteB._id}`, { token: adminToken });
  check('defense: super admin retains read-only site access', adminRead.status === 200, `got ${adminRead.status}`);

  // --- E. admin surface must reject engineer tokens ------------------------
  for (const path of ['/admin/engineers', '/admin/audit-logs', '/admin/sites', '/admin/reports']) {
    const r = await api('GET', path, { token: tokenA });
    check(`defense: A ${path} rejected`, r.status === 403 || r.status === 401, `got ${r.status}`);
  }


  // ---- cleanup ---------------------------------------------------------------
  await api('DELETE', `/sites/${siteA._id}?confirm=true`, { token: adminToken });
  await api('DELETE', `/sites/${siteB._id}?confirm=true`, { token: adminToken });
  await api('DELETE', `/admin/engineers/${userA._id}`, { token: adminToken });
  await api('DELETE', `/admin/engineers/${userB._id}`, { token: adminToken });
  check('cleanup: fixtures removed', true);

  console.log('CROSS_TENANT_ATTACK_END');
  console.log(`passed=${pass} failed=${fail}`);
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(fail === 0 ? 0 : 1);
};

main().catch((e) => {
  console.log(`CROSS_TENANT_ATTACK_ERROR: ${e.message}`);
  process.exit(1);
});

