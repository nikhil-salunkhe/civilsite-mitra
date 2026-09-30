/**
 * live-reset-engineer.mjs - reset the Render engineer's password and verify it.
 *
 * Run when an engineer is locked out with 401 "Invalid email or password".
 * Uses the SAME admin endpoint the UI uses, then proves the new credentials work
 * so we can tell a bad password apart from a bad email address.
 */
const ORIGIN = 'https://civilsite-mitra.onrender.com';

const admin = await (await fetch(`${ORIGIN}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.ADMIN_EMAIL || 'admin@civilsitemitra.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123456',
  }),
})).json();

if (!admin?.token) { console.log('admin login failed'); process.exit(1); }
const auth = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };

const list = await (await fetch(`${ORIGIN}/api/admin/engineers?limit=50`, { headers: auth })).json();
const engineers = list?.data?.engineers || [];
const target = engineers.find((e) => e.status === 'ACTIVE' && e.role !== 'SUPER_ADMIN');
if (!target) { console.log('no ACTIVE engineer found'); process.exit(1); }

console.log(`engineer : ${target.name}`);
console.log(`email    : ${target.email}   <-- note the spelling`);
console.log(`id       : ${target._id}\n`);

const reset = await fetch(`${ORIGIN}/api/admin/engineers/${target._id}/reset-password`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});
const resetJson = await reset.json().catch(() => null);
console.log(`reset status: ${reset.status}`);
if (reset.status !== 200) {
  console.log(JSON.stringify(resetJson));
  process.exit(1);
}

const newPassword = resetJson?.data?.temporaryPassword
  || resetJson?.data?.password
  || resetJson?.temporaryPassword;
console.log(`new password: ${newPassword ? '(issued)' : 'NOT RETURNED'}`);
if (!newPassword) { console.log(JSON.stringify(resetJson)); process.exit(1); }

// Prove the new credentials work.
const verify = await fetch(`${ORIGIN}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: target.email, password: newPassword }),
});
const vj = await verify.json().catch(() => null);
console.log(`\nverify login with the stored email : ${verify.status} ${vj?.message || ''}`);

const wrong = await fetch(`${ORIGIN}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: target.email.replace('@gamil.', '@gmail.'), password: newPassword }),
});
console.log(`verify login with gmail.com spelling: ${wrong.status} (401 expected - different account)`);

console.log('\n--- next step for the user ---');
console.log(`1. Sign in with EXACTLY: ${target.email}`);
console.log(`2. Password: ${newPassword}`);
console.log('3. The app will require a password change on first login (Settings).');
console.log('4. Also correct the typo in the stored email so the address is deliverable.');