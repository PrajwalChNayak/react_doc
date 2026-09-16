#!/usr/bin/env node
// Example harness: extract every JSX/TSX code block from content/ and
// type-check it against the real `react` and `@types/react` packages.
//
//   node scripts/check-examples.mjs [--keep] [--filter <substring>]
//
// This is the check that catches invented APIs and stale syntax. Proofreading
// does not. It needs `typescript`, `react`, `react-dom`, `@types/react` and
// `@types/react-dom` installed — see the message it prints if they are missing.
//
// Blocks tagged `legacy` are skipped (they deliberately show removed APIs).
// Blocks tagged `nocheck="reason"` are skipped and counted separately.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { builtinModules } from 'node:module';

import { loadPages, isNextGroup } from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');

const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const FILTER = (() => {
  const i = argv.indexOf('--filter');
  return i !== -1 ? argv[i + 1] : null;
})();

// The work directory lives inside the repo on purpose: tsc then resolves
// `react` and `@types/react` through ordinary node_modules lookup, exactly the
// way a real project would. It is git-ignored and removed after a clean run.
const WORK = process.env.EXAMPLES_WORKDIR || path.join(ROOT, '.examples-work');

const CHECKABLE = new Set(['jsx', 'tsx']);

// Blocks are written several levels down so that a realistic parent-relative
// import (`../../app/hooks`) still resolves inside the work directory.
const BLOCK_DIR = 'src/app/features/panel';

/* --------------------------------------------------------------- toolchain */

function requirePackages() {
  const needed = ['typescript', 'react', 'react-dom', '@types/react', '@types/react-dom'];
  const missing = needed.filter((pkg) => !existsSync(path.join(NM, ...pkg.split('/'))));
  if (missing.length) {
    console.error('The example harness needs the real React packages installed.\n');
    console.error(`  Missing: ${missing.join(', ')}\n`);
    console.error('  Install them once, from the repository root:\n');
    console.error('    npm install\n');
    console.error('  (The site build itself has no dependencies — this check is the only');
    console.error('   thing that needs node_modules, because it compiles against the real');
    console.error('   React type definitions.)');
    process.exit(2);
  }
}

async function installedVersion(pkg) {
  try {
    const json = JSON.parse(await readFile(path.join(NM, ...pkg.split('/'), 'package.json'), 'utf8'));
    return json.version;
  } catch {
    return 'unknown';
  }
}

function runTsc(cwd, args) {
  return new Promise((resolve) => {
    const bin = path.join(NM, '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
    const child = spawn(bin, args, { cwd, shell: process.platform === 'win32' });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ code: -1, out: `${out}\n${e.message}` }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

/* ---------------------------------------------------------------- extract */

function pad(n, width) {
  return String(n).padStart(width, '0');
}

// Next.js pages also carry plain `.ts` files (`proxy.ts`, `next.config.ts`,
// `lib/dal.ts`, route handlers), and those are where most framework APIs live.
const NEXT_CHECKABLE = new Set(['jsx', 'tsx', 'ts', 'js']);

async function extract() {
  const { pages } = await loadPages();
  const blocks = [];
  const nextBlocks = [];
  // Every `file=` path on every Next.js page, including pages outside --filter:
  // the route skeleton for `next typegen` has to describe the whole docs app, or
  // a filtered run would reject `PageProps<'/…'>` routes declared elsewhere.
  const nextFiles = [];
  const skipped = { legacy: 0, nocheck: [], other: 0 };

  let n = 0;
  let nx = 0;
  for (const page of pages) {
    const framework = isNextGroup(page.group);
    if (framework) {
      for (const block of page.codeBlocks) {
        if (typeof block.flags.file === 'string') {
          nextFiles.push({ file: block.flags.file, code: block.code, legacy: Boolean(block.flags.legacy) });
        }
      }
    }
    if (FILTER && !page.rel.includes(FILTER)) continue;
    for (const block of page.codeBlocks) {
      if (framework) {
        if (!NEXT_CHECKABLE.has(block.lang)) { skipped.other += 1; continue; }
        if (block.flags.legacy) { skipped.legacy += 1; continue; }
        if (block.flags.nocheck) {
          skipped.nocheck.push({
            page: page.rel,
            line: block.line,
            reason: typeof block.flags.nocheck === 'string' ? block.flags.nocheck : '(no reason given)',
          });
          continue;
        }
        nx += 1;
        // Keep the real extension: a `.ts` file must not accept JSX, and a
        // `.js` file is checked as JavaScript.
        nextBlocks.push({
          name: `nx${pad(nx, 4)}.${block.lang}`,
          lang: block.lang,
          code: block.code,
          page: page.rel,
          line: block.line,
          live: false,
          file: typeof block.flags.file === 'string' ? block.flags.file : null,
          canary: Boolean(block.flags.canary),
          next: true,
        });
        continue;
      }
      if (!CHECKABLE.has(block.lang)) { skipped.other += 1; continue; }
      if (block.flags.legacy) { skipped.legacy += 1; continue; }
      if (block.flags.nocheck) {
        skipped.nocheck.push({
          page: page.rel,
          line: block.line,
          reason: typeof block.flags.nocheck === 'string' ? block.flags.nocheck : '(no reason given)',
        });
        continue;
      }
      n += 1;
      const name = `ex${pad(n, 4)}.${block.lang}`;
      blocks.push({
        name,
        lang: block.lang,
        code: block.code,
        page: page.rel,
        line: block.line,
        live: Boolean(block.flags.live),
      });
    }
  }
  return { blocks, nextBlocks, nextFiles, skipped, pageCount: pages.length };
}

/* ------------------------------------------------------------------ write */

// Packages that must resolve to their REAL type definitions. Anything invented
// in an import from one of these has to be caught, so they are never stubbed.
const REAL_MODULES = [
  'react', 'react-dom',
  'react/jsx-runtime', 'react/jsx-dev-runtime',
  'react-dom/client', 'react-dom/server', 'react-dom/static',
  'react-dom/server.browser', 'react-dom/server.node',
];

// The specifier may not contain whitespace and the clause may not cross a
// semicolon, so a string such as `get('from')` later in a block is never read
// as an import (it used to produce an unparseable stub declaration).
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^;]*?[\s}*]from\s*['"]([^'"\s]+)['"]|(?:^|[^\w.])import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[^\w.])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Collect every bare (non-relative) module specifier the examples import, minus
 * the React packages we want type-checked for real. Those get a per-module
 * ambient stub so an example may import @testing-library/react or react-router
 * without the harness failing on a package we deliberately do not install.
 *
 * A wildcard `declare module '*'` would be simpler, but ambient wildcards take
 * precedence over node_modules resolution in TypeScript, which silently turns
 * `react` itself into `any` and makes the whole harness worthless.
 */
