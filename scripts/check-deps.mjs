#!/usr/bin/env node
// Dependency check for the Next.js documentation and example apps.
//
//   node scripts/check-deps.mjs [--offline]
//
// Every package the Next.js pages or the example apps name has to exist on npm,
// every pinned version has to exist and not be deprecated or a prerelease, and
// any package that declares a peer range on `next` or `react` has to accept the
// versions this site documents. It also enforces the security floor: nothing
// may install or pin a `next` below the August 2026 patched release.
//
// Needs network access to registry.npmjs.org. With --offline it only runs the
// local checks (the security floor) and says so.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPages, isNextGroup, NEXT } from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'examples', 'nextjs');
const OFFLINE = process.argv.includes('--offline');

const TARGET = { next: NEXT.version, react: '19.2.8' };

/* ------------------------------------------------------------------ semver */

// Enough of semver for npm peer ranges: exact, ^, ~, >=, >, <=, <, x/*
// wildcards, space-separated AND, and || alternatives. Prerelease ranges such
// as `19.0.0-rc-…` only ever match themselves, which is the npm behavior.
function parse(v) {
  const m = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
  if (!m) return null;
  const n = (s) => (s === undefined || s === 'x' || s === '*' ? null : Number(s));
  return { major: Number(m[1]), minor: n(m[2]), patch: n(m[3]), pre: m[4] || null };
}

function cmp(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (a.pre && !b.pre) return -1;
  if (!a.pre && b.pre) return 1;
  return 0;
}

function satisfiesOne(version, clause) {
  const v = parse(version);
  const c = clause.trim();
  if (!c || c === '*' || c === 'x' || c === 'latest') return true;
  const op = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(c);
  const r = parse(op[2]);
  if (!v || !r) return false;
  if (r.pre) return version === op[2];
  switch (op[1]) {
    case '>=': return cmp(v, r) >= 0;
    case '>': return cmp(v, r) > 0;
    case '<=': return cmp(v, r) <= 0;
    case '<': return cmp(v, r) < 0;
    case '^': {
      if (cmp(v, r) < 0) return false;
      if (r.major > 0) return v.major === r.major;
      if ((r.minor ?? 0) > 0) return v.major === 0 && v.minor === r.minor;
      return v.major === 0 && v.minor === (r.minor ?? 0) && v.patch === (r.patch ?? 0);
    }
    case '~': return cmp(v, r) >= 0 && v.major === r.major && (r.minor === null || v.minor === r.minor);
    default:
      return v.major === r.major && (r.minor === null || v.minor === r.minor) && (r.patch === null || v.patch === r.patch) && !v.pre;
  }
}

export function satisfies(version, range) {
  return range.split('||').some((alt) => {
    const parts = alt.trim().replace(/(>=|<=|>|<|\^|~|=)\s+/g, '$1').split(/\s+/).filter(Boolean);
    return parts.every((p) => satisfiesOne(version, p));
  });
}

/* ----------------------------------------------------------------- collect */

const NODE_BUILTINS = new Set(builtinModules);

function packageName(spec) {
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('node:')) return null;
  if (spec.startsWith('#') || spec.startsWith('virtual:')) return null;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (NODE_BUILTINS.has(name)) return null;
  return /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/.test(name) ? name : null;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
// Separators are spaces and tabs only: a bare `npm install` line must not
// swallow the next line's words as package names.
const INSTALL_RE = /\b(?:npm[ \t]+(?:install|i|add)|pnpm[ \t]+(?:add|install|i)|yarn[ \t]+add|bun[ \t]+(?:add|install|i))[ \t]+([^\n&|;]+)/g;
// Flags whose next token is a value, not a package.
const VALUE_FLAGS = new Set(['--workspace', '-w', '--prefix', '--registry', '--tag', '--filter']);

// Scopes reserved for obvious placeholders in examples ("substitute your own
// library"). They are unregistered on npm on purpose, so copying the example
// cannot install someone else's package.
const PLACEHOLDER_SCOPES = ['@your-org/'];

// Packages that exist only in this repository's examples workspace.
const LOCAL_SCOPES = ['@nextjs-examples/'];

