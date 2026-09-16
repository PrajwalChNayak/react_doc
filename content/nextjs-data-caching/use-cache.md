---
title: use cache
description: Mark a file, component or function as cacheable, and understand its cache key, serialization rules and private and remote variants.
group: nextjs-data-caching
order: 20
status: current
since: "16.0"
related: [nextjs-data-caching/caching-model, nextjs-data-caching/cache-life-and-tags, server-react/directives, data-fetching/suspense]
---

## Overview

`"use cache"` is a Next.js directive that caches the return value of an async
function or component. You can place it at three levels:

| Level | Where the directive goes | What gets cached |
|---|---|---|
| File | First line of a module | Every exported function, each with its own entries |
| Component | First line of an async component | The rendered output for each set of props |
| Function | First line of an async function | The return value for each set of arguments |

It needs `cacheComponents: true` in `next.config.ts` (see
[The caching model](./caching-model.md)). Functions and components that use it
must be `async`.

It looks like React's `"use client"` and `"use server"`, but it is not a React
directive. Next.js's compiler implements it. See
[Directives](../server-react/directives.md) for the two React ones.

## Why it exists

Server Components already let you `await` data in render. What they do not tell
the framework is **which results are safe to reuse**. `"use cache"` is that
declaration. Next.js can then store the result, include it in the static shell,
send it with prefetches, and skip the work next time.

A directive instead of a wrapper function also means Next.js can derive the
cache key for you. You do not write keys by hand, so you cannot forget an
input.

## When to use it

- **Data shared by many visitors**: a product catalog, a blog post, a list of
  categories.
- **Expensive computation** over data that changes rarely, such as reports or
  aggregates.
- **UI that would otherwise sit outside the static shell** because it awaits
  something slow.

## When not to use it

- **Per-user data read from cookies or headers.** Plain `"use cache"` cannot read
  them. Read the value outside and pass it in, or see `"use cache: private"`
  below.
- **Data that must be fresh on every request**, such as stock levels at
  checkout. Leave it uncached behind `<Suspense>`.
- **Mutations.** Caching a write means it silently does not run the second time.
- **Values that are not serializable**, such as class instances. See
  [Serialization](#serialization).

## Basic example

```ts file="lib/catalog.ts"
import { cacheLife, cacheTag } from 'next/cache';

export type Category = { slug: string; name: string };

export async function getCategories(): Promise<Category[]> {
  'use cache';
  cacheLife('days');
  cacheTag('categories');

  const response = await fetch('https://api.example.com/categories');
  if (!response.ok) {
    throw new Error(`Categories request failed with ${response.status}`);
  }
  return response.json();
}
```

Every Server Component that calls `getCategories()` shares one entry. The first
call runs the `fetch`. Later calls, in the same render or in later requests,
reuse the stored result until the `days` profile or a `categories` tag
invalidation says otherwise.

We recommend a `cacheLife` call in every `"use cache"` scope. Without one, the
`default` profile applies, and the lifetime is no longer visible where the cache
is declared. See [cacheLife and cacheTag](./cache-life-and-tags.md).

## How it works

### Cache keys

Next.js builds each entry's key from:

1. **The build ID**, or `deploymentId` when configured. A new deploy therefore
   starts with empty caches.
2. **The function ID**, a hash of the function's location and signature.
3. **The serialized arguments**: props for components, arguments for functions.
4. **An HMR refresh hash**, in development only, so edits invalidate entries.

Values the function **closes over** from an outer scope are captured and bound
as arguments, so they are part of the key too:

```tsx file="app/components/order-history.tsx"
import { cacheLife } from 'next/cache';

type Order = { id: string; total: number };

export async function OrderHistory({ accountId }: { accountId: string }) {
  async function getOrders(status: 'open' | 'closed') {
    'use cache';
    cacheLife('minutes');
    // Key includes accountId (closure) and status (argument).
    const response = await fetch(
      `https://api.example.com/accounts/${encodeURIComponent(accountId)}/orders?status=${status}`,
    );
    const orders: Order[] = await response.json();
    return orders;
  }

  const open = await getOrders('open');
  return <p>{open.length} open orders</p>;
}
```

When a cached function reads [root params](../nextjs-routing/root-params.md),
only the ones it reads become part of its key.

### Serialization

Arguments and return values must be serializable, and they use two different
systems. Arguments follow the rules for Server Function arguments. Return values
follow the rules for props passed to Client Components, which also allow JSX.
Both come from React; see
[Server Components](../server-react/server-components.md#serialization-rules).

| Allowed | Not allowed |
|---|---|
| Primitives, plain objects, arrays | Class instances |
| `Date`, `Map`, `Set`, typed arrays, `ArrayBuffer` | Functions, except as pass-through |
| JSX, as a return value | Symbols, `WeakMap`, `WeakSet` |
| React elements and Server Actions, as pass-through arguments | `URL` instances |

**Pass-through** means the cached function receives a value it does not
inspect. A cached layout can accept `children` or a Server Action and place it in
its output. The entry does not depend on what was passed, so dynamic children
inside a cached wrapper stay dynamic.

```tsx file="app/components/product-shell.tsx"
import type { ReactNode } from 'react';
import { cacheLife } from 'next/cache';

