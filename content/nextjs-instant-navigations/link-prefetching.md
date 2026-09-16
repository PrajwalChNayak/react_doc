---
title: Link prefetching
description: What <Link prefetch> downloads with and without Partial Prefetching, what prefetch={true} costs, and how 16.3 bundles small prefetches.
group: nextjs-instant-navigations
order: 30
status: opt-in
since: "16.3"
related: [nextjs-instant-navigations/partial-prefetching, nextjs-performance/prefetching-cost, nextjs-routing/linking-and-navigation, data-fetching/suspense]
---

## Overview

`<Link>` from `next/link` prefetches its destination in the background so the
router can render the next route without waiting for a round trip. The
`prefetch` prop decides how much it downloads, and the answer changes when
Partial Prefetching is on.

> [!NOTE]
> **Opt-in (16.3).** Partial Prefetching changes the default `<Link>` prefetch to
> a shared per-route App Shell, and turns `prefetch={true}` into per-link
> prefetching. It requires `cacheComponents: true` plus `partialPrefetching: true`
> (or `export const prefetch = 'partial'` on the destination). This behavior is
> slated to become the default in a future major version of Next.js.

Prefetching runs only in **production** (`next start` or a deployment). In
`next dev`, every navigation waits on the server, whatever the prop says.

## Why it exists

A server-rendered route cannot appear instantly unless something about it is
already in the browser at click time. Prefetching is how it gets there.

The trouble is cost. Prefetching every visible link in full wakes the server
for pages the user never opens. Prefetching nothing makes every click wait.
The `prefetch` prop, the per-route App Shell, and the prefetch scheduler exist
to put that trade-off where you can control it: shared, cheap work by default,
and expensive per-link work only where it pays off.

## When to use it

- **Default `<Link>`** for almost every link. Under Partial Prefetching it
  costs one App Shell per route.
- **`prefetch={true}`** when the destination has cached content that depends on
  that link's `params` or `searchParams`, users are likely to click, and the
  content should be on screen immediately.
- **`prefetch={false}`** for large lists of links that are rarely followed, such
  as footers or infinite tables.

## When not to use it

Skip `prefetch={true}` when:

- The route barely depends on URL data. The App Shell already makes the
  navigation instant.
- The URL-dependent content must be fresh per request. The per-link prefetch
  stops at the same `<Suspense>` fallback, so the user sees the same UI.
- The route is rarely visited. You pay for each visible link, clicked or not.
- The destination is not structured for instant navigation yet. Per-link
  prefetching cannot fix a route that blocks without it. Fix the route first
  (see [Partial Prefetching](./partial-prefetching.md)).

## Basic example

```tsx file="app/store/page.tsx"
import Link from 'next/link';
import { getProducts } from '@/lib/catalog';

export default async function StorePage() {
  const products: { slug: string; name: string }[] = await getProducts();

  return (
    <>
      <nav>
        {/* Default: the App Shell for /about */}
        <Link href="/about">About</Link>
        {/* Never prefetched */}
        <Link href="/legal" prefetch={false}>
          Legal
        </Link>
      </nav>
      <ul>
        {products.map((product) => (
          <li key={product.slug}>
            {/* Per-link: App Shell plus cached content for this slug */}
            <Link href={`/store/${product.slug}`} prefetch={true}>
              {product.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
```

For the product links to help, the product page must read `params` inside a
`<Suspense>` boundary and cache the lookup with `"use cache"`. Then the name
and price are ready before the click. The
[instant-navigations example](../../examples/nextjs/instant-navigations/README.md)
tests exactly this.

## How it works

### What each value downloads

| `<Link>` | Without Cache Components | Cache Components, no Partial Prefetching | With Partial Prefetching |
|---|---|---|---|
| default (`"auto"` or `null`) | Static route: the full route. Dynamic route: down to the nearest `loading.js`. | The cached page render. | The route's shared **App Shell**. |
| `prefetch={true}` | The full route, static or dynamic. | The cached render **and** uncached dynamic content (the legacy full prefetch). | The App Shell **plus** cached content that depends on this link's URL data (per-link prefetching). |
| `prefetch={false}` | Nothing, on viewport entry or hover. | Nothing. | Nothing. |

The middle column is why an existing app must review its `prefetch={true}`
links before enabling Partial Prefetching: they stop receiving uncached
dynamic content.

### The App Shell is shared

Every default link to `/store/[slug]` reuses one App Shell, fetched once when
the first such link enters the viewport, and cached on the client. Rendering a
hundred product links does not multiply the work.

### Per-link prefetching

With `prefetch={true}`, the router prefetches a prerender that already knows
this link's `params`, `searchParams` and full URL. The prerender advances
through static and cached content, and stops at uncached reads, falling back to
the surrounding `<Suspense>` boundary.

It is best-effort. On a slow connection, or on a page with many links, the
per-link prefetch may not be finished when the user clicks. The navigation then
falls back to the App Shell, which is why the route must be instant without it.

### When prefetching happens

As each `<Link>` enters the viewport, Next.js queues a prefetch. The scheduler
works in this order:

1. Links in the viewport.
2. Links showing user intent (hover or touch).
3. Newer links replace older ones.
4. Links scrolled off-screen are discarded.

