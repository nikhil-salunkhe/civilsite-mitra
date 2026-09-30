/**
 * auth-safety-check.mjs - guards the authentication security properties.
 *
 * Regression guard for two real defects:
 *   1. tools/seed.js logged the Super Admin password in plaintext and silently
 *      overwrote an existing password on every run.
 *   2. express had no `trust proxy` setting, so behind Render every client
 *      shared one rate-limit bucket and emitted
 *      ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
 *
 * Static assertions only - no database, no network, no secrets printed.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const checks = [];
const ok = (n, d = '') => checks.push({ pass: true, n, d });
const bad = (n, d) => checks.push({ pass: false, n, d });
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const src = (p) => read(join('..', 'backend', p));

// --- 1. Password must never be logged --------------------------------------
// Two views of the same source:
//   noComments - comments removed, STRING LITERALS INTACT (needed to match
//                require('express-rate-limit') and app.set('trust proxy', 1))
//   bare       - comments AND string literals removed, so a log line that merely
//                mentions the word "password" is not mistaken for printing it
const noComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
const bare = (text) => noComments(text)
  .replace(/`(?:[^`\\]|\\.)*`/g, '""')
  .replace(/'(?:[^'\\]|\\.)*'/g, '""')
  .replace(/"(?:[^"\\]|\\.)*"/g, '""');

for (const f of ['tools/seed.js', 'src/controllers/authController.js', 'src/config/index.js']) {
  const raw = src(f);
  if (!raw) { bad(`${f} readable`, 'file not found'); continue; }
  // Only now is a *variable* named password/token/secret inside a console call a
  // genuine leak of a value.
  const leaks = [...bare(raw).matchAll(/console\.(log|info|warn|error)\([^)]*\b(password|passwd|pwd|token|secret)\b[^)]*\)/gi)]
    .map((m) => m[0]);
  if (leaks.length) for (const l of leaks) bad(`${f} logs a secret`, l.slice(0, 90));
  else ok(`${f} logs no secret`, 'only literal text, no value interpolated');
}

// --- 2. Passwords must be hashed, never stored plain -----------------------
const user = src('src/models/User.js');
if (!/bcrypt\.hash\(/.test(user)) bad('User model hashing', 'no bcrypt.hash() found');
else ok('User model hashing', 'bcrypt.hash() used');
if (!/bcrypt\.compare\(/.test(user)) bad('User model compare', 'no bcrypt.compare() found');
else ok('User model compare', 'bcrypt.compare() used');
// The re-hash guard is what stops a login-time save() from re-hashing.
if (/isModified\('password'\)/.test(user)) ok('User model re-hash guard', "pre('save') guarded by isModified('password')");
else bad('User model re-hash guard', "pre('save') is NOT guarded - login would double-hash");
if (/select:\s*false/.test(user)) ok('password select:false', 'never returned by default');
else bad('password select:false', 'password field is queryable by default');

// --- 3. ensure-admin must not overwrite by default -------------------------
const seed = src('tools/seed.js');
if (seed) {
  if (/--reset-password/.test(seed)) ok('ensure-admin reset is opt-in', 'requires an explicit flag');
  else bad('ensure-admin reset is opt-in', 'no --reset-password guard found');
  if (/existing\.password\s*=\s*password/.test(seed)) {
    const guarded = /RESET_PASSWORD\)[\s\S]{0,200}existing\.password\s*=\s*password/.test(seed)
      || /if\s*\(RESET_PASSWORD\)/.test(seed);
    if (guarded) ok('ensure-admin overwrite', 'password write is inside the RESET_PASSWORD branch');
    else bad('ensure-admin overwrite', 'existing password is overwritten unconditionally');
  }
}

// --- 4. trust proxy for Render --------------------------------------------
// Match comments out first: the doc block explains what NOT to do
// ("app.set('trust proxy', true) would be UNSAFE") and must not be read as the
// real setting.
const appCode = noComments(src('src/app.js'));
const tp = appCode.match(/app\.set\(\s*'trust proxy'\s*,\s*([^)]+)\)/);
if (!tp) {
  bad('trust proxy', 'not set - rate limiting collapses all clients into one bucket on Render');
} else if (/^\s*true\s*$/.test(tp[1])) {
  bad('trust proxy', 'set to `true` - clients could spoof X-Forwarded-For and evade limits');
} else {
  ok('trust proxy', `set to ${tp[1].trim()} (one hop - correct for Render)`);
}

// --- 5. Rate limiting must still be enabled -------------------------------
if (/express-rate-limit/.test(appCode)) {
  if (/app\.use\([^\n]*limiter/.test(appCode)) ok('rate limiting', 'still enabled');
  else bad('rate limiting', 'required but not applied');
} else bad('rate limiting', 'express-rate-limit not required');

// --- 6. JWT signing must be unchanged -------------------------------------
const authCtl = src('src/controllers/authController.js');
if (/jwt\.sign\(/.test(authCtl) && /config\.jwt\.secret/.test(authCtl)) {
  ok('JWT generation', 'unchanged - signs with config.jwt.secret');
} else bad('JWT generation', 'unexpected change in JWT signing');

// --- 7. Login must not read the env password -----------------------------
// A login that compared against process.env.SUPER_ADMIN_PASSWORD would be a
// catastrophic auth bypass.
if (/SUPER_ADMIN_PASSWORD/.test(authCtl)) {
  bad('login env usage', 'authController references SUPER_ADMIN_PASSWORD');
} else ok('login env usage', 'login never reads the env password');

const failed = checks.filter((c) => !c.pass);
console.log(`AUTH_SAFETY_CHECK checks=${checks.length} failed=${failed.length}`);
for (const c of checks) {
  if (!c.pass) console.log(`FAIL  ${c.n}: ${c.d}`);
}
if (!failed.length) for (const c of checks) console.log(`ok    ${c.n}${c.d ? ` (${c.d})` : ''}`);
process.exit(failed.length ? 1 : 0);
