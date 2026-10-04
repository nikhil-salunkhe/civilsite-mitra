/**
 * undefined-jsx-check.mjs
 *
 * Catches `<Foo />` where Foo is neither imported nor declared locally.
 *
 * Vite/Babel happily COMPILE this - an unresolved capitalised identifier is
 * only a ReferenceError when React renders that branch. That is exactly how a
 * new tab reached production and white-screened inside the ErrorBoundary
 * while `npm run build` stayed green.
 *
 * Cheap, dependency-free, and run as part of `npm run check`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');

/** Files worth checking: anything React renders. */
const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) out.push(full);
  }
  return out;
};

/** Names a module brings into scope. */
const collectImported = (rawSrc) => {
  const names = new Set();
  // Drop side-effect imports first. `import './x.css';` has no `from`, and a
  // non-greedy scan would otherwise let it swallow the NEXT import statement.
  const src = rawSrc.replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = m[1].replace(/;[\s\S]*$/, '');
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      named[1].split(',').forEach((n) => {
        const id = n.trim().split(/\s+as\s+/).pop().trim();
        if (id) names.add(id);
      });
    }
    // Default / namespace binding: whatever is left before the braces.
    const def = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim();
    if (def) names.add(def);
  }
  return names;
};

/** Locally declared bindings that can legitimately be used as components. */
const collectDeclared = (src) => {
  const names = new Set(['React']);
  const patterns = [
    /(?:^|\n)\s*(?:const|let|var|function|class)\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+(?:const|function|class)\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+default\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s*\{([^}]*)\}/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const grp = m[1];
      if (grp.includes(',')) {
        grp.split(',').forEach((n) => {
          const id = n.trim().split(/\s+as\s+/).pop().trim();
          if (id) names.add(id);
        });
      } else if (grp) {
        names.add(grp.trim());
      }
    }
  }
  return names;
};

/** Every <Component /> referenced in the file. */
const collectUsed = (src) => {
  const used = new Set();
  // Only the identifier that immediately follows "<" (or "</") is a component.
  // A capitalised token after a plain dot is NOT JSX - Intl.NumberFormat,
  // URL.createObjectURL and Sq.Ft all match that shape.
  for (const m of src.matchAll(/<\/?([A-Z][A-Za-z0-9_]*)/g)) used.add(m[1]);
  // Member components: <Icons.Home /> - must appear directly after the "<".
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_]*)\.([A-Z][A-Za-z0-9_]*)/g)) {
    used.add(`${m[1]}.${m[2]}`);
  }
  // <React.Fragment /> when React is in scope; members resolve with the parent.
  if (/\bReact\b/.test(src)) {
    for (const m of src.matchAll(/<(?:React\.)?([A-Z][A-Za-z0-9_]*)\./g)) used.add(m[1]);
  }
  return used;
};

/** Members reachable through an imported object (React.Fragment, Icons.Home). */
const collectMemberAccess = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_]*)\.([A-Z][A-Za-z0-9_]*)/g)) names.add(`${m[1]}.${m[2]}`);
  return names;
};

const files = walk(SRC);
const findings = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  if (src.includes('@ts-ignore') || src.includes('eslint-disable')) continue;

  const known = new Set([...collectImported(src), ...collectDeclared(src)]);
  // A member expression only resolves if its ROOT object is in scope:
  // <React.Fragment /> needs React, <AuthContext.Provider /> needs AuthContext.
  for (const ref of collectMemberAccess(src)) {
    const root = ref.split('.')[0];
    if (known.has(root)) known.add(ref);
  }
  const missing = [...collectUsed(src)].filter((c) => !known.has(c)).sort();

  if (missing.length) {
    findings.push({ file: relative(ROOT, file), missing });
  }
}

console.log('UNDEFINED_JSX_CHECK');
console.log(`scanned=${files.length} violations=${findings.length}`);

for (const f of findings) {
  console.log(`  ${f.file}`);
  console.log(`    missing -> ${f.missing.join(', ')}`);
}

if (findings.length) {
  console.log('\nFAIL: JSX references a component that is neither imported nor declared.');
  console.log('Vite compiles this - it only throws at render time.');
  process.exit(1);
}
console.log('OK: every JSX component reference resolves.');