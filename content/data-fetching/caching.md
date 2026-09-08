---
title: Caching
description: Deduplicate work on the server with cache and cacheSignal, and understand what a client cache owes you.
group: data-fetching
order: 50
status: current
since: "19.2"
related: [data-fetching/libraries, server-react/server-components, data-fetching/use-with-promises, data-fetching/overview]
---

## Overview

"Caching" covers three unrelated layers that people routinely conflate:

| Layer | Lives | Lifetime | React's involvement |
|---|---|---|---|
| Server render memoization | Server process | One request | `cache()`, `cacheSignal()` |
| Client data cache | Browser memory | Until evicted | None — bring a library |
| HTTP cache | Browser and CDN | `Cache-Control` | None |

React ships an API for the first, deliberately ships nothing for the second, and
has nothing to do with the third. Most "why is this refetching" questions are
about the layer the asker was not thinking about.

## Why it exists

On the server, a single render tree may ask for the same record from five
different components. Without memoization that is five database round trips for
one page, and no component is in a position to know that another one already
asked.

`cache()` solves exactly that, and nothing more. It is a per-request memoization
table, not a data store. It exists because request-scoped deduplication is the
one caching problem that React can solve without inventing a policy — the
lifetime is unambiguous, because the request ends.

Client caching has no such unambiguous answer. How long is a user record fresh?
Should a background tab refetch? What invalidates after a mutation? Those are
product decisions, which is why React leaves them to
[libraries](./libraries.md).

## When to use it

- `cache()` — around any server-side data access called from more than one
  component in a render: `getUser`, `getSettings`, a `fetch` wrapper.
- `cacheSignal()` — when the work behind a `cache()` entry should stop if the
  render is aborted or has already finished.
- A client cache — the moment two components need the same server data, or the
  moment a user navigates away and back.
- `Cache-Control` — on every response your application serves. It is free and it
  is the layer with the widest reach.

## When not to use it

- **`cache()` in a Client Component.** react.dev states plainly that `cache` is
  for use in Server Components only. In a Client Component it does not memoize
  the way you expect; use `useMemo` for render-scoped work, or a data library
  for data.
- **`cache()` as a cross-request store.** React invalidates the cache for all
  memoized functions on each server request. It is not Redis.
- **`cache()` around a mutation.** Errors are cached too, and a memoized write
  that "succeeds" the second time without running is a serious bug.
- **A hand-written client cache** for anything beyond load-once data.

## Basic example

Two components need the same user. One query runs.

```jsx static="Server Components require a framework with an RSC bundler."
import { cache } from 'react';
import { db } from './db.js';

export const getUser = cache(async userId => {
  return db.users.findById(userId);
});
```

```jsx static="Server Components require a framework with an RSC bundler."
import { getUser } from './data/users.js';

async function Avatar({ userId }) {
  const user = await getUser(userId);
  return <img src={user.avatarUrl} alt="" width={32} height={32} />;
}

async function DisplayName({ userId }) {
  const user = await getUser(userId);
  return <span>{user.name}</span>;
}

export default function UserBadge({ userId }) {
  return (
    <span>
      <Avatar userId={userId} />
      <DisplayName userId={userId} />
    </span>
  );
}
```

`Avatar` and `DisplayName` each `await getUser(userId)`. The database is queried
once, because both calls hit the same memoized entry for this request.

Note that `getUser` is exported from a module. Each call to `cache()` creates a
**new** function with its own table, so wrapping the same function twice gives
you two independent caches that share nothing. Wrap once, at module scope,
and import the wrapped version everywhere.

## How it works

`cache(fn)` returns a memoized function with the same signature. React keys
entries by the arguments, using the same comparison it uses elsewhere — so
primitives work and a fresh object literal per call does not.

The documented caveats are worth reading as rules:

- React invalidates the cache for all memoized functions **for each server
  request**.
- Each call to `cache` creates a new function; calling `cache` on the same
  function twice returns memoized functions that do not share a cache.
