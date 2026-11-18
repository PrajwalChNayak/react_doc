---
title: The pre-16 caching model
description: How caching worked without Cache Components, and how each fetch option, segment export and unstable_ API maps onto use cache.
group: nextjs-migration
order: 50
status: legacy
since: "16.0"
related: [nextjs-data-caching/caching-model, nextjs-data-caching/use-cache, nextjs-data-caching/cache-life-and-tags, data-fetching/caching]
---

## Overview

Next.js 16 has two caching models. With `cacheComponents: true`, caching is
explicit: nothing is cached unless you write `"use cache"`. Without the flag,
Next.js keeps what its docs now call the **Previous Model**: caching configured
through `fetch` options, `unstable_cache`, and route segment exports, with
Next.js deciding per route whether to render statically or dynamically.

> [!LEGACY]
> This page documents the Previous Model so you can maintain and migrate it. It
> still works in Next.js 16.3 when `cacheComponents` is off. New code should use
> [Cache Components](../nextjs-data-caching/caching-model.md).

| Previous Model | Cache Components (16.3) |
|---|---|
| `fetch(url, { cache: 'force-cache' })` | A `"use cache"` function around the `fetch` |
| `fetch(url, { next: { revalidate: 3600 } })` | `cacheLife('hours')` inside `"use cache"` |
| `fetch(url, { next: { tags: ['posts'] } })` | `cacheTag('posts')` inside `"use cache"` |
| `fetch(url, { cache: 'no-store' })` | Plain `fetch`. Uncached is the default. |
| `unstable_cache(fn, keyParts, { tags, revalidate })` | `"use cache"` + `cacheTag` + `cacheLife`. Keys come from arguments. |
| `unstable_noStore()` | Remove it. Use `connection()` or `io()` if the work must run per request. |
| `export const dynamic = 'force-dynamic'` | Remove it. Everything is dynamic by default. |
| `export const dynamic = 'force-static'` | Remove it; add `"use cache"` with `cacheLife('max')` where data is read. |
| `export const dynamic = 'error'` | Remove it. Cache Components validation reports uncached data. |
| `export const revalidate = 3600` | `cacheLife` inside `"use cache"` |
| `export const fetchCache = '…'` | Remove it. Fetches inside `"use cache"` are cached. |
| `export const dynamicParams = false` | Remove it; call `notFound()` for unknown params. |
| `generateStaticParams` returning `[]` | Return at least one param. |
| `experimental.ppr`, `experimental_ppr` | **Removed in 16.0.** `cacheComponents: true` |
| `experimental.dynamicIO`, `experimental.useCache` | **Removed in 16.0.** `cacheComponents: true` |
| `revalidateTag(tag)` | `revalidateTag(tag, 'max')`, or `updateTag(tag)` in a Server Action |
| `revalidatePath(path)` | Unchanged |

## Why it exists

The Previous Model grew out of the first App Router releases, where `fetch` was
cached by default and a route became static or dynamic depending on what the
framework detected. The defaults moved over time. Next.js 15 stopped caching
`fetch` and `GET` Route Handlers by default. That left a model where one
`cookies()` call anywhere made the whole route dynamic, and where the cache
behavior of a line of code depended on segment exports in other files.

Cache Components replaces the implicit decision with an explicit one next to the
data. It also enables Partial Prerendering by default: a static shell for the
cached and static parts of a route, with the dynamic parts streamed into it.
That is why the old per-route switches have no equivalent. A route is no longer
"static" or "dynamic"; each piece of it is. See
[The caching model](../nextjs-data-caching/caching-model.md).

## When to use it

- **Maintaining a 15.x or 16.x app with `cacheComponents` off.** Everything on
  this page still behaves as described.
- **Planning the migration.** The mapping table above is the checklist.

## When not to use it

- **New routes or new apps.** Enable `cacheComponents` from the start.
- **Routes on the Edge runtime you intend to move to Cache Components.** Cache
  Components requires Node.js, so remove the deprecated `runtime = 'edge'` export
  first.

## Basic example

### `fetch` cache options

