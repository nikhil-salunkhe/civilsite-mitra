#!/usr/bin/env node
/**
 * Auth-flow regression check (dependency-free).
 *
 * Guards the sign-out path. It used to break in a way that was invisible to the
 * build: `logout()` navigated to /login while the session state was still set,
 * so /login redirected straight back into the dashboard, remounted it, and fired
 * token-less API calls. The user saw "Access denied. No token provided.", the
 * 401 handler then did a window.location redirect, and the app hard-reloaded
 * (visible as a second "[vite] connecting... connected" in the console).
 *
 * Run with: npm run check:auth
 * Optional: node tools/auth-flow-check.js --src <dir>  (check a source snapshot)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const srcArgIndex = process.argv.indexOf('--src');
const SRC = srcArgIndex !== -1 && process.argv[srcArgIndex + 1]
  ? path.resolve(process.argv[srcArgIndex + 1])
  : path.join(HERE, '..', 'src');
const results = [];
let failed = 0;

const read = (relative) => fs.readFileSync(path.join(SRC, relative), 'utf8');

const check = (name, condition, detail = '') => {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) failed += 1;
};

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
};

// ---------------------------------------------------------------------------
// 1. logout() must tear the session down BEFORE it navigates
// ---------------------------------------------------------------------------
const auth = read('context/AuthContext.jsx');
const logoutBody = auth.slice(auth.indexOf('const logout = useCallback'));
const idxRemoveToken = logoutBody.indexOf("localStorage.removeItem('token')");
const idxSetUserNull = logoutBody.indexOf('setUser(null)');
const idxNavigate = logoutBody.indexOf("navigate('/login'");

check(
  'logout() clears the stored token before navigating to /login',
  idxRemoveToken !== -1 && idxNavigate !== -1 && idxRemoveToken < idxNavigate
);
check(
  'logout() resets the user state before navigating to /login',
  idxSetUserNull !== -1 && idxNavigate !== -1 && idxSetUserNull < idxNavigate
);
check(
  'logout() drops any lingering error toast',
  logoutBody.includes('toast.dismiss()')
);
// The heart of the bug: the teardown used to sit BEHIND an awaited network call,
// so for the duration of that request the app was still "signed in" while the
// router moved to /login - which bounced back into the dashboard. The teardown
// must therefore be synchronous, i.e. no `await` may precede the navigation.
const idxFirstAwait = logoutBody.indexOf('await ');
check(
  'logout() tears the session down synchronously (no await before navigating)',
  idxFirstAwait !== -1 && idxNavigate !== -1 && idxFirstAwait > idxNavigate
);
check(
  'logout() skips the sign-out ping when the token is already gone',
  /if \(token\) \{[\s\S]*?api\.post\('\/auth\/logout'/.test(logoutBody)
);
check(
  'logout() sends the sign-out ping with the session token attached',
  /Authorization: `Bearer \$\{token\}`/.test(logoutBody)
);
check(
  'requests snapshot whether they carried a token (__hadToken)',
  auth.includes('config.__hadToken = Boolean(token)')
);
check(
  '401s only sign out when the call carried a token',
  /if \(config\.__hadToken\) \{[\s\S]*?notifyAuthFailure\(\)/.test(auth)
);
check(
  'token-less 401s are flagged silent (never a toast on the login screen)',
  /else \{[\s\S]*?error\.__silent = true;/.test(auth)
);
check(
  'logout() still calls POST /auth/logout (server-side audit trail)',
  logoutBody.includes('/auth/logout')
);

// ---------------------------------------------------------------------------
// 2. No hard page reloads anywhere: sign-out goes through the router
// ---------------------------------------------------------------------------
const offenders = [];
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  if (/window\.location\.(href|replace)\s*=/.test(text) || /window\.location\.href\s*=/.test(text)) {
    offenders.push(path.relative(SRC, file));
  }
}
check(
  'no window.location redirects (a hard reload re-bootstraps Vite + React)',
  offenders.length === 0,
  offenders.join(', ')
);

// ---------------------------------------------------------------------------
// 3. A 401 signs the user out through the router listener, not a reload
// ---------------------------------------------------------------------------
check('a 401 notifies the auth listeners', auth.includes('notifyAuthFailure()'));
check(
  'AuthProvider subscribes to auth failures and routes to /login',
  /onAuthFailure\(\(\) => \{[\s\S]*?navigate\('\/login', \{ replace: true \}\)/.test(auth)
);
check(
  'auth failures on an authenticated call are reworded for the user',
  auth.includes('Your session has expired. Please sign in again.')
);
check(
  'sign-in / password-recovery endpoints keep their own error messages',
  auth.includes("'/auth/login'") && auth.includes('isPublicRequest(config.url)')
);
check('cancelled requests are never retried', auth.includes("error.code === 'ERR_CANCELED'"));

// ---------------------------------------------------------------------------
// 4. Router v7 warnings must stay silenced
// ---------------------------------------------------------------------------
const main = read('main.jsx');
check('BrowserRouter opts in to v7_startTransition', main.includes('v7_startTransition: true'));
check('BrowserRouter opts in to v7_relativeSplatPath', main.includes('v7_relativeSplatPath: true'));

// ---------------------------------------------------------------------------
// 5. Layouts must not navigate after calling logout() (it routes itself)
// ---------------------------------------------------------------------------
for (const layout of ['layouts/AdminLayout.jsx', 'layouts/EngineerLayout.jsx']) {
  const text = read(layout);
  check(`${layout} has no redundant navigation after logout()`, !/logout\(\);\s*\n\s*navigate\(/.test(text));
}

// ---------------------------------------------------------------------------
// 6. No render-phase navigation on the login screen
// ---------------------------------------------------------------------------
const login = read('pages/LoginPage.jsx');
check(
  'LoginPage does not call navigate() during render',
  !/if \(isAuthenticated\) \{\s*\n\s*navigate\(/.test(login)
);
check('LoginPage delegates the already-signed-in case to <Navigate>', login.includes('<Navigate to='));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
for (const { name, ok, detail } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` -> ${detail}` : ''}`);
}
console.log(
  `\nAUTH_FLOW_CHECK ${failed === 0 ? 'pass' : 'fail'} checks=${results.length} failed=${failed}`
);
process.exit(failed === 0 ? 0 : 1);
