#!/usr/bin/env node
// Build and test the runnable Next.js example apps.
//
//   node scripts/check-apps.mjs [--skip-install] [--only <app>] [--tests] [--e2e]
//
// Installs the examples/nextjs workspace once, then for each app, one at a
// time: `typecheck`, `build`, and — when asked — `test` (API-level tests that
// need no browser) and `test:e2e` (Playwright with a browser). Apps are built
// sequentially on purpose: parallel `next build` runs fight over CPU and give
// misleading timings.
//
// Nothing is reported as passing unless the command ran and exited 0. Steps an
// app does not define are listed as "n/a", and steps that were not requested
// are listed as "not run".

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'examples', 'nextjs');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const ONLY = (() => {
  const i = argv.indexOf('--only');
  return i !== -1 ? argv[i + 1] : null;
})();

function run(cmd, args, cwd, env = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', CI: '1', ...env },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ code: -1, out: `${out}\n${e.message}`, ms: Date.now() - started }));
    child.on('close', (code) => resolve({ code, out, ms: Date.now() - started }));
  });
}

const tail = (text, n = 40) => text.trim().split(/\r?\n/).slice(-n).map((l) => `      ${l}`).join('\n');
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  if (!existsSync(path.join(EXAMPLES, 'package.json'))) {
    console.error('No examples/nextjs workspace found.');
    process.exitCode = 1;
    return;
  }

  const apps = [];
  for (const entry of (await readdir(EXAMPLES, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const pkg = path.join(EXAMPLES, entry.name, 'package.json');
    if (!entry.isDirectory() || entry.name === 'node_modules' || !existsSync(pkg)) continue;
    if (ONLY && entry.name !== ONLY) continue;
    apps.push({ dir: entry.name, pkg: JSON.parse(await readFile(pkg, 'utf8')) });
  }

  if (!flag('--skip-install')) {
    process.stdout.write('Installing the examples/nextjs workspace… ');
    const install = await run('npm', ['install', '--no-audit', '--no-fund'], EXAMPLES);
    console.log(install.code === 0 ? `done (${secs(install.ms)})` : 'FAILED');
    if (install.code !== 0) {
      console.log(tail(install.out, 60));
      process.exitCode = 1;
      return;
    }
  }

  const steps = [
    ['typecheck', true],
    ['build', true],
    ['test', flag('--tests')],
    ['test:e2e', flag('--e2e')],
  ];

  const results = [];
  let failed = 0;
  for (const app of apps) {
    const row = { app: app.dir };
    console.log(`\n▸ ${app.dir}`);
    for (const [script, requested] of steps) {
      if (!app.pkg.scripts?.[script]) { row[script] = 'n/a'; continue; }
      if (!requested) { row[script] = 'not run'; continue; }
      process.stdout.write(`    ${script.padEnd(10)} `);
      const res = await run('npm', ['run', script], path.join(EXAMPLES, app.dir));
      if (res.code === 0) {
        row[script] = `pass ${secs(res.ms)}`;
        console.log(`pass (${secs(res.ms)})`);
      } else {
        failed += 1;
        row[script] = `FAIL ${secs(res.ms)}`;
        console.log(`FAIL (exit ${res.code}, ${secs(res.ms)})`);
        console.log(tail(res.out));
        // A failed build makes the tests meaningless.
        if (script === 'build') break;
      }
    }
    results.push(row);
  }

  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  console.log(`${'app'.padEnd(22)}${'typecheck'.padEnd(14)}${'build'.padEnd(14)}${'test'.padEnd(14)}test:e2e`);
  for (const r of results) {
    console.log(
      `${r.app.padEnd(22)}${String(r.typecheck ?? '—').padEnd(14)}${String(r.build ?? '—').padEnd(14)}` +
      `${String(r.test ?? '—').padEnd(14)}${r['test:e2e'] ?? '—'}`,
    );
  }
  console.log('─────────────────────────────────────────────────────────────────────────────');

  if (failed) {
    console.log(`\nFAILED — ${failed} step${failed === 1 ? '' : 's'} failed across ${apps.length} app(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nPASSED — ${apps.length} app(s); every step that ran exited 0.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