:::tabs
== Before (Previous Model)
```tsx legacy file="app/page.tsx"
export default async function HomePage() {
  const res = await fetch('https://api.example.com/featured', {
    cache: 'force-cache',
    next: { revalidate: 3600, tags: ['featured'] },
  });
  const featured: { id: string; title: string }[] = await res.json();

  return <ul>{featured.map((item) => <li key={item.id}>{item.title}</li>)}</ul>;
}
```
== After (Next.js 16.3)
```tsx file="app/page.tsx"
import { cacheLife, cacheTag } from 'next/cache';

type Featured = { id: string; title: string };

async function getFeatured(): Promise<Featured[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('featured');

  const res = await fetch('https://api.example.com/featured');
  return res.json();
}

export default async function HomePage() {
  const featured = await getFeatured();
  return (
    <ul>
      {featured.map((item) => (
        <li key={item.id}>{item.title}</li>
      ))}
    </ul>
  );
}
```
:::

`revalidate: 3600` has no exact built-in profile. `'hours'` revalidates after one
hour and expires after a day. If you need different numbers, define a custom
profile under `cacheLife` in `next.config` or pass an object such as
`cacheLife({ revalidate: 3600 })`.

## How it works

### `unstable_cache`

`unstable_cache` wrapped a function and needed manual key parts. The bundled 16.3
docs say it has been replaced by `"use cache"`, which derives the key from the
function's arguments and closed-over values.

:::tabs
== Before (Previous Model)
```ts legacy file="lib/users.ts"
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';

export const getUser = unstable_cache(
  async (id: string) => db.user.findUnique({ where: { id } }),
  ['user'],
  { tags: ['users'], revalidate: 3600 },
);
```
== After (Next.js 16.3)
```ts file="lib/users.ts"
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

export async function getUser(id: string) {
  'use cache';
  cacheLife('hours');
  cacheTag('users', `user-${id}`);
  return db.user.findUnique({ where: { id } });
}
```
:::

> [!WARNING]
> **Persistence differs.** The `fetch` Data Cache and `unstable_cache` persisted
> entries across deployments and serverless instances. `"use cache"` stores
> entries in memory by default, scoped to one deployment and lost when an
> instance is torn down. Use `"use cache: remote"` or a custom `cacheHandlers`
> entry for durable storage, and expect recomputation after each deploy.

### Route segment config

The four caching exports **fail the build** once `cacheComponents` is on. Only
`runtime` (`'nodejs'`), `maxDuration`, and the Cache-Components-only `instant`
and `prefetch` exports remain. `preferredRegion` is still accepted but the
16.3.5 docs mark it deprecated.

:::tabs
== Before (Previous Model)
```tsx legacy file="app/news/page.tsx"
export const dynamic = 'force-static';
export const revalidate = 600;
export const fetchCache = 'default-cache';

export default async function NewsPage() {
  const res = await fetch('https://api.example.com/news');
  const news: { id: string; headline: string }[] = await res.json();
  return <ul>{news.map((n) => <li key={n.id}>{n.headline}</li>)}</ul>;
}
```
== After (Next.js 16.3)
```tsx file="app/news/page.tsx"
import { cacheLife } from 'next/cache';

type Story = { id: string; headline: string };

export default async function NewsPage() {
  'use cache';
  cacheLife('minutes');

  const res = await fetch('https://api.example.com/news');
  const news: Story[] = await res.json();

  return (
    <ul>
      {news.map((story) => (
        <li key={story.id}>{story.headline}</li>
      ))}
    </ul>
  );
}
```
:::

### `dynamicParams` and `generateStaticParams`

`dynamicParams = false` returned a 404 for params not listed at build time.
Under Cache Components the export fails with "Route segment config
"dynamicParams" is not compatible with `nextConfig.cacheComponents`". Unlisted
params always render on request, so reject unknown ones where the data is read.
Returning `[]` from `generateStaticParams` also becomes an error, because Next.js
needs at least one param to prerender and validate the static shell.

:::tabs
== Before (Previous Model)
```tsx legacy file="app/store/[slug]/page.tsx"
export const dynamicParams = false;

export async function generateStaticParams() {
  return [];
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <h1>{slug}</h1>;
}
```
== After (Next.js 16.3)
```tsx file="app/store/[slug]/page.tsx"
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { cacheLife } from 'next/cache';

type Product = { slug: string; name: string };

async function getProduct(slug: string): Promise<Product | null> {
  'use cache';
  cacheLife('days');
  const res = await fetch(`https://api.example.com/products/${slug}`);
  return res.ok ? res.json() : null;
}

