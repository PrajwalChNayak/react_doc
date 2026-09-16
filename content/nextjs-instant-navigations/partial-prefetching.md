---
title: Partial Prefetching
description: Prefetch one reusable App Shell per route, decide what it contains with "use cache" and Suspense, and adopt it route by route.
group: nextjs-instant-navigations
order: 20
status: opt-in
since: "16.3"
related: [nextjs-instant-navigations/overview, nextjs-instant-navigations/link-prefetching, nextjs-data-caching/use-cache, data-fetching/suspense]
---

## Overview

With Partial Prefetching, a `<Link>` prefetches the destination route's **App
Shell** instead of the full page. The App Shell is a per-route prerender of
everything that does not depend on URL data: static markup, cached content, and
the fallbacks of `<Suspense>` boundaries around the rest.

Next.js builds one App Shell per route and reuses it for every link to that
route. A page with fifty links to fifty products fetches one shell for
`/store/[slug]`, not fifty prefetches.

> [!NOTE]
> **Opt-in (16.3).** Partial Prefetching is off by default. Enable it with the
> top-level `partialPrefetching: true` option, which requires
> `cacheComponents: true`, or per route with `export const prefetch = 'partial'`.
> This behavior is slated to become the default in a future major version of
> Next.js.

## Why it exists

Before 16.3 a route had two prefetch choices. It could define a reusable
loading shell with a `loading.tsx` file, or a link could ask for a full
prefetch with `<Link prefetch={true}>`, which rendered the whole destination,
including uncached dynamic content, once per link.

The first option was rigid: the shell was whatever sat above the nearest
`loading.tsx`. The second was costly: every visible link could wake a server.
Apps that picked neither got blocking navigations.

Partial Prefetching extracts a reusable shell from **any** route's own
`<Suspense>` boundaries and cached content, so the loading state lives next to
the code that needs it. Because the shell is shared by every link to a route,
prefetch cost is bounded by the number of routes, not the number of links.

## When to use it

- Every route in a Cache Components app where you want the click to paint
  something meaningful right away.
- Routes that many links point to (product grids, feeds, tables of records).
- Existing apps that relied on a `loading.tsx` in every route to avoid blocking
  navigations.
- Dynamic routes with params that are not prerendered at build time. The same
  App Shell serves their first visit (see [ISR](../nextjs-data-caching/isr.md)).

## When not to use it

- **Without Cache Components.** It does not work, and config validation throws.
- **Before reviewing existing `<Link prefetch={true}>` calls.** Those links
  currently get a full prefetch that includes uncached dynamic content. After
  you enable Partial Prefetching they no longer do. Decide what each should keep
  first, or adopt routes one at a time.
- **For a route whose UI is all real-time data.** A prefetch of real-time content
  would be stale by the click. Let it stream in behind its boundary.

## Basic example

Turn it on for the whole app:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
```

Then keep URL data out of the shared shell. Awaiting `params` at the top of a
page ties the App Shell to one URL, and Next.js reports it as a "URL data
outside of Suspense" insight in development:

```tsx file="app/store/[slug]/page.tsx"
import { getProduct } from '@/lib/catalog';
import { ProductDetails } from '@/components/product-details';

// Avoid: the whole page now depends on one URL.
export default async function ProductPage({ params }: PageProps<'/store/[slug]'>) {
  const { slug } = await params;
  const product = await getProduct(slug);
  return <ProductDetails product={product} />;
}
```

Pass the promise down instead, and await it inside a boundary:

```tsx file="app/store/[slug]/page.tsx"
import { Suspense } from 'react';
import { getProduct } from '@/lib/catalog';
import { ProductDetails } from '@/components/product-details';
import { StoreHeader } from '@/components/store-header';

type Params = PageProps<'/store/[slug]'>['params'];

export default function ProductPage({ params }: PageProps<'/store/[slug]'>) {
  return (
    <>
      {/* URL-independent: part of the shared App Shell */}
      <StoreHeader />
      <Suspense fallback={<p>Loading product…</p>}>
        <Product params={params} />
      </Suspense>
    </>
  );
}

