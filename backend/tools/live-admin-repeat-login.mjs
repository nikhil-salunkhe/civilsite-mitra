/**
 * live-admin-repeat-login.mjs - is the Super Admin login self-destructive?
 *
 * Symptom under investigation: the first POST /api/auth/login returns 200 and
 * every later attempt with the SAME credentials returns 401. If a pre('save')
 * hook were re-hashing an unchanged password, that is exactly what we would see.
 *
 * This logs in repeatedly with identical credentials and reports the status of
 * each attempt. No password is ever printed.
 */
const ORIGIN = 'https://civilsite-mitra.onrender.com';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@civilsitemitra.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';

const attempt = async (n) => {
  const t0 = Date.now();
  const res = await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await res.json().catch(() => null);
  const ms = Date.now() - t0;
  console.log(
    `attempt ${String(n).padStart(2)}  status=${String(res.status).padEnd(4)} `
    + `${String(ms).padStart(5)}ms  ${j?.message || (res.status === 200 ? 'Login successful' : '')}`,
  );
  return res.status;
};

console.log(`repeating admin login 3x with identical credentials on ${ORIGIN}\n`);
const results = [];
for (let i = 1; i <= 3; i += 1) {
  results.push(await attempt(i));
  await new Promise((r) => setTimeout(r, 1200));
}

const allOk = results.every((s) => s === 200);
console.log(`\nstatuses: ${results.join(', ')}`);
if (allOk) {
  console.log('VERDICT: authentication is stable - repeated identical logins all succeed.');
  console.log('         A 401 here therefore means the entered password differs from the');
  console.log('         one hashed in the database, NOT that the auth code is broken.');
} else if (results[0] === 200 && results.slice(1).some((s) => s === 401)) {
  console.log('VERDICT: REPRODUCED - the first login succeeds and later ones fail.');
  console.log('         This is a real bug: the stored password hash is being mutated by');
  console.log('         the login-time user.save().');
} else {
  console.log('VERDICT: all attempts failed - the credentials are simply wrong, or the');
  console.log('         account is locked by the rate limiter (that would be 429).');
}