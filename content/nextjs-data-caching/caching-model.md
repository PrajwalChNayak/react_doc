---
title: The caching model
description: How Next.js 16 caches with Cache Components, where every cached copy lives, and why nothing is cached unless you ask.
group: nextjs-data-caching
order: 10
status: current
since: "16.0"
related: [nextjs-data-caching/use-cache, nextjs-data-caching/cache-life-and-tags, nextjs-data-caching/revalidation, data-fetching/caching]
---

## Overview

With **Cache Components** enabled (`cacheComponents: true`), caching in Next.js
is **opt-in**. Every data access runs at request time unless you mark it with
the [`"use cache"`](./use-cache.md) directive. Next.js then prerenders as much of
each route as it can into a **static shell**, and streams the rest.

When Next.js renders a route, each piece of your component tree falls into one
of three kinds:

| Kind | What makes it that kind | When it runs | Where the result ends up |
|---|---|---|---|
| Static | Synchronous work, module imports, pure computation | At build time | The static shell |
| Cached | A `"use cache"` function or component | Once per cache entry | The static shell, a server cache, and the browser |
| Dynamic | Uncached data, `cookies()`, `headers()`, `searchParams`, `connection()` | On every request | Streamed behind a `<Suspense>` fallback |

This page is the map for the whole group. The other pages cover each API in
depth:

- [use cache](./use-cache.md): the directive, cache keys and serialization.
- [cacheLife and cacheTag](./cache-life-and-tags.md): how long an entry lives
  and how you name it.
- [Revalidation](./revalidation.md): `revalidateTag`, `updateTag`, `refresh` and
  `revalidatePath`.
- [Request memoization](./request-memoization.md): deduplication inside one
  render, which is not caching.
- [Fetching data](./fetching-data.md): where and how to load data.
- [ISR](./isr.md): prerendering some dynamic routes and generating the rest on
  demand.

The runnable [caching example](../../examples/nextjs/caching/README.md) shows
cached and dynamic values side by side on one page.

## Why it exists

A cache that you did not ask for is a cache you cannot reason about. Explicit
`"use cache"` puts the caching decision next to the data access, with a
lifetime ([`cacheLife`](./cache-life-and-tags.md)) and a name
([`cacheTag`](./cache-life-and-tags.md)) in the same few lines.

Being explicit also lets Next.js do more for you. Because it knows exactly which
parts of a route are cached and which are dynamic, it can prerender a shell that
contains the cached parts, serve it instantly from a CDN, and stream only the
dynamic holes. React supplies the underlying mechanism, partial prerendering
with a `postponed` state (see [Static generation](../server-react/static-generation.md)).
Next.js decides where the holes go.

> [!NOTE]
> **Previous model.** Without Cache Components, Next.js decides per route
> whether to render statically or dynamically, based on whether it detects
> request-time APIs. In that previous model, caching is tuned through `fetch`
> options, route segment config exports and `unstable_cache`, which Cache
> Components replaces. That model still works when `cacheComponents` is off,
> but this section does not document it. See
> [The pre-16 caching model](../nextjs-migration/pre-16-caching-model.md).

## When to use it

- **New Next.js 16 apps.** Turn on `cacheComponents` from the start, so every
  route is validated as you build it.
- **Pages that mix shared and personal content**, such as a product page with a
  personalized cart. The shared parts can be cached into the shell while the
  cart streams.
- **Routes you want to navigate to instantly.** The static shell is what makes
  that possible. See [Instant Navigations](../nextjs-instant-navigations/overview.md).

## When not to use it

- **Routes that use the Edge runtime.** Cache Components requires the Node.js
  runtime. The `runtime = 'edge'` export is deprecated; move those routes to
  Node.js first.
- **Static exports** (`output: 'export'`). The bundled platform table lists
  `"use cache"` as unsupported there.
- **A large existing app you cannot migrate in one step.** Enabling the flag
  makes route segment config exports such as `dynamic` and `revalidate` fail.
  Plan the move with [the migration pages](../nextjs-migration/pre-16-caching-model.md)
  first.

## Basic example

Enable the flag:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

Then one page can contain all three kinds of content:

