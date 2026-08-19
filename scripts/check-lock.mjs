import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const locked = lock.packages?.['']?.dependencies ?? {};
const missing = Object.keys(declared).filter((name) => !locked[name]);
const stale = Object.keys(locked).filter((name) => !declared[name]);

if (missing.length || stale.length) {
  console.error('package.json / package-lock.json mismatch');
  if (missing.length) console.error('Missing from lock:', missing.join(', '));
  if (stale.length) console.error('Stale root entries:', stale.join(', '));
  console.error('Run: npm install --package-lock-only --ignore-scripts');
  process.exit(1);
}
console.log('Dependency manifest and lockfile root are synchronized.');
