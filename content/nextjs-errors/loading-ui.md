---
title: Loading UI
description: Choose between loading.tsx and inline Suspense boundaries, and understand how each affects navigation, prefetching, layout shift and the static shell.
group: nextjs-errors
order: 40
status: current
related: [nextjs-errors/error-boundaries, nextjs-rendering/streaming, nextjs-instant-navigations/overview, data-fetching/suspense]
---

## Overview

Next.js gives you two ways to show a loading state while a Server Component
waits for data:

- **`loading.tsx`**, a file convention. Next.js wraps the route segment's page in
  a `<Suspense>` boundary and uses the file's component as the fallback.
- **An inline `<Suspense>`** that you place yourself around any component.

Both are the same React primitive. What Suspense is, when it activates, and how
boundaries reveal are covered on the React [Suspense](../data-fetching/suspense.md)
page. This page covers what the file convention adds, and how to choose where
boundaries go in a Next.js app.

| | `loading.tsx` | Inline `<Suspense>` |
|---|---|---|
| Scope | The whole page of a segment, and nested segments | Exactly the subtree you wrap |
| Setup | Add a file | Wrap components in code |
| On navigation | Its fallback is prefetched and shown immediately | Part of the page's own render |
| Best for | Pages that show nothing useful until their data resolves | Most pages, where some content is ready before the rest |

## Why it exists

Server rendering has a waiting problem. Without a boundary, a navigation to a
dynamic route shows nothing new until the server has rendered the entire page,
so a slow query makes the click feel ignored.

`loading.tsx` exists so every route can have an **instant loading state** with
one file: a skeleton that appears the moment the user clicks, while shared
layouts stay interactive and the navigation stays interruptible. Inline
`<Suspense>` exists because a whole-page skeleton is usually too coarse. Most
pages have a heading, filters, or cached content that is ready immediately.

## When to use it

- Use **`loading.tsx`** when the page has no meaningful content until its data
  arrives, and you want a guaranteed instant fallback on every navigation to it.
- Use **inline `<Suspense>`** around each independently slow region, so the rest
  of the page renders without waiting for it.
- Use **both**: a light `loading.tsx` as a safety net, and inline boundaries
  inside the page for finer streaming once the page itself renders.

## When not to use it

- **To show a fallback for data read in the same segment's layout.** `loading.tsx`
  sits below `layout.tsx`, so it cannot cover it. Wrap the layout's slow part in its
  own `<Suspense>`, or move the fetch into the page.
- **Around fast, synchronous content.** A boundary does not make rendering faster.
  A fallback that flashes for 50 ms is worse than no fallback.
- **As a substitute for an error boundary.** Suspense handles pending, not
  failure. Pair it with [`error.tsx` or catchError](./error-boundaries.md).

## Basic example

A route with a `loading.tsx`:

```tsx file="app/orders/loading.tsx"
export default function OrdersLoading() {
  return (
    <main aria-busy="true">
      <h1>Orders</h1>
      <div style={{ height: 480 }} className="skeleton" />
    </main>
  );
}
```

```tsx file="app/orders/page.tsx"
import { connection } from 'next/server';
import { getOrders } from '@/lib/orders';

export default async function OrdersPage() {
  await connection();
  const orders: { id: string; total: string }[] = await getOrders();

  return (
    <main>
      <h1>Orders</h1>
      <ul style={{ minHeight: 480 }}>
        {orders.map((order) => (
          <li key={order.id}>
            {order.id}: {order.total}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

Clicking a link to `/orders` shows `OrdersLoading` immediately, then swaps in the
page when `getOrders()` resolves. The skeleton repeats the heading and reserves
the list's height, so nothing moves when the swap happens.

The same wait with an inline boundary keeps the heading out of the fallback
entirely:

```tsx file="app/orders/history/page.tsx"
import { Suspense } from 'react';
import { connection } from 'next/server';
import { getOrders } from '@/lib/orders';

async function OrderList() {
  await connection();
  const orders: { id: string; total: string }[] = await getOrders();
  return (
    <ul>
      {orders.map((order) => (
        <li key={order.id}>
          {order.id}: {order.total}
        </li>
      ))}
    </ul>
  );
}