If prefetched data has expired by the time the user hovers a link, Next.js
prefetches it again. Invalidating data with `revalidateTag` or `revalidatePath`
also refreshes the associated prefetches.

### Automatic bundling of small prefetches

Since 16.3, the App Router bundles small segment prefetch responses into a
single response instead of requesting each one separately. This applies to
**every** App Router app, not only apps using Partial Prefetching. Larger shared
segments stay separate so other routes can reuse them.

The behavior is permanent and on by default. Only its override is experimental:

> [!WARNING]
> **Experimental.** `experimental.prefetchInlining` overrides the bundling. Its
> options may still change. Most apps should leave it alone.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // false disables bundling. The object form changes the thresholds,
    // in bytes of gzip-compressed segment response (defaults shown).
    prefetchInlining: {
      maxSize: 2048,
      maxBundleSize: 10240,
    },
  },
};

export default nextConfig;
```

Lower thresholds keep more per-segment deduplication. Higher thresholds cut the
request count further. Setting `prefetchInlining: false` is mainly useful while
debugging navigation issues or measuring request volume.

## Caching implications

- A route whose content is all static is prefetched from the static cache or a
  CDN, even with `prefetch={true}`.
- A route that accesses non-static data is rendered on the server for each
  per-link prefetch. That is **one server invocation per visible
  `<Link prefetch={true}>`**.
- The App Shell only includes cached content whose `stale` time is at least 5
  minutes.

| | App Shell (default) | Per-link prefetch (`prefetch={true}`) |
|---|---|---|
| Scope | One per route | One per visible link |
| Content | The route minus URL-specific data | The same, plus cached URL-specific content |
| Cost | Bounded by route count | Bounded by visible-link count |

For budgeting that cost across a real app, see
[Prefetching cost](../nextjs-performance/prefetching-cost.md).

## Common patterns

### Prefetch on hover instead of on viewport entry

A grid of cards with `prefetch={true}` makes one server request per card as the
grid scrolls into view. To pay only for likely clicks, start prefetching when
the user shows intent:

```tsx file="app/ui/hover-prefetch-link.tsx"
'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

export function HoverPrefetchLink({ href, children }: { href: string; children: ReactNode }) {
  const [active, setActive] = useState(false);

  return (
    <Link href={href} prefetch={active ? null : false} onMouseEnter={() => setActive(true)}>
      {children}
    </Link>
  );
}
```

`prefetch={null}` restores the default prefetch once the pointer arrives. The
official docs warn that wrapping `<Link>` this way makes you responsible for
its prefetching and accessibility behavior, so use it only when the defaults do
not fit.

### Prefetch from code

`router.prefetch()` from `useRouter` warms a route that has no visible link, for
example when a card is hovered:

```tsx file="app/ui/pricing-card.tsx"
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function PricingCard() {
  const router = useRouter();

  return (
    <div onMouseEnter={() => router.prefetch('/pricing')}>
      <h2>Pro plan</h2>
      <Link href="/pricing">View pricing</Link>
    </div>
  );
}
```

### Cap prefetching at the destination

When a destination should never be prefetched, for example a rarely used page
behind authentication, set the route segment export on the destination instead
of editing every link:

```tsx file="app/admin/audit-log/page.tsx"
import { AuditLog } from '@/components/audit-log';

export const prefetch = 'force-disabled';

export default function AuditLogPage() {
  return <AuditLog />;
}
```

## Security considerations

A prefetch renders your layouts and pages before the user visits them. Code
with side effects in render, such as recording a page view, runs at prefetch
time. Move side effects into an Effect in a Client Component, or into a Server
Action triggered by the user.

A prefetch renders with the same server code as a visit, so authorization checks
in that code still run. Session-dependent content in an App Shell is cached per
session on the client, not shared between users.

## Common mistakes

**Testing prefetch behavior in `next dev`.** Prefetching is production-only.
Use `next build && next start`, or the Navigation Inspector to see the shell.

**Adding `prefetch={true}` to fix a slow route.** Per-link prefetching only helps
a route that is already instant with its App Shell.

**Putting `prefetch={true}` on every card in a long grid.** Each visible link can
wake the server. Use the default, or prefetch on hover.

**Expecting `prefetch={true}` to include uncached data under Partial
Prefetching.** It resolves URL data and the cached content behind it. Uncached
content streams in after the click.

**Tuning `experimental.prefetchInlining` without measuring.** The default is
right for most apps, and the option is experimental.

**Tracking analytics in a layout's render.** It fires on prefetch, not on visit.

## Related topics

- [Partial Prefetching](./partial-prefetching.md) — how the App Shell is built
  and the `prefetch` segment export.
- [Prefetching cost](../nextjs-performance/prefetching-cost.md) — measure and
  budget the server work prefetching creates.
- [Linking and navigation](../nextjs-routing/linking-and-navigation.md) — the
  rest of the `<Link>` API and client-side transitions.
- [Instant Navigations](./overview.md) — the suite and how to enable it.
- [Suspense](../data-fetching/suspense.md) — where a per-link prefetch stops.
- [Streaming](../server-react/streaming.md) — how the content a prefetch leaves
  out arrives after the click.
