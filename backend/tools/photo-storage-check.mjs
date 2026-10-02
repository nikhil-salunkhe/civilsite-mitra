/**
 * photo-storage-check.mjs
 *
 * Production-readiness checks for the Site Photos gallery and the pluggable
 * storage layer:
 *   - multi-photo upload, listing, download, delete
 *   - provider config (local default, s3 detection without secrets leaking)
 *   - ownership isolation (engineer B cannot see/download/delete A's photos)
 *   - path traversal / key injection defence
 *   - content type + no-inline-render headers
 *
 * Self-seeding: creates a throwaway engineer + site, then removes them.
 *
 * Usage:  node tools/photo-storage-check.mjs [baseUrl]
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

async function call(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${url}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  if (type.includes('json')) return { status: res.status, data: await res.json() };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), type, headers: res.headers };
}

const unwrap = (r) => {
  const p = r && r.data && (r.data.data || r.data);
  return p && typeof p === 'object' ? p : {};
};

/** Three genuinely different PNG payloads so each upload is distinguishable. */
const PNGS = [
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8//8/AzGAiYFIMKpwVOGowlGFxCkEAJRcAxHZ0m1cAAAAAElFTkSuQmCC', 'base64'),
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR42mNk+M9QzwAEYgH9P4k8m/QAAAAASUVORK5CYII=', 'base64'),
];

