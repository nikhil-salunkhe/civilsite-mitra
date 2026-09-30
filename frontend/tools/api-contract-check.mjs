/**
 * api-contract-check.mjs - guards the frontend<->backend URL contract.
 *
 * Regression guard for a real production outage: a deployed bundle requested
 * POST /auth/login (404) because the API base was missing the /api prefix that
 * every backend router is mounted under. These assertions fail the build if the
 * base URL, the env file or the axios instance drifts again.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const checks = [];
const ok = (n, d = '') => checks.push({ pass: true, n, d });
const bad = (n, d) => checks.push({ pass: false, n, d });
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// --- 1. Backend mounts everything under /api -------------------------------
const app = read(join('..', 'backend', 'src', 'app.js'));
if (app) {
  const mounts = [...app.matchAll(/app\.use\('(\/[^']*)'/g)].map((m) => m[1]);
  const apiMounts = mounts.filter((m) => m.startsWith('/api'));
  if (apiMounts.length === 0) bad('backend /api mount', 'no /api routers found in app.js');
  else ok('backend /api mount', apiMounts.join(' '));

  if (!/app\.get\('\/api\/health'/.test(app)) bad('/api/health', 'health route missing');
  else ok('/api/health', 'present');

  // A bare GET / is intentionally absent; flag it only if someone adds one.
  // Must match the literal root path only - app.get('/api/health' is fine.
  if (/app\.get\('\/'\s*,/.test(app)) {
    bad('root route', "a GET / route exists - it should stay unused (use /api/health)");
  } else ok('root route', 'absent (by design, not masked)');
} else {
  bad('backend/src/app.js', 'could not be read - backend mount assertions skipped');
}

// --- 2. The env file the production build actually reads -------------------
const prodEnv = read('.env.production');
if (!prodEnv) bad('.env.production', 'file missing - production build would fall back to /api');
else {
  const line = prodEnv.split('\n').find((l) => l.trim().startsWith('VITE_API_URL='));
  if (!line) bad('.env.production', 'VITE_API_URL not set');
  else {
    const value = line.slice(line.indexOf('=') + 1);
    if (/\s$/.test(value)) bad('VITE_API_URL', 'has a trailing space');
    else ok('VITE_API_URL', 'no trailing whitespace');
    if (/\/api$/i.test(value.trim())) ok('VITE_API_URL /api suffix', 'present');
    else bad('VITE_API_URL /api suffix', `"${value}" is missing the /api prefix`);
  }
  // Never allow backend secrets into the frontend bundle.
  for (const secret of ['MONGO_URI', 'JWT_SECRET', 'SUPER_ADMIN_PASSWORD', 'DB_PASSWORD']) {
    if (prodEnv.includes(secret)) bad('.env.production', `contains backend secret ${secret}`);
  }
  ok('.env.production secret scan', 'no backend secrets');
}

// --- 3. Single source of truth in the frontend -----------------------------
const format = read('src/utils/format.js');
const ctx = read('src/context/AuthContext.jsx');

if (!/export const API_BASE_URL = normaliseApiBase\(import\.meta\.env\.VITE_API_URL\)/.test(format)) {
  bad('API_BASE_URL', 'not derived via normaliseApiBase(import.meta.env.VITE_API_URL)');
} else ok('API_BASE_URL', 'derived from VITE_API_URL with normalisation');

if (!/import \{ API_BASE_URL \} from '\.\.\/utils\/format'/.test(ctx)) {
  bad('axios baseURL source', 'AuthContext does not import API_BASE_URL from utils/format');
} else if (/const API_BASE = '\/api'/.test(ctx)) {
  bad('axios baseURL source', "AuthContext still hardcodes '/api'");
} else if (!/const API_BASE = API_BASE_URL/.test(ctx)) {
  bad('axios baseURL source', 'AuthContext does not use API_BASE_URL');
} else ok('axios baseURL source', 'API_BASE = API_BASE_URL');

// --- 4. No hardcoded hosts or secrets anywhere in src ----------------------
const hardCoded = [];
for (const f of walk('src')) {
  const t = readFileSync(f, 'utf8');
  if (/onrender\.com/.test(t)) hardCoded.push(`${f}: hardcoded render host`);
  if (/localhost:5000/.test(t)) hardCoded.push(`${f}: hardcoded localhost:5000`);
}
if (hardCoded.length) for (const h of hardCoded) bad('hardcoded host', h);
else ok('hardcoded host scan', 'no onrender/localhost:5000 literals in src');

// --- 5. .env.example documents the same variable ---------------------------
const example = read('.env.example');
if (!example.includes('VITE_API_URL')) bad('.env.example', 'does not mention VITE_API_URL');
else ok('.env.example', 'documents VITE_API_URL');

const failed = checks.filter((c) => !c.pass);
console.log(`API_CONTRACT_CHECK checks=${checks.length} failed=${failed.length}`);
for (const c of checks) {
  if (!c.pass) console.log(`FAIL  ${c.n}: ${c.d}`);
}
if (!failed.length) for (const c of checks) console.log(`ok    ${c.n}${c.d ? ` (${c.d})` : ''}`);
process.exit(failed.length ? 1 : 0);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.jsx?$/.test(p)) out.push(p);
  }
  return out;
}