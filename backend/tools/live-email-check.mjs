const ORIGIN = 'https://civilsite-mitra.onrender.com';

// The engineer's REAL stored address vs the correctly-spelled one a user is
// likely to type. If the typo theory is right, only the real one can ever match.
const variants = [
  'nsalunkhe803@gamil.com',    // as stored in the database
  'nsalunkhe803@gmail.com',    // correctly spelled - what a human would type
  'Nikhil.Ramesh.Salunkhe@x.com',
];

console.log('email'.padEnd(34), 'status', ' message');
for (const email of variants) {
  const r = await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'x' }),
  });
  const j = await r.json().catch(() => null);
  console.log(email.padEnd(34), String(r.status).padEnd(6), j?.message || '');
}
console.log('\nBoth stored-email and typo variants return the same 401 by design');
console.log('(the API never reveals whether an account exists).');

// Which frontend request produces the 404 the user saw on the login page?
console.log('\n-- probing likely sources of the 404 seen in the browser console --');
for (const p of ['/api/auth/me', '/favicon.ico', '/api/sites/summary', '/api/engineer/activities']) {
  const r = await fetch(`${ORIGIN}${p}`);
  console.log(`  ${p.padEnd(26)} -> ${r.status}`);
}