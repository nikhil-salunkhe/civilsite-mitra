/**
 * ---------------------------------------------------------------------------
 * Design audit (run with: npm run check:design)
 * ---------------------------------------------------------------------------
 * Guards the shared design system so the app cannot drift back into the state
 * it had before: duplicated CSS definitions, ad-hoc colours, emoji as icons and
 * unlabelled icon buttons.
 *
 * Rules
 *   1. index.css must define every component class exactly once.
 *   2. Pages must use the semantic colour tokens (primary/secondary/success/
 *      warning/danger) instead of raw Tailwind palette colours.
 *   3. Icons come from components/Icon.jsx, never emoji characters.
 *   4. Icon-only buttons must be accessible (aria-label or title).
 *   5. <button> must declare type= (defaults to "submit" inside forms).
 *
 * Exit code 0 = clean, 1 = violations found (prints file:line for each).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(jsx|js|css)$/.test(entry)) files.push(full);
  }
})(SRC);

const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
const problems = [];
const add = (file, line, rule, message) => problems.push({ file, line, rule, message });

const eachLine = (file, fn) => {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((text, index) => fn(text, index + 1, lines));
};

/* --- Rule 1: no duplicated definitions in the stylesheet ------------------ */
const CSS = join(SRC, 'index.css');
if (existsSync(CSS)) {
  const seen = new Map();
  eachLine(CSS, (text, line) => {
    const match = text.match(/^\s*\.([a-z][a-z0-9-]*)\s*(?:,|$|\{)/);
    if (!match) return;
    // An explicit base+extension pair (e.g. .select extending .input) opts out
    // with a `design-audit-allow` comment on the redefining rule.
    if (text.includes('design-audit-allow')) return;
    const name = match[1];
    if (seen.has(name)) {
      add('src/index.css', line, 'css/unique', `.${name} is redefined here; first defined on line ${seen.get(name)}`);
    } else {
      seen.set(name, line);
    }
  });
}

/* --- Rules 2-5: JSX conventions ------------------------------------------ */
// Chromatic (non-neutral) raw palette colours are banned: status and brand
// colour must come from the semantic tokens so every screen means the same
// thing. Neutrals are fine because tailwind.config.js publishes ONE neutral
// scale under the names secondary / gray / slate, so they cannot drift.
const RAW_COLOR = /\b(?:bg|text|border|ring|from|to|via|divide|placeholder|shadow|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
const SEMANTIC_FOR = {
  red: 'danger', rose: 'danger',
  green: 'success', emerald: 'success', lime: 'success', teal: 'success',
  amber: 'warning', yellow: 'warning', orange: 'warning',
  blue: 'primary', sky: 'primary', indigo: 'primary', cyan: 'primary',
  violet: 'primary', purple: 'primary', fuchsia: 'primary', pink: 'primary',
};
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
// Only files that render UI need these checks.
const ALLOW_RAW = new Set(['components/Icon.jsx', 'index.css']);

for (const file of files) {
  const key = rel(file);
  if (!key.endsWith('.jsx')) continue;

  eachLine(file, (text, line) => {
    if (text.includes('design-audit-allow')) return; // inline opt-out

    if (!ALLOW_RAW.has(key)) {
      for (const m of text.matchAll(RAW_COLOR)) {
        const family = m[0].replace(/-[^-]+$/, '').split('-').pop();
        add(key, line, 'color/semantic', `${m[0]} -> use ${m[0].replace(`-${family}-`, `-${SEMANTIC_FOR[family] || 'secondary'}-`)} or add "design-audit-allow" to the line`);
      }
    }

    // Rule 3 is about emoji RENDERED AS ICONS. Comment prose (doc headers use
    // arrows / bullets to describe the layout) is not UI output and is skipped.
    const isComment = /^\s*(?:\/\/|\/\*|\*|#)/.test(text);
    if (!isComment) {
      for (const m of text.matchAll(EMOJI)) {
        add(key, line, 'icon/no-emoji', `emoji "${m[0]}" used as an icon -> use <Icon name="..." />`);
      }
    }

    if (/<button(?![^>]*\btype=)/.test(text) && !/<button[^>]*$/.test(text)) {
      add(key, line, 'button/type', '<button> without type= defaults to "submit"');
    }

    const iconOnly = text.match(/<button\b[^>]*className="[^"]*\bbtn-icon\b[^"]*"[^>]*>/);
    if (iconOnly && !/aria-label=|title=|\{`/.test(iconOnly[0])) {
      add(key, line, 'button/label', 'icon button needs aria-label');
    }
  });
}

/* --- Report --------------------------------------------------------------- */
const byRule = new Map();
for (const p of problems) {
  if (!byRule.has(p.rule)) byRule.set(p.rule, []);
  byRule.get(p.rule).push(p);
}

for (const [rule, list] of [...byRule.entries()].sort()) {
  console.log(`\n${rule} (${list.length})`);
  for (const p of list.slice(0, 12)) console.log(`  ${p.file}:${p.line}  ${p.message}`);
  if (list.length > 12) console.log(`  ...and ${list.length - 12} more`);
}

console.log(`\nDESIGN_AUDIT files=${files.length} violations=${problems.length}`);
process.exit(problems.length > 0 ? 1 : 0);
