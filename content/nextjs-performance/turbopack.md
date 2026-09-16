---
title: Turbopack
description: The default bundler for next dev and next build, how to configure it, and when you still need webpack.
group: nextjs-performance
order: 20
status: current
since: "16.0"
related: [nextjs-performance/dev-memory-and-caching, nextjs-performance/bundle-analysis, ecosystem/build-tooling, performance/code-splitting]
---

## Overview

Turbopack is the incremental bundler, written in Rust, that Next.js uses by
default for both `next dev` and `next build` since **16.0**. You do not add a
flag to use it. You add `--webpack` to opt out.

```bash
next dev              # Turbopack
next build            # Turbopack
next build --webpack  # opt out, build with webpack
```

Configuration lives under the **top-level** `turbopack` key in `next.config.ts`.
The old `experimental.turbopack` location was removed in 16.0.

## Why it exists

Next.js builds several outputs from one codebase: server bundles, client
bundles, and the React Server Components boundary between them. webpack handled
that with separate compilations stitched together. Turbopack uses one module
graph for every environment, so a change to a shared module is processed once.

Its other design choices target large apps:

- **Incremental computation.** Work is cached down to the function level and
  never repeated for unchanged inputs. Results persist to disk between runs (see
  [Dev memory and caching](./dev-memory-and-caching.md)).
- **Lazy bundling in development.** The dev server compiles only the routes you
  request, which keeps start-up time and memory proportional to what you touch.
- **Bundling in development.** Unlike tools that serve native ESM to the browser,
  Turbopack still bundles in dev, which avoids thousands of module requests on
  large pages.

## When to use it

Use it for every new project, and for existing projects whose `next.config` has
no `webpack()` function and no webpack plugins. Most apps need no Turbopack
configuration at all: TypeScript, JSX, CSS Modules, PostCSS, Sass, Tailwind CSS,
`tsconfig.json` path aliases and static image imports work out of the box.

## When not to use it

Keep webpack (`--webpack`) when you depend on something Turbopack does not
support:

- **webpack plugins**, including a `webpack()` function in `next.config`.
  Turbopack runs many webpack *loaders* but no webpack *plugins*.
- **`sassOptions.functions`** (custom Sass functions written in JavaScript).
- **Yarn Plug'n'Play**, which is not planned for Turbopack.
- **`@next/bundle-analyzer`**, which is a webpack plugin. With Turbopack use
  `next experimental-analyze` instead (see [Bundle analysis](./bundle-analysis.md)).
- **Platforms without native bindings**, such as FreeBSD. Next.js falls back to
  WebAssembly bindings there, and those do not include Turbopack.

> [!WARNING]
> If `next.config` defines a `webpack` function and you run `next build`, the
> build **fails** rather than silently ignoring it. The config may come from a
> plugin wrapper rather than your own code. Migrate it to `turbopack` options,
> or build with `--webpack`.

## Basic example

The common reason to configure Turbopack is a file type that needs a loader,
such as importing SVG files as React components with `@svgr/webpack`.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
};

export default nextConfig;
```

The glob key matches file names. `loaders` runs in order, and `as` tells
Turbopack to treat the loader's output as JavaScript. Only loaders that return
JavaScript are supported.

## How it works

### The `turbopack` options

| Option | What it does |
|---|---|
| `rules` | Apply webpack loaders, or set a module `type`, for files that match a glob |
| `resolveAlias` | Map one import specifier to another, optionally only for the browser |
| `resolveExtensions` | Replace the list of extensions tried when resolving imports |
| `root` | Set the project root when auto-detection from the lockfile is wrong |
| `debugIds` | Emit debug IDs in bundles and source maps |

A rule can also take a `condition` to restrict where a loader runs. The built-in
conditions are `browser`, `foreign` (code in `node_modules`), `development`,
`production`, `node` and `edge-light`. Restricting a loader with
`{ not: 'foreign' }` skips `node_modules`, which is often the biggest compile-time
saving available.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.svg': {
        condition: { not: 'foreign' },
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
    resolveAlias: {
      // Client code that imports a server-only dependency gets an empty module.
      // Prefer fixing the import; this is a last resort.
      fs: { browser: './lib/empty-module.ts' },
    },
  },
};

export default nextConfig;
```

`resolveAlias` supports only the `browser` condition. It replaces webpack's
`resolve.fallback` trick, and it has the same weakness: it hides an import that
should not be in the client graph at all.