```tsx file="app/storefront/page.tsx"
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife, cacheTag } from 'next/cache';

type Product = { id: string; name: string };

// Cached: everyone sees the same featured products.
async function FeaturedProducts() {
  'use cache';
  cacheLife('hours');
  cacheTag('products');

  const response = await fetch('https://api.example.com/products?featured=true');
  const products: Product[] = await response.json();

  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  );
}

// Dynamic: reads a cookie, so it runs on every request.
async function CartSummary() {
  const cartId = (await cookies()).get('cart-id')?.value;
  if (!cartId) return <p>Your cart is empty.</p>;

  const response = await fetch(`https://api.example.com/carts/${encodeURIComponent(cartId)}`);
  const cart: { itemCount: number } = await response.json();
  return <p>{cart.itemCount} items in your cart</p>;
}

export default function StorefrontPage() {
  return (
    <main>
      {/* Static: prerendered at build time. */}
      <h1>Storefront</h1>

      <FeaturedProducts />

      <Suspense fallback={<p>Loading your cart…</p>}>
        <CartSummary />
      </Suspense>
    </main>
  );
}
```

At build time the heading, the featured products and the cart fallback become
the static shell. At request time only `CartSummary` runs.

## How it works

### Prerendering and the static shell

During `next build`, Next.js renders every route's component tree. Static work
completes, `"use cache"` results are stored and kept, and anything dynamic
suspends. The output, HTML for a direct visit plus an RSC payload for client
navigations, is the **static shell**. Next.js calls this approach Partial
Prerendering, and with Cache Components it is the default.

A cached result joins the shell only if its lifetime is long enough to be safe
to serve from it. The thresholds are on the
[cacheLife and cacheTag](./cache-life-and-tags.md) page.

### Validation instead of silent fallbacks

Next.js requires you to decide what happens to every piece of dynamic work. An
uncached `fetch` or a `cookies()` call that is not inside a `<Suspense>`
boundary surfaces an insight in the dev overlay and the dev server log. It names
the route and offers the fixes: cache it, or move it into `<Suspense>`.

The rule exists so that every route still produces a shell. Without it, one
uncached read near the top of a layout would quietly make the whole route wait
for the slowest query.

### Random values and the current time

`Math.random()`, `Date.now()`, `new Date()` and `crypto.randomUUID()` give a
different answer every time, so Next.js makes you choose:

- **One value per request:** call `await connection()` (from `next/server`)
  before the read and wrap the component in `<Suspense>`. Since **16.3**,
  `await io()` from `next/cache` does the same during prerendering but, unlike
  `connection()`, does not wait for a real request, so the result can still be
  prefetched. The 16.3 docs recommend `io()` unless you need a real request.
- **One value shared by everyone:** read it inside `"use cache"`. The value is
  captured into the cache entry.

```tsx file="app/status/page.tsx"
import { Suspense } from 'react';
import { connection } from 'next/server';

async function ServerTime() {
  await connection();
  return <p>Rendered at {new Date().toISOString()}</p>;
}

