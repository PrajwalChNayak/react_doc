---
title: Self-hosting
description: Run next start in production behind a reverse proxy, with image optimization, shared caches, version skew protection and graceful shutdown.
group: nextjs-deployment
order: 20
status: current
related: [nextjs-deployment/docker, nextjs-deployment/caching-and-cdn, nextjs-deployment/checklist, server-react/streaming]
---

## Overview

Self-hosting means you run the Next.js server yourself: `next start`, or
`node server.js` from standalone output, on a VM, a container platform or bare
metal. According to the bundled Next.js docs, a single `next start` process
supports **every** Next.js feature: Server Components, streaming, Cache
Components, ISR, Server Actions, `proxy.ts`, image optimization and `after()`.

Running one process is straightforward. The work is in what surrounds it:

| Concern | One instance | Several instances |
|---|---|---|
| Reverse proxy | Recommended | Recommended |
| Streaming | Disable proxy buffering | Also on the load balancer |
| Server cache (ISR, images) | Local disk and memory work | Custom `cacheHandler` |
| `"use cache"` entries | In memory per process | `cacheHandlers` with shared storage |
| `revalidateTag` | Local | Tag coordination through the handler |
| Server Action encryption key | Automatic | Same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` at build |
| Version skew | Only during restarts | `deploymentId` plus deployment-aware routing |

> [!WARNING]
> Run **`next@16.3.3` or later** (16.3.5 recommended). The August 2026 security
> release fixed an unauthenticated remote code execution in the Image
> Optimization API when it processes an attacker-controlled AVIF image, and
> CVE-2026-75604, an unauthenticated RCE that affects **Windows-hosted** servers
> running apps that use both the Pages Router and the App Router without Cache
> Components. There is no workaround for the Windows issue; upgrading is the fix.

## Why it exists

A managed platform hides the reverse proxy, the cache storage and the rollout
strategy. When you host it yourself, those become your job, and Next.js leaves
explicit extension points for each: `cacheHandler`, `cacheHandlers`,
`deploymentId`, and an encryption key environment variable.

Self-hosting gives you control over region, cost and data residency. It also
means a feature that works on your laptop can behave differently behind a
buffering proxy or across three containers, which is what this page is about.

## When to use it

- **You already run Node.js services** and have a load balancer, logging and
  deployment pipeline you want Next.js to fit into.
- **You need to control where data and compute live**, for compliance or cost.
- **You deploy to a container platform** such as Kubernetes. See
  [Docker](./docker.md) for the image.

## When not to use it

- **You do not want to operate shared cache storage.** With several instances
  and on-demand revalidation you need it. A
  [managed platform](./managed-platforms.md) may provide it.
- **The site has no server features at all.** A static export on a file host is
  cheaper. See [Build output](./build-output.md).
- **Do not put `next start` directly on the internet.** Use a reverse proxy.

## Basic example

Build in CI, then start the server with a port and a keep-alive timeout longer
than your load balancer's idle timeout:

```bash
npm ci
npm run build
npx next start --port 3000 --keepAliveTimeout 70000
```

In front of it, a reverse proxy such as nginx terminates TLS, limits payload
size and rate, and absorbs slow or malformed connections. Next.js then spends its
CPU on rendering. Tell the proxy not to buffer responses, or streaming stops
working. Next.js can send the `X-Accel-Buffering` header that nginx reads:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*{/}?',
        headers: [{ key: 'X-Accel-Buffering', value: 'no' }],
      },
    ];
  },
};

export default nextConfig;
```

## How it works

### Keep-alive timeouts

When Node.js closes an idle keep-alive connection, it does not tell the proxy.
If the proxy then reuses that connection, the request fails. Setting
`--keepAliveTimeout` higher than the proxy's own timeout makes the proxy close
first.

### Streaming end to end

Suspense boundaries, the static shell of a partially prerendered route, and
Server Action responses all rely on streaming. Every hop must pass chunked or
HTTP/2 streamed responses through without buffering: the load balancer, any
reverse proxy, and the Node.js server. If one hop buffers, pages still work, but
the user waits for the whole response. See
[Streaming (React)](../server-react/streaming.md) for what is being streamed.

### Image optimization

