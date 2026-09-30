// Frontend/backend contract audit.
//
// Usage (backend must be running on :5000):
//   cd backend && node tools/contract-audit.js
//
// For every GET the React app performs, this asserts that the exact property
// path the component reads is present in the live payload. A missing path is a
// silent frontend bug: a blank card, a "Failed to load" toast, or a form that
// never populates. Exits non-zero when anything is missing, so it can gate CI.
//
// It is deliberately separate from smoke-test.js: smoke-test proves the
// business rules, this proves the frontend can actually READ the responses.
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../src/config');

const BASE = 'http://localhost:5000/api';
const out = [];
let pass = 0;
let fail = 0;

const get = async (token, path) => {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
};

const dig = (obj, path) =>
  path.split('.').reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), obj);

const check = async (token, path, expectations, label) => {
  const { status, body } = await get(token, path);
  out.push(`${status === 200 ? '200' : `HTTP${status}`} ${label || path}`);
  expectations.forEach((p) => {
    const v = dig(body, p);
    const ok = v !== undefined && v !== null;
    if (ok) pass += 1; else fail += 1;
    out.push(`      ${ok ? 'ok ' : 'MISSING'} ${p}`);
  });
};
(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const User = require('../src/models/User');
  const Site = require('../src/models/Site');
  const Vendor = require('../src/models/Vendor');
  const Worker = require('../src/models/Worker');
  const Payment = require('../src/models/Payment');

  const admin = await User.findOne({ role: 'SUPER_ADMIN' });
  const engineers = await User.find({ role: 'ENGINEER' }).sort({ createdAt: 1 });
  if (!admin || engineers.length === 0) throw new Error('seed users missing');

  // Deterministic fixtures. Other suites (smoke-test.js) create engineers, and a
  // bare findOne() would then pick a brand-new account owning nothing - silently
  // shrinking coverage. Rank every engineer by what it lets us exercise and take
  // the best: site + vendor + worker + payment > site + vendor > site.
  const candidates = [];
  for (const account of engineers) {
    const [ownSite, ownVendor, ownWorker, ownPayment] = await Promise.all([
      Site.findOne({ engineer: account._id }).sort({ createdAt: 1 }),
      Vendor.findOne({ engineer: account._id }),
      Worker.findOne({ engineer: account._id }),
      Payment.findOne({ engineer: account._id }),
    ]);
    if (!ownSite) continue;
    candidates.push({
      account,
      site: ownSite,
      vendor: ownVendor,
      worker: ownWorker,
      payment: ownPayment,
      score: (ownVendor ? 4 : 0) + (ownWorker ? 2 : 0) + (ownPayment ? 1 : 0),
    });
  }
  if (candidates.length === 0) throw new Error('no engineer owning a site found - seed the database first');
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const eng = best.account;
  const site = best.site;
  let vendor = best.vendor;
  let worker = best.worker;
  let payment = best.payment;

  const tok = (u) =>
    jwt.sign({ id: u._id, role: u.role, status: u.status }, config.jwt.secret, { expiresIn: '1h' });
  const aTok = tok(admin);
  const eTok = tok(eng);

  const sid = site._id;
  const S = `/sites/${sid}`;
  out.push(
    `FIXTURES engineer=${eng.email} site="${site.siteName}" vendor=${vendor ? vendor.name : 'none'} worker=${worker ? worker.name : 'none'} payment=${payment ? 'yes' : 'no'} existingFixtureScore=${best.score} (pre-seed; anything missing is created below and removed at the end)`
  );

  // --- Seed what is missing, so coverage is identical on any database ---------
  // A fresh database has no vendors/workers/payments, and those GET paths would
  // silently go unchecked - exactly how a broken installment response once
  // escaped testing. Everything created here is removed in the finally block.
  const created = [];
  const post = async (path, body) => {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${eTok}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.status >= 300) throw new Error(`seed ${path} -> ${res.status} ${json?.message || ''}`);
    const doc = (json && json.data) || {};
    if (doc._id) created.push({ path, id: doc._id });
    return doc;
  };
  const RUN = Date.now().toString().slice(-6);

  try {
    if (!vendor) {
      vendor = await post(`${S}/vendors`, {
        name: `Audit Vendor ${RUN}`,
        mobile: '9000000001',
        materialCategory: 'Steel',
      });
      await post(`${S}/vendor-payments`, {
        vendor: vendor._id,
        amount: 25000,
        date: new Date().toISOString(),
        paymentMode: 'Cheque',
        materialName: 'TMT Steel',
      });
    }
    if (!worker) {
      worker = await post(`${S}/workers`, {
        name: `Audit Worker ${RUN}`,
        mobile: '9333333333',
        workerType: 'Helper',
        dailyWage: 700,
      });
      await post(`${S}/worker-payments`, {
        worker: worker._id,
        date: new Date().toISOString(),
        workDays: 5,
        dailyWage: 700,
        paidAmount: 3500,
      });
    }
    if (!payment) {
      payment = await post(`${S}/payments`, {
        amount: 15000,
        date: new Date().toISOString(),
        paymentMode: 'Cash',
        notes: `Audit payment ${RUN}`,
      });
    }
    const material = await post(`${S}/materials`, {
      name: `Audit Cement ${RUN}`,
      category: 'Cement',
      quantity: 100,
      unit: 'Bag',
      rate: 400,
      openingStock: 50,
      minStockLevel: 20,
      trackStock: true,
    });
    await post(`${S}/material-usage`, {
      material: material._id,
      quantity: 10,
      date: new Date().toISOString(),
      workActivity: 'Audit consumption',
    });
    // A past-due installment drives the derived paid/pending/status path in the
    // financial summary - the code path that once broke the whole site screen.
    await post(`${S}/installments`, {
      name: `Audit Installment ${RUN}`,
      amount: 50000,
      dueDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    });
    await post(`${S}/expenses`, {
      category: 'Miscellaneous',
      amount: 1200,
      expenseDate: new Date().toISOString(),
      description: `Audit expense ${RUN}`,
      paidAmount: 1200,
    });
    await post(`${S}/activities`, {
      date: new Date().toISOString(),
      workDescription: `Audit activity ${RUN}`,
      workersPresent: 3,
      todayExpense: 900,
    });
    if (created.length) {
      out.push(`SEEDED ${created.length} fixture rows (all removed at the end)`);
    }
  } catch (seedErr) {
    out.push(`SEED_FAILED ${seedErr.message}`);
    fail += 1;
  }

  // --- auth ---
  await check(aTok, '/auth/me', ['data.user', 'data.mustChangePassword'], 'auth: /auth/me');

  // --- engineer dashboard + list pages ---
  await check(eTok, '/sites?page=1&limit=10', ['data.sites', 'data.pagination.totalItems'], 'engineer: /sites (SitesList + EngineerReports)');
  await check(eTok, '/sites/summary', ['data.stats', 'data.financials', 'data.sites', 'data.financials.projectValue', 'data.financials.pendingReceivable', 'data.financials.materialCost', 'data.financials.workerCost', 'data.financials.vendorCost', 'data.financials.otherExpenses', 'data.financials.estimatedProfit', 'data.financials.totalInvestment', 'data.financials.totalReceived'], 'engineer: /sites/summary (dashboard + report cards)');

  for (const m of ['workers', 'materials', 'vendors', 'expenses', 'activities', 'documents']) {
    await check(eTok, `/engineer/${m}?page=1&limit=10`, ['data.items', 'data.siteNames', 'data.pagination'], `engineer: sidebar /engineer/${m}`);
  }
  {
    await check(eTok, S, ['data.site', 'data.summary', 'data.site.siteName', 'data.site.totalArea', 'data.site.ratePerArea'], 'engineer: /sites/:id (Edit Site form + dashboard)');
    await check(eTok, `${S}/summary`, ['data.projectValue', 'data.totalReceived', 'data.pendingReceivable', 'data.totalInvestment', 'data.estimatedProfit'], 'engineer: site summary (Overview tab)');
    await check(eTok, `${S}/reports`, ['data.summary', 'data.installments', 'data.payments', 'data.summary.projectValue', 'data.summary.pendingReceivable', 'data.summary.materialCost', 'data.summary.workerCost', 'data.summary.vendorCost', 'data.summary.otherExpenses'], 'engineer: Reports tab');
    await check(eTok, `${S}/installments`, ['data'], 'engineer: installments tab (array)');
    await check(eTok, `${S}/payments`, ['data.payments', 'data.pagination'], 'engineer: payments tab');
    await check(eTok, `${S}/workers`, ['data.workers', 'data.pagination'], 'engineer: workers tab');
    await check(eTok, `${S}/worker-payments`, ['data.payments'], 'engineer: worker payment history');
    await check(eTok, `${S}/attendance`, ['data.attendance', 'data.pagination'], 'engineer: attendance tab');
    await check(eTok, `${S}/attendance/summary`, [], 'engineer: attendance summary');
    await check(eTok, `${S}/materials`, ['data'], 'engineer: materials tab (array)');
    await check(eTok, `${S}/material-usage`, ['data.usage', 'data.pagination', 'data.totalQuantity'], 'engineer: material usage tab');
    await check(eTok, `${S}/material-stock`, ['data.stock'], 'engineer: material stock');
    await check(eTok, `${S}/vendors`, ['data'], 'engineer: vendors tab (array)');
    await check(eTok, `${S}/vendor-payments`, ['data.payments'], 'engineer: vendor payments');
    await check(eTok, `${S}/expenses`, ['data.expenses', 'data.pagination'], 'engineer: expenses tab');
    await check(eTok, `${S}/activities`, ['data.activities', 'data.pagination'], 'engineer: activities tab');
    await check(eTok, `${S}/documents`, ['data'], 'engineer: documents tab (array)');
    if (vendor) {
      await check(eTok, `${S}/vendors/${vendor._id}/ledger`, ['data.vendor', 'data.openingBalance', 'data.summary.totalPurchases', 'data.summary.totalPaid', 'data.summary.outstanding', 'data.ledger'], 'engineer: vendor ledger');
    } else {
      out.push('SKIPPED engineer: vendor ledger (fixture engineer owns no vendor)');
    }
  }

  // --- admin pages ---
  await check(aTok, '/admin/dashboard', ['data'], 'admin: dashboard');
  await check(aTok, '/admin/reports', ['data'], 'admin: reports');
  await check(aTok, '/admin/sites?page=1&limit=15', ['data.sites', 'data.pagination'], 'admin: AllSites');
  await check(aTok, `/admin/sites?engineerId=${eng._id}&limit=50`, ['data.sites', 'data.pagination'], 'admin: EngineerDetail site list');
  await check(aTok, '/admin/engineers?limit=100', ['data.engineers', 'data.pagination'], 'admin: EngineersList + AdminReports');
  await check(aTok, `/admin/engineers/${eng._id}`, ['data.name', 'data.email', 'data.siteCount', 'data.financials'], 'admin: engineer detail');
  await check(aTok, '/admin/audit-logs?page=1&limit=20', ['data.logs', 'data.pagination'], 'admin: audit logs');

  // --- Clean up every seeded fixture (reverse order: children first) ---------
  let cleanupFailures = 0;
  for (const item of [...created].reverse()) {
    const res = await fetch(`${BASE}${item.path}/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${eTok}` },
    });
    if (res.status >= 300) cleanupFailures += 1;
  }
  out.push(`CLEANUP removed=${created.length - cleanupFailures} failed=${cleanupFailures}`);

  await mongoose.disconnect();
  console.log(out.join('\n'));
  const skipped = out.filter((l) => l.startsWith('SKIPPED')).length;
  console.log(`\nCONTRACT_AUDIT pass=${pass} missing=${fail} skipped=${skipped}`);
  process.exit(fail === 0 && cleanupFailures === 0 ? 0 : 2);
})().catch((e) => {
  console.error('AUDIT_FATAL', e.message);
  process.exit(1);
});


