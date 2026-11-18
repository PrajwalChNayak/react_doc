---
title: Caching and CDNs
description: The Cache-Control and Vary headers Next.js sends, what a CDN in front of Next.js may cache, and how to purge after revalidation.
group: nextjs-deployment
order: 70
status: current
related: [nextjs-deployment/self-hosting, nextjs-data-caching/revalidation, nextjs-deployment/adapters, data-fetching/caching]
---

## Overview

A CDN in front of `next start` can serve static assets and prerendered pages
without touching your servers. Next.js tells the CDN what is safe through
standard headers:

| Response | `Cache-Control` sent by Next.js |
|---|---|
| Hashed assets under `/_next/static/` | `public, max-age=31536000, immutable` (cannot be overridden) |
| Static page, no revalidation | `s-maxage=31536000` |
| Revalidating page (ISR, `cacheLife`) | `s-maxage=<revalidate>, stale-while-revalidate=<expire - revalidate>` |
| Dynamic page | `private, no-cache, no-store, max-age=0, must-revalidate` |

App Router responses also vary by request headers, so the same URL can return
HTML or an RSC payload. Next.js signals that with a `Vary` header and an `_rsc`
search parameter. A CDN that ignores both can serve the wrong variant.

## Why it exists

A prerendered shell only feels instant if it is served near the user. Origin
latency undoes the work the build did. A CDN closes that gap, but it is a second
cache with its own lifetime, and Next.js cannot reach into it.

So there are two rules to design around. The CDN may only cache what Next.js
marks as public. And anything you invalidate in Next.js, you also have to purge
at the CDN.

## When to use it

- **Static assets.** Always. They are content-hashed and immutable.
- **Prerendered and revalidating pages** that are the same for every visitor.
- **Several regions** served from one origin.

## When not to use it

- **Personalized responses.** Anything that reads `cookies()`, `headers()` or a
  session is sent as `private, no-store`. Never override that at the CDN.
- **Routes whose `proxy.ts` decisions depend on the request** (authentication,
  redirects, rewrites) when the CDN sits in front of proxy. The docs say proxy
  should run before the CDN cache, or those routes should bypass the CDN cache.
- **A CDN you cannot configure** to keep query parameters in the cache key or to
  forward the `rsc` header.

## Basic example

Check what Next.js sends before you configure anything at the CDN:

```bash
# A hashed asset: long-lived and immutable.
curl -sI https://shop.example.com/_next/static/chunks/main-app.js | grep -i cache-control

# A prerendered page with cacheLife('hours').
curl -sI https://shop.example.com/products | grep -i -E "cache-control|vary"

# A personalized page: must be private.
curl -sI https://shop.example.com/account | grep -i cache-control
```

Asset filenames are hashed, so take a real path from your page's HTML. Then set
the CDN to **respect origin `Cache-Control`**, include the full query string in
the cache key, and forward the `rsc`, `next-router-prefetch`,
`next-router-state-tree`, `next-router-segment-prefetch` and `next-url` request
headers.

## How it works

### Where the headers come from

The header follows how the route was rendered. A fully prerendered route is
public. A route with cached entries gets `s-maxage` from the shortest
`revalidate` in it and `stale-while-revalidate` from the difference to `expire`.
The default `expire` is one year, so `stale-while-revalidate` is normally
present. A dynamic route is private, which protects user-specific data even if
the CDN is configured to cache aggressively.

`cacheLife` sets those numbers. See
[cacheLife and cacheTag](../nextjs-data-caching/cache-life-and-tags.md).

### HTML versus RSC payload

The client router requests the same URL with an `rsc` header to get an RSC
payload instead of HTML. Next.js responds with `Vary` listing:

- `rsc`: RSC payload or HTML.
- `next-router-state-tree`: the client's router state for targeted updates.
- `next-router-prefetch`: whether it is a prefetch.
- `next-router-segment-prefetch`: which segment is prefetched.
- `next-url`: only for routes with interception routes.

Many CDNs do not honor `Vary` without extra setup. That is why Next.js also adds
the **`_rsc` search parameter**, a hash of the relevant header values, so each
variant has a different URL. When an RSC request arrives with a wrong or missing
`_rsc` value, Next.js answers with a **307 redirect** to the correct one, and the
CDN has to follow it.

### What you must preserve

- **Forward the `rsc` header.** If the CDN strips it, the server returns HTML to
  a client router that expected RSC, and navigations fall back to full page loads.
- **Keep `_rsc` in the cache key.** Some CDNs drop query strings from the key by
  default. That mixes HTML and RSC variants under one entry.
- **For prefetches, keep both `next-router-prefetch` and `_rsc`.**

