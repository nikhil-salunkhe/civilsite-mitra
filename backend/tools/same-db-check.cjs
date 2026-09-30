/**
 * same-db-check.mjs - is the LOCAL .env database the SAME one Render uses?
 *
 * Decides whether running `node tools/seed.js --reset-password` on this machine
 * would touch PRODUCTION data.
 *
 * PRIVACY: this script never prints a connection string, hostname, username or
 * password. It only compares an opaque ObjectId that identifies the same
 * document, and prints SAME_DATABASE / DIFFERENT_DATABASE.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const ORIGIN = 'https://civilsite-mitra.onrender.com';
const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@civilsitemitra.com').toLowerCase().trim();

(async () => {

// --- local side ------------------------------------------------------------
let localId = null;
let localCount = null;
try {
  const config = require('../src/config');
  const User = require('../src/models/User');
  const Site = require('../src/models/Site');
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const admin = await User.findOne({ email }).select('_id');
  localId = admin?._id?.toString() || null;
  localCount = await Site.countDocuments();
} catch (e) {
  console.log('local connect failed:', String(e.message).split('\n')[0]);
} finally {
  await mongoose.disconnect().catch(() => {});
}

// --- production side -------------------------------------------------------
let prodId = null;
let prodCount = null;
try {
  const login = await (await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'admin@civilsitemitra.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@123456',
    }),
  })).json();
  if (login?.token) {
    const dash = await (await fetch(`${ORIGIN}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })).json();
    // The admin's own id is returned by /auth/me for the logged-in admin.
    const me = await (await fetch(`${ORIGIN}/api/auth/me`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })).json();
    prodId = me?.data?.user?._id || null;
    prodCount = dash?.data?.sites?.total ?? null;
  }
} catch (e) {
  console.log('production probe failed:', e.message);
}

console.log('');
console.log(`local  : admin present=${Boolean(localId)}  sites=${localCount}`);
console.log(`prod   : admin present=${Boolean(prodId)}  sites=${prodCount}`);

if (localId && prodId) {
  console.log('');
  if (localId === prodId) {
    console.log('RESULT: SAME_DATABASE');
    console.log('=> The local .env points at the production MongoDB database.');
    console.log('=> Running `node tools/seed.js --reset-password` LOCALLY would change');
    console.log('   the PRODUCTION Super Admin password.');
  } else {
    console.log('RESULT: DIFFERENT_DATABASE');
    console.log('=> A local run would NOT affect production.');
  }
} else {
  console.log('RESULT: INCONCLUSIVE - could not read the admin id on one side.');
}

})().catch((e) => { console.error('check failed:', e.message); process.exit(1); });