// Page bodies by `content/<rel>`, so a prerelease pin can be accepted only where
// the page itself labels it as one.
const pageText = new Map();

async function collect() {
  const uses = new Map(); // name -> { pins: Set, where: Set }
  const note = (name, pin, where) => {
    if (!name) return;
    if (!uses.has(name)) uses.set(name, { pins: new Set(), where: new Set() });
    const u = uses.get(name);
    if (pin) u.pins.add(pin);
    u.where.add(where);
  };

  const { pages } = await loadPages();
  for (const page of pages.filter((p) => isNextGroup(p.group))) {
    const where = `content/${page.rel}`;
    pageText.set(where, page.body);
    for (const block of page.codeBlocks) {
      if (block.flags.legacy) continue;
      for (const m of block.code.matchAll(IMPORT_RE)) note(packageName(m[1] || m[2] || m[3]), null, where);
      if (block.lang === 'bash') {
        for (const m of block.code.matchAll(INSTALL_RE)) {
          const tokens = m[1].trim().split(/[ \t]+/);
          for (let t = 0; t < tokens.length; t += 1) {
            const token = tokens[t];
            if (VALUE_FLAGS.has(token)) { t += 1; continue; }
            if (token.startsWith('-')) continue;
            const at = token.lastIndexOf('@');
            const name = at > 0 ? token.slice(0, at) : token;
            const pin = at > 0 ? token.slice(at + 1) : null;
            note(packageName(name), pin, `${where} (install command)`);
          }
        }
      }
      if (block.lang === 'json' && /package\.json$/.test(block.flags.file || '')) {
        try {
          const json = JSON.parse(block.code);
          for (const field of ['dependencies', 'devDependencies']) {
            for (const [name, pin] of Object.entries(json[field] || {})) note(name, pin, `${where} (package.json)`);
          }
        } catch { /* partial snippet; imports above still count */ }
      }
    }
  }

  const apps = [];
  if (existsSync(EXAMPLES)) {
    for (const entry of await readdir(EXAMPLES, { withFileTypes: true })) {
      const file = path.join(EXAMPLES, entry.name, 'package.json');
      if (!entry.isDirectory() || !existsSync(file)) continue;
      const json = JSON.parse(await readFile(file, 'utf8'));
      apps.push({ name: entry.name, json });
      for (const field of ['dependencies', 'devDependencies']) {
        for (const [name, pin] of Object.entries(json[field] || {})) {
          note(name, pin, `examples/nextjs/${entry.name}/package.json`);
        }
      }
    }
  }
  return { uses, apps };
}

/* ------------------------------------------------------------------- check */

async function fetchPackument(name) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`registry ${res.status} for ${name}`);
  return res.json();
}

function resolvePin(packument, pin) {
  const versions = Object.keys(packument.versions || {});
  if (!pin || pin === 'latest') return packument['dist-tags']?.latest;
  if (packument.versions[pin]) return pin;
  if (packument['dist-tags']?.[pin]) return packument['dist-tags'][pin];
  const stable = versions.filter((v) => !v.includes('-') && satisfies(v, pin));
  return stable.sort((a, b) => cmp(parse(b), parse(a)))[0] || null;
}

