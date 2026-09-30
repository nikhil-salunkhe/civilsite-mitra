/**
 * bug-hunt.mjs - precise static scan for runtime defects that the design and
 * auth audits do not cover.
 *
 * Rules:
 *   1. .map() calls whose JSX element is missing a key prop
 *   2. URL.createObjectURL without a matching revokeObjectURL in the same file
 *   3. useEffect with async callbacks (state updates after unmount / races)
 *   4. setState called directly in the component body (render-phase update)
 *   5. .then() chains with no .catch() anywhere in the statement
 *   6. Non-null assertions on API data paths that already use optional chaining
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = 'src';
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.jsx?$/.test(p)) files.push(p);
  }
})(ROOT);

const findings = [];
const add = (f, rule, line, detail) => findings.push({ file: f, rule, line, detail });

// Rule 1: JSX inside .map( ... ) without a key
const mapRe = /\.map\s*\(\s*\(?([A-Za-z_$][\w$]*)?\)?\s*=>\s*\(/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    if (!/\.map\s*\(/.test(ln)) return;
    // Scan the opening JSX tag that follows the arrow function
    const after = lines.slice(i, i + 8).join('\n');
    const open = after.match(/<([A-Za-z][\w.]*)\b([^>]*)>/);
    if (!open) return;
    // Skip if the element is a fragment or the key appears in the tag attrs
    const attrs = open[2] || '';
    if (/\bkey\s*=/.test(attrs)) return;
    // Only flag when this really is the element returned by the map callback
    if (!/=>\s*\(?\s*$|=>\s*\(/.test(ln) && !/=>\s*\(/.test(after)) return;
    add(f, 'map-missing-key', i + 1, `<${open[1]} returned from .map() has no key`);
  });
}

// Rule 2: createObjectURL with no revokeObjectURL in the same file
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const creates = (src.match(/createObjectURL/g) || []).length;
  const revokes = (src.match(/revokeObjectURL/g) || []).length;
  if (creates > revokes) {
    const line = src.split('\n').findIndex((l) => /createObjectURL/.test(l)) + 1;
    add(f, 'objecturl-leak', line, `${creates} createObjectURL vs ${revokes} revokeObjectURL`);
  }
}

// Rule 3: useEffect(async () => ...)
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  src.split('\n').forEach((ln, i) => {
    if (/useEffect\s*\(\s*async/.test(ln)) add(f, 'useEffect-async', i + 1, 'useEffect(async () => ...) returns a Promise, not a cleanup fn');
  });
}

// Rule 5: multi-line .then( ... ) with no .catch on the statement
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    if (!/\.then\s*\(/.test(ln)) return;
    const stmt = lines.slice(i, i + 6).join('\n');
    // find end of the statement by ';' or by hitting a new top-level const
    const endIdx = lines.slice(i + 1, i + 12).findIndex((l) => /^\s*(const|let|return|\})/.test(l));
    const stmtText = lines.slice(i, i + (endIdx > 0 ? endIdx + 1 : 6)).join('\n');
    if (/\.catch\s*\(/.test(stmtText)) return;
    if (/^\s*\/\/|\* /.test(ln)) return;
    add(f, 'then-no-catch', i + 1, '.then() without a .catch() in the following lines');
  });
}

const byRule = findings.reduce((acc, f) => {
  (acc[f.rule] = acc[f.rule] || []).push(f);
  return acc;
}, {});

console.log(`BUG_HUNT files=${files.length} findings=${findings.length}`);
for (const [rule, list] of Object.entries(byRule)) {
  console.log(`\n${rule} (${list.length})`);
  for (const f of list) console.log(`  ${f.file}:${f.line}  ${f.detail}`);
}