export async function generateStaticParams() {
  const res = await fetch('https://api.example.com/products?top=10');
  const products: Product[] = await res.json();
  return products.map((product) => ({ slug: product.slug }));
}

async function ProductDetails({ params }: Pick<PageProps<'/store/[slug]'>, 'params'>) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();
  return <h1>{product.name}</h1>;
}

export default function ProductPage({ params }: PageProps<'/store/[slug]'>) {
  return (
    <Suspense fallback={<p>Loading product…</p>}>
      <ProductDetails params={params} />
    </Suspense>
  );
}
```
:::

Awaiting `params` inside the `<Suspense>` boundary, rather than at the top of the
page, lets an unlisted slug still get a prerendered shell.

### `unstable_noStore` and request-time data

`noStore()` opted a component out of caching. Under Cache Components nothing is
cached unless you ask, so delete it. If work must run on every request and not
be prerendered, await `connection()` (from `next/server`) or, for synchronous
values such as `new Date()`, `io()` (from `next/cache`, 16.3.0) inside a
`<Suspense>` boundary.

:::tabs
== Before (Previous Model)
```tsx legacy file="app/clock/page.tsx"
import { unstable_noStore as noStore } from 'next/cache';

export default function ClockPage() {
  noStore();
  return <p>{new Date().toISOString()}</p>;
}
```
== After (Next.js 16.3)
```tsx file="app/clock/page.tsx"
import { Suspense } from 'react';
import { io } from 'next/cache';

async function ServerTime() {
  await io();
  return <p>{new Date().toISOString()}</p>;
}

export default function ClockPage() {
  return (
    <Suspense fallback={<p>Loading time…</p>}>
      <ServerTime />
    </Suspense>
  );
}
```
:::

In the Previous Model, reading `cookies()`, `headers()` or `searchParams` made
the whole route dynamic. Under Cache Components it only makes the component that
reads them dynamic, which is why those reads must sit inside `<Suspense>`.

### `GET` Route Handlers

In the Previous Model a `GET` handler was dynamic (since 15.0) unless it exported
`dynamic = 'force-static'`. Under Cache Components, `GET` handlers prerender when
they read no uncached or request-time data. The directive cannot go on the `GET`
export itself, so move the data read into a cached helper.

:::tabs
== Before (Previous Model)
```ts legacy file="app/api/categories/route.ts"
export const dynamic = 'force-static';

export async function GET() {
  const res = await fetch('https://api.example.com/categories');
  return Response.json(await res.json());
}
```
== After (Next.js 16.3)
```ts file="app/api/categories/route.ts"
import { cacheLife } from 'next/cache';

async function getCategories(): Promise<string[]> {
  'use cache';
  cacheLife('days');
  const res = await fetch('https://api.example.com/categories');
  return res.json();
}

export async function GET() {
  return Response.json(await getCategories());
}
```
:::

### On-demand revalidation

Tagging moves from `next.tags` to `cacheTag`. `revalidatePath` is unchanged.
`revalidateTag` now requires a second argument, and `updateTag` gives Server
Actions read-your-writes semantics. `updateTag` also works with the Previous
Model, so you can adopt it before migrating.

:::tabs
== Before (Previous Model)
```ts legacy file="app/api/webhooks/cms/route.ts"
import { revalidateTag } from 'next/cache';

export async function POST() {
  revalidateTag('featured');
  return Response.json({ revalidated: true });
}
```
== After (Next.js 16.3)
```ts file="app/api/webhooks/cms/route.ts"
import { revalidateTag } from 'next/cache';

export async function POST() {
  revalidateTag('featured', 'max');
  return Response.json({ revalidated: true });
}
```
:::

`updateTag` throws outside a Server Action, so webhooks and Route Handlers keep
`revalidateTag`. See [Revalidation](../nextjs-data-caching/revalidation.md).

### The Partial Prerendering flags

Next.js 15 canaries shipped PPR behind `experimental.ppr` (`true` or
`'incremental'` with a per-route `experimental_ppr` export), and a separate
`experimental.dynamicIO` flag for the "dynamic by default" behavior. **All three
were removed in 16.0** and folded into `cacheComponents`. The upgrade guide warns
that 16's PPR works differently from the 15 canaries.

:::tabs
== Before (Next.js 15 canary)
```ts legacy file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: 'incremental',
    dynamicIO: true,
    useCache: true,
  },
};

