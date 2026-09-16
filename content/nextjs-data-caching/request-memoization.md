---
title: Request memoization
description: How Next.js deduplicates identical fetch calls within one render, when to use React cache() for everything else, and why neither is "use cache".
group: nextjs-data-caching
order: 50
status: current
related: [data-fetching/caching, nextjs-data-caching/use-cache, nextjs-data-caching/fetching-data]
---

## Overview

**Memoization** means that within one server render pass, the same data request
runs once, however many components ask for it. Next.js gives you two ways to get
it:

- **`fetch`**: `GET` requests with the same URL and options are memoized
  automatically across layouts, pages, Server Components, `generateMetadata`,
  `generateViewport` and `generateStaticParams`.
- **React's `cache()`**: wrap any other async data access, such as an ORM query,
  to get the same behavior. How `cache()` works is explained on the React
  [Caching](../data-fetching/caching.md) page. This page covers what Next.js
  adds around it.

Memoization is **not caching**. It ends when the render ends, and a second
request starts from nothing. Persistent caching is `"use cache"`.

## Why it exists

A route in the App Router is a tree of layouts and pages that render in
parallel. The layout needs the current user for the header, the page needs it
for permissions, and `generateMetadata` needs it for the title. Without
memoization that is three identical queries.

Memoization lets each component fetch what it needs where it needs it, instead
of loading everything at the top and threading it through props. That keeps
components independent, which matters more in Next.js than in a single-component
tree, because a layout and a page cannot pass props to each other.

## When to use it

- **Any data read called from more than one place in a route**: the current
  user, the current organization, a record named by `params`.
- **Preloading.** Starting a request early and reading it later only avoids a
  second request if the function is memoized. See
  [Fetching data](./fetching-data.md).
- **Uncached, per-request reads** where `"use cache"` is wrong but duplicate
  work is still wasteful.

## When not to use it

- **To make repeat visits faster.** That needs [`"use cache"`](./use-cache.md).
- **In Route Handlers.** `fetch` memoization does not apply there, because a
  Route Handler is not part of the React component tree.
- **Around writes.** A memoized mutation does not run the second time.
- **To pass data into a `"use cache"` scope.** React's `cache()` is isolated
  inside it (see below).

## Basic example

```ts file="lib/current-user.ts"
import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

// One query per request, however many components ask.
export const getCurrentUser = cache(async () => {
  const sessionId = (await cookies()).get('session')?.value;
  if (!sessionId) return null;
  return db.session.findUser(sessionId);
});
```

```tsx file="app/settings/layout.tsx"
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/current-user';

async function AccountBadge() {
  const user = await getCurrentUser();
  return <span>{user ? user.name : 'Guest'}</span>;
}

export default function SettingsLayout({ children }: LayoutProps<'/settings'>) {
  return (
    <div>
      <header>
        <Suspense fallback={<span>…</span>}>
          <AccountBadge />
        </Suspense>
      </header>
      {children}
    </div>
  );
}
```

```tsx file="app/settings/page.tsx"
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/current-user';

async function EmailSettings() {
  // Same request as the layout's AccountBadge: no second query.
  const user = await getCurrentUser();
  if (!user) return <p>Sign in to change your settings.</p>;
  return <p>Notifications go to {user.email}</p>;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p>Loading settings…</p>}>
      <EmailSettings />
    </Suspense>
  );
}
```

`getCurrentUser` is uncached on purpose: it depends on the session. Each request
runs one session query, shared by the layout and the page.

## How it works

### `fetch` memoization

Next.js extends the server-side `fetch` so that `GET` requests with the same URL
and options, made during one render pass, share one network call and one
response.

```tsx file="app/weather/page.tsx"
import { Suspense } from 'react';

type Forecast = { city: string; highC: number; summary: string };

async function getForecast(city: string): Promise<Forecast> {
  const response = await fetch(`https://weather.example.com/forecast/${encodeURIComponent(city)}`);
  return response.json();
}

async function Headline() {
  const forecast = await getForecast('Lisbon');
  return <h1>{forecast.summary}</h1>;
}

async function Details() {
  // Same URL and options as Headline: memoized, one request.
  const forecast = await getForecast('Lisbon');
  return <p>High of {forecast.highC}°C</p>;
}