async function main() {
  const errors = [];
  const warnings = [];
  const rows = [];
  const { uses, apps } = await collect();

  // --- security floor (local) ----------------------------------------------
  const floor = parse(NEXT.minimumSafe);
  for (const [name, info] of uses) {
    if (name !== 'next') continue;
    for (const pin of info.pins) {
      const base = pin.replace(/^[\^~>=\s]+/, '');
      const v = parse(base);
      if (v && v.minor !== null && v.patch !== null && cmp(v, floor) < 0) {
        errors.push(`next@${pin} is below the security floor ${NEXT.minimumSafe} (${[...info.where].join(', ')})`);
      }
    }
  }
  for (const app of apps) {
    const pin = app.json.dependencies?.next;
    if (!pin) errors.push(`examples/nextjs/${app.name} does not depend on next`);
    else if (pin !== NEXT.version) warnings.push(`examples/nextjs/${app.name} pins next ${pin}; the docs target ${NEXT.version}`);
  }

  if (OFFLINE) {
    console.log(`Collected ${uses.size} packages from Next.js pages and ${apps.length} example apps.`);
    console.log('NOT RUN — registry checks skipped (--offline). Only the security floor was checked.');
  } else {
    const names = [...uses.keys()].sort();
    const results = await Promise.all(names.map(async (name) => {
      try {
        return [name, await fetchPackument(name)];
      } catch (e) {
        return [name, e];
      }
    }));

    for (const [name, packument] of results) {
      const info = uses.get(name);
      const where = [...info.where];
      if (packument instanceof Error) {
        errors.push(`${name}: could not query the registry (${packument.message})`);
        continue;
      }
      if (!packument) {
        if (LOCAL_SCOPES.some((s) => name.startsWith(s))) {
          warnings.push(`${name}: local workspace package, not on npm (expected)`);
        } else if (PLACEHOLDER_SCOPES.some((s) => name.startsWith(s))) {
          warnings.push(`${name}: placeholder name, intentionally unregistered on npm`);
        } else {
          errors.push(`${name}: does not exist on npm (named in ${where.join(', ')})`);
        }
        continue;
      }
      if (PLACEHOLDER_SCOPES.some((s) => name.startsWith(s))) {
        errors.push(`${name}: a placeholder scope now resolves to a real npm package. Pick another placeholder.`);
        continue;
      }
      const latest = packument['dist-tags']?.latest;
      const pins = info.pins.size ? [...info.pins] : [null];
      for (const pin of pins) {
        const resolved = resolvePin(packument, pin);
        if (!resolved) {
          errors.push(`${name}@${pin}: no published version matches (named in ${where.join(', ')})`);
          continue;
        }
        const meta = packument.versions[resolved];
        if (meta?.deprecated) errors.push(`${name}@${resolved} is deprecated on npm: ${meta.deprecated}`);
        if (pin && resolved.includes('-')) {
          // Allowed only when there is no stable line for what the page teaches
          // and every page that pins it says so in words (e.g. Auth.js v5).
          const labelled = where.every((w) => {
            const text = pageText.get(w.replace(/ \(.*\)$/, ''));
            return text && /\b(beta|release candidate|prerelease|canary)\b/i.test(text);
          });
          if (labelled) {
            warnings.push(`${name}@${resolved} is a prerelease; accepted because every page naming it labels it (${where.join(', ')})`);
          } else {
            errors.push(`${name}@${resolved} is a prerelease; document the latest stable (named in ${where.join(', ')})`);
          }
        }
        // Compatibility with the framework versions this site documents.
        for (const [peer, target] of Object.entries(TARGET)) {
          const range = meta?.peerDependencies?.[peer];
          if (range && !satisfies(target, range)) {
            errors.push(`${name}@${resolved} peer ${peer} "${range}" does not accept ${peer}@${target}`);
          }
        }
        rows.push({ name, pin: pin || '(unpinned)', resolved, latest, where: where.length });
        if (pin && latest && !latest.includes('-') && cmp(parse(resolved), parse(latest)) < 0) {
          warnings.push(`${name}: pinned ${resolved}, latest stable is ${latest}`);
        }
        if (!pin && latest?.includes('-')) {
          warnings.push(`${name}: npm latest is a prerelease (${latest}); unpinned mentions resolve to it`);
        }
      }
    }

    console.log(`Checked ${uses.size} packages named by Next.js pages and ${apps.length} example apps against registry.npmjs.org.\n`);
    const w = Math.max(...rows.map((r) => r.name.length), 8);
    console.log(`  ${'package'.padEnd(w)}  ${'pin'.padEnd(14)}  ${'resolves'.padEnd(12)}  latest`);
    for (const r of rows) {
      console.log(`  ${r.name.padEnd(w)}  ${String(r.pin).padEnd(14)}  ${String(r.resolved).padEnd(12)}  ${r.latest}`);
    }
  }

  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const m of warnings) console.log(`  ${m}`);
  }
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const m of errors) console.log(`  ${m}`);
    console.log(`\nFAILED — ${errors.length} error${errors.length === 1 ? '' : 's'}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nPASSED — 0 errors, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. Security floor: next >= ${NEXT.minimumSafe}.`);
}

if (process.argv[1]?.endsWith('check-deps.mjs')) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