- `cachedFn` caches **errors**. If `fn` throws for certain arguments, the same
  error is rethrown for the same arguments.
- `cache` is for use in Server Components only.

The error-caching rule is the surprising one. It is correct for a render — you
do not want six components retrying a failing query — and wrong for anything
that could succeed on a retry.

### `cacheSignal`, since 19.2

React 19.2 added `cacheSignal()` so that work started inside a cached function
can be stopped when the cache's lifetime is over.

```js
import { cache, cacheSignal } from 'react';

const dedupedFetch = cache(fetch);

async function Component() {
  await dedupedFetch(url, { signal: cacheSignal() });
}
```

`cacheSignal()` returns an `AbortSignal` when called during rendering, and
`null` otherwise. The signal aborts when the cache lifetime ends — React
finished rendering successfully, the render was aborted, or the render failed.

Its caveats, quoted:

- `cacheSignal` is currently for use in Server Components only. In Client
  Components it will always return `null`. In the future it will also be used
  for Client Components when a client cache refreshes or invalidates, so you
  should not assume it will always be `null` on the client.
- If called outside of rendering, `cacheSignal` returns `null` to make it clear
  that the current scope is not cached forever.

That second rule is why every call site needs to tolerate `null`: passing
`signal: null` to `fetch` is valid, but code that calls `signal.addEventListener`
must check first.

```js
import { cache, cacheSignal } from 'react';

export const runReport = cache(async reportId => {
  const signal = cacheSignal();

  const response = await fetch(`https://reports.internal/${reportId}`, {
    signal,
  });
  if (!response.ok) {
    throw new Error(`Report ${reportId} failed with ${response.status}`);
  }

  const rows = await response.json();

  if (signal?.aborted) {
    // Nobody is waiting for this any more; skip the expensive part.
    return null;
  }

  return summarize(rows);
});
```

The practical win is cost. A page that aborts halfway through no longer pays for
the API calls, database queries and CPU that its unfinished half had queued.

## Common patterns

### Wrap the data access, not the component

```js
import { cache } from 'react';
import { db } from './db.js';

// ✅ One wrapped accessor, imported everywhere.
export const getProject = cache(projectId => db.projects.findById(projectId));

// 🔴 Wrapping at each call site creates a separate cache each time.
// const getProjectHere = cache(projectId => db.projects.findById(projectId));
```

### Key on primitives

`cache()` compares arguments. A new object per call never hits.

```js
import { cache } from 'react';

// 🔴 `{ userId, includeArchived }` is a new object on every call.
// export const listTasks = cache(options => query(options));

// ✅ Primitives compare by value.
export const listTasks = cache((userId, includeArchived) =>
  query({ userId, includeArchived })
);
```

### What a client cache has to do

If you are tempted to write your own, this is the specification you are signing
up for:

- **Deduplicate** concurrent requests for the same key into one network call.
- **Share** one entry across every component that asks, at any depth.
- **Revalidate** on a policy — staleness window, window focus, network
  reconnect, interval.
- **Invalidate** on demand, so a mutation can mark related keys stale.
- **Keep previous data** while refetching, so the UI does not blank.
- **Garbage-collect** entries nothing is rendering, so memory is bounded.
- **Retry** transient failures with backoff, and stop retrying 404s.
- **Deduplicate across mounts**, so navigating away and back is free.
- **Survive concurrent rendering**, returning a stable value within one render.

> [!WARNING]
> The `Map` cache in [use with promises](./use-with-promises.md#advanced-example)
> does the first item on that list and none of the rest. It is fine for
> load-once data such as a translation bundle. It leaks for anything keyed by
> user input, and it will serve stale data indefinitely. Adopt
> [a library](./libraries.md) rather than growing it.

### HTTP caching, the layer people forget

Before adding a client cache, check whether the response is cacheable at all. A
correct `Cache-Control` header gets you deduplication across page loads, across
tabs, and at the CDN — none of which any React-level cache can do.

```text
Cache-Control: private, max-age=0, must-revalidate
ETag: "a1b2c3"
```

With an `ETag`, a repeat request costs a `304 Not Modified` and no body. For
genuinely static assets:

```text
Cache-Control: public, max-age=31536000, immutable
```

And for data that may be served stale while it refreshes behind the scenes:

```text
Cache-Control: public, max-age=60, stale-while-revalidate=600
```

`stale-while-revalidate` is the same idea SWR is named after, implemented one
layer down and applied to every client, including ones that never run your
JavaScript.

## Advanced example

Combining the layers on a server-rendered page: request-scoped memoization,
abortable work, and an HTTP policy the CDN can act on.

```jsx static="Server Components require a framework with an RSC bundler."
import { Suspense, cache } from 'react';