export default function OrderHistoryPage() {
  return (
    <main>
      <h1>Order history</h1>
      <Suspense fallback={<div style={{ height: 480 }} className="skeleton" />}>
        <OrderList />
      </Suspense>
    </main>
  );
}
```

The [error boundaries example app](../../examples/nextjs/error-boundaries/README.md)
has both versions running side by side (`/dashboard` and `/feed`).

## How it works

### What `loading.tsx` wraps

In a route segment, Next.js nests the special files in this order:

```text
<Layout>                  layout.tsx       not wrapped: renders before the fallback can show
  <Template>              template.tsx     not wrapped
    <ErrorBoundary>       error.tsx        not wrapped
      <Suspense fallback={<Loading />}>    loading.tsx
        <NotFoundBoundary>                 not-found.tsx
          <Page />                         page.tsx, or a nested segment's layout
```

`loading.tsx` wraps `page.tsx`, `not-found.tsx`, and every **nested** segment.
It does **not** wrap the `layout.tsx`, `template.tsx` or `error.tsx` in its own
folder. Two consequences:

- The layout stays on screen and interactive while the page loads. That is the
  point: navigation within a section keeps the section's chrome.
- If the layout itself awaits uncached or request-time data, such as `cookies()`,
  `headers()` or an uncached fetch, `loading.tsx` cannot show a fallback for it.
  Without Cache Components, the navigation blocks until the layout finishes. With
  Cache Components, that access must be wrapped in its own `<Suspense>` inside the
  layout, or the build reports an error.

```tsx file="app/orders/layout.tsx"
import { Suspense } from 'react';
import { cookies } from 'next/headers';

async function CurrencySwitcher() {
  const cookieStore = await cookies();
  const currency = cookieStore.get('currency')?.value ?? 'USD';
  return <p>Prices in {currency}</p>;
}

export default function OrdersLayout({ children }: LayoutProps<'/orders'>) {
  return (
    <section>
      <Suspense fallback={<p>Prices in ...</p>}>
        <CurrencySwitcher />
      </Suspense>
      {children}
    </section>
  );
}
```

### Navigation and prefetching

- **The fallback is prefetched.** When a `<Link>` to the route is prefetched, the
  loading UI comes with it, so the click shows it with no server round trip.
  Navigation is immediate unless that prefetch has not finished yet.
- **Dynamic routes are partially prefetched.** Without Cache Components, Next.js
  skips prefetching a dynamic route, unless it has a `loading.tsx`, in which case
  the shared layouts and the loading skeleton are prefetched.
- **Navigation is interruptible.** The user can click elsewhere before the page
  finishes loading.

### With Cache Components: boundaries define the static shell

With `cacheComponents: true`, `next build` prerenders every route up to its
Suspense boundaries. Everything that completes during prerendering, plus the
**fallbacks** of boundaries around uncached or request-time work, becomes the
**static shell**. The shell is served instantly, and the suspended content streams
in at request time.

That changes how you should think about `loading.tsx`:

- `loading.tsx` is treated as an ordinary `<Suspense>` boundary, not a special
  prefetch marker.
- When the prerenderer finds uncached work, it looks for the **nearest** Suspense
  boundary above it. If there is none, the build fails with a blocking route error.
- A `loading.tsx` high in the tree satisfies that search, but then the whole page
  becomes its fallback, and the static shell contains a skeleton where it could
  have contained your real heading, filters, and cached content.

So under Cache Components, prefer inline `<Suspense>` placed close to the uncached
access. It keeps the most real content in the shell.

```tsx file="app/products/page.tsx"
import { Suspense } from 'react';
import { cacheLife } from 'next/cache';
import { cookies } from 'next/headers';
import { getCatalog, getRecentlyViewed } from '@/lib/catalog';

async function Catalog() {
  'use cache';
  cacheLife('hours');
  const products: { id: string; name: string }[] = await getCatalog();
  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  );
}

async function RecentlyViewed() {
  const cookieStore = await cookies();
  const items: { id: string; name: string }[] = await getRecentlyViewed(cookieStore.get('visitor')?.value);
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}

