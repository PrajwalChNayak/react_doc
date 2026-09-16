---
title: Static and Dynamic Rendering
description: How Cache Components decides, component by component, what is prerendered into the static shell and what renders at request time.
group: nextjs-rendering
order: 50
status: current
since: "16.0"
related: [nextjs-data-caching/caching-model, nextjs-data-caching/use-cache, nextjs-rendering/streaming, server-react/static-generation]
---

## Overview

With `cacheComponents` enabled, Next.js does not ask whether a **route** is
static or dynamic. It asks the question of every component. At build time it
renders each route and keeps everything that can finish without a request. That
output is the **static shell**. Anything that needs the request, or needs fresh
data, renders at request time and streams into the shell behind a `<Suspense>`
fallback.

Two rules decide where each piece lands:

- Code is **dynamic by default**. Uncached data fetches and request APIs run at
  request time. Nothing is cached unless you say so with `"use cache"`.
- Everything that is **not** waiting on dynamic work is prerendered. Static
  markup, predictable computation and `"use cache"` results go into the shell.

Next.js calls this split **Partial Prerendering (PPR)**, and it is the default
behavior under Cache Components. The React primitive underneath, `prerender()`
returning a postponed state, is described in
[Static generation](../server-react/static-generation.md).

## Why it exists

Route-level rendering forces an all-or-nothing choice. A product page that is
static except for a "Hi, Dana" greeting has to be fully dynamic, or has to fetch
the greeting on the client after load.

Component-level rendering removes that choice. The product details are cached
and prerendered, the greeting streams in, and the user sees real content from
the first byte. Caching also becomes explicit: you opt a function or component
in with `"use cache"`, instead of opting out of implicit caches you did not
know were there.

## When to use it

Enable Cache Components for new App Router apps and for apps that want
instant first paints with personalized or fresh sections. It is a single flag:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

Cache Components requires the Node.js runtime. The Edge runtime is deprecated,
and routes that still export `runtime = 'edge'` must drop that export.

## When not to use it

If an existing app depends on the previous model (route segment config such as
`dynamic`, `revalidate`, `fetchCache` and `dynamicParams`), those exports are
removed when `cacheComponents` is on. Plan the migration rather than flipping
the flag. See [the pre-16 caching model](../nextjs-migration/pre-16-caching-model.md).

## Basic example

One page, three kinds of content:

```tsx file="app/menu/page.tsx"
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

type Dish = { id: string; name: string; priceCents: number };

export default function MenuPage() {
  return (
    <main>
      {/* Static: prerendered */}
      <h1>Tonight&apos;s menu</h1>

      {/* Cached: prerendered, refreshed on its own schedule */}
      <DishList />

      {/* Request-time: fallback in the shell, content streamed */}
      <Suspense fallback={<p>Checking your table…</p>}>
        <TableGreeting />
      </Suspense>
    </main>
  );
}

async function DishList() {
  'use cache';
  cacheLife('hours');
  cacheTag('menu');

  const dishes: Dish[] = await db.dish.findMany({ orderBy: { name: 'asc' } });

  return (
    <ul>
      {dishes.map((dish) => (
        <li key={dish.id}>
          {dish.name}: ${(dish.priceCents / 100).toFixed(2)}
        </li>
      ))}
    </ul>
  );
}

async function TableGreeting() {
  const cookieStore = await cookies();
  const table = cookieStore.get('table')?.value;

  return <p>{table ? `Welcome, table ${table}.` : 'Ask your server for a table code.'}</p>;
}
```

At build time, Next.js renders the heading, runs `DishList` and stores its
output, and renders the `TableGreeting` fallback. That is the shell. At request
time only `TableGreeting` runs. Reading `cookies()` here does **not** make the
whole route dynamic, which is what it did in the previous model.

## How it works

### What each kind of code does during prerendering

| Code | During prerender | Where it ends up |
|---|---|---|
| Static JSX, props, pure computation | Completes | Shell |
| Module imports, synchronous file reads, synchronous database drivers | Completes | Shell |
| `"use cache"` function or component | Runs and caches | Shell, unless its lifetime is too short (below) |
| Uncached `fetch` or async database query | Does not complete | Needs a `<Suspense>` boundary; fallback in the shell |
| `await cookies()`, `await headers()` | Stops | Needs a boundary |
| `await searchParams` | Stops | Needs a boundary |
| `await params` for values not in `generateStaticParams` | Stops | Needs a boundary |
| `await connection()` from `next/server` | Stops until a real request | Needs a boundary |
| `await io()` from `next/cache` (16.3) | Stops during prerender | Needs a boundary |
| `Math.random()`, `Date.now()`, `crypto.randomUUID()` | Rejected unless guarded | Guard with `io()` / `connection()`, or capture with `"use cache"` |

`<Suspense>` itself does not make anything dynamic. A component inside a
boundary that only does synchronous work still completes and lands in the shell.

### Missing boundaries are errors

When dynamic work has no Suspense boundary above it, Next.js reports a
**blocking route** in the dev overlay and fails `next build`. The fix is one of:

- wrap the component (or move the access) into `<Suspense>`
- cache the work with `"use cache"`
- for random values and timestamps, decide between a value per request
  (`io()` or `connection()`) and a value shared by everyone (`"use cache"`)

The check exists so every route keeps producing a shell. A route that silently
became fully dynamic would lose its instant first paint without anyone noticing.

