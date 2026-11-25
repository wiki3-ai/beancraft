#!/usr/bin/env node
// License gate for BeanCraft (AGPL-3.0-or-later).
//  1. Every package in package-lock.json must use an allow-listed license.
//     GPL-2.0-only (and anything unknown) fails: it cannot be combined with AGPLv3.
//  2. Every npm package that the production build bundles must be recorded in
//     THIRD_PARTY_NOTICES.md (the list is written by the Vite build).
import { existsSync, readFileSync } from 'node:fs';

const ALLOWED = new Set([
  '0BSD',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'ISC',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  'Unicode-3.0',
  'Unlicense',
  'Zlib',
]);

/** True if an SPDX expression is satisfiable with allowed licenses. */
export function allowed(expr) {
  if (!expr) return false;
  const e = expr.trim().replace(/^\((.*)\)$/, '$1');
  if (/ OR /i.test(e)) return e.split(/ OR /i).some(allowed);
  if (/ AND /i.test(e)) return e.split(/ AND /i).every(allowed);
  return ALLOWED.has(e);
}

const failures = [];
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (path === '') continue;
  if (!allowed(pkg.license)) failures.push(`${path}: license "${pkg.license ?? 'unknown'}" is not allowed`);
}

const BUNDLED = 'node_modules/.tmp/bundled-packages.json';
if (existsSync(BUNDLED)) {
  const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
  for (const name of JSON.parse(readFileSync(BUNDLED, 'utf8'))) {
    if (!notices.includes(`\`${name}\``)) failures.push(`${name} is bundled but not listed in THIRD_PARTY_NOTICES.md`);
  }
} else {
  console.warn(`${BUNDLED} not found; run "npm run build" first to check bundled packages.`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Licenses OK (${Object.keys(lock.packages).length - 1} packages).`);
