const ORIGIN = 'https://civilsite-mitra.onrender.com';

const login = await (async () => {
  const res = await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'admin@civilsitemitra.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@123456',
    }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
})();

if (login.status !== 200 || !login.json?.token) {
  console.log(`ADMIN LOGIN FAILED status=${login.status}`);
  console.log('  -> The super admin itself cannot authenticate on Render.');
  console.log('  -> Either the credentials differ, or SUPER_ADMIN_* was never seeded there.');
  process.exit(1);
}
console.log('admin login: OK (200)');

const token = login.json.token;
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const engRes = await fetch(`${ORIGIN}/api/admin/engineers?limit=50`, { headers: auth });
const engJson = await engRes.json().catch(() => null);
const engineers = engJson?.data?.engineers || [];

console.log(`\nengineers on Render: ${engineers.length}`);
console.log('name'.padEnd(24), 'email'.padEnd(30), 'status'.padEnd(10), 'mustChangePwd');
for (const e of engineers) {
  console.log(
    String(e.name || '').slice(0, 23).padEnd(24),
    String(e.email || '').slice(0, 29).padEnd(30),
    String(e.status || '').padEnd(10),
    String(e.mustChangePassword),
  );
}

const active = engineers.filter((e) => e.status === 'ACTIVE' && e.role !== 'SUPER_ADMIN');
if (!active.length) {
  console.log('\nno ACTIVE engineer exists on Render - create one from the admin UI first.');
} else {
  const e = active[0];
  console.log(`\n-- probing the login response codes for the first ACTIVE engineer --`);
  for (const [label, email, password] of [
    ['correct email, wrong password', e.email, 'definitely-not-the-password'],
    ['unknown email', 'no-such-user@example.com', 'whatever'],
  ]) {
    const r = await fetch(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => null);
    console.log(`  ${label.padEnd(30)} -> ${r.status}  ${j?.message || ''}`);
  }
  console.log(`\n  The engineer's stored email is: ${e.email}`);
  console.log('  Passwords are bcrypt-hashed; if it was created with a temporary password,');
  console.log('  reset it from Admin -> Engineers -> Reset Password and use the new one.');
}