export default function WeatherPage() {
  return (
    <Suspense fallback={<p>Loading forecast…</p>}>
      <Headline />
      <Details />
    </Suspense>
  );
}
```

To opt a single request out, pass an `AbortController` signal. A request with
its own signal is not deduplicated.

### React `cache()` in Next.js

Everything the React page says about `cache()` holds: wrap once at module scope,
key on primitives, errors are cached, and the cache resets for every server
request. Next.js adds three things to know:

- **It covers every part of a route render**, including `generateMetadata` and
  the layouts and pages that render in parallel.
- **It is isolated inside `"use cache"`.** Values stored with `cache()` outside a
  cached scope are not visible inside it, and two separate cached functions do
  not share a `cache()` result. Pass data into a cached function as arguments.
- **It is the right tool for request-scoped data.** A function that reads
  `cookies()`, such as `getCurrentUser` above, cannot use plain `"use cache"`,
  and should not be cached across users anyway.

### Memoization, `"use cache"` and `"use cache: private"`

| | Memoization (`fetch`, `cache()`) | `"use cache"` | `"use cache: private"` |
|---|---|---|---|
| Lifetime | One render pass | Until `revalidate` / `expire` or a tag invalidation | One request on the server; `stale` in the browser |
| Shared between users | No | Yes, by cache key | No |
| Can read `cookies()` / `headers()` | Yes | No | Yes |
| Puts results in the static shell | No | Yes, if long-lived | No |
| Visible across `"use cache"` scopes | No | Yes | Yes, within one request |

The last row is why `"use cache: private"` exists in this comparison. When a
helper reads request data and one cached function needs to reuse work another
started, React's `cache()` cannot bridge them. The 16.3 migration guide suggests
`"use cache: private"` with `cacheLife({ stale: Infinity })`, which deduplicates
within the request without lowering the route's client stale time and without
storing anything on the server.

## Server and client implications

- **Server only.** `fetch` memoization and `cache()` apply to server rendering.
  In Client Components, use a data library, or `useMemo` for render-scoped
  computation.
- **Nothing crosses to the browser.** A memoized value is not sent to the client
  unless a component renders it or passes it as a prop.

## Caching implications

- **Memoization does not make a route static.** An uncached `fetch` is still
  dynamic work that must be inside `<Suspense>` or `"use cache"`.
- **In development, the HMR cache can reuse `fetch` responses** across hot
  reloads, including uncached ones. A full page reload or navigation clears it.
  This is a development convenience, not memoization or caching in production.

## Common patterns

### A data access layer with memoized readers

Put every read the UI needs behind functions in one module, each wrapped in
`cache()` if it is request-scoped, or marked `"use cache"` if it is shared. Pages
and layouts then call whatever they need without coordinating. The
[data access layer](../nextjs-auth/data-access-layer.md) page builds this for
authorization.

### Cache the shared part, memoize the personal part

```ts file="lib/pricing.ts"
import { cache } from 'react';
import { cookies } from 'next/headers';
import { cacheLife, cacheTag } from 'next/cache';

type PriceList = { currency: string; prices: Record<string, number> };

// Shared across users: persistent cache, keyed by currency.
async function getPriceList(currency: string): Promise<PriceList> {
  'use cache';
  cacheLife('hours');
  cacheTag('prices');
  const response = await fetch(`https://pricing.example.com/lists/${encodeURIComponent(currency)}`);
  return response.json();
}

// Per request: memoized, because it reads a cookie.
export const getVisitorPrices = cache(async () => {
  const currency = (await cookies()).get('currency')?.value ?? 'USD';
  return getPriceList(currency);
});
```

Components call `getVisitorPrices()` freely. The cookie is read once per
request, and the price list is fetched once per currency per cache lifetime.

## Common mistakes

**Expecting memoization to persist between requests.** Every request starts
empty. Use `"use cache"` for cross-request reuse.

**Relying on `fetch` memoization in a Route Handler.** It does not apply there.

**Calling `cache()` inside a component or a function body.** Each call creates a
new, empty cache. Wrap once at module scope.

**Expecting a `cache()` value set outside `"use cache"` to be visible inside
it.** Cached scopes have an isolated React cache. Pass arguments.

**Varying `fetch` options between call sites.** A different header or option
means a different request, and no deduplication.

**Wrapping a `"use cache"` function in `cache()` to "double cache" it.** A cached
function already reuses its result within a render and across requests.

## Related topics

- [Caching (React)](../data-fetching/caching.md): how `cache()` and
  `cacheSignal()` work, which this page does not repeat.
- [use cache](./use-cache.md): persistent caching, and the `"use cache: private"`
  variant.
- [Fetching data](./fetching-data.md): preloading and parallel fetching, which
  depend on memoization.
- [Server Components (React)](../server-react/server-components.md): the render
  model memoization is scoped to.
- [The caching model](./caching-model.md): where memoization sits among the
  other layers.
