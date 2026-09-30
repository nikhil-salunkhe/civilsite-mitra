import { results, ok, bad, req, setToken, num, isBad, checkSummary } from './invariant-core.mjs';

const login = await req('POST', '/auth/login', {
  email: process.env.ADMIN_EMAIL || 'admin@civilsitemitra.com',
  password: process.env.ADMIN_PASSWORD || 'Admin@123456',
});
// The API answers { success, message, token, user } on login (token at top level).
if (login.status !== 200 || !login.json?.token) {
  bad('admin login', `HTTP ${login.status} ${JSON.stringify(login.json).slice(0, 160)}`);
} else {
  ok('admin login');
  setToken(login.json.token);

  const dash = await req('GET', '/admin/dashboard');
  // Shape: data = { engineers:{total,active,suspended,blocked,inactive},
  //                  sites:{total,running,completed},
  //                  financials:{ projectValue, totalInvestment, estimatedProfit, ... } }
  const dd = dash.json?.data || {};
  if (dash.status !== 200) bad('admin dashboard', `HTTP ${dash.status}`);
  else {
    ok('admin dashboard');
    for (const g of ['engineers', 'sites', 'financials']) {
      if (!dd[g] || typeof dd[g] !== 'object') bad(`admin.${g}`, `missing -> ${JSON.stringify(dd[g])}`);
    }
    for (const f of ['total', 'active', 'suspended', 'blocked', 'inactive']) {
      if (isBad(dd.engineers?.[f])) bad(`admin.engineers.${f}`, `null/NaN -> ${JSON.stringify(dd.engineers?.[f])}`);
    }
    for (const f of ['total', 'running', 'completed']) {
      if (isBad(dd.sites?.[f])) bad(`admin.sites.${f}`, `null/NaN -> ${JSON.stringify(dd.sites?.[f])}`);
    }
    checkSummary('admin', dd.financials || {});
    if (num(dd.financials?.totalInvestment) < 0) bad('admin.financials.totalInvestment', 'negative');
    const pv = num(dd.financials?.projectValue);
    if (num(dd.financials?.estimatedProfit) < -pv) {
      bad('admin.financials.estimatedProfit', 'loss exceeds revenue');
    }
  }

  const reports = await req('GET', '/admin/reports');
  if (reports.status !== 200) bad('admin reports', `HTTP ${reports.status}`);
  else {
    ok('admin reports');
    const rd = reports.json?.data || {};
    for (const [k, v] of Object.entries(rd.totals || {})) {
      if (isBad(v)) bad(`admin.reports.totals.${k}`, `null/NaN -> ${JSON.stringify(v)}`);
    }
    for (const e of rd.engineers || []) {
      if (isBad(e.projectValue)) bad(`reports.engineer[${e.name}].projectValue`, 'null/NaN');
      if (num(e.projectValue) < 0) bad(`reports.engineer[${e.name}].projectValue`, `negative ${e.projectValue}`);
    }
  }
}

// The admin token also passes the tenant guard (super-admin bypass), so we can
// probe every site without resetting anyone's password or creating fixtures.
const engList = await req('GET', '/admin/engineers?limit=10');
const engineers = engList.json?.data?.engineers || [];
const eng = engineers.find((e) => e.status === 'ACTIVE' && e.role !== 'SUPER_ADMIN');
if (!eng) {
  bad('fixture engineer', 'no ACTIVE engineer available for the probe');
} else {
  ok('fixture engineer found', eng.email);

  const esum = await req('GET', '/sites/summary');
  const es = esum.json?.data || {};
  if (esum.status !== 200) bad('engineer /sites/summary', `HTTP ${esum.status}`);
  else {
    ok('engineer /sites/summary');
    checkSummary('engineer', es.financials || es);
    for (const s of es.sites || []) {
      const p = num(s.overallProgress);
      if (isBad(s.overallProgress) && s.overallProgress !== 0) {
        bad(`site[${s.siteName}].overallProgress`, `null/NaN -> ${JSON.stringify(s.overallProgress)}`);
      }
      if (p < 0 || p > 100) bad(`site[${s.siteName}].overallProgress`, `outside 0..100 -> ${p}`);
    }
  }

  const sites = await req('GET', '/sites?limit=20');
  let siteCount = 0;
  for (const site of sites.json?.data?.sites || []) {
    siteCount += 1;
    const sid = site._id;
    const one = await req('GET', `/sites/${sid}/summary`);
    if (one.status === 200) checkSummary(`site[${site.siteName}]`, one.json?.data?.summary || one.json?.data || {});
    else bad(`site summary ${sid}`, `HTTP ${one.status}`);

    const mats = await req('GET', `/sites/${sid}/materials?limit=100`);
    for (const m of mats.json?.data?.materials || []) {
      if (isBad(m.totalAmount) && m.totalAmount !== 0) bad(`material[${m.materialName}].totalAmount`, `null/NaN -> ${JSON.stringify(m.totalAmount)}`);
      const q = num(m.quantity); const r = num(m.ratePerUnit ?? m.rate); const t = num(m.totalAmount);
      if (q > 0 && r > 0 && t > 0 && Math.abs(q * r - t) > 2) {
        bad(`material[${m.materialName}]`, `qty*rate=${(q * r).toFixed(2)} != total ${t}`);
      }
      if (num(m.pendingAmount) < -0.5) bad(`material[${m.materialName}].pendingAmount`, `negative ${m.pendingAmount}`);
      if (num(m.paidAmount) > t + 1) bad(`material[${m.materialName}].paidAmount`, `paid ${m.paidAmount} > total ${t}`);
    }

    const insts = await req('GET', `/sites/${sid}/installments?limit=100`);
    const pg = insts.json?.data?.pagination;
    if (pg && pg.currentPage > pg.totalPages) bad('installments pagination', `currentPage ${pg.currentPage} > totalPages ${pg.totalPages}`);
    for (const i of insts.json?.data?.installments || []) {
      if (num(i.pendingAmount) < -0.5) bad(`installment[${i.name}].pendingAmount`, `negative ${i.pendingAmount}`);
      if (num(i.paidAmount) > num(i.amount) + 1) bad(`installment[${i.name}].paidAmount`, `paid > amount`);
    }

    const pays = await req('GET', `/sites/${sid}/payments?limit=200`);
    const pg2 = pays.json?.data?.pagination;
    if (pg2 && pg2.currentPage > pg2.totalPages) bad('payments pagination', `currentPage ${pg2.currentPage} > totalPages ${pg2.totalPages}`);
    for (const p of pays.json?.data?.payments || []) {
      if (num(p.amount) < 0) bad(`payment[${p._id}].amount`, `negative ${p.amount}`);
    }
  }
  if (siteCount === 0) ok('no sites to probe', 'database has 0 sites');
}

const failed = results.filter((r) => !r.pass);
console.log(`INVARIANT_CHECK checks=${results.length} failed=${failed.length}`);
for (const r of results) {
  if (!r.pass) console.log(`FAIL  ${r.n}: ${r.d}`);
}
if (!failed.length) console.log('all invariants hold');
process.exit(failed.length ? 1 : 0);