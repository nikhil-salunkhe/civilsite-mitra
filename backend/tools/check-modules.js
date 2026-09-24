/* eslint-disable no-console */
/**
 * Module integrity checker.
 * Loads every backend source file individually so that syntax errors and
 * undefined identifiers (a common symptom of truncated files) surface clearly.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'src');
const files = [];

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
};

walk(root);

let failed = 0;
for (const file of files.sort()) {
  const rel = path.relative(path.resolve(__dirname, '..'), file);
  try {
    require(file);
    console.log(`OK    ${rel}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${rel}`);
    console.log(`      ${error.message.split('\n')[0]}`);
  }
}

console.log(`\n${files.length - failed}/${files.length} modules loaded successfully.`);
process.exit(failed > 0 ? 1 : 0);
