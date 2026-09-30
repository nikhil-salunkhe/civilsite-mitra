/* CivilSiteMitra - Demo data seeder
 * Seeds 3 demo engineers + 3 realistic sites with the full record set,
 * using the real HTTP API so it can never drift from the schemas.
 *
 * Idempotent: re-running removes only the previous demo data
 * (matched by the DEMO_ emails / DEMO- site names) and rebuilds it.
 *
 * Usage (from backend/):
 *   node tools/seed-demo.js
 *   npm run seed:demo
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('ERROR: SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD are not set in backend/.env');
  process.exit(1);
}

let cookie = '';
let bearer = '';

async function call(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = res.headers.get('set-cookie');
  if (raw) cookie = raw.split(/,(?=[^;]+=)/).map((c) => c.split(';')[0]).join('; ');

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data.message || data.error || res.statusText;
    throw new Error(`${method} ${path} -> ${res.status}: ${msg}`);
  }
  return data;
}

const first = (d) => (Array.isArray(d) ? d[0] : d?.data?.[0] || d?.data || d);
const list = (d) => (Array.isArray(d) ? d : d?.data || []);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString();

const DEMO_ENGINEERS = [
  { name: 'Rahul Patil',  email: 'demo.rahul@civilsitemitra.com',  mobile: '9800000101', company: 'Patil Civil Works' },
  { name: 'Priya Sharma', email: 'demo.priya@civilsitemitra.com', mobile: '9800000102', company: 'Sharma Builders' },
  { name: 'Vikram Desai', email: 'demo.vikram@civilsitemitra.com', mobile: '9800000103', company: 'Desai Infrastructure' },
];

// __CONTINUE__
