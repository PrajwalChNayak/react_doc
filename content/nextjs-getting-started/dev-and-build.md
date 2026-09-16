---
title: Dev and build
description: What next dev, next build, next start and next typegen do in Next.js 16.3, with Turbopack, separate output directories and the filesystem cache.
group: nextjs-getting-started
order: 40
status: current
since: "16.0"
related: [nextjs-performance/turbopack, nextjs-deployment/build-output, nextjs-getting-started/typescript, ecosystem/build-tooling]
---

## Overview

Four `next` commands cover the whole local lifecycle:

| Command | What it does | Output |
|---|---|---|
| `next dev` | Development server with Fast Refresh, the error overlay and on-demand compilation. | `.next/dev` |
| `next build` | Production build: compiles, type-checks, prerenders, prints a route table. | `.next` |
| `next start` | Serves the output of `next build`. | reads `.next` |
| `next typegen` | Generates route types and `next-env.d.ts` without building. | `.next/types` or `.next/dev/types` |

All of them use **Turbopack by default** since Next.js 16.0.

## Why it exists

Development and production want opposite things. Development wants to start
instantly and recompile one file; production wants every route compiled,
optimized and, where possible, rendered ahead of time. Next.js keeps these as
separate commands with separate output directories, so you never ship a dev
build and never wait for a production build to see an edit.

## When to use it

- `next dev` while writing code.
- `next build` before every deploy, and in CI, because it is the only command
  that proves every route prerenders and type-checks.
- `next start` to run the production build locally or on a Node.js server.
- `next typegen` in CI or editors when you want route types without a build.

## When not to use it

- Do not benchmark or load-test `next dev`. It compiles routes on demand and adds
  development checks. Measure `next build && next start`.
- Do not use `next start` for static exports. An `output: 'export'` build is a
  folder of files for a static host.
- Do not run `next build` only to type-check. `next typegen && tsc --noEmit` is
  faster.

## Basic example

```json file="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "next typegen && tsc --noEmit"
  }
}
```

```bash
npm run dev
# http://localhost:3000

npm run build
npm run start
```

With `npm run`, pass flags to `next` after `--`. pnpm, yarn and bun forward
them directly:

```bash
npm run dev -- --port 4000
```

## How it works

### `next dev`

- Compiles each route the first time it is requested, not all at once.
- Serves on port 3000 by default. Change it with `-p` / `--port` or the `PORT`
  environment variable. `PORT` cannot be set in a `.env` file, because the HTTP
  server starts before `.env` files load.
- Writes its output to **`.next/dev`**, not `.next`. That is why `next dev` and
  `next build` can run at the same time without corrupting each other (16.0).
- Writes its PID, port and URL to **`.next/dev/lock`**. A second `next dev` in the
  same project does not start a duplicate server. It prints the running server's
  URL and the PID to stop instead.
- `--experimental-https` starts the server with a locally trusted self-signed
  certificate, for testing OAuth callbacks or secure cookies on `localhost`.

### `next build`

`next build` loads `.env` files and `next.config`, discovers routes, compiles
with Turbopack, runs type checking in parallel, prerenders every route it can,
and writes `.next`. It ends with a route table:

```text
Route (app)
┌ ○ /_not-found
└ ƒ /products/[id]

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Read the symbols before you deploy. `○` is prerendered at build time, `●` is
prerendered from `generateStaticParams`, `ƒ` is rendered on every request, and
with Cache Components enabled `◐` is a prerendered shell with dynamic parts
streamed in. A page you expected to be static showing `ƒ` is a
performance bug you can catch here. See
[Static and dynamic rendering](../nextjs-rendering/static-and-dynamic-rendering.md)
and [Build output](../nextjs-deployment/build-output.md).

Two things `next build` no longer does:

- **Lint.** `next lint` was removed in 16.0. Run ESLint or Biome as its own
  script.
- **Print JavaScript bundle sizes** in the route table (removed in 16.0). Use
  the bundle analyzer. See [Bundle analysis](../nextjs-performance/bundle-analysis.md).

A type error fails the build. Next.js 16.3 type-checks by running your
project's own `tsc`, which is what lets you use TypeScript 7. See
[TypeScript](./typescript.md).

### `next start`

`next start` serves the last `next build` from `.next`. It does not compile
anything, so run it only after a successful build. Behind a load balancer, set
`--keepAliveTimeout` (in milliseconds) above the load balancer's own idle
timeout, or Node.js closes connections the load balancer still thinks are open.

```bash
npx next start --port 8080 --keepAliveTimeout 70000
```

### `next typegen`

Route types (`PageProps`, `LayoutProps`, `RouteContext`, typed links) are
generated from your `app/` tree. `next dev` and `next build` generate them as a
side effect. `next typegen` generates them alone, which is what a CI type-check
needs:

```bash
npx next typegen && npx tsc --noEmit
```

It loads your `next.config` in the production build phase, so any environment
variables the config reads must be set.

### Turbopack is the default, webpack is the opt-out

Since 16.0, `next dev` and `next build` use Turbopack with no flag. You do not
need `--turbopack` in your scripts. To use webpack instead, pass `--webpack`:

```json file="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build --webpack",
    "start": "next start"
  }
}
```

If `next.config` contains a custom `webpack` function (often added by a plugin
you did not write), `next build` **fails** rather than silently ignoring it.
Either migrate that configuration to Turbopack options, or build with
`--webpack`. Turbopack configuration lives under the top-level `turbopack` key.
See [Turbopack](../nextjs-performance/turbopack.md).

### The filesystem cache

Turbopack persists its work under `.next` between runs, so a restarted dev
server or a second build starts warm:

| Cache | Location | On by default since |
|---|---|---|
| Development | `.next/dev/cache/turbopack` | 16.1 |
| Production build | `.next/cache/turbopack` | 16.3 |

The build cache only helps if `.next/cache` survives between builds. Containers
and CI runners start clean unless you cache that directory explicitly. If your
environment never restores it, turn the build cache off so the build does not
spend time writing it:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // The option names still live under `experimental`, but both caches
    // are enabled by default in 16.3. This opts the build cache out.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
```

> [!WARNING]
> **Experimental.** `experimental.turbopackMemoryEviction` (added in 16.3,
> default `'auto'`) controls whether `next dev` drops cached data from memory
> after writing it to disk. It only affects `next dev` with the filesystem cache
> on. Leave the default unless you are diagnosing dev-server memory use. See
> [Dev memory and caching](../nextjs-performance/dev-memory-and-caching.md).

## Server and client implications

`next build` compiles two kinds of output from the same source: server bundles
for Server Components, Route Handlers and `proxy.ts`, and client bundles for the
`"use client"` subtree. The `"use client"` boundary decides which bundle a module
lands in, so `next build` is where a server module accidentally imported from a
Client Component shows up, for example as a build error when that module imports
`server-only`. See
[Directives](../server-react/directives.md).

## Common patterns

### Debug a prerender error

Production builds minify server code, so a prerender failure can point at
unreadable frames. `--debug-prerender` turns on server source maps, disables
minification, and continues past the first error so you see all of them:

```bash
npx next build --debug-prerender
```

Never deploy a build made with this flag.

### Build a subset of routes

On a large app, reproduce a build error faster by building only the routes
involved. Globs work, and `!` excludes:

```bash
npx next build --debug-build-paths="app/blog/**/page.tsx,!app/blog/drafts/**"
```

### Type-check in CI without building

```bash
npx next typegen && npx tsc --noEmit
```

## Common mistakes

- **Adding `--turbopack` to scripts.** It is the default since 16.0. The flag
  still works, but it is noise.
- **Looking for dev output in `.next`.** Since 16.0 the dev server writes to
  `.next/dev`, including its generated types in `.next/dev/types`.
- **Running two `next dev` processes on one project** and wondering which one
  you are editing. The lockfile tells the second one where the first is running.
- **Expecting `next build` to lint.** It does not since 16.0.
- **Discarding `.next/cache` in CI** and then wondering why the 16.3 build cache
  does not speed anything up.
- **Load-testing `next dev`.** Measure the production server.
- **Deploying a `--debug-prerender` build.** It is unminified and slower.

## Related topics

- [Turbopack](../nextjs-performance/turbopack.md) — configuration, loaders and
  the differences from webpack.
- [Dev memory and caching](../nextjs-performance/dev-memory-and-caching.md) —
  keeping a long-running `next dev` fast.
- [Build output](../nextjs-deployment/build-output.md) — what is in `.next`
  and how to read the route table.
- [TypeScript](./typescript.md) — generated route types and TypeScript 7 in
  `next build`.
- [Build tooling](../ecosystem/build-tooling.md) — the React-level view of
  bundlers and why frameworks own the build.
- [Static generation](../server-react/static-generation.md) — the React
  `prerender` model behind `next build`.