const uploadPhotos = async (siteId, token, buffers, names) => {
  const form = new FormData();
  buffers.forEach((buf, i) => {
    form.append('files', new Blob([buf], { type: 'image/png' }), names[i] || `photo-${i}.png`);
  });
  const res = await fetch(`${BASE}/sites/${siteId}/photos`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

async function main() {
  // --- storage provider configuration ---
  heading('STORAGE PROVIDER');
  const storage = (await import('../src/services/storageService.js')).default;
  const status = storage.configStatus();
  check(typeof status.provider === 'string' && status.ready === true,
    'storage provider configured', JSON.stringify(status));
  check(!/AKIA|secretAccessKey|accessKeyId\s*[:=]\s*["'][^"]+/.test(JSON.stringify(status)),
    'configStatus leaks no credential', JSON.stringify(status));
  check(/^(local|s3)$/.test(storage.provider), 'provider is local or s3', storage.provider);
  const key = storage.buildKey('photos', 'Site Photo.PNG');
  check(key.startsWith('photos/') && !key.includes('..') && !key.includes('\\'),
    'storage key is confined to its folder', key);
  for (const evil of ['../../etc/passwd', '/abs/path', 'a\\..\\..\\b']) {
    let threw = false;
    try {
      await storage.read(evil);
    } catch (err) {
      threw = /unsafe/i.test(err.message);
    }
    check(threw, `path traversal rejected: "${evil}"`);
  }

  // --- fixture tenant ---
  const stamp = Date.now();
  const mobile = `7${String(stamp).slice(-9)}`;
  const admin = await call('POST', '/auth/login', {
    body: { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD },
  });
  if (admin.status !== 200) {
    check(false, 'super admin fixture login', `status=${admin.status}`);
    return finish();
  }
  const adminToken = admin.data.token;
  check(true, 'super admin fixture login');

  const mkEngineer = async (name, m, email) => {
    const r = await call('POST', '/admin/engineers', {
      token: adminToken, body: { name, mobile: m, email, status: 'ACTIVE' },
    });
    const p = unwrap(r);
    const e = p.engineer || p;
    return {
      id: e._id,
      email: e.email || email,
      password: (p.credentials && p.credentials.temporaryPassword) || e.temporaryPassword,
    };
  };

  const a = await mkEngineer('Photo Engineer A', mobile, `photoa${mobile}@example.com`);
  check(Boolean(a.id && a.password), 'fixture engineer A created');
  const loginA = await call('POST', '/auth/login', { body: { email: a.email, password: a.password } });
  check(loginA.status === 200, 'engineer A signed in');
  const tokenA = loginA.data?.token;

  const siteRes = await call('POST', '/sites', {
    token: tokenA,
    body: {
      siteName: 'Photo Test Site', ownerName: 'Photo Owner', ownerMobile: '9888777666',
      address: 'Gallery Lane', city: 'Pune', state: 'Maharashtra',
      startDate: '2026-09-01', expectedCompletionDate: '2027-03-01',
      totalArea: 1500, ratePerArea: 1700,
    },
  });
  const siteId = (unwrap(siteRes).site || unwrap(siteRes))._id;
  check(Boolean(siteId), 'fixture site created');
  if (!tokenA || !siteId) return finish();


  // --- upload / list / download ---
  heading('PHOTO UPLOAD & GALLERY');

  const up = await uploadPhotos(siteId, tokenA, PNGS, ['a.png', 'b.png', 'c.png']);
  check(up.status === 201, 'multi-photo upload accepted', `status=${up.status}`);
  const saved = up.json?.data;
  check(Array.isArray(saved) && saved.length === 3,
    'all three photos recorded', `count=${Array.isArray(saved) ? saved.length : 'n/a'}`);
  check(saved?.[0]?.isPhoto === true, 'upload is flagged as a photo');
  check(Boolean(saved?.[0]?.downloadUrl), 'each photo carries a download route');
  check(saved?.every((p) => p.mimeType === 'image/png'), 'mime type recorded');
  check(saved?.every((p) => p.size > 0), 'file size recorded', `sizes=${saved?.map((p) => p.size).join(',')}`);
  check(saved?.every((p) => !('storageKey' in p) && !('accessKeyId' in p)),
    'API response exposes no storage internals');
  check(saved?.every((p) => p.storageProvider === undefined),
    'storage provider not leaked to the client');

  const list = await call('GET', `/sites/${siteId}/documents`, { token: tokenA });
  const all = list.data?.data;
  check(Array.isArray(all) && all.length === 3, 'gallery list returns the photos',
    `count=${Array.isArray(all) ? all.length : 'n/a'}`);

  const photosOnly = await call('GET', `/sites/${siteId}/documents?fileType=${encodeURIComponent('Site Photo')}`, { token: tokenA });
  check(photosOnly.data?.data?.length === 3, 'fileType filter returns the photo set');

  const first = saved[0];
  const dl = await call('GET', `/sites/${siteId}/documents/${first._id}/download`, { token: tokenA });
  check(dl.status === 200, 'owner can download a photo', `status=${dl.status}`);
  check(dl.buf?.slice(1, 4).toString() === 'PNG', 'downloaded bytes are a real PNG', `${dl.size} bytes`);
  check(dl.buf?.equals(PNGS[0]) === true, 'downloaded bytes match what was uploaded');
  check(String(dl.type).includes('image/png'), 'correct content type served', dl.type);
  check(dl.headers.get('x-content-type-options') === 'nosniff',
    'nosniff header prevents content sniffing');
  check(/attachment/.test(dl.headers.get('content-disposition') || ''),
    'served as attachment, not rendered inline');

  const form = new FormData();
  form.append('files', new Blob([PNGS[1]], { type: 'image/png' }), 'captioned.png');
  form.append('notes', 'Foundation completed');
  const cap = await fetch(`${BASE}/sites/${siteId}/photos`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokenA}` }, body: form,
  });
  const capJson = await cap.json().catch(() => ({}));
  check(capJson?.data?.[0]?.notes === 'Foundation completed', 'caption is stored for the gallery');


  // --- isolation ---
  heading('OWNERSHIP ISOLATION');
  const b = await mkEngineer('Photo Engineer B', `6${String(stamp).slice(-9)}`, `photob${mobile}@example.com`);
  const loginB = await call('POST', '/auth/login', { body: { email: b.email, password: b.password } });
  check(loginB.status === 200, 'fixture engineer B signed in');
  const tokenB = loginB.data?.token;

  const bList = await call('GET', `/sites/${siteId}/documents`, { token: tokenB });
  check(bList.status === 404, "engineer B cannot list engineer A's photos", `status=${bList.status}`);
  const bDl = await call('GET', `/sites/${siteId}/documents/${first._id}/download`, { token: tokenB });
  check(bDl.status === 404, "engineer B cannot download engineer A's photo", `status=${bDl.status}`);
  const bDel = await call('DELETE', `/sites/${siteId}/documents/${first._id}`, { token: tokenB });
  check(bDel.status === 404, "engineer B cannot delete engineer A's photo", `status=${bDel.status}`);

  const anon = await call('GET', `/sites/${siteId}/documents`);
  check(anon.status === 401, 'unauthenticated photo list rejected', `status=${anon.status}`);

  // IDOR: engineer's OWN site, but a photo id that lives on a different site.
  const otherSite = await call('POST', '/sites', {
    token: tokenA,
    body: {
      siteName: 'Second Photo Site', ownerName: 'Other', ownerMobile: '9000001111',
      address: 'x', city: 'Y', state: 'Z', startDate: '2026-09-01',
      expectedCompletionDate: '2027-01-01', totalArea: 100, ratePerArea: 100,
    },
  });
  const site2 = (unwrap(otherSite).site || unwrap(otherSite))._id;
  const crossSite = await call('GET', `/sites/${site2}/documents/${first._id}/download`, { token: tokenA });
  check(crossSite.status === 404, 'photo cannot be fetched through a different site id', `status=${crossSite.status}`);
  const crossDel = await call('DELETE', `/sites/${site2}/documents/${first._id}`, { token: tokenA });
  check(crossDel.status === 404, 'photo cannot be deleted through a different site id', `status=${crossDel.status}`);

  const notFound = await call('GET', `/sites/${siteId}/documents/000000000000000000000000/download`, { token: tokenA });
  check(notFound.status === 404, 'unknown photo id returns 404', `status=${notFound.status}`);

  const evil = new FormData();
  evil.append('files', new Blob([Buffer.from('#!/bin/sh\nrm -rf /')], { type: 'application/x-sh' }), 'evil.sh');
  const evilRes = await fetch(`${BASE}/sites/${siteId}/photos`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokenA}` }, body: evil,
  });
  check(evilRes.status === 400, 'executable rejected on the gallery route', `status=${evilRes.status}`);

  // --- delete ---
  heading('DELETE');
  const before = (await call('GET', `/sites/${siteId}/documents`, { token: tokenA })).data?.data?.length || 0;
  const del = await call('DELETE', `/sites/${siteId}/documents/${first._id}`, { token: tokenA });
  check(del.status === 200, 'owner can delete a photo', `status=${del.status}`);
  const after = (await call('GET', `/sites/${siteId}/documents`, { token: tokenA })).data?.data?.length || 0;
  check(after === before - 1, 'gallery shrinks by exactly one', `${before} -> ${after}`);
  const gone = await call('GET', `/sites/${siteId}/documents/${first._id}/download`, { token: tokenA });
  check(gone.status === 404, 'deleted photo no longer served', `status=${gone.status}`);

  // --- cleanup ---
  heading('CLEANUP');
  for (const id of [siteId, site2]) {
    if (id) await call('DELETE', `/sites/${id}?confirm=true`, { token: tokenA });
  }
  // Verified BEFORE the engineer accounts are removed: once the account is
  // gone its token can no longer authenticate at all, so the check would
  // report 401 instead of the 404 we actually want to prove.
  const goneSite = await call('GET', `/sites/${siteId}`, { token: tokenA });
  check(goneSite.status === 404, 'fixture site removed', `status=${goneSite.status}`);
  for (const id of [a.id, b.id]) {
    if (id) await call('DELETE', `/admin/engineers/${id}`, { token: adminToken });
  }

  return finish();
}

function finish() {
  console.log(`PHOTO_STORAGE_CHECK  base=${BASE}`);
  console.log(results.join('\n'));
  console.log('');
  console.log(`PHOTO_STORAGE_CHECK  pass=${pass}  fail=${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.log(`PHOTO_STORAGE_CHECK  base=${BASE}`);
  console.log(results.join('\n'));
  console.log('');
  console.log(`PHOTO_STORAGE_CHECK  aborted: ${err.message}`);
  process.exitCode = 1;
});

