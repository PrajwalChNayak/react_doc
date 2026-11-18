---
title: Managed platforms
description: What a hosting platform must support to run every Next.js 16 feature, and how to check a platform instead of assuming.
group: nextjs-deployment
order: 50
status: current
related: [nextjs-deployment/adapters, nextjs-deployment/self-hosting, nextjs-deployment/caching-and-cdn, server-react/streaming]
---

## Overview

A managed platform builds and runs your Next.js app for you. How much of
Next.js actually works there depends on the platform's integration, not on your
code. The bundled Next.js docs describe the requirements as a matrix of three
infrastructure capabilities:

| Feature | Streaming | Shared cache | Edge stitching |
|---|---|---|---|
| Server Components | Required | No | No |
| ISR (time-based) | No | Recommended | No |
| ISR (on-demand) | No | Recommended | No |
| Partial Prerendering | Required | Recommended | Optional |
| Cache Components (`"use cache"`) | Required | Recommended | No |
| Proxy | No | No | No |
| Server Actions | Required | No | No |
| `after()` | No | No | No |

`after()` additionally needs graceful shutdown, so pending callbacks can finish.
Image optimization needs the `sharp` package on the server.

The docs group deployment targets into three tiers:

| Tier | What it means |
|---|---|
| Node.js server or Docker | All features. You operate it. See [Self-hosting](./self-hosting.md). |
| Verified adapter | Open source, built on the public [Adapters API](./adapters.md), runs the Next.js compatibility test suite. The 16.3.5 docs list Vercel and Bun. |
| Other platform integrations | Not built on the public Adapter API and not verified by the Next.js team. Feature support varies. |

## Why it exists

Since Next.js 16, the line between static and dynamic runs through the component
tree, not between pages. One URL can need a CDN-cached shell, a streamed dynamic
render, a Server Action endpoint and a shared cache entry. A host that only knows
"static file or serverless function" cannot serve that route as designed.

The docs separate two levels of support so you can compare platforms honestly:

- **Functional fidelity:** every feature works correctly. It is binary, and the
  adapter test suite is the contract.
- **Performance fidelity:** features reach their best performance, such as a
  PPR shell served at CDN latency. It is a spectrum, and platforms differ.

## When to use it

- **You want the platform to own scaling, TLS, CDN and cache storage.**
- **Your team does not want to run shared cache infrastructure** for multiple
  instances.
- **The platform has a verified adapter** or publishes results against the
  Next.js compatibility tests for the version you run.

## When not to use it

- **The platform cannot stream responses.** Server Components, Server Actions,
  Cache Components and PPR need it. Buffered responses still work, but the
  performance benefit is lost.
- **The platform lags behind security releases.** You need **`next@16.3.3` or
  later** in production. If the platform pins its own runtime or build image, check
  that it lets you run a patched version.
- **You depend on the deprecated Edge runtime** being the only runtime offered.
  Cache Components requires Node.js, and `proxy.ts` runs on Node.js.

## Basic example

Before choosing a platform, write down what your app actually uses and check
each item against the platform's own Next.js documentation:

```text
App: shop-web, next@16.3.5, Node.js 24 LTS

Uses                               Needs from the platform
cacheComponents + Suspense         Unbuffered streaming responses
"use cache: remote"                A shared cacheHandlers backend
revalidateTag('products', 'max')   Tag invalidation across all instances and the CDN
Server Actions                     POST + streaming; one build per deployment
proxy.ts                           Node.js runtime for proxy
next/image with remotePatterns     Image optimization with sharp, or a loader
after()                            Graceful shutdown / waitUntil
Rolling deploys                    Version skew protection (deploymentId routing)
```

Every "Needs" line becomes a question for the platform's docs, support matrix or
compatibility test results. Anything you cannot confirm is a risk to test on a
preview deployment before production.

## How it works

### Streaming

"Streaming required" means the platform supports chunked transfer encoding or
HTTP/2 streaming and does **not** buffer the response before sending it. Some
load balancer and function integrations buffer by default. Without streaming,
a `<Suspense>` fallback never reaches the browser before the data does. See
[Streaming (React)](../server-react/streaming.md).

### Shared cache

Without a shared cache, each instance keeps its own ISR and `"use cache"`
entries. Features still work on each instance, but `revalidateTag` on one does
not reach the others. Platforms plug in storage through `cacheHandler` (server
cache, ISR, images) and `cacheHandlers` (`"use cache"`), with `refreshTags()`
to sync tag invalidations.

### Edge stitching

For PPR, a platform can cache the static shell at the edge and ask the origin to
**resume** only the dynamic part, then stream both as one response. That is an
optimization. A single origin that streams gives the same result with a slower
first byte.

### Build output

Platforms receive the build through the Adapters API: a structured list of
functions, prerenders, static files and routing rules, generated by the same
`next build` you run locally. Vercel's adapter uses the same public API as
everyone else, according to the docs.

## Caching implications

- **Ask where the server cache lives.** Per-instance memory on a platform that
  runs many short-lived instances means few runtime cache hits.
- **Ask how on-demand revalidation reaches the CDN.** `revalidateTag` clears the
  Next.js cache. A CDN copy lives until its TTL unless the platform purges it.
- **Ask whether the CDN keys on the `_rsc` search parameter.** A CDN that drops it
  can serve HTML where the client router expects an RSC payload. See
  [Caching and CDNs](./caching-and-cdn.md).

## Common patterns

### Verify on a preview deployment

A support matrix can be out of date. Deploy a branch that exercises your risky
features and check each one:

```bash
# Streaming: the first chunk should arrive before the slow part finishes.
curl -N -s -o /dev/null -w "first byte: %{time_starttransfer}s total: %{time_total}s\n" https://preview.shop.example.com/products/1

# Dynamic responses must not be cached publicly.
curl -sI https://preview.shop.example.com/account | grep -i cache-control

# The deployed Next.js version, if you expose it from a health route.
curl -s https://preview.shop.example.com/api/health
```

A large gap between first byte and total time means streaming works. A first
byte close to the total means something is buffering.

### Fall back to a container

If a platform does not meet a requirement, most container services run the
[Docker](./docker.md) image with full feature support. You give up the
platform's edge optimizations, not correctness.

## Security considerations

- **Confirm the version that is actually deployed.** A platform build image or a
  loose version range can install something other than what you tested. Check
  it as described in the [Deployment checklist](./checklist.md).
- **Environment variables marked public on the platform are still inlined** at
  build time if they start with `NEXT_PUBLIC_`. See
  [Environment configuration](./environment-configuration.md).

## Common mistakes

**Choosing a platform from a blog post.** Integrations change quickly. Read the
platform's current Next.js docs, and prefer a verified adapter.

**Treating "supports Next.js" as "supports Next.js 16".** Ask specifically about
Cache Components, PPR resume, `proxy.ts` on Node.js, and `after()`.

**Assuming revalidation propagates.** Test `revalidateTag` on a preview with more
than one instance.

**Keeping `runtime = 'edge'` exports to fit a platform.** The Edge runtime is
deprecated, and Cache Components will not run there.

**Ignoring performance fidelity.** Two platforms can pass the same tests and
still serve the shell at very different latencies. Measure.

## Related topics

- [Adapters](./adapters.md): the API platforms build their Next.js support on.
- [Self-hosting](./self-hosting.md): the baseline that supports every feature.
- [Caching and CDNs](./caching-and-cdn.md): headers and cache keys a platform's
  CDN must respect.
- [Deployment checklist](./checklist.md): confirm the running version and
  configuration after you pick a platform.
- [Streaming (React)](../server-react/streaming.md): why unbuffered responses
  matter.