Omitting `next-router-state-tree` or `next-router-segment-prefetch` produces
larger responses, not broken ones. Omitting `next-url` disables interception
routes: users see the full target page instead of the intercepted one.

### Pathname-based prefetches

With Cache Components, segment prefetches already use pathname-based URLs such as
`/page.segments/_tree.segment.rsc`, which a CDN can cache with an ordinary
pathname key. The Next.js team describes moving all variants to pathnames as
future work in active design. Do not rely on it yet.

### Static assets across deployments

With `deploymentId` set, asset URLs carry `?dpl=<id>`, so browsers refetch them
after each deploy even when the content did not change. Since **16.3**, a
platform adapter can opt in to **immutable static assets**: content-addressed
files under `/_next/static/immutable/`, requested without `?dpl`, and shared
across deployments. That is enabled by the adapter, not by application config.
See [Adapters](./adapters.md).

To host assets on a separate domain or CDN origin, set `assetPrefix`.

## Server and client implications

- **The browser has its own copy.** The client router keeps RSC payloads for the
  `stale` time of the `cacheLife` profile. Purging the CDN does not clear an open
  tab. A Server Action that calls `revalidateTag` or `updateTag` does.
- **Prefetch responses can be cached at the CDN** for partially prerendered
  routes, because a static prefetch does not depend on router state.

## Caching implications

- **`revalidateTag` does not purge the CDN.** It invalidates the Next.js server
  cache. The CDN keeps serving its copy until `s-maxage` runs out.
- **Purge both variants.** A page exists as HTML and as RSC payloads (`_rsc`
  URLs). Purge whatever keys your CDN stored for both.
- **Several instances need shared tags too.** The CDN purge helps only if the
  origin that refills the CDN has also seen the invalidation. See
  [Self-hosting](./self-hosting.md).

## Common patterns

### Revalidate, then purge

Invalidate the Next.js cache first, then the CDN, so the CDN refills from fresh
content:

```ts file="app/products/actions.ts"
'use server';

import { revalidateTag } from 'next/cache';
import { purgeCdnTag } from '@/lib/cdn';
import { verifySession } from '@/lib/dal';

export async function publishProductChanges() {
  const session = await verifySession();
  if (session.role !== 'editor') {
    throw new Error('Not allowed to publish product changes');
  }

  revalidateTag('products', 'max');

  // Your CDN's purge API. Purge the HTML and RSC entries for these pages.
  await purgeCdnTag('products');
}
```

`purgeCdnTag` is your own wrapper around the CDN's purge API. How to tag or list
keys differs per provider, so check its documentation. If you cannot purge,
choose `cacheLife` profiles with short enough `revalidate` values that the CDN
TTL is acceptable.

### Serve assets from a dedicated origin

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  assetPrefix: process.env.ASSET_PREFIX,
};

export default nextConfig;
```

Upload `.next/static` to that origin under `/_next/static/` before switching
traffic to the new build, and keep old files for as long as old clients may
request them.

## Security considerations

- **Never cache `private` responses at the CDN.** Overriding origin headers with a
  "cache everything" rule serves one user's page to the next.
- **Cache poisoning through unkeyed headers.** If the origin's response depends
  on a header that the CDN does not include in the key or `Vary`, an attacker can
  store a variant for everyone. Keep the Next.js routing headers forwarded and
  keyed, and do not add request-dependent output to public routes.
- **Proxy decisions belong before the cache.** A cached response bypasses a
  `proxy.ts` redirect that sits behind the CDN.

## Common mistakes

**Stripping query strings from the cache key.** HTML and RSC variants collide and
client navigation breaks.

**Expecting `revalidateTag` to update the CDN.** Add a purge step, or accept the
TTL.

**Forcing `Cache-Control: public` on all HTML at the CDN.** Dynamic pages are
private on purpose.

**Purging only the HTML URL.** Client navigations keep receiving the stale RSC
payload.

**Setting a long browser `max-age` on pages yourself.** A CDN can be purged; a
browser cache cannot.

**Placing proxy-based authentication behind a caching CDN.** Cached responses
skip the check.

## Related topics

- [Revalidation](../nextjs-data-caching/revalidation.md): `revalidateTag`,
  `updateTag` and `revalidatePath` on the Next.js side.
- [Self-hosting](./self-hosting.md): the server cache and shared handlers behind
  the CDN.
- [Adapters](./adapters.md): immutable static assets and PPR at the edge.
- [Managed platforms](./managed-platforms.md): questions to ask about a
  platform's CDN.
- [Caching (React)](../data-fetching/caching.md): React's per-request `cache()`,
  which never reaches a CDN.
