/**
 * pdf-preview.mjs
 *
 * Renders the REAL report PDFs straight from the database into backend/.preview/
 * so the layout can be inspected (and rasterised for pixel-level review)
 * without starting the server or clicking through the UI.
 *
 *   node tools/pdf-preview.mjs      -> .preview/site-*.pdf, .preview/material-*.pdf
 *
 * Read-only: nothing is written to the database.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const req = createRequire(import.meta.url);
const mongoose = req('mongoose');
const config = req('../src/config');
const Site = req('../src/models/Site');
const User = req('../src/models/User');
const Material = req('../src/models/Material');
const svc = req('../src/services/reportService');
const { buildSiteReportPdf } = req('../src/reports/siteReport');
const { buildMaterialPdf } = req('../src/reports/materialReport');

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.preview');

/**
 * Saves a PDF to disk. The site dossier returns a live PDFDocument stream,
 * while the material reports resolve to a Buffer - accept either form.
 */
const write = async (target, file) => {
  if (target && typeof target.on === 'function') {
    const buf = await new Promise((resolve, reject) => {
      const chunks = [];
      target.on('data', (c) => chunks.push(c));
      target.on('error', reject);
      target.on('end', () => resolve(Buffer.concat(chunks)));
    });
    fs.writeFileSync(file, buf);
  } else {
    fs.writeFileSync(file, await target);
  }
  return file;
};

const slug = (s) =>
  String(s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });

  try {
    const sites = await Site.find({}).sort({ createdAt: -1 }).limit(4);
    if (!sites.length) throw new Error('no sites in the database - run: npm run seed:demo');

    const written = [];
    for (const site of sites) {
      const data = await svc.assembleSiteReportData(site, {});
      const owner = await User.findById(site.engineer)
        .select('name company email mobile').lean();
      if (owner) {
        data.engineer = {
          name: owner.name || site.engineerName || '',
          company: owner.company || '',
          email: owner.email || '',
          mobile: owner.mobile || '',
        };
      }
      const file = path.join(OUT, `site-${slug(site.siteName)}.pdf`);
      written.push(await write(buildSiteReportPdf(data), file));
    }

    // One standalone material report, so the shared kit is previewed too.
    // The material must be rendered against ITS OWN site (tenant guard).
    const material = await Material.findOne({});
    if (material) {
      const mSite = sites.find((s) => String(s._id) === String(material.site))
        || await Site.findById(material.site);
      if (mSite) {
        const mData = await svc.assembleMaterialReportData(mSite, material._id);
        const file = path.join(OUT, `material-${slug(material.name)}.pdf`);
        written.push(await write(buildMaterialPdf(mData, { site: mSite }), file));
      }
    }

    console.log('PDF_PREVIEW');
    written.forEach((f) => console.log(`  ${f}`));
    if (!material) console.log('  (no material found - material preview skipped)');
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`PDF_PREVIEW failed: ${err.message}`);
  process.exitCode = 1;
});