type ProductSummary = { name: string; description: string };

export async function ProductShell({ productId, children }: { productId: string; children: ReactNode }) {
  'use cache';
  cacheLife('hours');

  const response = await fetch(`https://api.example.com/products/${encodeURIComponent(productId)}`);
  const product: ProductSummary = await response.json();

  return (
    <article>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      {/* Not read here, so not part of the key: it can be dynamic. */}
      {children}
    </article>
  );
}
```

### What a cached scope cannot read

A cached function runs in an isolated environment:

- **`cookies()`, `headers()` and `searchParams` are not allowed**, including in
  helpers the cached function calls. On a dynamically rendered route the error
  can appear under `next start` even though `next build` passed. Read the value
  outside and pass it as an argument.
- **`connection()` is not allowed** in any cache variant.
- **`draftMode()` is the exception.** You can read `isEnabled` inside a cached
  scope. When Draft Mode is on, cached functions re-execute on every request
  and their results are not stored. Calling `enable()` or `disable()` inside a
  cached scope throws.
- **React's `cache()` is isolated.** Values stored with `cache()` outside a
  `"use cache"` scope are not visible inside it. Pass data in as arguments. See
  [Request memoization](./request-memoization.md).

```tsx file="app/account/page.tsx"
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife } from 'next/cache';

async function getRecommendations(segment: string) {
  'use cache';
  cacheLife('hours');
  const response = await fetch(`https://api.example.com/recommendations?segment=${encodeURIComponent(segment)}`);
  const titles: string[] = await response.json();
  return titles;
}

async function Recommendations() {
  // Read request data outside the cache...
  const segment = (await cookies()).get('segment')?.value ?? 'general';
  // ...and pass the value in, so it becomes part of the key.
  const titles = await getRecommendations(segment);
  return (
    <ul>
      {titles.map((title) => (
        <li key={title}>{title}</li>
      ))}
    </ul>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<p>Loading recommendations…</p>}>
      <Recommendations />
    </Suspense>
  );
}
```

Keying on a low-cardinality value such as a segment or a language, rather than a
user ID, means many visitors share one entry.

### Interaction with `<Suspense>`

`"use cache"` and `<Suspense>` are the two ways to satisfy Cache Components'
validation, and they combine:

- A cached component **outside** any boundary is prerendered into the static
  shell, as long as its lifetime is not too short.
- A cached function called **after** a request-time read, as in
  `Recommendations` above, cannot be prerendered, because its input is not known
  at build time. It sits inside the `<Suspense>` boundary, and at request time
  it still hits the cache.
- A short-lived cache (the `seconds` profile, `revalidate: 0`, or `expire` under
  five minutes) is excluded from prerendering and becomes a dynamic hole. Wrap
  it in `<Suspense>`.

For the underlying React behavior, see [Suspense](../data-fetching/suspense.md).

### Where entries are stored

On the server, entries live in an in-memory LRU cache by default and respect the
profile's `revalidate` and `expire` times. How useful that is at runtime depends
on where you deploy:

| Environment | Runtime cache behavior |
|---|---|
| Self-hosted, long-running server | Entries persist across requests. `cacheMaxMemorySize` limits the size. |
| Serverless | Entries typically do not persist across requests, because requests reach different instances. Build-time entries in the shell still work. |

In the browser, content is kept for the profile's `stale` time, with a minimum
of 30 seconds.

## Server and client implications

- **Import from a Client Component.** When the directive is at the top of a
  file, a Client Component can import its exported functions and call them.
  They run on the server, like a Server Function. Prefer calling them from
  Server Components and passing results down as props.
- **Caching is per deployment, not per user.** Every visitor whose inputs
  produce the same key receives the same output. Treat the arguments as the
  complete description of who may see the result.
- **Development logs.** Console output from cached functions is replayed with a
  `Cache` prefix. Set `NEXT_PRIVATE_DEBUG_CACHE=1` for verbose cache logging.

## Caching implications

### `"use cache: private"`

`"use cache: private"` shipped with Cache Components in **16.0**. It lets a
function read `cookies()`, `headers()` and `searchParams` inside the cached
scope.

Its result is **never stored in a server cache across requests**. Matching calls
within one request can share it, and the browser can keep the rendered output
for the `stale` time. It runs at request time and is not part of the static
shell. You cannot configure a cache handler for it.

```tsx file="app/dashboard/page.tsx"
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife, cacheTag } from 'next/cache';

type Notification = { id: string; message: string };

async function getNotifications() {
  'use cache: private';
  cacheLife({ stale: 60 });
  cacheTag('notifications');

  const session = (await cookies()).get('session')?.value;
  const response = await fetch('https://api.example.com/notifications', {
    headers: { authorization: `Bearer ${session ?? ''}` },
  });
  const notifications: Notification[] = await response.json();
  return notifications;
}