export default function ProductsPage() {
  return (
    <main>
      {/* Static: in the shell. */}
      <h1>Products</h1>
      {/* Cached: in the shell. */}
      <Catalog />
      {/* Request-time: the fallback is in the shell, the list streams in. */}
      <Suspense fallback={<p>Loading your recently viewed items...</p>}>
        <RecentlyViewed />
      </Suspense>
    </main>
  );
}
```

> [!NOTE]
> **Opt-in (16.3).** Instant Navigations extend this model to client-side
> navigations and prefetching. They need `cacheComponents: true` and
> `partialPrefetching: true`, and these behaviors are slated to become the default
> in a future major version. See
> [Instant Navigations](../nextjs-instant-navigations/overview.md).

### Status codes

A rendered fallback starts the streamed response, and the status code is sent with
the first chunk. After a `loading.tsx` or inline fallback has rendered, a
`notFound()` or `redirect()` further down can no longer change the `200` status.
See [notFound and redirect](./not-found-and-redirect.md).

## Caching implications

- A fallback is rendered at build time when it is part of a prerendered static
  shell, so it must not read request data. Keep fallbacks static.
- Wrapping cached content in `<Suspense>` does not make it dynamic. A boundary only
  matters for work that cannot complete during prerendering.
- Caching the slow part with `"use cache"` often removes the need for a fallback
  entirely, because the result is already in the shell. See the
  [caching model](../nextjs-data-caching/caching-model.md).

## Common patterns

### Avoiding layout shift from `loading.tsx`

A `loading.tsx` fallback is swapped for the real page in one step, so any
difference in size or structure shows up as a jump:

- **The skeleton is shorter than the page.** Content below it jumps down when the
  page arrives. Reserve the height the real content will take.
- **The page renders chrome that the fallback does not.** If `page.tsx` renders the
  section title and tabs, the fallback shows none, and they pop in with the data.
  Move that chrome into `layout.tsx`, which stays on screen, or repeat it in the
  fallback.
- **One `loading.tsx` serves many nested routes.** A parent `loading.tsx` also
  covers nested segments, so a list-shaped skeleton can appear before a
  detail page. Add a closer `loading.tsx`, or use inline boundaries in the page.

### Nested boundaries for layered loading

Nest boundaries so content appears from the outside in: the frame first, the main
data next, the slowest extras last. React reveals nested boundaries in that order
and batches reveals that land close together, as described on the React
[Suspense](../data-fetching/suspense.md#reveal-order-and-throttling) page.

## Common mistakes

**Expecting `loading.tsx` to cover a slow layout.** It sits below the layout in
the same folder. Wrap the layout's slow component in `<Suspense>`, or move the
fetch into the page.

**One `loading.tsx` at the top of the app.** Every route then shows a full-page
skeleton, and under Cache Components the static shell loses all real content.
Place boundaries near the slow work.

**Fallbacks that do not match the page's shape.** The swap causes a visible layout
shift. Size fallbacks like the content they replace.

**Testing streaming with a tiny page in Safari.** Some browsers buffer a streamed
response until it exceeds about 1024 bytes, so a "hello world" page appears not to
stream. Real pages are not affected.

**Placing `notFound()` after a fallback and expecting a 404.** The response is
already `200` once streaming starts.

**No error boundary around a boundary that can fail.** A rejected fetch skips the
loading fallback and goes to the nearest error boundary. Put
[`error.tsx` or catchError](./catch-error.md) above it.

## Related topics

- [Suspense (React)](../data-fetching/suspense.md) — what activates a boundary,
  reveal order, and transitions.
- [Streaming](../nextjs-rendering/streaming.md) — how Next.js streams HTML chunk by
  chunk along Suspense boundaries.
- [Instant Navigations](../nextjs-instant-navigations/overview.md) — the opt-in
  16.3 model that prefetches loading shells for any route.
- [Error boundaries in Next.js](./error-boundaries.md) — `error.tsx`, which sits
  directly outside `loading.tsx` in a segment.
- [Caching model](../nextjs-data-caching/caching-model.md) — how `"use cache"`
  moves content into the static shell so it needs no fallback.