### Short cache lifetimes become holes

A `"use cache"` scope with `revalidate: 0` or an `expire` under 5 minutes is
excluded from prerendering and resolves at request time, so it needs a boundary
too. Of the built-in `cacheLife` profiles, only `seconds` falls into this
category. Profiles and tags are covered in
[cacheLife and cacheTag](../nextjs-data-caching/cache-life-and-tags.md).

### `io()` versus `connection()`

Both keep the code after them out of the shell. The difference shows up with
prefetching:

- `await io()` suspends like any async call. The code after it can still be
  cached with `"use cache"` and included in a prefetch. Prefer it for random
  values, timestamps and synchronous database drivers.
- `await connection()` waits for a real user request, so it also blocks
  prefetches. Use it when the work must happen per request.

```tsx file="app/menu/specials-clock.tsx"
import { io } from 'next/cache';

export async function SpecialsClock() {
  await io();
  const closesAt = new Date();
  closesAt.setHours(22, 0, 0, 0);
  const minutesLeft = Math.max(0, Math.round((closesAt.getTime() - Date.now()) / 60000));

  return <p>Specials end in {minutesLeft} minutes.</p>;
}
```

Render `<SpecialsClock />` inside `<Suspense>`. Without `io()`, `new Date()`
would either be frozen into the shell at build time or rejected as an unguarded
timestamp.

## Server and client implications

- **Client Components prerender too.** A Client Component outside any boundary
  is rendered to HTML at build time. If it reads `Date.now()` during render, call
  `use(io())` first, so the value is not frozen into the shell.
- **Bots get a different response.** HTML-limited crawlers skip the shell and get
  the page rendered at request time, so metadata can go in `<head>`. See
  [streaming](./streaming.md).
- **Navigation keeps state.** With Cache Components, Next.js hides routes you
  navigate away from with `<Activity>` instead of unmounting them. See
  [Client Components in Next.js](./client-components.md).

## Caching implications

The shell is stored as prerendered HTML plus an RSC Payload, which a CDN can
serve for direct visits and the router can use for navigations. `"use cache"`
results inside it are refreshed according to their `cacheLife`, and can be
invalidated with tags.

At request time, a `"use cache"` entry that is not part of the shell (for
example, one that depends on a cookie value passed as an argument) is cached in
memory per server instance by default. On serverless platforms that memory does
not survive between invocations. The storage options are covered in
[the caching model](../nextjs-data-caching/caching-model.md).

## Common patterns

### Pass request values into cached functions

A cached function cannot read `cookies()` or `headers()` itself. Read the value
outside, then pass it in. The argument becomes part of the cache key:

```tsx file="app/menu/allergen-notice.tsx"
import { cookies } from 'next/headers';
import { cacheLife } from 'next/cache';
import { getAllergenNotice } from '@/lib/allergens';

export async function AllergenNotice() {
  const cookieStore = await cookies();
  const dietaryProfile = cookieStore.get('dietary-profile')?.value ?? 'none';

  return <CachedAllergenNotice dietaryProfile={dietaryProfile} />;
}

async function CachedAllergenNotice({ dietaryProfile }: { dietaryProfile: string }) {
  'use cache';
  cacheLife('hours');

  const notice: string = await getAllergenNotice(dietaryProfile);
  return <aside>{notice}</aside>;
}
```

`AllergenNotice` still reads a cookie, so render it inside `<Suspense>`. The
expensive lookup is shared by everyone with the same profile.

### Push dynamic reads down the tree

A layout that awaits `params` or `cookies()` at the top cannot be prerendered.
Pass the promise to the component that needs the value and await it there,
inside a boundary. Everything around it, including `children`, stays in the
shell. [Streaming](./streaming.md) has the full example.

### Prerender known parameter values

For dynamic segments, `generateStaticParams` provides values that are known at
build time, so `await params` completes for those URLs. See
[prerendering](./prerendering.md).

## Common mistakes

**Expecting `fetch` to be cached.** Under Cache Components nothing is cached
implicitly. An uncached `fetch` runs at request time and needs a boundary.
Add `"use cache"` to the function that calls it.

**Reading `cookies()` inside a `"use cache"` scope.** It throws, and so does any
helper called from that scope that reads request data. Read outside and pass the
value in.

**Wrapping everything in one boundary at the root.** It clears the build errors
and empties the shell. Put boundaries next to the dynamic access.

**Using `Date.now()` in the shell and expecting it to tick.** Prerendered output
is fixed at build time. Use `io()` for per-request values.

**Carrying route segment config across.** `export const dynamic` and
`export const revalidate` are removed under Cache Components. Express the same
intent with `"use cache"`, `cacheLife` and boundaries.

**Assuming a boundary makes a component dynamic.** Only the dynamic work inside
it does. Synchronous content inside a boundary is still prerendered.

## Related topics

- [Caching model](../nextjs-data-caching/caching-model.md): where cached output
  is stored and how it is refreshed.
- [`use cache`](../nextjs-data-caching/use-cache.md): cache keys, constraints and
  pass-through arguments.
- [Streaming in Next.js](./streaming.md): how the shell and the streamed parts
  reach the browser.
- [Prerendering](./prerendering.md): `generateStaticParams`, first-request
  rendering and static exports.
- [Static generation (React)](../server-react/static-generation.md): the React
  `prerender` and postponed-state APIs that PPR is built on.