async function Notifications() {
  const notifications = await getNotifications();
  return (
    <ul>
      {notifications.map((notification) => (
        <li key={notification.id}>{notification.message}</li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p>Loading notifications…</p>}>
      <Notifications />
    </Suspense>
  );
}
```

The docs position it as the exception: reach for it when refactoring the request
read out of the function is impractical, or when compliance requires that
request-specific data never enter a server cache. A `stale` of at least 30
seconds is needed for per-link prefetching to include it.

### `"use cache: remote"`

`"use cache: remote"` also shipped in **16.0**. It stores entries through the
`remote` [cache handler](#custom-cache-handlers) instead of per-instance memory,
so every server instance shares them.

It has the same restrictions as `"use cache"`: no `cookies()` or `headers()`
inside. It costs a network round trip per lookup and, on most platforms, storage
fees, so it pays off only with a high hit rate. Good fits are rate-limited APIs,
slow or expensive backends, and flaky upstream services whose results you read
at request time.

```tsx file="app/components/exchange-rates.tsx"
import { connection } from 'next/server';
import { cacheLife, cacheTag } from 'next/cache';

type Rates = Record<string, number>;

async function getRates(base: string): Promise<Rates> {
  'use cache: remote';
  cacheLife({ expire: 600 });
  cacheTag('exchange-rates');

  const response = await fetch(`https://rates.example.com/latest?base=${encodeURIComponent(base)}`);
  return response.json();
}

export async function ExchangeRates() {
  await connection();
  const rates = await getRates('USD');
  return <p>1 USD = {rates.EUR} EUR</p>;
}
```

### Comparing the three

| | `"use cache"` | `"use cache: remote"` | `"use cache: private"` |
|---|---|---|---|
| Server storage | In memory, or the `default` handler | The `remote` handler | None |
| Shared by | All visitors with the same key | All visitors, across instances | One browser |
| Reads `cookies()` / `headers()` | No, pass values in | No, pass values in | Yes |
| Built for | The static shell and shared data | Request-time reads shared across instances | Personalized request-time data |
| Extra cost | None | Storage and a lookup round trip | None |
| Survives a deploy | No | No | Not applicable |

Nesting rules: a remote cache can be nested inside `"use cache"` or another
remote cache. Private and remote caches cannot be nested inside each other.

### Custom cache handlers

`cacheHandlers` in `next.config.ts` points the `default` handler (used by
`"use cache"`) and the `remote` handler (used by `"use cache: remote"`) at your
own implementation. You can also register additional named handlers and use
them as `"use cache: <name>"`. Most apps do not need this; hosting platforms
usually provide the `remote` handler. Self-hosting details are in
[Caching and CDNs](../nextjs-deployment/caching-and-cdn.md).

## Common patterns

### Cache a whole module

```ts file="lib/reports.ts"
'use cache';

import { cacheLife } from 'next/cache';

export async function getMonthlyRevenue(month: string) {
  cacheLife('days');
  const response = await fetch(`https://reports.example.com/revenue?month=${encodeURIComponent(month)}`);
  const report: { month: string; totalCents: number } = await response.json();
  return report;
}

export async function getTopProducts() {
  cacheLife('days');
  const response = await fetch('https://reports.example.com/top-products');
  const products: { id: string; name: string }[] = await response.json();
  return products;
}
```

Every export must be async, including framework exports such as
`generateMetadata` in a page file.

### Cache a route segment

A `page` or `layout` file is a module too. Each segment is cached independently,
so to prerender a whole route, add the directive to the page, the layout and any
parallel route slots. A cached layout does not cache the `children` it renders.

## Common mistakes

**Calling `cookies()` inside `"use cache"`.** It fails with the
`next-request-in-use-cache` error. Read it outside and pass the value in.

**Passing a request-time promise into a cached function.** Awaiting a `params`
or `cookies()` promise inside the cache makes the build wait for data that
cannot resolve. It times out after 50 seconds with "Filling a cache during
prerender timed out". Await outside, pass the value.

**Sharing promises through a module-level `Map`** between cached and uncached
code. The cached side can pick up a request-time promise and hang the build in
the same way.

**Caching per-user data under a key that does not include the user.** Everyone
then sees the first visitor's result.

**Returning a class instance.** It cannot be serialized. Return plain objects.

**Using `"use cache: remote"` for keys that are unique per request**, such as
search filters or user IDs. The hit rate is near zero and every lookup adds
latency.

**Expecting an entry to survive a deploy.** The build ID is part of every key.

## Related topics

- [The caching model](./caching-model.md): where `"use cache"` fits among static,
  cached and dynamic content.
- [cacheLife and cacheTag](./cache-life-and-tags.md): the lifetime and tags you
  set inside every cached scope.
- [Revalidation](./revalidation.md): invalidating entries after the data
  changes.
- [Directives (React)](../server-react/directives.md): `"use client"` and
  `"use server"`, which `"use cache"` sits alongside.
- [Suspense (React)](../data-fetching/suspense.md): the boundary that holds
  dynamic work a cache cannot cover.
- [Server Components (React)](../server-react/server-components.md): the
  serialization rules cached arguments and return values follow.
