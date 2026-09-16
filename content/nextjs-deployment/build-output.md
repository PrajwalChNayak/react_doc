---
title: Build output
description: What next build produces, how to read its route table, and which output mode to deploy.
group: nextjs-deployment
order: 10
status: current
since: "16.0"
related: [nextjs-deployment/self-hosting, nextjs-deployment/docker, nextjs-deployment/caching-and-cdn, server-react/static-generation]
---

## Overview

`next build` turns your app into something a server can run. It compiles your
code with Turbopack, prerenders every route it can, writes the result to
`.next/`, and prints a **route table** that tells you how each URL will be
served.

What you deploy depends on the output mode you choose:

| Output mode | Config | What you deploy | Server needed |
|---|---|---|---|
| Default | none | The project with `.next/` and `node_modules`, started with `next start` | Yes (Node.js) |
| Standalone | `output: 'standalone'` | `.next/standalone` plus `public` and `.next/static` | Yes (`node server.js`) |
| Static export | `output: 'export'` | The `out/` folder | No, but no server features |

This page is the starting point for the Deployment section. The rest of the
group covers where that output runs and how to operate it:

- [Self-hosting](./self-hosting.md): `next start` behind a reverse proxy, with
  shared caches and several instances.
- [Docker](./docker.md): a multi-stage image built from standalone output.
- [Adapters](./adapters.md): the API platforms use to reshape the build output.
- [Managed platforms](./managed-platforms.md): what a host must support for
  full Next.js 16 features.
- [Environment configuration](./environment-configuration.md): build-time and
  runtime variables, and one image for many environments.
- [Caching and CDNs](./caching-and-cdn.md): the `Cache-Control` headers Next.js
  sends and what a CDN may cache.
- [Debugging production](./debugging-production.md): inspecting, logging and
  tracing a running server.
- [Deployment checklist](./checklist.md): everything to confirm before you ship.

## Why it exists

Development and production have opposite goals. `next dev` compiles on demand so
edits show up quickly. A production build does all the work up front, so a
request only pays for what genuinely depends on that request.

The route table exists because that split is now decided per component, not per
page. With Cache Components, one route can have a prerendered shell and dynamic
holes, so you need the build to tell you what it actually managed to prerender.

## When to use it

- **Before every deploy.** Run `next build` in CI, never on the production
  server while it is serving traffic.
- **Locally, before opening a pull request** that changes data access. The route
  table shows at once if a route lost its static shell.
- **With `output: 'standalone'`** when you ship a container or copy files to a
  server, so you do not carry the whole `node_modules` folder.
- **With `output: 'export'`** when the site has no server-side features at all
  and can live on any static file host.

## When not to use it

- **Do not deploy a build made with `--debug-prerender`.** It disables
  minification and other optimizations. The CLI docs warn against it.
- **Do not use `output: 'export'`** if you need Server Actions, `proxy.ts`,
  `cookies()`, `"use cache"` at request time, ISR or default image optimization.
  None of these work without a server.
- **Do not build once per environment** if you can avoid it. Build once and
  promote the same artifact. See
  [Environment configuration](./environment-configuration.md).

## Basic example

Make sure `package.json` has the three standard scripts:

```json file="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

Build and start the production server:

```bash
npm run build
npm run start
```

With Cache Components enabled, a small store prints a table like this:

```text
Route (app)           Revalidate  Expire
┌ ○ /
├ ○ /_not-found
├ ○ /products                15m      1y
└   /products/[id]
  ├ ◐ /products/[id]
  ├ ○ /products/1            15m      1y
  ├ ○ /products/2            15m      1y
  └ ○ /products/3            15m      1y

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
```

## How it works

### The route table legend

| Symbol | Name | Meaning |
|---|---|---|
| `○` | Static | Fully prerendered at build time. Served without rendering. |
| `◐` | Partial Prerender | A static shell is served at once; dynamic parts stream at request time. |
| `●` | SSG | Prerendered HTML from `generateStaticParams`. Seen without Cache Components. |
| `ƒ` | Dynamic | Rendered on demand for every request. |

With Cache Components on, most routes sit between `○` and `◐`. A route shows `ƒ`
only when there is nothing to prerender, for example a Route Handler that reads
the request, or a dynamic `icon` or `opengraph-image`.

Routes that contain cached functions also get **Revalidate** and **Expire**
columns. Each column shows the shortest value among all caches in the route.
The `Expire` column caps at one year and prints `1y`.

A dynamic segment gets one indented row per param listed by
`generateStaticParams`, plus a `◐` fallback row for params that were not listed.
Long lists end with `[+N more paths]`.

### The build phases

`next build` runs in six phases. Knowing them makes a failed build easier to
place:

1. **Setup.** Loads `.env` files, validates `next.config`, generates a build ID.
2. **Route discovery.** Scans `app/` and `pages/`, finds `proxy.ts` and
   `instrumentation.ts`, and generates route types.
3. **Compilation.** Bundles client and server code with Turbopack (or webpack
   with `--webpack`). Type checking runs in parallel.
4. **Static analysis.** Classifies each route and checks for prerender-blocking
   errors, such as an uncached `fetch` outside `<Suspense>`.
5. **Prerendering.** Renders static pages and shells to HTML, plus the RSC
   payload used for client navigations.
6. **Output.** Writes `.next/`, and `.next/standalone` or `out/` if configured.

Prerendering is React's `prerender` with a `postponed` state underneath. See
[Static generation](../server-react/static-generation.md) for that mechanism.

### What is in `.next/`

The bundled docs describe these parts of the build directory. The rest is
internal and can change between releases, so do not script against it.

| Path | What it is |
|---|---|
| `.next/BUILD_ID` | The build identifier for this build |
| `.next/static/` | Hashed JavaScript, CSS and other assets served under `/_next/static/` |
| `.next/cache/` | The build cache, reused by the next `next build` |
| `.next/types/` | Generated route types from `next build` or `next typegen` |
| `*.nft.json` | File traces listing what each route needs at runtime |
| `.next/standalone/` | Present only with `output: 'standalone'` |
| `.next/dev/` | Output of `next dev`, kept apart from the production build |

Since **16.0**, `next dev` writes to `.next/dev` instead of `.next`. You can run
a development server and a production build in the same project at the same
time without one overwriting the other.

### Standalone output

During the build Next.js traces every `import`, `require` and `fs` call to find
the files each route can load. With `output: 'standalone'`, it copies only those
files, including the needed parts of `node_modules`, into `.next/standalone`,
together with a minimal `server.js`.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

`server.js` does not copy `public` or `.next/static`, because a CDN usually
serves those. If the Node.js server serves them itself, copy them in after the
build:

```bash
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```

### Static export

`output: 'export'` writes an HTML file per route, plus the payloads for client
navigation, to `out/`. Server Components run once, at build time. Anything that
needs a request, such as `cookies()`, Server Actions or `proxy.ts`, is not
supported. [Adapters](./adapters.md) receive only static files for an export.

### The build cache

Next.js keeps a cache in `.next/cache` that speeds up the next build. Since
**16.3**, Turbopack's filesystem cache is also on by default for `next build`,
stored in `.next/cache/turbopack`. It only helps if `.next/cache` survives
between builds, which is not the case in a fresh CI runner or a clean Docker
layer unless you persist it.

## Caching implications

- **The route table is your cache report.** A route that you expected to be `○`
  but shows `◐` still reads uncached or request-time data somewhere.
- **A new build starts with empty runtime caches.** The cache key includes the
  build ID or `deploymentId`. Plan for a cold cache after each release.
- **Standalone output does not include the build's `.next/cache`.** The
  official Docker example copies it only if you choose to keep cached fetch
  responses from the build.

## Common patterns

### Persist `.next/cache` in CI

Restore and save the directory around the build step. For GitHub Actions, the
bundled CI guide uses `actions/cache`:

```text file=".github/workflows/deploy.yml"
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx') }}
    restore-keys: |
      ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
```

Without it, Next.js may report a "No Cache Detected" error and every build
starts cold.

If your build environment can never keep `.next/cache`, turn off the Turbopack
build cache so the build does not spend time writing it. The option is still
under `experimental`:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
```

### Debug a failed prerender

Production builds minify server code, so stack traces are hard to read. Rebuild
with readable traces, then fix the route and rebuild normally:

```bash
next build --debug-prerender
```

To iterate on one route in a large app, build only that route:

```bash
next build --debug-build-paths="app/products/[id]/page.tsx"
```

### Trace files outside the project in a monorepo

Tracing starts at the project directory. Files from a shared package higher in
the repo are left out unless you move the tracing root:

```ts file="next.config.ts"
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
```

## Common mistakes

**Deploying `.next/standalone` without `public` and `.next/static`.** Pages
render, but every script, stylesheet and image returns 404. Copy both folders,
or serve them from a CDN.

**Running `next build` on the production host.** The build competes with live
traffic for CPU and memory, and a failed build can leave a half-written `.next/`.
Build in CI and ship the result.

**Expecting `ƒ` for dynamic pages.** With Cache Components a page that reads
`cookies()` inside `<Suspense>` still shows `◐`, because its shell is
prerendered.

**Shipping a `--debug-prerender` build.** It is unminified and slower.

**Treating the `.next/` layout as an API.** Only the documented parts are stable.
Platforms that need the build output in a structured form should use the
[Adapters API](./adapters.md).

**Choosing `output: 'export'` and then adding a Server Action.** The build fails,
because nothing can run it. Pick the output mode from the features you need.

## Related topics

- [Self-hosting](./self-hosting.md): run the build with `next start` in
  production.
- [Docker](./docker.md): package standalone output into a small image.
- [Caching and CDNs](./caching-and-cdn.md): the headers each route table symbol
  produces.
- [The caching model](../nextjs-data-caching/caching-model.md): why a route ends
  up `○` or `◐`.
- [Static generation (React)](../server-react/static-generation.md): the React
  `prerender` and `postponed` state the build relies on.