const isReactReal = (spec) => REAL_MODULES.includes(spec) || /^react(-dom)?\//.test(spec);

function collectStubModules(blocks, isReal = isReactReal, aliasIsLocal = false) {
  const found = new Map();
  for (const block of blocks) {
    for (const m of block.code.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      if (!spec || spec.startsWith('.') || spec.startsWith('/')) continue;
      if (aliasIsLocal && spec.startsWith('@/')) continue;
      // React (and, for Next.js blocks, the framework packages) stay real.
      if (isReal(spec)) continue;
      if (!found.has(spec)) found.set(spec, new Set());
    }
    for (const imp of parseNamedImports(block.code)) {
      if (found.has(imp.spec)) imp.named.forEach((n) => found.get(imp.spec).add(n));
    }
  }
  return [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// A shorthand `declare module 'x';` makes every import `any`, and TypeScript
// refuses type arguments on an `any` call (TS2347) — so `useForm<Values>()`
// would fail purely because the package is stubbed. Declaring each imported
// name explicitly avoids that: a callable-and-indexable value plus a type alias
// of the same name, so the binding works in both value and type position.
function renderModuleStub(spec, names) {
  const body = [...names].filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  if (!body.length) return `declare module '${spec}';`;
  const lines = [`declare module '${spec}' {`];
  for (const name of body) {
    lines.push(
      `  export const ${name}: { <A = any, B = any, C = any>(...args: any[]): any; new (...args: any[]): any; [key: string]: any };`,
      `  export type ${name}<A = any, B = any, C = any> = any;`,
    );
  }
  lines.push('  const _default: any;', '  export default _default;', '}');
  return lines.join('\n');
}

// `import { a, b as c } from './x.js'` -> { spec: './x.js', named: ['a','b'],
// hasDefault: false, star: false }. Good enough for documentation examples,
// which never use exotic import forms.
const IMPORT_CLAUSE_RE = /import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g;

// Words that can follow a `.` in a comment but can never be an exported
// binding; declaring one produces a stub that does not parse.
const JS_KEYWORDS = new Set([
  'await', 'break', 'case', 'catch', 'continue', 'debugger', 'do', 'enum', 'extends',
  'implements', 'interface', 'package', 'private', 'protected', 'public', 'static',
  'super', 'switch', 'throw', 'try', 'void', 'with', 'yield', 'async', 'instanceof',
  'undefined',
]);

const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// Property names that are never module exports, so a stub must not declare
// them. Several are reserved words that would not parse as an export name.
const RESERVED_MEMBERS = new Set([
  'default', 'then', 'catch', 'finally', 'map', 'filter', 'length', 'current',
  'push', 'slice', 'join', 'toFixed', 'toLocaleString', 'preventDefault',
  'stopPropagation', 'target', 'currentTarget', 'value', 'delete', 'set', 'get',
  'has', 'add', 'clear', 'forEach', 'find', 'includes', 'split', 'trim',
  'toString', 'valueOf', 'constructor', 'prototype', 'call', 'apply', 'bind',
  'import', 'export', 'class', 'function', 'return', 'new', 'typeof', 'in',
  'of', 'for', 'while', 'if', 'else', 'var', 'let', 'const', 'this', 'null',
  'true', 'false', 'sort', 'reduce', 'some', 'every', 'concat', 'keys',
  'values', 'entries', 'focus', 'blur', 'style', 'classList', 'dataset',
]);

// Every `import ... from '<spec>'` clause with its bound names, relative or not.
function parseNamedImports(code) {
  const out = [];
  for (const m of code.matchAll(IMPORT_CLAUSE_RE)) {
    const named = [];
    const braces = /\{([\s\S]*?)\}/.exec(m[1]);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (name) named.push(name);
      }
    }
    out.push({ spec: m[2], named });
  }
  return out;
}

