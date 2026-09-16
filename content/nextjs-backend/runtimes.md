---
title: Runtimes
description: Next.js server code runs on the Node.js runtime; the Edge runtime is deprecated and incompatible with Cache Components.
group: nextjs-backend
order: 30
status: current
related: [nextjs-backend/route-handlers, nextjs-backend/proxy, nextjs-databases/edge-runtime, server-react/server-components]
---

## Overview

A runtime is the JavaScript environment your server code executes in: Server
Components, Route Handlers, Server Actions and `proxy.ts`. Next.js 16.3 has one
runtime you should use, **Node.js**, and it is the default. You do not need to
configure anything to get it.

The other runtime, **Edge**, was a restricted, Web-API-only environment. It is
deprecated.

> [!DEPRECATED]
> **The Edge runtime is deprecated.** The Next.js 16.3.5 docs say to remove the
> `runtime` export from your route files. The segment option still accepts
> `'edge'`, but new code should not use it, and it does not work with Cache
> Components. `proxy.ts` cannot use Edge at all. No release post names the
> version that deprecated it.

## Why it exists

Edge was introduced so that code could run in lightweight isolates close to the
user with fast cold starts, originally for middleware. The price was a runtime
without most of Node.js. Over time Next.js moved in the other direction: Node.js
support for middleware became stable in 15.5, `proxy.ts` became Node.js-only in
16.0, and Cache Components requires Node.js.

The result is a simpler model. Every server file can use the full Node.js API and
the npm ecosystem, and you no longer have to track which files run where.

## When to use it

Use the Node.js runtime for everything. In practice that means **exporting
nothing**: no `runtime` export in pages, layouts or Route Handlers.

## When not to use it

There is no current alternative inside Next.js. If a platform offered
edge-specific performance you relied on, move the fast decision (a redirect, a
rewrite, a header) into [`proxy.ts`](./proxy.md), which the Next.js docs name as
the replacement for "edge behavior", and cache what you can with
[`"use cache"`](../nextjs-data-caching/use-cache.md) and a CDN.

## Basic example

A Route Handler that uses Node.js built-ins directly. It needs no configuration
because Node.js is the default:

```ts file="app/api/exports/[exportId]/route.ts"
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';

const EXPORT_DIR = path.join(process.cwd(), 'storage', 'exports');

export async function GET(_request: NextRequest, context: RouteContext<'/api/exports/[exportId]'>) {
  const { exportId } = await context.params;
  if (!/^[a-f0-9]{32}$/.test(exportId)) {
    return new Response('Not found', { status: 404 });
  }

  const filePath = path.join(EXPORT_DIR, `${exportId}.csv`);
  const file = await open(filePath).catch(() => null);
  if (!file) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(file.readableWebStream() as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="export-${exportId}.csv"`,
      ETag: createHash('sha256').update(exportId).digest('hex'),
    },
  });
}
```

`node:fs`, `node:crypto` and `node:path` are all unavailable on Edge. On Node.js
they are ordinary imports. The strict pattern check on `exportId` is what keeps
the path join from being a path traversal bug.

## How it works

### What the Node.js runtime gives you

- Every Node.js built-in: `fs`, `crypto` (including `timingSafeEqual`),
  `stream`, `child_process`, `worker_threads`, `async_hooks`.
- npm packages that use native add-ons or CommonJS `require`.
- The Web APIs as well: `fetch`, `Request`, `Response`, `ReadableStream`,
  `TextEncoder`, `crypto.randomUUID()`.

Next.js bundles server dependencies by default. A package that relies on
Node.js-specific loading behavior (native binaries, dynamic `require`) can be
excluded from bundling with `serverExternalPackages` in `next.config.ts`. Next.js
already excludes a built-in list of common ones, such as `@prisma/client` and
`@node-rs/argon2`.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A placeholder for your own package that loads a native binary.
  serverExternalPackages: ['@acme/pdf-renderer'],
};

export default nextConfig;
```

### What Edge could not do

Described here so you can recognize it in older code and migrate it. The Edge
runtime:

