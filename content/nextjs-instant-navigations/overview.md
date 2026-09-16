---
title: Instant Navigations
description: The opt-in Next.js 16.3 suite that shows a prefetched shell the moment a user clicks a link, while dynamic content streams in.
group: nextjs-instant-navigations
order: 10
status: opt-in
since: "16.3"
related: [nextjs-instant-navigations/partial-prefetching, nextjs-instant-navigations/link-prefetching, nextjs-instant-navigations/devtools, data-fetching/suspense]
---

## Overview

A navigation is **instant** when the browser starts rendering the new page the
moment the user clicks. Static content, cached content and `<Suspense>`
fallbacks appear right away, and the server streams the rest into those
fallbacks.

Next.js 16.3 ships a suite of features built around that goal:

| Feature | What it does | Read more |
|---|---|---|
| Partial Prefetching | A `<Link>` prefetches one reusable **App Shell** per route instead of prefetching every link separately. | [Partial Prefetching](./partial-prefetching.md) |
| Per-link prefetching | `<Link prefetch={true}>` also resolves cached content that depends on that link's `params` or `searchParams`. | [Link prefetching](./link-prefetching.md) |
| Improved ISR | A URL that was not prerendered at build time serves an instant shell on its first visit, then upgrades in the background. | [ISR](../nextjs-data-caching/isr.md) |
| Instant Insights | Development-time validation that reports navigations that would block, with suggested fixes. | [DevTools](./devtools.md) |
| Navigation Inspector | A DevTools panel that pauses a page load or client navigation at its shell. | [DevTools](./devtools.md) |
| `instant()` | A Playwright helper from `@next/playwright` that asserts what is visible before dynamic data arrives. | [Instant navigation tests](../nextjs-testing/instant-navigation-tests.md) |

> [!NOTE]
> **Opt-in (16.3).** Instant Navigations (Partial Prefetching, improved ISR,
> Instant Insights, the Navigation Inspector and the `instant()` Playwright
> helper) are off unless you enable `cacheComponents` and `partialPrefetching`.
> These behaviors are slated to become the default in a future major version of
> Next.js. They are not the default in 16.3.

## Why it exists

Server Components let apps ship less JavaScript and avoid client-side network
waterfalls. The cost was that a click often waited on the server before
anything changed on screen, so apps felt less responsive than client-rendered
single-page apps, which can paint a loading state immediately.

Before 16.3, the fix was a `loading.tsx` file per route. It was too common to miss
one, and a single missing file meant a blocking navigation. The other option,
`<Link prefetch={true}>`, prefetched the whole destination, including uncached
dynamic content. That was aggressive and expensive, and many apps ended up
with neither.

Instant Navigations move the loading state into the component tree. Any
`<Suspense>` fallback, and any content cached with `"use cache"`, can become
part of a shell that Next.js extracts per route and sends to the browser before
the click. The development tools then tell you when a route cannot be instant,
and a test helper stops a refactor from quietly making it slow again.

## When to use it

- New App Router projects on 16.3. There are no legacy full prefetches to
  migrate, so you can turn both flags on from the start.
- Apps already on Cache Components whose navigations block on data, show a
  blank screen after a click, or rely on a `loading.tsx` in every route.
- Dynamic, personalized apps (dashboards, feeds, stores) where most content is
  request-specific but the page structure is predictable.
- Routes with many links to the same destination, such as product grids, where
  per-link prefetching multiplied server work.

## When not to use it

- **The app does not use Cache Components.** `partialPrefetching` requires
  `cacheComponents: true`. Without it, `next dev` and `next build` throw at
  config validation. Adopt Cache Components first; it changes caching for every
  route. See [The caching model](../nextjs-data-caching/caching-model.md).
- **The app depends on route segment exports from the previous model.**
  `export const dynamic`, `revalidate`, `fetchCache` and `dynamicParams` are
  removed when `cacheComponents` is on, so they must be migrated first.
- **The app runs on the Edge runtime.** The Edge runtime is deprecated, and
  Cache Components requires the Node.js runtime.
- **You have many `<Link prefetch={true}>` calls and no time to review them.**
  Enabling Partial Prefetching changes what those links download. Review them
  first, or adopt one route at a time (see
  [Partial Prefetching](./partial-prefetching.md)).
- **The Pages Router.** These features are App Router only.

## Basic example

Enable both flags:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
```

Then structure a route so that part of it can be shown immediately. This
product page has a cached part (name and price) and a dynamic part (live
inventory). Each has its own `<Suspense>` boundary:

```tsx file="app/store/[slug]/page.tsx"
import { Suspense } from 'react';
import { connection } from 'next/server';
import { cacheLife } from 'next/cache';
import { db } from '@/lib/db';

type Params = PageProps<'/store/[slug]'>['params'];

export default function ProductPage({ params }: PageProps<'/store/[slug]'>) {
  return (
    <article>
      <Suspense fallback={<p>Loading product…</p>}>
        <ProductInfo params={params} />
      </Suspense>
      <Suspense fallback={<p>Checking inventory…</p>}>
        <Inventory params={params} />
      </Suspense>
    </article>
  );
}

async function getProduct(slug: string) {
  'use cache';
  cacheLife('hours');
  return db.products.findBySlug(slug);
}