function parseRelativeImports(code, isLocal = (spec) => spec.startsWith('.')) {
  const out = [];

  // `lazy(() => import('./ChartPanel.jsx'))` — no named bindings, but the module
  // still has to exist, and lazy() requires a default export.
  //
  // A dynamically imported module is often reached through a binding whose name
  // cannot be tracked reliably (`const [Component, loader] = await
  // Promise.all([...])`, then `loader.loader`). Rather than guess, declare every
  // property name that appears anywhere in the block. The stub is `any`-typed,
  // so over-declaring costs nothing and there is no real module to contradict.
  const allMembers = [...code.matchAll(/\.\s*([A-Za-z_$][\w$]*)/g)]
    .map((x) => x[1])
    .filter((n) => !RESERVED_MEMBERS.has(n) && !JS_KEYWORDS.has(n));

  for (const m of code.matchAll(DYNAMIC_IMPORT_RE)) {
    if (isLocal(m[1])) {
      out.push({ spec: m[1], named: allMembers, hasDefault: true, star: false });
    }
  }

  for (const m of code.matchAll(IMPORT_CLAUSE_RE)) {
    const spec = m[2];
    if (!isLocal(spec)) continue;
    const clause = m[1].trim();
    const entry = { spec, named: [], hasDefault: false, star: false };

    const braces = /\{([\s\S]*?)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (name) entry.named.push(name);
      }
    }
    if (/\*\s+as\s+\w+/.test(clause)) entry.star = true;
    const head = clause.split('{')[0].split('*')[0].replace(/,$/, '').trim();
    if (head && !head.startsWith('type ')) entry.hasDefault = true;

    out.push(entry);
  }
  return out;
}

// Documentation examples import sibling modules (`./App.jsx`, `./db/users.js`)
// because that is what real code looks like. Those files do not exist in the
// harness, so synthesise a typed-`any` stub for each one rather than reporting
// a false failure. TypeScript never applies ambient wildcards to relative
// specifiers, so these have to be real files on disk.
// Block files live in WORK/src, so a stub path is resolved from there. That
// keeps `../lib/db` inside the work directory instead of escaping it.
function stubPathFor(spec) {
  // `@/lib/db` is the create-next-app alias for the project root.
  const resolved = spec.startsWith('@/')
    ? path.posix.normalize(spec.slice(2))
    : path.posix.normalize(path.posix.join(BLOCK_DIR, spec));
  const clean = resolved;
  if (/\.jsx$/.test(clean)) return clean.replace(/\.jsx$/, '.tsx');
  if (/\.tsx$/.test(clean)) return clean;
  if (/\.js$/.test(clean)) return clean.replace(/\.js$/, '.ts');
  if (/\.ts$/.test(clean)) return clean;
  // `allowArbitraryExtensions` lets `./x.module.css` resolve to
  // `x.module.d.css.ts`, which is how TypeScript types non-code assets.
  const asset = /^(.*)\.(css|scss|sass|less|svg|png|jpg|jpeg|gif|webp)$/.exec(clean);
  if (asset) return `${asset[1]}.d.${asset[2]}.ts`;
  if (/\.json$/.test(clean)) return null;
  return `${clean}.ts`;
}

async function writeRelativeStubs(blocks, workDir, isLocal) {
  const merged = new Map();

  for (const block of blocks) {
    for (const imp of parseRelativeImports(block.code, isLocal)) {
      const rel = stubPathFor(imp.spec);
      if (!rel || rel.startsWith('..')) continue;
      if (!merged.has(rel)) merged.set(rel, { named: new Set(), hasDefault: false });
      const target = merged.get(rel);
      imp.named.forEach((n) => target.named.add(n));
      if (imp.hasDefault) target.hasDefault = true;
    }
  }

  for (const [rel, info] of merged) {
    const full = path.join(workDir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    const lines = [
      '// Auto-generated stub for a relative import in a documentation example.',
      '/* eslint-disable */',
    ];
    if (/\.d\.[a-z]+\.ts$/.test(rel)) {
      // A CSS module resolves to a record of class names; an image to a URL.
      lines.push(
        'declare const asset: { readonly [key: string]: string } & string;',
        'export default asset;',
        'export {};',
      );
      await writeFile(full, `${lines.join('\n')}\n`, 'utf8');
      continue;
    }
    for (const name of info.named) {
      // A value and a type of the same name, so `import { type Session }` and
      // `import { getSession }` both resolve against the stub.
      lines.push(`export const ${name}: any = undefined as any;`, `export type ${name} = any;`);
    }
    if (info.hasDefault) {
      lines.push('declare const _default: any;', 'export default _default;');
    }
    lines.push('export {};');
    await writeFile(full, `${lines.join('\n')}\n`, 'utf8');
  }

  return merged.size;
}

const AMBIENT_HEAD = `// Third-party modules the docs reference but this repo does not install.
// Each resolves to \`any\`. React itself is NOT stubbed — it resolves to the real
// @types/react, so an invented React export is still a compile error.
`;

const AMBIENT_TAIL = `
// Test-runner globals, so testing examples do not need a runner installed.
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => unknown) => void;
declare const test: (name: string, fn: () => unknown) => void;
declare const expect: (value: unknown) => any;
declare const beforeEach: (fn: () => unknown) => void;
declare const afterEach: (fn: () => unknown) => void;
declare const vi: any;
declare const jest: any;
`;

function tsconfig({ strict, files, noImplicitAny = strict }) {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict,
        noImplicitAny,
        noEmit: true,
        skipLibCheck: true,
        allowJs: true,
        checkJs: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        forceConsistentCasingInFileNames: true,
        isolatedModules: false,
        allowArbitraryExtensions: true,
        // No `types` entry: pick up @types/react and @types/react-dom normally.
      },
      files,
    },
    null,
    2,
  );
}

