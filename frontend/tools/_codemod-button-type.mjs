/**
 * One-shot codemod: add type="button" to every <button> that does not already
 * declare a type attribute. Submit buttons in this codebase always say
 * type="submit" explicitly, so untouched tags are action buttons that were
 * silently defaulting to type="submit" (a real bug inside <form> trees).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const f = join(d, e.name);
    return e.isDirectory() ? walk(f) : /\.jsx$/.test(e.name) ? [f] : [];
  });

let inserted = 0;
for (const f of walk('src')) {
  const original = readFileSync(f, 'utf8');
  const updated = original.replace(/<button(?![A-Za-z/])(?![^>]*\btype=)/g, () => {
    inserted += 1;
    return '<button type="button" ';
  });
  if (updated !== original) writeFileSync(f, updated, 'utf8');
}

// Sanity: no tag may end up with two type attributes.
let doubles = 0;
for (const f of walk('src')) {
  const tags = readFileSync(f, 'utf8').match(/<button[\s\S]*?>/g) || [];
  for (const t of tags) {
    if ((t.match(/\btype=/g) || []).length > 1) {
      console.log('DOUBLE-TYPE: ' + f + ' :: ' + t.slice(0, 70).replace(/\s+/g, ' '));
      doubles += 1;
    }
  }
}
console.log(`BUTTON_TYPE inserted=${inserted} doubles=${doubles}`);