async function Product({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  return <ProductDetails product={product} />;
}
```

Every link to `/store/...` now shares one App Shell containing `<StoreHeader>`
and the "Loading product…" fallback. The product streams in after the click,
or before it when the link sets `prefetch={true}` (see
[Link prefetching](./link-prefetching.md)).

## How it works

### What goes into the App Shell

Next.js prerenders the route and keeps everything that can be prepared ahead of
the navigation. Each kind of content lands in a predictable place:

| Content | In the App Shell? |
|---|---|
| Static markup and components with no I/O | Yes |
| Output of a `"use cache"` function whose `stale` time is at least 5 minutes | Yes |
| Output of a `"use cache"` function with a shorter `stale` time (the `seconds` profile) | No, streams in after navigation |
| Content that depends on `cookies()` or `headers()` | Yes, cached per session on the client |
| Content that reads `params` or `searchParams` (URL data) | No. Its `<Suspense>` fallback is in the shell. `prefetch={true}` can resolve cached URL-dependent content per link. |
| Uncached data, or anything after `await connection()` | No. Its `<Suspense>` fallback is in the shell. |

So there are two levers. **`"use cache"`** pulls content into the shell by
giving it a lifetime, and **`<Suspense>`** marks where the shell stops and
streaming begins. See [use cache](../nextjs-data-caching/use-cache.md) and
[cacheLife and cacheTag](../nextjs-data-caching/cache-life-and-tags.md) for the
caching side, and [Suspense](../data-fetching/suspense.md) for the boundary
semantics.

### Why URL data is excluded

`params` and `searchParams` vary per link. A shell that is shared by every link
to a route cannot contain them. `cookies()` and `headers()` are different: they
vary per session, not per link, so the shell can carry session content and the
client caches it per session.

### Where `loading.tsx` fits

A `loading.tsx` file is still a `<Suspense>` boundary around the page, so its
fallback can be part of an App Shell. It is no longer the only way to get a
reusable loading state. A boundary placed right around the slow component
usually keeps more real content visible. See
[Loading UI](../nextjs-errors/loading-ui.md).

### The `prefetch` route segment export

`prefetch` sets a per-route ceiling on prefetch work. It only works with
`cacheComponents` enabled, and it cannot be used in a Client Component segment.

| Value | Effect |
|---|---|
| omitted (`'auto'`) | Follow the app's `partialPrefetching` setting. Do not write `'auto'` explicitly. |
| `'partial'` | Opt this segment into Partial Prefetching while the global flag is off. |
| `'force-disabled'` | Never prefetch this segment's data, or the data of any deeper segment. Route metadata may still be prefetched. |

Set it on the **destination**, not on the link. A destination cannot know which
links point to it, so the segment config caps what any link can pull.
`<Link prefetch={false}>` still skips prefetching regardless of the segment
config.

One exception: when Next.js performs a per-link prefetch for a segment, all
downstream segments are included in the same request, so deeper segments marked
`'force-disabled'` are still prefetched as part of that response.

### The `instant` route segment export

`instant` controls development-time validation of whether navigations into a
segment are instant. It also only works with `cacheComponents` enabled and cannot
be used in Client Components.

| Value | Effect |
|---|---|
| `true` | Validate this segment at the globally configured level. |
| `false` | Allow navigations into this segment to block. Validation stops reporting them. |
| `{ level: 'warning' }` | Validate in development only, with errors in the dev overlay. `'warning'` is currently the only documented level. |

By default, a Cache Components app already validates every page and default
segment, so you rarely need `instant = true`. The common use is `false`:

```tsx file="app/tabs/layout.tsx"
import type { ReactNode } from 'react';

// The shared layout reads slow account data and is allowed to block.
export const instant = false;

export default function TabsLayout({ children }: { children: ReactNode }) {
  return <section>{children}</section>;
}
```

```tsx file="app/tabs/[tab]/page.tsx"
import { Suspense } from 'react';
import { TabContent } from '@/components/tab-content';

// Navigations between tabs must still be instant.
export const instant = true;

export default function TabPage({ params }: PageProps<'/tabs/[tab]'>) {
  return (
    <Suspense fallback={<p>Loading tab…</p>}>
      <TabContent params={params} />
    </Suspense>
  );
}
```

Navigations from elsewhere into `/tabs` may block at the layout. Navigations
between `/tabs/a` and `/tabs/b` are still validated. When the highest `instant`
config in a route's tree is `false`, that route also skips static shell
validation, so place `false` as low in the tree as you can.

`instant` never changes rendering. A segment marked `false` can still navigate
instantly if its structure allows. It only changes what Next.js reports.

## Caching implications

- Cached content with a `stale` time under 5 minutes is left out of the App
  Shell, because the shell is reused for longer than that content stays fresh.
- Revalidating with `revalidateTag` or `revalidatePath` refreshes the
  prefetches that depend on the invalidated data.
- In serverless deployments, in-memory `"use cache"` entries do not persist
  across instances. The official docs suggest `"use cache: remote"` for
  persistent caching.

## Common patterns

### Carry session content in the shell

`"use cache"` cannot read `cookies()` inside the cached function. Read the
cookie outside and pass the value in. The cache entry is keyed on the argument,
so sessions that share a value share the entry:

```tsx file="app/dashboard/team-topics.tsx"
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

async function getTopics(team: string | undefined) {
  'use cache';
  return db.topics.forTeam(team);
}

export async function TeamTopics() {
  const team = (await cookies()).get('team')?.value;
  const topics = await getTopics(team);
  return (
    <ul>
      {topics.map((topic: { id: string; label: string }) => (
        <li key={topic.id}>{topic.label}</li>
      ))}
    </ul>
  );
}
```

Render `<TeamTopics />` inside a `<Suspense>` boundary. On a direct visit it
shows the fallback until the lookup resolves. On a navigation, the App Shell
already contains it. When the lookup belongs to a single session, use
`"use cache: private"` instead, which caches in the browser only.

### Adopt one route at a time

With the global flag off, opt a destination in with the segment export:

```tsx file="app/dashboard/page.tsx"
import { Dashboard } from '@/components/dashboard';

export const prefetch = 'partial';

export default function DashboardPage() {
  return <Dashboard />;
}
```

The workflow the official guide recommends:

1. Pick one destination. Decide what its existing `prefetch={true}` links must
   keep delivering before the click, and capture that with `instant()` tests
   run against a production build with Partial Prefetching still off.
2. Cache what should stay in the shell, move URL data behind `<Suspense>`, and
   remove `prefetch={true}` where the App Shell is now enough.
3. Add `export const prefetch = 'partial'` and deploy. In development, links to
   routes you have not adopted keep reporting the "dynamic data during
   prefetching" insight.
4. When every route in scope is adopted, set `partialPrefetching: true` and
   remove the per-route exports with the codemod:

```bash
npx @next/codemod@canary remove-partial-prefetch ./app
```

Pass `./src/app` in a `src/` project. A wrong path reports `0 ok` instead of
failing, so check the file count. The codemod leaves other values, such as
`'force-disabled'`, in place.

### Decide what each full prefetch becomes

| The destination delivers | Do this |
|---|---|
| Static or already cached content | Remove the now-redundant `prefetch={true}`. |
| Uncached content you want ready before the click | Cache it with `"use cache"`, then remove `prefetch={true}`. |
| Content that depends on `cookies()` or `headers()` | Cache the lookup behind the session value, then remove `prefetch={true}`. |
| Content that reads `params` or `searchParams` | Keep `prefetch={true}` so the link resolves it ahead of the click. |
| Real-time content that must be fresh per request | Remove `prefetch={true}` and let it stream in. |

## Common mistakes

**Awaiting `params` or `searchParams` outside a boundary.** The shared shell
cannot contain URL data. Pass the promise to a child inside `<Suspense>`.

**Setting `prefetch = 'partial'` on the page that renders the link.** The
export belongs on the destination segment.

**Writing `export const prefetch = 'auto'`.** It is the default. Omit the
export.

**Using `instant` or `prefetch` in a `"use client"` page or layout.** Neither
works in a Client Component segment, and `instant` throws an error there.

**Expecting `instant = false` to make a route slower or faster.** It only
changes validation.

**Caching with the `seconds` profile and expecting it in the shell.** Content
must stay fresh for at least 5 minutes to be included.

**Leaving `prefetch = 'partial'` exports behind after enabling the flag.** They
are redundant. Run the `remove-partial-prefetch` codemod.

## Related topics

- [Instant Navigations](./overview.md) — the suite this belongs to and how to
  enable it.
- [Link prefetching](./link-prefetching.md) — resolve URL data per link with
  `prefetch={true}`, and what that costs.
- [Instant Insights and the Navigation Inspector](./devtools.md) — see the
  shell each navigation produces.
- [use cache](../nextjs-data-caching/use-cache.md) — the directive that pulls
  content into the shell.
- [Suspense](../data-fetching/suspense.md) — the React boundary that marks where
  the shell stops.
- [Static generation](../server-react/static-generation.md) — React's partial
  prerendering, which the static shell is built on.
