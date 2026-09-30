const ORIGIN = 'https://civilsite-mitra.onrender.com';

const probe = async (method, path, body) => {
  const t0 = Date.now();
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { path, status: res.status, ms: Date.now() - t0, ok: res.status < 500 };
  } catch (e) {
    return { path, status: 'ERR', ms: Date.now() - t0, ok: false, err: e.message };
  }
};

const rows = [
  await probe('GET', '/api/health'),
  await probe('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password' }),
  await probe('POST', '/auth/login', { email: 'x@y.com', password: 'z' }),
  await probe('GET', '/'),
  await probe('GET', '/api/sites'),
];

console.log('path'.padEnd(28), 'status'.padEnd(8), 'ms'.padEnd(6), 'verdict');
for (const r of rows) {
  let verdict = '';
  if (r.path === '/api/health') verdict = r.status === 200 ? 'OK - health works' : 'PROBLEM';
  if (r.path === '/api/auth/login') {
    verdict = r.status === 401 ? 'OK - route exists, rejects bad creds' : (r.status === 200 ? 'unexpected 200' : 'PROBLEM');
  }
  if (r.path === '/auth/login') {
    verdict = r.status === 404 ? 'EXPECTED 404 - no /auth mount (frontend must use /api)' : 'UNEXPECTED';
  }
  if (r.path === '/') verdict = r.status === 404 ? 'EXPECTED 404 - no root route by design' : 'note: root route exists';
  if (r.path === '/api/sites') verdict = r.status === 401 ? 'OK - protected (401 without token)' : `PROBLEM (${r.status})`;
  console.log(r.path.padEnd(28), String(r.status).padEnd(8), String(r.ms).padEnd(6), verdict);
}