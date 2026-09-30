// Report generation smoke check: proves the three downloadable artefacts really
// contain a document (correct MIME + magic bytes) rather than an error page.
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../src/config');

const BASE = 'http://localhost:5000/api';

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const User = require('../src/models/User');
  const Site = require('../src/models/Site');

  const eng = await User.findOne({ role: 'ENGINEER' });
  const site = await Site.findOne({ engineer: eng._id });
  const token = jwt.sign({ id: eng._id, role: eng.role, status: eng.status }, config.jwt.secret, {
    expiresIn: '1h',
  });
  const sid = site._id;
  let fail = 0;

  const hit = async (path, expectType, magic, label) => {
    const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || '';
    const disp = res.headers.get('content-disposition') || '';
    const okType = type.includes(expectType);
    const okMagic = magic ? buf.slice(0, magic.length).equals(Buffer.from(magic)) : buf.length > 0;
    const ok = res.status === 200 && okType && okMagic;
    if (!ok) fail += 1;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${label} -> HTTP${res.status} ${type.split(';')[0]} ${buf.length}B attach=${disp.includes('attachment')}`
    );
  };

  await hit(`/sites/${sid}/report/pdf`, 'application/pdf', '%PDF-', 'PDF report');
  await hit(`/sites/${sid}/export/excel`, 'spreadsheet', 'PK', 'Excel export (.xlsx)');
  await hit(`/sites/${sid}/export/csv`, 'text/csv', null, 'CSV export');
  await hit(`/sites/${sid}/reports`, 'application/json', null, 'Reports JSON payload');

  // The JSON bundle must carry the standard dossier metadata: the canonical
  // numbered section list + record counters, shared with PDF/Excel/CSV/screen.
  const metaRes = await fetch(`${BASE}/sites/${sid}/reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await metaRes.json();
  const meta = payload && payload.data && payload.data.meta;
  const sections = meta && meta.sections;
  const numberingOk =
    Array.isArray(sections) &&
    sections.length === 14 &&
    sections.every(
      (s, i) => s.no === i + 1 && !!s.key && !!s.title && typeof s.records === 'number'
    );
  const totalsOk = !!(meta && meta.totals && typeof meta.totals === 'object');
  const scopeOk = typeof (meta && meta.scope) === 'string' && meta.scope.length > 0;
  const metaOk = metaRes.status === 200 && numberingOk && totalsOk && scopeOk;
  if (!metaOk) fail += 1;
  console.log(
    `${metaOk ? 'ok  ' : 'FAIL'} report meta -> sections=${Array.isArray(sections) ? sections.length : 0} numbering=${numberingOk} totals=${totalsOk} scope=${scopeOk}`
  );

  await mongoose.disconnect();
  console.log(`\nREPORT_CHECK fail=${fail}`);
  process.exit(fail === 0 ? 0 : 2);
})().catch((e) => {
  console.error('REPORT_CHECK_FATAL', e.message);
  process.exit(1);
});