- had **no native Node.js APIs**. You could not read or write the filesystem,
  and `node:crypto`, `net` and `child_process` were unavailable;
- could only use npm packages that ship ES modules and avoid Node.js APIs, so
  most database drivers, `bcrypt`, image libraries and many SDKs failed;
- did **not allow `require`**, only ES modules;
- rejected dynamic code evaluation (`eval`, `new Function`);
- did **not support Incremental Static Regeneration**;
- is **not supported with Cache Components**, which requires Node.js.

A file that opted into Edge did so with a `runtime` segment export set to
`'edge'`. To migrate, delete that export. The code then runs on Node.js, where
everything that worked on Edge still works.

### `NEXT_RUNTIME`

`process.env.NEXT_RUNTIME` is `'nodejs'` or `'edge'`. You will mostly see it in
`instrumentation.ts`, which Next.js calls in every runtime, to import
Node.js-only setup conditionally:

```ts file="instrumentation.ts"
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/telemetry-node');
  }
}
```

### Segment options that remain

Under Cache Components, the route segment exports are `runtime` (whose only
non-deprecated value is `'nodejs'`, the default), `maxDuration`, the
Cache-Components-only `instant` and `prefetch`, and `preferredRegion`, which the
16.3.5 docs also mark as deprecated. `maxDuration` is the one you are most
likely to set, for long-running handlers on a serverless host; see
[Background work](./background-work.md).

## Server and client implications

Runtimes apply only to server code. Client Components run in the browser
regardless. A Server Component, Route Handler or Server Action can import any
Node.js module, but those imports must never end up in a Client Component. Keep
Node.js-only modules in files marked with `import 'server-only'`, so a mistaken
import from a `"use client"` file fails the build. The React side of that
boundary is in [Server Components](../server-react/server-components.md).

## Caching implications

Cache Components (`cacheComponents: true`) requires the Node.js runtime. A route
that still exports `runtime = 'edge'` has to be migrated before you can turn it
on. The Next.js docs also note that other server-side JavaScript runtimes are not
guaranteed to work with it.

## Common patterns

- **Delete legacy `runtime` exports** during the 16 upgrade and run the test
  suite. Most Edge code runs unchanged on Node.js.
- **Move "edge" redirects into `proxy.ts`**, which runs before routing.
- **Use `node:crypto`** for HMAC and constant-time comparisons in
  [webhooks](./webhooks.md), instead of the more awkward Web Crypto workarounds
  Edge required.
- **Stream files from disk** with `FileHandle.readableWebStream()`, as in the
  basic example. See [Streaming responses](./streaming-responses.md).
- **Database drivers**: use the regular Node.js drivers and pool connections. The
  edge-specific drivers and their trade-offs are covered in
  [Edge runtime and databases](../nextjs-databases/edge-runtime.md).

## Common mistakes

- **Adding a `runtime` export for Edge from an old tutorial.** It is deprecated
  and blocks Cache Components.
- **Exporting `runtime` from `proxy.ts`.** It throws; proxy is always Node.js.
- **Keeping `middleware.ts` to stay on Edge.** The deprecated `middleware.ts` still
  runs on Edge, but that keeps you on a deprecated file and a deprecated runtime.
  Migrate to `proxy.ts`.
- **Assuming serverless means Edge.** Serverless platforms run Node.js functions;
  they still enforce time limits, which you configure with `maxDuration`.
- **Importing a Node.js-only module into a Client Component.** Mark server
  modules with `server-only`.
- **Joining request input into a filesystem path** without validating it first.

## Related topics

- [Route Handlers](./route-handlers.md) — the most common place you use Node.js
  APIs directly.
- [Proxy](./proxy.md) — always Node.js, and the replacement for request-time
  edge logic.
- [Edge runtime and databases](../nextjs-databases/edge-runtime.md) — what the
  deprecation means for database drivers.
- [Server Components](../server-react/server-components.md) — the React model
  for server-only code and the client boundary.
- [Next.js 15 to 16](../nextjs-migration/next-15-to-16.md) — removing runtime
  exports as part of the upgrade.