`next/image` optimization works with `next start` without configuration. It
needs the `sharp` package, and on glibc-based Linux `sharp` may need a different
memory allocator to avoid excessive memory use (see sharp's install docs).

Two advisories concern self-hosted image optimization directly:

- **AVIF remote code execution** (August 2026, Critical). Fixed in **16.3.3**.
  The patch **disables AVIF optimization** until an upstream `libheif` fix ships.
  If you configured `images.formats` to include `image/avif`, do not expect AVIF
  output from a patched server.
- **CVE-2026-64644** (GHSA-q8wf-6r8g-63ch, Medium). A malicious remotely hosted
  SVG can exhaust CPU at `/_next/image`. It requires `images.remotePatterns` to
  be configured, and custom loaders are not affected. Fixed in **16.2.11** and
  therefore in every version at or above the 16.3.3 floor.

Keep `images.remotePatterns` as narrow as possible. Every allowed host is a
source of untrusted input to your image pipeline.

### Server cache storage

ISR pages, Route Handler responses and optimized images go into the Next.js
**server cache**. By default it lives in memory (50 MB, `cacheMaxMemorySize`)
and on the local disk of each instance. That works for one instance with a
persistent disk. On ephemeral containers, or with several pods, each copy
diverges and is lost on restart.

`"use cache"` entries are separate. They are kept in an in-memory LRU cache per
process unless you configure `cacheHandlers`. The two options are often mixed
up:

| Option | Covers |
|---|---|
| `cacheHandler` (singular) | ISR, Route Handler responses, optimized images (with `images.customCacheHandler: true`) |
| `cacheHandlers` (plural) | `"use cache"` (`default`) and `"use cache: remote"` (`remote`) |

### Version skew

During a rolling deploy, a browser holding the old version can request a
JavaScript chunk that the new server no longer has, or call a Server Action ID
the new build does not know. With a `deploymentId`, Next.js appends `?dpl=<id>`
to asset URLs, sends `x-deployment-id` on navigations, and forces a full reload
when the client and server disagree.

Next.js does **not** route requests by `?dpl=`. To keep old clients on old
instances during a rollout, your load balancer or CDN has to route by
deployment. Without that, mismatched clients reload instead of breaking.

### Server Action encryption key

Next.js encrypts variables closed over by Server Functions before sending them
to the client, using a key generated per build. If instances come from different
builds, one cannot decrypt what another encrypted, and users see "Failed to find
Server Action". Set the same base64 key (16, 24 or 32 bytes) at build time for
every build you run side by side.

### Graceful shutdown

On `SIGINT` or `SIGTERM`, the Next.js server finishes in-flight requests and
runs pending `after()` callbacks before it exits. Give your orchestrator a
drain period; the docs recommend 10 to 30 seconds. Killing the process with
`SIGKILL` skips all of that.

## Server and client implications

- **Clients outlive deployments.** An open tab keeps the old JavaScript until it
  navigates. `deploymentId` turns silent breakage into a reload, which loses
  React state held in `useState`. Keep important state in the URL or on the
  server.
- **Server Actions are bound to a build.** Deploy all instances from the same
  build, or share the encryption key.

## Caching implications

- **`revalidateTag` is local by default.** Calling it on one instance does not
  invalidate the other instances. Implement `refreshTags()` and `updateTags()` in
  a `cacheHandlers` handler backed by shared storage.
- **A CDN in front keeps its own copy.** Revalidating the Next.js cache does not
  purge the CDN. See [Caching and CDNs](./caching-and-cdn.md).
- **A new `deploymentId` changes `"use cache"` keys**, so each release starts
  with a cold cache.

## Common patterns

### Several instances behind a load balancer

Build once, set a deployment ID and a shared encryption key at build time, and
point both cache options at shared storage:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  deploymentId: process.env.DEPLOYMENT_VERSION,
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,
  cacheHandlers: {
    default: require.resolve('./cache-handlers/default-handler.js'),
    remote: require.resolve('./cache-handlers/remote-handler.js'),
  },
};

export default nextConfig;
```

```bash
openssl rand -base64 32
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="<key from your secret store>" DEPLOYMENT_VERSION="$GIT_SHA" npm run build
```

`cacheMaxMemorySize: 0` turns off the per-instance memory cache, so every read
goes to the shared store. The handler files are your own code; the bundled docs
link a Redis `cacheHandler` example and describe the `cacheHandlers` interface
(`get`, `set`, `refreshTags`, `getExpiration`, `updateTags`).

### A health check endpoint

Next.js has no documented built-in health route, so write one. With Cache
Components, a `GET` Route Handler that reads no request data is prerendered at
build time, which would make it report healthy forever. `connection()` makes it
run on every request:

```ts file="app/api/health/route.ts"
import { connection } from 'next/server';

export async function GET() {
  await connection();
  return Response.json(
    { status: 'ok', uptimeSeconds: Math.round(process.uptime()) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
```

Keep liveness cheap. If readiness should check the database, do it in a
separate route with a short timeout, so a slow database does not get healthy
pods restarted.

### Run code on server start

To warm a connection pool or start telemetry before the first request, export
`register` from `instrumentation.ts`. It runs once per server instance and must
finish before the server accepts requests. See
[Debugging production](./debugging-production.md).

## Security considerations

- **Patch first.** Nothing else on this page matters on a version below
  **16.3.3**. On Windows hosts, CVE-2026-75604 allows unauthenticated RCE in
  apps that mix the Pages Router and App Router without Cache Components.
  Linux and macOS are not affected by that one, but they are by the AVIF issue.
- **Do not expose the inspector.** `next start --inspect` opens a debugging port
  that can execute code. Bind it to localhost only. See
  [Debugging production](./debugging-production.md).
- **Treat the encryption key as a secret.** It is embedded in the build output,
  so protect build artifacts and images like the key itself.
- **Terminate hostile traffic at the proxy.** Request size limits and slow-client
  protection belong in front of Node.js.

## Common mistakes

**Streaming works locally but not in production.** A buffering proxy or load
balancer is holding the response. Disable buffering on every hop.

**Scaling to three pods and seeing different content on refresh.** Each pod has
its own cache and its own view of `revalidateTag`. Add shared cache handlers.

**"Failed to find Server Action" after a rolling deploy.** Instances were built
separately with different keys, or clients from the old deployment reached new
instances. Share the key and set `deploymentId`.

**Setting only `cacheHandler` and expecting `"use cache"` to be shared.** That
needs `cacheHandlers`.

**Load balancer 502s under light load.** The Node.js keep-alive timeout is
shorter than the balancer's. Raise `--keepAliveTimeout`.

**Killing containers without a drain period.** In-flight requests fail and
`after()` work is lost.

**Assuming Linux hosting makes an old version safe.** The AVIF RCE is not
platform-specific.

## Related topics

- [Docker](./docker.md): the container image for the setup on this page.
- [Caching and CDNs](./caching-and-cdn.md): headers and purging when a CDN sits
  in front of `next start`.
- [Environment configuration](./environment-configuration.md): runtime
  variables for one image across environments.
- [Deployment checklist](./checklist.md): confirm the version and settings before
  you go live.
- [Streaming (React)](../server-react/streaming.md): what must pass unbuffered
  through your proxy.
