/**
 * ---------------------------------------------------------------------------
 * Design codemod  (node tools/design-codemod.mjs [--apply])
 * ---------------------------------------------------------------------------
 * Mechanical half of the design-system standardisation. Two safe, deterministic
 * rewrites are applied across every .jsx file in src/:
 *
 *   1. Raw Tailwind palette colours -> the semantic tokens declared in
 *      tailwind.config.js (secondary / success / warning / danger / primary),
 *      so a single palette change restyles the whole app.
 *   2. <button> -> <button type="button"> whenever the tag declares no type.
 *      Inside a <form> an untyped button submits, which caused real bugs
 *      (filter chips re-running a search form, etc).
 *
 * Anything that needs judgement (emoji as icons, missing aria-labels) is only
 * REPORTED - those are fixed by hand.
 *
 * Dry run by default; pass --apply to write.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.jsx$/.test(entry)) files.push(full);
  }
})(SRC);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

/* --- 1. colour mapping ---------------------------------------------------- */
// Neutral scale is standardised on slate (already aliased as `secondary`).
const NEUTRALS = ['gray', 'slate', 'zinc', 'neutral', 'stone'];
const MAP = new Map();
for (const c of NEUTRALS) MAP.set(c, 'secondary');
for (const c of ['red', 'rose']) MAP.set(c, 'danger');
for (const c of ['orange', 'amber', 'yellow']) MAP.set(c, 'warning');
for (const c of ['green', 'emerald', 'teal']) MAP.set(c, 'success');
for (const c of ['blue', 'indigo', 'sky', 'cyan']) MAP.set(c, 'primary');

// Scales that stop at 900 in tailwind.config.js - clamp 950 to 900 so no
// rewrite can ever emit a class that does not exist.
const NO_950 = new Set(['success', 'warning', 'danger']);

const PREFIX = '(?:bg|text|border|ring|from|to|via|divide|placeholder|shadow|fill|stroke|decoration|outline|accent|caret)';
const RAW_COLOR = new RegExp(`\\b(${PREFIX})-(${[...MAP.keys()].join('|')})-(\\d{2,3})\\b`, 'g');
// Icon.jsx owns the palette mapping table, index.css is the system itself.
const SKIP = new Set(['components/Icon.jsx']);

/* --- 2. button type ------------------------------------------------------- */
/** Index of the '>' that closes the opening tag, or -1. Skips {} expressions. */
const findTagEnd = (text, from) => {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return i;
  }
  return -1;
};

const report = { colors: 0, buttons: 0, emoji: [], labels: [] };
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

for (const file of files) {
  const key = rel(file);
  let text = readFileSync(file, 'utf8');
  const before = text;

  if (!SKIP.has(key)) {
    text = text.replace(RAW_COLOR, (_m, prefix, color, shade) => {
      const token = MAP.get(color);
      const level = NO_950.has(token) && shade === '950' ? '900' : shade;
      report.colors += 1;
      return `${prefix}-${token}-${level}`;
    });
  }

  // Insert type="button" into every opening <button> tag that lacks a type.
  let cursor = 0;
  let patched = '';
  while (true) {
    const start = text.indexOf('<button', cursor);
    if (start === -1) {
      patched += text.slice(cursor);
      break;
    }
    const afterName = start + '<button'.length;
    const next = text[afterName];
    // Guard against identifiers such as <buttonLabel
    if (next && /[A-Za-z0-9_]/.test(next)) {
      patched += text.slice(cursor, afterName);
      cursor = afterName;
      continue;
    }
    const end = findTagEnd(text, afterName);
    if (end === -1) {
      patched += text.slice(cursor);
      break;
    }
    const tag = text.slice(afterName, end);
    const hasType = /[\s{]type\s*=/.test(tag);
    patched += text.slice(cursor, afterName) + (hasType ? '' : ' type="button"') + tag;
    if (!hasType) report.buttons += 1;
    cursor = end;
  }
  text = patched;

  if (text !== before && APPLY) writeFileSync(file, text, 'utf8');

  // Report-only findings (need a human decision).
  const raw = readFileSync(file, 'utf8').split(/\r?\n/);
  raw.forEach((line, index) => {
    const marks = line.match(EMOJI);
    if (marks) report.emoji.push(`${key}:${index + 1}  ${marks.join('')}  |  ${line.trim().slice(0, 96)}`);
    const iconOnly = line.match(/<button\b[^>]*className="[^"]*\bbtn-icon\b[^"]*"[^>]*>/);
    if (iconOnly && !/aria-label=|title=/.test(iconOnly[0])) report.labels.push(`${key}:${index + 1}`);
  });
}

console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}  files=${files.length}`);
console.log(`  colour tokens rewritten : ${report.colors}`);
console.log(`  buttons given type=     : ${report.buttons}`);
console.log(`  emoji icons to map      : ${report.emoji.length}`);
for (const line of report.emoji) console.log(`    ${line}`);
console.log(`  icon buttons w/o label  : ${report.labels.length}`);
for (const line of report.labels) console.log(`    ${line}`);
