// npm run test:leak
//
// Builds the app with two fake keys, then searches everything under
// .next/static (the files served to browsers) for each one.
//
//   - NEXT_PUBLIC_PAYMENTS_SECRET_KEY must be found: that is the vulnerability.
//   - PAYMENTS_SECRET_KEY must NOT be found: that is the fix.
//
// Exit code 0 means the demo behaves as documented. Exit code 1 means the
// server-only key leaked (or the vulnerable demo stopped reproducing).

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const LEAKED = 'sk_test_DEMO_LEAKED_0000';
const SERVER_ONLY = 'sk_test_DEMO_SERVER_ONLY_0000';

const build = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, NEXT_PUBLIC_PAYMENTS_SECRET_KEY: LEAKED, PAYMENTS_SECRET_KEY: SERVER_ONLY },
});
if (build.status !== 0) process.exit(build.status ?? 1);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else yield full;
  }
}

const hits = { [LEAKED]: [], [SERVER_ONLY]: [] };
const staticDir = path.join(appDir, '.next', 'static');
for (const file of files(staticDir)) {
  const text = readFileSync(file, 'utf8');
  for (const marker of Object.keys(hits)) {
    if (text.includes(marker)) hits[marker].push(path.relative(appDir, file));
  }
}

console.log(`\nNEXT_PUBLIC_PAYMENTS_SECRET_KEY found in ${hits[LEAKED].length} browser file(s):`);
for (const file of hits[LEAKED]) console.log(`  ${file}`);
console.log(`PAYMENTS_SECRET_KEY found in ${hits[SERVER_ONLY].length} browser file(s):`);
for (const file of hits[SERVER_ONLY]) console.log(`  ${file}`);

if (hits[SERVER_ONLY].length > 0) {
  console.error('\nFAIL: the server-only key reached the browser bundle.');
  process.exit(1);
}
if (hits[LEAKED].length === 0) {
  console.error('\nFAIL: the vulnerable demo no longer reproduces the NEXT_PUBLIC_ leak.');
  process.exit(1);
}
console.log('\nOK: the NEXT_PUBLIC_ key leaked (vulnerable) and the server-only key did not (fixed).');
