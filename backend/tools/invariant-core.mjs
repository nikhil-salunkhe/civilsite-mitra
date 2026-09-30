/**
 * invariant-check.mjs - runtime business-logic probe (part 1 of 2).
 *
 * The existing suites prove endpoints RESPOND and fields EXIST. This one
 * asserts the VALUES are internally consistent - where silent money bugs hide:
 * NaN/null in numeric fields, negative balances, paid > total, received >
 * project value, margin outside -100..100, progress outside 0..100,
 * qty x rate != total, pending != amount - paid, bad pagination.
 */
const BASE = process.env.BASE || 'http://localhost:5000/api';

export const results = [];
export const ok = (n, d = '') => results.push({ pass: true, n, d });
export const bad = (n, d) => results.push({ pass: false, n, d });

let token = null;
export const setToken = (t) => { token = t; };

export async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

export const num = (v) => (typeof v === 'number' ? v : Number(v));
export const isBad = (v) =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

export function checkSummary(label, s) {
  if (!s || typeof s !== 'object') { bad(`${label}.summary`, 'missing'); return; }
  const fields = ['projectValue', 'totalReceived', 'pendingReceivable', 'materialCost',
    'workerCost', 'vendorCost', 'otherExpenses', 'totalInvestment', 'estimatedProfit', 'profitMargin'];
  for (const f of fields) {
    if (isBad(s[f])) bad(`${label}.${f}`, `null/NaN -> ${JSON.stringify(s[f])}`);
  }
  const pv = num(s.projectValue);
  const recv = num(s.totalReceived);
  const pend = num(s.pendingReceivable);

  if (recv < 0) bad(`${label}.totalReceived`, `negative ${recv}`);
  if (pend < 0) bad(`${label}.pendingReceivable`, `negative ${pend}`);
  if (pv > 0 && recv > pv + 1) bad(`${label}.totalReceived`, `received ${recv} > projectValue ${pv}`);
  if (pv > 0 && Number.isFinite(pend) && Math.abs(pend - (pv - recv)) > 2) {
    bad(`${label}.pendingReceivable`, `expected ${pv - recv}, got ${pend}`);
  }
  const pm = num(s.profitMargin);
  if (pv > 0 && (pm > 100 || pm < -100)) bad(`${label}.profitMargin`, `out of range ${pm}`);
  if (num(s.totalInvestment) < 0) bad(`${label}.totalInvestment`, `negative ${s.totalInvestment}`);
}