/* ------------------------------------------------------------------ report */

// tsc emits `path/to/file.tsx(12,4): error TS2304: Cannot find name 'x'.`
const DIAG_RE = /^(.*?)[(:](\d+)[,:](\d+)\)?:?\s*-?\s*error\s+(TS\d+):\s*(.*)$/;

function parseDiagnostics(output) {
  const found = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = DIAG_RE.exec(raw.trim());
    if (!m) continue;
    found.push({
      file: path.basename(m[1].trim()),
      line: Number(m[2]),
      col: Number(m[3]),
      code: m[4],
      message: m[5].trim(),
    });
  }
  return found;
}

/* ----------------------------------------------------------------- Next.js */

// Next.js examples compile against the real framework. These specifiers
// resolve to installed type definitions and are never stubbed, so an invented
// export from `next/cache` or a wrong `zod` call is a compile error.
const NEXT_REAL = [
  /^next(\/|$)/, /^server-only$/, /^zod(\/|$)/, /^drizzle-orm(\/|$)/,
  /^@next\/playwright$/, /^@playwright\/test$/, /^react(-dom)?(\/|$)/, /^node:/,
];
const NODE_BUILTINS = new Set(builtinModules);
const isNextReal = (spec) =>
  NEXT_REAL.some((re) => re.test(spec)) || NODE_BUILTINS.has(spec.split('/')[0]);
const isNextLocal = (spec) => spec.startsWith('.') || spec.startsWith('@/');

const ROUTE_FILE_RE = /^(?:src\/)?app\/((?:[^/]+\/)*)(page|layout|default|route)\.(tsx|ts|jsx|js)$/;

/**
 * Build the smallest App Router tree that has every route the documentation
 * names in a `file=` path, so `next typegen` can emit the real `PageProps`,
 * `LayoutProps`, `RouteContext` and `next/root-params` declarations.
 *
 * Pages from different docs pages are independent examples, so two of them may
 * claim the same URL (`app/page.tsx` and `app/(shop)/page.tsx`). Next.js would
 * reject that tree, so the first claim wins; both resolve to the same route
 * type anyway.
 */
function routeSkeleton(nextFiles) {
  const byKey = new Map();
  for (const { file, legacy } of nextFiles) {
    if (legacy) continue;
    const m = ROUTE_FILE_RE.exec(file.replace(/\\/g, '/'));
    if (!m) continue;
    const [, dir, kind] = m;
    const urlSegments = dir.split('/').filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
    const leaf = kind === 'page' || kind === 'route';
    const key = `${leaf ? 'leaf' : kind}:${urlSegments.join('/')}`;
    if (!byKey.has(key)) byKey.set(key, { dir, kind, urlSegments });
  }

  // Root params are the dynamic segments above the root layout. Independent
  // examples disagree about where the root layout is: one documents
  // `app/layout.tsx` (so `LayoutProps<'/'>` must exist), another
  // `app/[lang]/layout.tsx` (so `next/root-params` must export `lang`). One tree
  // cannot have both, so the root-params types come from a second tree without
  // the top-level layouts.
  const entries = [...byKey.values()];
  const dynamicRootLayout = entries.some(
    (e) => e.kind === 'layout' && e.urlSegments.length && /^\[/.test(e.urlSegments[0]),
  );
  const rootLayout = (e) => e.kind === 'layout' && e.urlSegments.length === 0;
  return {
    entries,
    rootParamsEntries: dynamicRootLayout && entries.some(rootLayout) ? entries.filter((e) => !rootLayout(e)) : null,
  };
}

async function writeSkeleton(entries, dir, configSource) {
  for (const { dir: routeDir, kind } of entries) {
    const ext = kind === 'route' ? 'ts' : 'tsx';
    const full = path.join(dir, 'app', ...routeDir.split('/').filter(Boolean), `${kind}.${ext}`);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, SKELETON_SOURCE[kind], 'utf8');
  }
  if (!entries.some((e) => e.kind === 'page' || e.kind === 'route')) {
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await writeFile(path.join(dir, 'app', 'page.tsx'), SKELETON_SOURCE.page, 'utf8');
  }
  await writeFile(path.join(dir, 'next.config.mjs'), configSource, 'utf8');
}

const SKELETON_SOURCE = {
  page: 'export default function Page() {\n  return null;\n}\n',
  default: 'export default function Default() {\n  return null;\n}\n',
  layout:
    "import type { ReactNode } from 'react';\n" +
    'export default function Layout({ children }: { children: ReactNode }) {\n  return children;\n}\n',
  route: 'export function GET() {\n  return new Response(null);\n}\n',
};

