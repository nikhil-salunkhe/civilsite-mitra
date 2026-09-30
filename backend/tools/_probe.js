// Throwaway probe: prints the raw operators PDFKit emits for page 1 so the
// inspector's regexes can be matched against reality instead of assumption.
const zlib = require('zlib');
const mongoose = require('mongoose');
const config = require('../src/config');
const Site = require('../src/models/Site');
const { assembleSiteReportData, buildReportMeta } = require('../src/services/reportService');
const { buildSiteReportPdf } = require('../src/reports/siteReport');

const renderPdf = (data) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const doc = buildSiteReportPdf(data);
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const site = await Site.findOne({}).sort({ createdAt: 1 }).lean();
  const data = await assembleSiteReportData(site);
  data.meta = buildReportMeta(data);
  const buf = await renderPdf(data);

  const text = buf.toString('latin1');
  const objects = new Map();
  for (const m of text.matchAll(/(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g)) objects.set(Number(m[1]), m[3]);

  const pages = [];
  for (const [num, body] of objects) if (/\/Type\s*\/Page[^s]/.test(body)) pages.push({ num, body });
  pages.sort((a, b) => a.num - b.num);

  const ref = Number(pages[0].body.match(/\/Contents\s+(\d+)\s+\d+\s+R/)[1]);
  const raw = objects.get(ref);
  const s = raw.indexOf('stream');
  const e = raw.lastIndexOf('endstream');
  let slice = Buffer.from(raw.slice(s + 6, e), 'latin1');
  while (slice.length && (slice[0] === 0x0d || slice[0] === 0x0a)) slice = slice.slice(1);
  const content = zlib.inflateSync(slice).toString('latin1');

  console.log('=== OPERATOR FORMS ===');
  const forms = new Set();
  for (const m of content.matchAll(/[A-Za-z'"*]+\s*(?:\n|$)/g)) forms.add(m[0].trim());
  console.log([...forms].join(' '));

  console.log('\n=== FIRST 1400 CHARS ===');
  console.log(content.slice(0, 1400));

  console.log('\n=== LAST 700 CHARS ===');
  console.log(content.slice(-700));

  await mongoose.disconnect();
})().catch((e) => {
  console.error('PROBE_FATAL', e.message);
  process.exit(1);
});
