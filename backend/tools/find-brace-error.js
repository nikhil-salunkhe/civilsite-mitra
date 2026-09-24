/* eslint-disable no-console */
/**
 * Reports where the { } nesting of a file first goes wrong.
 * Truncated writes leave an unbalanced brace, which surfaces as
 * "Unexpected token '}'" at the very end of the file.
 */
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/find-brace-error.js <file>');
  process.exit(2);
}

const source = fs.readFileSync(file, 'utf8');
const lines = source.split(/\r?\n/);

let depth = 0;
let minDepth = 0;
let inBlockComment = false;
let inTemplate = false;

lines.forEach((raw, index) => {
  const lineNo = index + 1;
  let i = 0;
  let inString = null;

  while (i < raw.length) {
    const ch = raw[i];
    const pair = raw.slice(i, i + 2);

    if (inBlockComment) {
      if (pair === '*/') { inBlockComment = false; i += 2; continue; }
      i += 1;
      continue;
    }

    if (inString) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inString) inString = null;
      i += 1;
      continue;
    }

    if (pair === '//') break;
    if (pair === '/*') { inBlockComment = true; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; i += 1; continue; }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth < minDepth) minDepth = depth;
    }
    i += 1;
  }

  const marker = depth < 0 ? '  <-- depth went negative here' : '';
  if (depth <= 0 || marker) {
    console.log(`${String(lineNo).padStart(4)} depth=${String(depth).padStart(3)} | ${raw.slice(0, 90)}${marker}`);
  }
});

console.log(`\nFinal depth: ${depth} (0 = balanced, positive = missing ${depth} closing brace(s))`);
console.log(`Minimum depth reached: ${minDepth}`);