// Custom `cacheLife` profiles become typed overloads of `cacheLife()`, so the
// skeleton config declares every profile a documented `next.config` defines —
// and only those, so an undeclared profile name still fails.
function customCacheLifeProfiles(nextFiles) {
  const names = new Set();
  for (const { file, code } of nextFiles) {
    if (!/^next\.config\.(ts|mjs|js)$/.test(file)) continue;
    const at = code.search(/\bcacheLife\s*:\s*\{/);
    if (at === -1) continue;
    let i = code.indexOf('{', at);
    const start = i;
    let depth = 0;
    for (; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}' && --depth === 0) break;
    }
    const body = code.slice(start + 1, i);
    for (const m of body.matchAll(/(?:^|[,{\s])(['"]?)([A-Za-z_$][\w$-]*)\1\s*:\s*\{/g)) names.add(m[2]);
  }
  return [...names];
}

function runNode(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ code: -1, out: `${out}\n${e.message}` }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

function nextTsconfig({ strict, noImplicitAny = strict, files }) {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['DOM', 'DOM.Iterable', 'ESNext'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict,
        noImplicitAny,
        noEmit: true,
        skipLibCheck: true,
        allowJs: true,
        checkJs: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        isolatedModules: false,
        allowArbitraryExtensions: true,
        forceConsistentCasingInFileNames: true,
        paths: { '@/*': ['./*'] },
      },
      files,
    },
    null,
    2,
  );
}

/**
 * Prepare the Next.js work directory: route skeleton, `next typegen`, stubs,
 * block files and tsconfigs. Returns the tsc runs to execute, or throws with
 * the typegen output if the generated types could not be produced.
 */
async function prepareNext(nextBlocks, nextFiles, workDir) {
  await mkdir(path.join(workDir, ...BLOCK_DIR.split('/')), { recursive: true });

  const { entries: skeleton, rootParamsEntries } = routeSkeleton(nextFiles);

  const profiles = customCacheLifeProfiles(nextFiles);
  const cacheLife = profiles.length
    ? `,\n  cacheLife: {\n${profiles.map((p) => `    ${JSON.stringify(p)}: { stale: 300, revalidate: 900, expire: 86400 },`).join('\n')}\n  }`
    : '';
  const configSource =
    `// Generated by scripts/check-examples.mjs for next typegen.\nexport default {\n  cacheComponents: true${cacheLife}\n};\n`;
  await writeSkeleton(skeleton, workDir, configSource);

  const nextBin = path.join(NM, 'next', 'dist', 'bin', 'next');
  const typegen = await runNode([nextBin, 'typegen'], workDir);
  const typesDir = path.join(workDir, '.next', 'types');

  if (typegen.code === 0 && rootParamsEntries) {
    const rootDir = path.join(workDir, '..', `${path.basename(workDir)}-rootparams`);
    await rm(rootDir, { recursive: true, force: true });
    await writeSkeleton(rootParamsEntries, rootDir, configSource);
    const second = await runNode([nextBin, 'typegen'], rootDir);
    const generatedRootParams = path.join(rootDir, '.next', 'types', 'root-params.d.ts');
    if (second.code !== 0 || !existsSync(generatedRootParams)) {
      throw new Error(`next typegen (root params pass) failed (exit ${second.code}):\n${second.out.trim()}`);
    }
    await writeFile(path.join(typesDir, 'root-params.d.ts'), await readFile(generatedRootParams, 'utf8'), 'utf8');
  }
  const generated = ['routes.d.ts', 'root-params.d.ts', 'cache-life.d.ts'].filter((f) =>
    existsSync(path.join(typesDir, f)),
  );
  if (typegen.code !== 0 || !generated.includes('routes.d.ts')) {
    throw new Error(`next typegen failed (exit ${typegen.code}):\n${typegen.out.trim()}`);
  }

  // next-env.d.ts imports the generated files by path; list them directly
  // instead and keep only the global Next.js references.
  await writeFile(
    path.join(workDir, 'next-env.harness.d.ts'),
    '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
    'utf8',
  );
  await writeFile(path.join(workDir, 'canary.d.ts'), '/// <reference types="react/canary" />\nexport {};\n', 'utf8');

  const stubs = collectStubModules(nextBlocks, isNextReal, true);
  await writeFile(
    path.join(workDir, 'ambient.d.ts'),
    AMBIENT_HEAD + stubs.map(([spec, names]) => renderModuleStub(spec, names)).join('\n') + '\n' + AMBIENT_TAIL,
    'utf8',
  );
  const localStubs = await writeRelativeStubs(nextBlocks, workDir, isNextLocal);

  for (const block of nextBlocks) {
    await writeFile(path.join(workDir, ...BLOCK_DIR.split('/'), block.name), `${block.code}\n`, 'utf8');
  }

  const base = [
    'next-env.harness.d.ts',
    ...generated.map((f) => `.next/types/${f}`),
    'ambient.d.ts',
  ];
  const STUBBED = new Set(stubs.map(([spec]) => spec));
  const importsAStub = (block) =>
    parseNamedImports(block.code).some((i) => isNextLocal(i.spec) || STUBBED.has(i.spec)) ||
    [...block.code.matchAll(DYNAMIC_IMPORT_RE)].some((m) => isNextLocal(m[1]) || STUBBED.has(m[1]));
  const rel = (b) => `${BLOCK_DIR}/${b.name}`;

  const plan = [
    { label: 'Next.js js/jsx', strict: false, pick: (b) => (b.lang === 'js' || b.lang === 'jsx') && !b.canary },
    { label: 'Next.js ts/tsx (strict)', strict: true, pick: (b) => /^tsx?$/.test(b.lang) && !b.canary && !importsAStub(b) },
    { label: 'Next.js ts/tsx (stubbed imports)', strict: true, noImplicitAny: false, pick: (b) => /^tsx?$/.test(b.lang) && !b.canary && importsAStub(b) },
    { label: 'Next.js React Canary', strict: true, noImplicitAny: false, canary: true, pick: (b) => b.canary },
  ];

  const runs = [];
  for (const [i, step] of plan.entries()) {
    const picked = nextBlocks.filter(step.pick);
    if (!picked.length) continue;
    const config = `tsconfig.next${i}.json`;
    await writeFile(
      path.join(workDir, config),
      nextTsconfig({
        strict: step.strict,
        noImplicitAny: step.noImplicitAny ?? step.strict,
        files: [...base, ...(step.canary ? ['canary.d.ts'] : []), ...picked.map(rel)],
      }),
      'utf8',
    );
    runs.push({ label: step.label, config, count: picked.length, cwd: workDir });
  }

  // Page, layout and route-handler blocks are also checked the way `next build`
  // checks real files: Next's generated validator asserts each module's exports
  // against the route it lives at. That is what rejects a synchronous
  // `{ params: { id: string } }` page signature, which compiles on its own.
  // The type definitions are copied from the validator `next typegen` wrote;
  // only the per-file assertions point at the documentation blocks instead.
  const validator = await buildRouteValidator(nextBlocks, workDir);
  if (validator) {
    await writeFile(
      path.join(workDir, config0(validator)),
      nextTsconfig({ strict: true, noImplicitAny: false, files: [...base, '.next/types/harness-validator.ts'] }),
      'utf8',
    );
    runs.push({
      label: 'Next.js route exports (page/layout/route)',
      config: config0(validator),
      count: validator.count,
      cwd: workDir,
      validator,
    });
  }

  return { runs, skeletonRoutes: skeleton.length, stubs: stubs.length, localStubs, profiles };
}

const config0 = () => 'tsconfig.nextroutes.json';

const VALIDATOR_KIND = { page: ['AppPageConfig', 'AppRoutes'], layout: ['LayoutConfig', 'LayoutRoutes'], route: ['RouteHandlerConfig', 'AppRouteHandlerRoutes'] };

function routeOf(dir) {
  const segments = dir.split('/').filter(Boolean).filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  return `/${segments.join('/')}`;
}

async function buildRouteValidator(nextBlocks, workDir) {
  const typesDir = path.join(workDir, '.next', 'types');
  let generated;
  let routes;
  try {
    generated = await readFile(path.join(typesDir, 'validator.ts'), 'utf8');
    routes = await readFile(path.join(typesDir, 'routes.d.ts'), 'utf8');
  } catch {
    return null;
  }
  const header = generated.split(/\n\/\/ Validate /)[0];
  const unions = {};
  for (const [, kindUnion] of Object.values(VALIDATOR_KIND)) {
    const m = new RegExp(`type ${kindUnion} = ([^\\n]*)`).exec(routes);
    unions[kindUnion] = new Set(m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : []);
  }

  const lines = header.split('\n');
  const ranges = [];
  for (const block of nextBlocks) {
    if (!block.file || !/^tsx?$/.test(block.lang)) continue;
    const m = ROUTE_FILE_RE.exec(block.file);
    if (!m || !VALIDATOR_KIND[m[2]]) continue;
    const [configType, unionName] = VALIDATOR_KIND[m[2]];
    const route = routeOf(m[1]);
    if (!unions[unionName].has(route) || !header.includes(`type ${configType}<`)) continue;
    const start = lines.length + 1;
    lines.push(
      `// Validate ${block.file} (${block.page}:${block.line})`,
      '{',
      `  type __IsExpected<Specific extends ${configType}<${JSON.stringify(route)}>> = Specific`,
      `  const handler = {} as typeof import("../../${BLOCK_DIR}/${block.name.replace(/\.tsx?$/, '.js')}")`,
      '  type __Check = __IsExpected<typeof handler>',
      '  // @ts-ignore',
      '  type __Unused = __Check',
      '}',
      '',
    );
    ranges.push({ start, end: lines.length, name: block.name, route, kind: m[2] });
  }
  if (!ranges.length) return null;
  await writeFile(path.join(typesDir, 'harness-validator.ts'), lines.join('\n'), 'utf8');
  return {
    count: ranges.length,
    locate: (line) => ranges.find((r) => line >= r.start && line <= r.end),
  };
}

/* -------------------------------------------------------------------- main */

async function main() {
  requirePackages();

  const [tsVersion, reactVersion, typesVersion, nextVersion] = await Promise.all([
    installedVersion('typescript'),
    installedVersion('react'),
    installedVersion('@types/react'),
    installedVersion('next'),
  ]);

  const { blocks: reactBlocks, nextBlocks, nextFiles, skipped, pageCount } = await extract();
  const blocks = [...reactBlocks, ...nextBlocks];

  console.log('React and Next.js example type-check harness');
  console.log(`  typescript ${tsVersion} · react ${reactVersion} · @types/react ${typesVersion} · next ${nextVersion}`);
  console.log(`  ${pageCount} pages scanned`);
  console.log(
    `  ${reactBlocks.length} React jsx/tsx and ${nextBlocks.length} Next.js ts/tsx/js/jsx blocks to check ` +
    `(${skipped.legacy} legacy skipped, ${skipped.nocheck.length} nocheck skipped)`,
  );

  if (!blocks.length) {
    console.log('\nNothing to check.');
    return;
  }

  await rm(WORK, { recursive: true, force: true });
  await mkdir(path.join(WORK, ...BLOCK_DIR.split('/')), { recursive: true });

  const nextRuns = [];
  if (nextBlocks.length) {
    if (nextVersion === 'unknown') {
      console.error('\nNext.js blocks need `next` installed. Run `npm install` from the repository root.');
      process.exitCode = 2;
      return;
    }
    process.stdout.write('  Generating Next.js route types (next typegen)… ');
    try {
      const prepared = await prepareNext(nextBlocks, nextFiles, path.join(WORK, 'nextjs'));
      nextRuns.push(...prepared.runs);
      console.log(
        `${prepared.skeletonRoutes} route file(s)` +
        (prepared.profiles.length ? `, cacheLife profiles: ${prepared.profiles.join(', ')}` : ''),
      );
      console.log(
        `  ${prepared.stubs} third-party module(s) and ${prepared.localStubs} local import(s) stubbed for Next.js; ` +
        'next, zod, drizzle-orm, server-only and Playwright resolve for real',
      );
    } catch (e) {
      console.log('failed');
      console.error(`\n${e.message}`);
      console.error('\nFAILED — the harness could not generate Next.js route types.');
      process.exitCode = 1;
      return;
    }
  }

  const stubs = collectStubModules(reactBlocks);
  const ambient =
    AMBIENT_HEAD +
    stubs.map(([spec, names]) => renderModuleStub(spec, names)).join('\n') +
    '\n' +
    AMBIENT_TAIL;
  await writeFile(path.join(WORK, 'ambient.d.ts'), ambient, 'utf8');

  const relStubs = await writeRelativeStubs(reactBlocks, WORK);
  console.log(
    `  ${stubs.length} third-party module(s) and ${relStubs} relative import(s) stubbed; ` +
    'react/react-dom resolve for real',
  );

  const jsxBlocks = reactBlocks.filter((b) => b.lang === 'jsx');
  const tsxBlocks = reactBlocks.filter((b) => b.lang === 'tsx');
  const byName = new Map(blocks.map((b) => [b.name, b]));

  for (const block of reactBlocks) {
    await writeFile(
      path.join(WORK, ...BLOCK_DIR.split('/'), block.name),
      `${block.code}\n`,
      'utf8',
    );
  }

  const runs = [];
  // JSX examples are plain JavaScript: check them for real errors (unknown
  // imports, wrong arity, invented APIs) without demanding type annotations.
  if (jsxBlocks.length) {
    await writeFile(
      path.join(WORK, 'tsconfig.jsx.json'),
      tsconfig({ strict: false, files: ['ambient.d.ts', ...jsxBlocks.map((b) => `${BLOCK_DIR}/${b.name}`)] }),
      'utf8',
    );
    runs.push({ label: 'jsx', config: 'tsconfig.jsx.json', count: jsxBlocks.length });
  }
  // TSX examples are the typed ones, and are held to strict mode.
  const STUBBED = new Set(stubs.map(([spec]) => spec));
  const importsAStub = (block) =>
    parseNamedImports(block.code).some(
      (i) => i.spec.startsWith('.') || STUBBED.has(i.spec),
    );

  const tsxStrict = tsxBlocks.filter((b) => !importsAStub(b));
  const tsxLoose = tsxBlocks.filter(importsAStub);

  if (tsxStrict.length) {
    await writeFile(
      path.join(WORK, 'tsconfig.tsx.json'),
      tsconfig({ strict: true, files: ['ambient.d.ts', ...tsxStrict.map((b) => `${BLOCK_DIR}/${b.name}`)] }),
      'utf8',
    );
    runs.push({ label: 'tsx (strict)', config: 'tsconfig.tsx.json', count: tsxStrict.length });
  }
  // Same strictness, minus noImplicitAny: a callback passed to a stubbed
  // third-party function has nothing to infer its parameter types from.
  if (tsxLoose.length) {
    await writeFile(
      path.join(WORK, 'tsconfig.tsxloose.json'),
      tsconfig({
        strict: true,
        noImplicitAny: false,
        files: ['ambient.d.ts', ...tsxLoose.map((b) => `${BLOCK_DIR}/${b.name}`)],
      }),
      'utf8',
    );
    runs.push({ label: 'tsx (stubbed imports)', config: 'tsconfig.tsxloose.json', count: tsxLoose.length });
  }

  runs.push(...nextRuns);

  const diagnostics = [];
  for (const run of runs) {
    process.stdout.write(`\n  Compiling ${run.count} ${run.label} block(s)… `);
    const { code, out } = await runTsc(run.cwd || WORK, ['-p', run.config, '--pretty', 'false']);
    let parsed = parseDiagnostics(out);
    if (run.validator) {
      // The block files themselves were already compiled in their own run; keep
      // only the validator's verdicts and attribute each to its block.
      parsed = parsed
        .filter((d) => d.file === 'harness-validator.ts')
        .map((d) => {
          const hit = run.validator.locate(d.line);
          return hit && {
            ...d,
            file: hit.name,
            line: 1,
            col: 1,
            message: `${hit.kind} exports do not match what Next.js expects for route "${hit.route}": ${d.message}`,
          };
        })
        .filter(Boolean);
    }
    diagnostics.push(...parsed);
    if (code === -1) {
      console.log('failed to start');
      console.error(out);
      process.exitCode = 1;
      return;
    }
    console.log(parsed.length ? `${parsed.length} error(s)` : 'clean');

    // A non-zero exit with nothing parseable means tsc failed for a reason the
    // diagnostic regex does not cover (a bad config, a missing input file).
    // Never let that read as a pass.
    if (!parseDiagnostics(out).length && code !== 0) {
      console.error('\ntsc exited non-zero but produced no parseable diagnostics:\n');
      console.error(out.trim() || '(no output)');
      console.error('\nFAILED — the harness could not verify the examples.');
      process.exitCode = 1;
      return;
    }
  }

  // Group diagnostics back onto the docs page and line they came from.
  //
  // One class is separated out rather than failing the run. In a plain `.jsx`
  // file, `memo(function Card({ title }) {...})` gives TypeScript nothing to
  // infer the props from, so it settles on `{}` and then rejects every prop at
  // the call site. The JavaScript is correct and runs correctly; TypeScript
  // simply cannot type an unannotated destructured parameter flowing through
  // `memo`'s generic. Requiring JSDoc annotations on every memoized example
  // would make the documentation worse to read for no reader benefit.
  //
  // The two patterns below are narrow on purpose. An invented or misspelled
  // React export surfaces as TS2305/TS2307/TS2551 and still fails the run.
  const isJsInferenceLimit = (block, d) =>
    block.lang === 'jsx' &&
    ((d.code === 'TS2339' && /does not exist on type '\{\}'\.$/.test(d.message)) ||
      (d.code === 'TS2322' && /IntrinsicAttributes & object/.test(d.message)));

  const failures = new Map();
  const softened = new Map();
  // A diagnostic outside every block file (a broken stub, generated types, the
  // ambient declarations) means the harness did not verify the run. It must
  // never read as a pass.
  const unattributed = [];
  for (const d of diagnostics) {
    const block = byName.get(d.file);
    if (!block) { unattributed.push(d); continue; }
    const bucket = isJsInferenceLimit(block, d) ? softened : failures;
    if (!bucket.has(block.name)) bucket.set(block.name, { block, diags: [] });
    bucket.get(block.name).diags.push(d);
  }
  // A block is only "soft" if every one of its diagnostics is.
  for (const name of failures.keys()) softened.delete(name);

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`Blocks checked  : ${blocks.length}`);
  console.log(`Blocks clean    : ${blocks.length - failures.size - softened.size}`);
  console.log(`Blocks failing  : ${failures.size}`);
  console.log(`JS-inference    : ${softened.size}  (correct JS, memo() props uninferable — not a failure)`);
  console.log(`Diagnostics     : ${diagnostics.length}`);
  console.log(`Skipped legacy  : ${skipped.legacy}`);
  console.log(`Skipped nocheck : ${skipped.nocheck.length}`);
  console.log('─────────────────────────────────────────────────────────────');

  if (softened.size) {
    console.log(
      `\nJS inference limitation in ${softened.size} block(s) — memoized components ` +
      'whose props TypeScript cannot infer from untyped JavaScript:',
    );
    const pages = new Map();
    for (const { block } of softened.values()) {
      pages.set(block.page, (pages.get(block.page) || 0) + 1);
    }
    for (const [page, count] of [...pages].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(3)}  content/${page}`);
    }
  }

  if (skipped.nocheck.length) {
    console.log('\nnocheck blocks (each one is unverified by this harness):');
    const byPage = new Map();
    for (const s of skipped.nocheck) {
      byPage.set(s.page, (byPage.get(s.page) || 0) + 1);
    }
    for (const [page, count] of [...byPage].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count.toString().padStart(3)}  content/${page}`);
    }
  }

  if (unattributed.length) {
    console.log(`\nDiagnostics outside any documentation block (${unattributed.length}):\n`);
    for (const d of unattributed.slice(0, 20)) {
      console.log(`  ${d.file}(${d.line},${d.col}): ${d.code} ${d.message}`);
    }
    console.log('\nFAILED — the harness produced errors it could not attribute to an example.');
    if (KEEP) console.log(`Extracted sources kept in: ${WORK}`);
    process.exitCode = 1;
    return;
  }

  if (failures.size) {
    console.log(`\nFailing examples (${failures.size}):\n`);
    const sorted = [...failures.values()].sort(
      (a, b) => a.block.page.localeCompare(b.block.page) || a.block.line - b.block.line,
    );
    for (const { block, diags } of sorted) {
      console.log(`  content/${block.page}:${block.line}  [${block.lang}${block.live ? ' live' : ''}]`);
      for (const d of diags.slice(0, 6)) {
        console.log(`      line ${d.line}: ${d.code} ${d.message}`);
      }
      if (diags.length > 6) console.log(`      … and ${diags.length - 6} more`);
      console.log('');
    }
    console.log(`FAILED — ${failures.size} of ${blocks.length} examples do not compile.`);
    if (KEEP) console.log(`Extracted sources kept in: ${WORK}`);
    process.exitCode = 1;
    return;
  }

  if (!KEEP) await rm(WORK, { recursive: true, force: true });
  else console.log(`\nExtracted sources kept in: ${WORK}`);

  console.log(
    `\nPASSED — all ${blocks.length} examples compile ` +
    `(${reactBlocks.length} against React ${reactVersion}, ${nextBlocks.length} against Next.js ${nextVersion}).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