export default function StatusPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ServerTime />
    </Suspense>
  );
}
```

### Where cached content lives

A cached function's output is serialized as an RSC payload. That payload is
then stored in up to three places, and [`cacheLife`](./cache-life-and-tags.md)
controls each one:

| Store | What it holds | Controlled by | Scope |
|---|---|---|---|
| Prerendered output | The static shell's HTML and RSC payload, on disk when self-hosting or in the platform's storage behind a CDN | `revalidate` and `expire` | All visitors |
| Server cache | `"use cache"` entries. In memory per server instance by default; `"use cache: remote"` stores them through a shared [cache handler](./use-cache.md) | `revalidate` and `expire` | All visitors |
| Browser (client cache) | The RSC payload from navigations and prefetches | `stale` | One tab |

Every store is scoped to one deployment. The cache key includes the build ID (or
`deploymentId`), so a new deploy starts with empty caches.

> [!WARNING]
> On serverless platforms the default in-memory server cache usually does not
> survive between requests, because each request may reach a different
> instance. Build-time entries in the static shell still work. Runtime cache hits
> may not. See [use cache](./use-cache.md) for `"use cache: remote"`.

### Request memoization is a separate layer

Inside a single render, identical `fetch` calls and functions wrapped in React's
`cache()` run once. That deduplication ends when the render ends and is not
controlled by anything on this page. See
[Request memoization](./request-memoization.md).

## Server and client implications

- **The browser keeps its own copy.** Content from the server cache is kept in
  browser memory for the `stale` time of its `cacheLife` profile. The client
  router enforces a **minimum stale time of 30 seconds**, so a prefetched link
  is still usable when it is clicked.
- **Mutations clear the browser copy.** Calling `revalidateTag`,
  `revalidatePath`, `updateTag` or `refresh` from a Server Action clears the
  entire client cache immediately, whatever the stale time.
- **Navigation keeps state.** With Cache Components on, Next.js hides the
  previous route with React's `<Activity>` instead of unmounting it, so component
  state survives a back navigation. See
  [Activity](../performance/activity.md) for the React side.
- **Bots get the whole page.** Crawlers are detected by user agent and receive
  the fully rendered page instead of the shell, so everything the shell depends
  on must also work at request time.

## Caching implications

- **Dynamic is the default.** A new data access you add runs on every request
  until you cache it. Forgetting `"use cache"` costs performance, not
  correctness.
- **Deploys reset the server cache.** Plan for a cold cache after each release.
- **A cache entry is shared by everyone who produces the same key.** Never cache
  a function whose output depends on the user unless the user is part of the
  key. The [use cache](./use-cache.md) page explains keys.

## Common patterns

### Push dynamic reads down the tree

The deeper a `cookies()` call or uncached `fetch` sits, the more of the page can
be in the shell. Pass the `params` promise into a child inside `<Suspense>`
rather than awaiting it at the top of a layout.

```tsx file="app/teams/[team]/layout.tsx"
import { Suspense } from 'react';

async function TeamName({ params }: Pick<LayoutProps<'/teams/[team]'>, 'params'>) {
  const { team } = await params;
  return <h1>{team}</h1>;
}

export default function TeamLayout({ children, params }: LayoutProps<'/teams/[team]'>) {
  return (
    <div>
      <Suspense fallback={<h1>Loading team…</h1>}>
        <TeamName params={params} />
      </Suspense>
      {children}
    </div>
  );
}
```

The layout never awaits, so its structure and `children` stay in the shell.
Only `TeamName` waits for the URL.

### Cache data, then compose

Caching a data function (`getProducts()`) is usually more reusable than caching
a whole page, because several components can share the entry. Cache whole
components when their output is expensive to render as well as to load.

### Tag everything you cache

A tag costs one line and is the only way to invalidate an entry on demand. Add
`cacheTag` alongside `cacheLife` from the start, even if nothing calls
`revalidateTag` yet.

## Common mistakes

**Expecting a `fetch` to be cached because an older tutorial said so.** With
Cache Components nothing is cached unless it is inside `"use cache"`.

**Reading `cookies()` at the top of a layout.** The whole layout, and every page
below it, waits for the request. Read it in a small component inside
`<Suspense>`.

**Calling `new Date()` in a prerendered component** and being surprised by the
build error. Decide whether you want one value per request (`connection()` or
`io()` behind `<Suspense>`) or one shared value (`"use cache"`).

**Assuming the server cache is shared across instances.** The default is in
memory per instance. Serverless deployments may miss on almost every runtime
read.

**Turning on `cacheComponents` in an app with `runtime = 'edge'` routes.** Cache
Components requires the Node.js runtime.

**Treating request memoization as a cache.** React `cache()` and `fetch`
deduplication last one render. They never make a second request faster.

## Related topics

- [use cache](./use-cache.md): the directive that opts a function or component
  into caching.
- [cacheLife and cacheTag](./cache-life-and-tags.md): lifetimes, profiles and
  tags for every entry.
- [Revalidation](./revalidation.md): how to invalidate entries after data
  changes.
- [Caching (React)](../data-fetching/caching.md): the React-level `cache()` and
  how it differs from a persistent cache.
- [Static generation (React)](../server-react/static-generation.md): the React
  prerendering and `postponed` state that the static shell is built on.
- [The pre-16 caching model](../nextjs-migration/pre-16-caching-model.md): the
  implicit model this replaces, for apps that have not migrated.
