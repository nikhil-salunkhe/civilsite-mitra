// Temporary diagnostic: prints, per page, the text drawn lowest on the sheet so
// the overflow assertion can be calibrated against real footer geometry.
const zlib = require('zlib');
const mongoose = require('mongoose');
const config = require('../src/config');
const Site = require('../src/models/Site');
const User = require('../src/models/User');
const { assembleSiteReportData, buildReportMeta } = require('../src/services/reportService');
const { buildSiteReportPdf } = require('../src/reports/siteReport');

const render = (data) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const doc = buildSiteReportPdf(data);
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

const inflate = (body) => {
  const start = body.indexOf('stream');
  const end = body.lastIndexOf('endstream');
  if (start === -1 || end === -1) return '';
  let slice = Buffer.from(body.slice(start + 6, end), 'latin1');
  while (slice.length && (slice[0] === 0x0d || slice[0] === 0x0a)) slice = slice.slice(1);
  while (slice.length && (slice[slice.length - 1] === 0x0a || slice[slice.length - 1] === 0x0d)) {
    slice = slice.slice(0, -1);
  }
  try {
    return zlib.inflateSync(slice).toString('latin1');
  } catch {
    return '';
  }
};

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const site = await Site.findOne({}).sort({ createdAt: 1 }).lean();
  const owner = await User.findById(site.engineer).lean();
  const data = await assembleSiteReportData(site);
  data.engineer = { name: owner?.name || '', company: '', email: '', mobile: '' };
  data.meta = buildReportMeta(data);

  const buf = await render(data);
  const text = buf.toString('latin1');
  const objects = new Map();
  for (const m of text.matchAll(/(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g)) {
    objects.set(Number(m[1]), m[3]);
  }
  const pageDocs = [];
  for (const [num, body] of objects) {
    if (/\/Type\s*\/Page[^s]/.test(body)) pageDocs.push({ num, body });
  }
  pageDocs.sort((a, b) => a.num - b.num);

  pageDocs.forEach((p, index) => {
    const ref = p.body.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    if (!ref) {
      console.log(`page ${index + 1} (obj ${p.num}) has NO /Contents ref`);
      return;
    }
    const content = inflate(objects.get(Number(ref[1])) || '');
    console.log(`\n===== page ${index + 1} (obj ${p.num}) contentLen=${content.length} =====`);
    if (process.env.DUMP_RAW) {
      console.log(content.slice(0, 1200).replace(/[^\x20-\x7e\n]/g, '.'));
      return;
    }
    // Walk the stream tracking the last Td/Tm so each shown string keeps its y.
    let y = 0;
    const rows = [];
    const re = /(-?[\d.]+)\s+(-?[\d.]+)\s+(Td|TD)|1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm|\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      if (m[1] !== undefined) {
        y = Number(m[2]);
      } else if (m[4] !== undefined) {
        y = Number(m[5]);
      } else {
        const raw = m[6] !== undefined ? m[6] : m[7];
        if (raw === undefined) continue;
        const txt = Array.from(raw.matchAll(/\(((?:[^()\\]|\\.)*)\)/g))
          .map((x) => x[1])
          .join('');
        if (txt) rows.push({ y, txt });
      }
    }
    rows.sort((a, b) => b.y - a.y);
    console.log('lowest 8 drawn strings (top-down y, larger = lower on sheet):');
    rows.slice(0, 8).forEach((r) => console.log(`  y=${r.y.toFixed(1)}  "${r.txt.slice(0, 70)}"`));
    console.log(`  total strings=${rows.length}`);
  });

  await mongoose.disconnect();
})();