export default nextConfig;
```
```tsx legacy file="app/feed/page.tsx"
export const experimental_ppr = true;

export default function FeedPage() {
  return <h1>Feed</h1>;
}
```
== After (Next.js 16.3)
```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```
```tsx file="app/feed/page.tsx"
export default function FeedPage() {
  return <h1>Feed</h1>;
}
```
:::

`npx @next/codemod@latest remove-experimental-ppr .` removes the segment export.

## Common patterns

### The migration, route by route

The bundled guide, *Migrating to Cache Components*, drives the move with
validation in `next dev`. Summarized:

1. **Upgrade to Next.js 16** (see [Next.js 15 to 16](./next-15-to-16.md)) and
   enable `cacheComponents: true`.
2. **Replace every `dynamic`, `revalidate`, `fetchCache` and `dynamicParams`
   export** using the table at the top. The build fails until you do.
3. **Opt out what is not ready.** Add `export const instant = false` to a segment
   to defer its validation, or run the 16.3 codemod that adds it everywhere:

   ```bash
   npx @next/codemod@canary cache-components-instant-false ./app
   ```

   `instant = false` does not make a route dynamic, and it does not clear
   synchronous IO errors: `new Date()`, `Math.random()` and `crypto.randomUUID()`
   during prerender still fail. Fix those first with `io()` or `connection()`
   inside `<Suspense>`.
4. **Convert one route at a time.** Remove its `instant = false`, then follow
   each insight in the dev overlay: cache the data with `"use cache"`, or wrap
   request-time reads in `<Suspense>`.
5. **Handle the special surfaces**: `generateStaticParams` returning at least one
   param, `generateMetadata` using `"use cache"` for external data, and client
   hooks such as `usePathname` or `useSearchParams` inside `<Suspense>` where the
   route has unknown params.
6. **Check UI state.** Cache Components keeps recently visited routes mounted in
   a hidden `<Activity>`, so `useState`, open dropdowns and form values survive
   back navigation. Reset what used to rely on unmounting.

A migrated segment that still needs a temporary opt-out looks like this:

```tsx file="app/dashboard/layout.tsx"
import type { ReactNode } from 'react';

// TODO: remove once the dashboard's uncached reads sit inside <Suspense>.
export const instant = false;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <section>{children}</section>;
}
```

`React.cache` keeps working for deduplication within a render. Each
`"use cache"` function has its own React cache scope, though, so a value
preloaded in one cached function is not shared with another. See
[Caching in React](../data-fetching/caching.md).

## Common mistakes

- **Flipping `cacheComponents` on without removing segment exports.** The build
  fails on every route that still exports `dynamic`, `revalidate`, `fetchCache`
  or `dynamicParams`.
- **Wrapping the whole page in `"use cache"` when it reads cookies.** Request
  data cannot be read inside a cached scope. Read it outside and pass the value
  in, or split the component.
- **Assuming `"use cache"` persists like the Data Cache did.** It is in memory
  per deployment by default.
- **Keeping `unstable_cache` key arrays "for safety".** `"use cache"` keys come
  from arguments; an argument you forgot to pass is a stale-data bug, not a key
  problem.
- **Using `instant = false` to silence `new Date()` errors.** It does not; move the
  call behind `io()` or `connection()`.
- **Replacing `dynamicParams = false` with nothing.** Unknown slugs then render
  instead of 404ing. Call `notFound()`.

## Related topics

- [The caching model](../nextjs-data-caching/caching-model.md) — how Cache
  Components works, as the target of this migration.
- [use cache](../nextjs-data-caching/use-cache.md) — the directive, cache keys and
  serialization rules.
- [cacheLife and cacheTag](../nextjs-data-caching/cache-life-and-tags.md) — the
  replacements for `revalidate` and `tags`.
- [Caching in React](../data-fetching/caching.md) — React's `cache`, which still
  deduplicates within a render.
- [Next.js 16.2 to 16.3](./next-16-2-to-16-3.md) — the Instant Navigations flags
  that build on Cache Components.