async function ProductInfo({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  return (
    <>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </>
  );
}

async function Inventory({ params }: { params: Params }) {
  const { slug } = await params;
  await connection(); // always fresh: render at request time
  const item = await db.inventory.findBySlug(slug);
  return <p>{item.count} in stock</p>;
}
```

A link to this page, `<Link href="/store/trail-runner" prefetch={true}>`,
prefetches the shell and the cached product. On click, the name and price
render at once and "Checking inventory…" marks where the count will stream in.

The runnable version, with Playwright tests that assert exactly this, is in
[the instant-navigations example](../../examples/nextjs/instant-navigations/README.md).

## How it works

### Two kinds of shell

A **direct visit** receives the route's **static shell** as HTML: everything
static or cached, plus the fallbacks of `<Suspense>` boundaries around dynamic
work. This is Partial Prerendering, which Cache Components turns on.

A **client navigation** only re-renders below the layout that the current and
destination routes share. So a `<Suspense>` boundary in the root layout can
cover a page load but not a navigation between two pages under `/store`. The
shell for a navigation is the destination's **App Shell**: the route's output
that does not depend on URL data, prefetched by `<Link>`.

That difference is why a route can load instantly and still navigate slowly,
and why the tooling checks both cases.

### What decides the shell

Two primitives, both covered elsewhere, decide what lands in a shell:

- **`"use cache"`** gives an async function's result a lifetime, which lets
  Next.js include it ahead of time. See
  [use cache](../nextjs-data-caching/use-cache.md).
- **`<Suspense>`** marks where uncached or request-time work begins. Its
  fallback goes in the shell, and the content streams in later. The React
  behavior is described in [Suspense](../data-fetching/suspense.md) and
  [Streaming](../server-react/streaming.md).

[Partial Prefetching](./partial-prefetching.md) explains the rules in detail,
including why `params` and `searchParams` must sit inside a boundary.

### Improved ISR

With both flags on, a dynamic route prerenders the params you list in
`generateStaticParams` and builds an App Shell for everything else. The first
visit to an unlisted URL gets that App Shell instantly, and Next.js renders the
page with the now-known params in the background. Later visitors get the
upgraded result from the cache. A prefetch counts as that first visit. See
[ISR](../nextjs-data-caching/isr.md).

### Validation and tooling

In development, a Cache Components app validates every page for instant
navigation and reports problems as **Instant Insights** in the dev overlay. The
**Navigation Inspector** freezes a navigation at its shell so you can see it.
Both matter because Next.js does not prefetch in development. See
[DevTools](./devtools.md).

In CI, the `instant()` helper runs your assertions while dynamic data is held
back, so a regression fails a test. See
[Instant navigation tests](../nextjs-testing/instant-navigation-tests.md).

## Server and client implications

The pages still render on the server. Nothing moves your data fetching into the
browser. What changes is **when** the browser receives the parts of a render
that do not depend on the request: before the click, as a prefetch.

Because Cache Components keeps up to three previously visited routes mounted
with React's `<Activity>`, a return visit can also restore state and DOM. See
[Activity](../performance/activity.md) for the React side.

## Caching implications

- An App Shell includes cached content only when its `stale` time is at least 5
  minutes. The built-in `default` profile and every preset except `seconds`
  qualify. Shorter-lived content streams in after the navigation.
- Routes that read `cookies()` or `headers()` get an App Shell that includes
  session data, cached per session on the client.
- Invalidating data with `revalidateTag` or `revalidatePath` refreshes the
  associated prefetches.
- A cold cache still has to be computed once, so the very first navigation to a
  route may wait.

## Common patterns

### Adopt with an agent

The official docs provide agent Skills for each step:
`next-cache-components-adoption` and `next-partial-prefetching-adoption`. The
Partial Prefetching skill installs with:

```bash
npx skills add vercel/next.js --skill next-partial-prefetching-adoption
```

Adopt Cache Components first, then Partial Prefetching. See
[AI agents](../nextjs-getting-started/ai-agents.md) for the wider workflow.

### Adopt by hand

1. Turn on `cacheComponents` and fix the validation errors it reports.
2. Review every `<Link prefetch={true}>`, because its behavior changes.
3. Turn on `partialPrefetching`, or opt routes in one at a time with
   `export const prefetch = 'partial'`.
4. Move `params` and `searchParams` reads inside `<Suspense>`.
5. Add `instant()` tests for the navigations that matter most.

### Opt a route out

Some routes are not worth making instant. `export const instant = false` on a
page or layout stops validation from reporting navigations into that segment.
See [Partial Prefetching](./partial-prefetching.md).

## Common mistakes

**Enabling `partialPrefetching` without `cacheComponents`.** Config validation
throws. Both flags are required.

**Putting `partialPrefetching` under `experimental`.** It is a top-level option
in 16.3.

**Calling these behaviors the default.** They are opt-in in 16.3. They are
slated to become the default in a future major version.

**Judging navigation speed in `next dev`.** Prefetching does not run in
development, so every dev navigation waits on the server. Use the Navigation
Inspector, or test against `next start`.

**Wrapping the whole page in one `<Suspense>` boundary.** Validation passes,
but every navigation shows a single full-page fallback. Push boundaries down to
the data that is actually slow.

**Awaiting `params` at the top of the page.** It ties the App Shell to one URL.
Pass the promise to a child inside a boundary.

## Related topics

- [Partial Prefetching](./partial-prefetching.md) — how the App Shell is built
  and how to adopt it route by route.
- [Link prefetching](./link-prefetching.md) — what each `prefetch` value
  downloads and what it costs.
- [Instant Insights and the Navigation Inspector](./devtools.md) — see and fix
  slow navigations during development.
- [Instant navigation tests](../nextjs-testing/instant-navigation-tests.md) —
  lock instant behavior in with `instant()`.
- [Suspense](../data-fetching/suspense.md) — the React boundary that defines
  every fallback in a shell.
- [Streaming](../server-react/streaming.md) — how content arrives after the
  shell.