### Babel is detected automatically

Since 16.0, if Turbopack finds a Babel configuration file (such as
`babel.config.js` or `.babelrc`), it runs Babel on your code automatically. Two
details differ from webpack:

- **SWC still runs.** Next.js's own transforms and downleveling always use SWC.
  Under webpack, a Babel config disables SWC entirely.
- **`node_modules` is excluded** from Babel unless you configure `babel-loader`
  yourself in `turbopack.rules`.

A Babel config therefore still costs compile time on every file you own. Delete
it if its only job was something SWC already does, such as JSX or TypeScript.

### `import.meta.glob`

Turbopack in 16.3 supports `import.meta.glob`, the Vite-compatible API for
importing every module that matches a pattern. It is not available under webpack.

```tsx file="app/changelog/page.tsx"
type ChangelogEntry = { version: string; date: string; summary: string };

// Eager: each value is the module's `entry` export, resolved at build time.
const entries = import.meta.glob('./entries/*.ts', {
  eager: true,
  import: 'entry',
}) as Record<string, ChangelogEntry>;

export default function ChangelogPage() {
  const sorted = Object.values(entries).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ul>
      {sorted.map((entry) => (
        <li key={entry.version}>
          {entry.version} ({entry.date}): {entry.summary}
        </li>
      ))}
    </ul>
  );
}
```

The keys are file paths relative to the calling file. Without `eager: true`, each
value is a function that returns a Promise for the module, so matching modules
load lazily. The built-in type returns `unknown` values, so assert or validate
the shape you expect. The options are `eager`, `import`, `query`, `base` and
`caseSensitive`. `import.meta.globEager()` and the Vite `as` option are not
supported.

The Next.js team's reason for adding it: Server Components that read local files
with a glob import get hot module reloading, because the files are part of the
module graph rather than read from disk at render time.

## Common patterns

### Use Turbopack in dev, webpack for production builds

When a webpack plugin blocks production builds, you can still get Turbopack's dev
speed while you migrate:

```json file="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build --webpack",
    "start": "next start"
  }
}
```

Treat this as a transition state. Bundling differences between dev and build
mean a bug can appear in one and not the other.

### Trace a slow compile

If a route compiles slowly in dev, record a trace:

```bash
next dev --internal-trace
npx next internal trace .next-profiles/trace-turbopack.bin
```

The second command starts a trace server you can open at `trace.nextjs.org`.
Look for a loader or dependency that dominates the aggregated time.

### Know the webpack differences before migrating

- **CSS Module ordering** follows JavaScript import order. An app that relied on
  webpack's arbitrary order can render differently.
- **CSS precision:** Lightning CSS keeps 5 decimal digits where webpack kept 10.
- **Files outside the project root** (for example `npm link`ed packages) are not
  resolved unless you widen `turbopack.root`.
- **The Sass `~` prefix** for `node_modules` imports is not supported.

## Common mistakes

- **Adding `--turbopack` to scripts.** It is the default since 16.0. The flag
  still parses, but it only adds noise.
- **Writing `experimental.turbopack`.** That location was removed in 16.0. Use
  the top-level `turbopack` key.
- **Porting a `webpack()` function line by line.** Turbopack has no plugin API.
  Map each piece to a rule, an alias or an existing Next.js feature instead.
- **Aliasing `fs` to an empty module to silence an error.** The error means
  server code reached the client graph. Fix the import boundary first. See
  [Client Components](../nextjs-rendering/client-components.md).
- **Keeping a Babel config for JSX or TypeScript.** SWC already handles both,
  and the Babel pass slows every compile.
- **Using `import.meta.glob` in code that must also build with webpack.** It
  fails under `--webpack`.

## Related topics

- [Dev memory and caching](./dev-memory-and-caching.md) — the filesystem cache
  and memory eviction that make Turbopack fast across restarts.
- [Bundle analysis](./bundle-analysis.md) — the Turbopack-based analyzer for
  finding client-bundle bloat.
- [React Compiler in Next.js](./react-compiler.md) — the Babel-based compiler and
  the experimental Rust port that runs inside Turbopack.
- [Build tooling](../ecosystem/build-tooling.md) — how bundlers fit into a React
  app outside Next.js.
- [Code splitting](../performance/code-splitting.md) — the React side of what
  the bundler splits into chunks.