const getPricing = cache(async region => {
  const response = await fetch(`https://pricing.internal/${region}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Pricing for ${region} failed with ${response.status}`);
  }
  return response.json();
});

async function PriceTable({ region }) {
  const pricing = await getPricing(region);
  return (
    <table>
      <tbody>
        {pricing.tiers.map(tier => (
          <tr key={tier.id}>
            <td>{tier.name}</td>
            <td>{tier.monthly}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function PriceSummary({ region }) {
  // Same arguments, same request: no second network call.
  const pricing = await getPricing(region);
  return <p>Plans start at {pricing.tiers[0].monthly} per month.</p>;
}

export default function PricingPage({ region }) {
  return (
    <main>
      <Suspense fallback={<p>Loading pricing…</p>}>
        <PriceSummary region={region} />
        <PriceTable region={region} />
      </Suspense>
    </main>
  );
}
```

Two components, one upstream call. Add `signal: cacheSignal()` to the `fetch`
options — as in the JavaScript examples above — and a render that is abandoned
mid-flight stops paying for the upstream request too.

> [!NOTE]
> `@types/react` currently models `cacheSignal()`'s return value as an opaque
> `CacheSignal` rather than `AbortSignal`, so passing it straight into a typed
> `fetch` call does not type-check yet. At runtime it is an `AbortSignal`, which
> is why the examples using it on this page are plain JavaScript.

> [!NOTE]
> If you render React on a server with an RSC-capable bundler, pin `react` and
> `react-dom` to **19.2.4 or later**. The Server Components advisories fixed in
> 19.0.3 / 19.1.4 / 19.2.3 were patched incompletely; the complete fixes are in
> 19.0.4 / 19.1.5 / 19.2.4. Examples on this site use **19.2.8**.

## Common mistakes

**Using `cache()` in a Client Component.** It is Server Components only. The
symptom is a cache that never seems to hit.

**Calling `cache()` inside a component.** That creates a fresh memoized function
on every render, with an empty table. Call it once at module scope.

**Expecting `cache()` to persist between requests.** Every server request starts
with an empty cache. For cross-request caching use your framework's data cache,
an HTTP cache, or an actual cache server.

**Caching a mutation.** Errors and results are both memoized. A `createOrder`
wrapped in `cache()` will silently not run the second time.

**Passing an object as the cache key.** A new literal per call means a new entry
per call.

**Assuming `cacheSignal()` is non-null.** It returns `null` outside rendering and
in Client Components today. Use optional chaining or a guard.

**Writing your own client cache.** Read the specification above and count how
many of those nine items your version handles.

**Skipping HTTP caching entirely.** A `Cache-Control` header is one line of
server configuration and it works for every client, on every navigation, before
React is even loaded.

## Related topics

- [Data libraries](./libraries.md) — the client caches worth adopting.
- [Server Components](../server-react/server-components.md) — where `cache()`
  and `cacheSignal()` apply.
- [use with promises](./use-with-promises.md) — the minimal cache, and why it is
  minimal.
- [Data fetching overview](./overview.md) — choosing which layer you need.
- [useMemo](../hooks/use-memo.md) — render-scoped memoization on the client,
  which `cache()` is not a substitute for.
