---
title: Data fetching overview
description: Choose how to load data in a React 19 app, from Server Components down to a plain Effect.
group: data-fetching
order: 10
status: current
related: [data-fetching/libraries, data-fetching/suspense, data-fetching/fetching-in-effects, server-react/server-components]
---

## Overview

React does not ship a data-fetching solution, and it does not pretend to. There
is no `useFetch`, no built-in cache, no router-level loader. What React 19 gives
you is a set of **primitives** — `use`, `<Suspense>`, transitions, `cache()` on
the server — that a framework or a data library builds a solution on top of.

So the first question is not "which hook do I call". It is "who owns the cache".
This page answers that, in order of preference.

| | Where it runs | Cache | Dedupes | Revalidates | Extra dependency |
|---|---|---|---|---|---|
| Server Components | Server | Per request (`cache()`) plus your framework's | Yes | Framework | Framework required |
| Data library | Client | Yes, keyed, GC'd | Yes | Yes | Third-party |
| `use()` + Suspense | Client | Whatever you supply | Only if your cache does | No | None |
| `useEffect` | Client | None | No | Manual | None |

## Why it exists

React's rendering model is synchronous and re-entrant. A component can render
many times, be interrupted, be thrown away, and be rendered again — none of
which is compatible with a component owning a network request.

Every workable answer therefore moves the request **out** of the component:
onto the server, into a cache keyed by something stable, or into a promise
created before the render begins. The options below differ mainly in who
maintains that outside-of-React thing.

## When to use it

Work down this list and stop at the first option that fits.

### 1. Fetch on the server, if you have a framework

If you use a framework with React Server Components, fetch there. The component
is an `async` function; you `await` the data and render the result. No loading
state, no client-side cache, no round trip from the browser to your database
through your own API layer.

```jsx static="Server Components require a framework with an RSC bundler."
import { getProject } from './db/projects.js';

export default async function ProjectPage({ params }) {
  const project = await getProject(params.projectId);

  return (
    <article>
      <h2>{project.name}</h2>
      <p>{project.summary}</p>
    </article>
  );
}
```

This is the smallest amount of machinery for the largest class of problems. The
data never crosses the network as JSON; the rendered output does. See
[Server Components](../server-react/server-components.md).

The catch is real, though: it requires a framework. React does not provide a
bundler or router that can do this.

### 2. Use a data library, if you fetch on the client

For a client-rendered app — Vite, a SPA, an existing codebase — reach for
TanStack Query, SWR, or RTK Query. They are **third-party libraries, not part of
React**, and they exist because the hard part of data fetching is not the fetch.
It is the cache.

```jsx static="Requires a QueryClientProvider and a real endpoint."
import { useQuery } from '@tanstack/react-query';

export default function ProjectPanel({ projectId }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      return response.json();
    },
  });

  if (isPending) return <p>Loading project…</p>;
  if (isError) return <p role="alert">{error.message}</p>;

  return <h2>{data.name}</h2>;
}
```

Compare that with the equivalent Effect below. The library version is shorter,
but that is not the point — the point is that it also dedupes concurrent
requests for the same key, keeps the previous data while refetching, retries,
revalidates on window focus, and garbage-collects entries nobody is rendering.
See [data libraries](./libraries.md).

### 3. `use()` with a Suspense-aware cache

If you want loading states expressed as boundaries in the tree rather than
booleans in every component, and you do not want a library, you can read a
promise directly with [`use`](../hooks/use.md).

The constraint is unavoidable: **the promise must be cached** so the same
instance comes back on every render. React 19 gives you the reader, not the
cache. You supply the cache — and a module-level `Map` is a cache the way a
shoebox is a filing system.

Use this when the data is loaded once and never invalidated: a configuration
document, a translation bundle, a static content file. See
[use with promises](./use-with-promises.md).

### 4. `useEffect`, as the option of last resort

Fetching in an Effect is the only option that needs nothing outside React. It is
also the one that gets written wrong most often, because everything it does not
do is your job:

- **Waterfalls.** The Effect runs after the component mounts. A child that
  fetches after its parent mounts starts its request one render later, serially.
- **No cache.** Navigate away and back, and you refetch. Two components that
  need the same record issue two requests.
- **No deduplication.** Rapid dependency changes fire overlapping requests.
- **Race conditions.** Responses can arrive out of order. Without cleanup, the
  slower, older response wins and renders stale data.
- **No revalidation.** Nothing refreshes on focus, on reconnect, or on an
  interval unless you write it.
- **Loading and error state in every component.** Three `useState` calls that
  you copy and paste, and get subtly wrong once.

None of that means "never". A one-off widget in an app with no data layer is
fine. But write it correctly — see
[fetching in Effects](./fetching-in-effects.md), which covers cleanup,
cancellation and why StrictMode's double mount is doing you a favor.

> [!BEST-PRACTICE]
> If you find yourself building a `useFetch` hook with a cache, a stale timer and
> a refetch API, stop. You are writing TanStack Query with fewer tests.

## When not to use it

None of these four is the right tool for data you already have.

- **Derived values** do not need fetching or caching. Compute them during
  render. See [useMemo](../hooks/use-memo.md).
- **Form submissions and mutations** are actions, not queries. Use
  [`useActionState`](../hooks/use-action-state.md) and
  [`useOptimistic`](../hooks/use-optimistic.md).
- **Subscriptions to an external store** — a WebSocket, a browser API, a
  third-party state container — belong in
  [`useSyncExternalStore`](../hooks/use-sync-external-store.md), not in a fetch.

## Basic example

The same feature, written both ways, so the difference is concrete.

With a library:

```jsx static="Requires a QueryClientProvider and a real endpoint."
import { useQuery } from '@tanstack/react-query';

export default function IncidentCount() {
  const { data, isPending } = useQuery({
    queryKey: ['incidents', 'open'],
    queryFn: () => fetch('/api/incidents?status=open').then(r => r.json()),
    staleTime: 30_000,
  });

  return <p>{isPending ? 'Counting…' : `${data.count} open incidents`}</p>;
}
```

With an Effect, written correctly:

```jsx static="Calls a real endpoint, so there is no browser preview."
import { useEffect, useState } from 'react';

export default function IncidentCount() {
  const [count, setCount] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch('/api/incidents?status=open', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        const body = await response.json();
        setCount(body.count);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            loadError instanceof Error ? loadError.message : 'Request failed'
          );
        }
      }
    }

    load();
    return () => controller.abort();
  }, []);

  if (errorMessage) return <p role="alert">{errorMessage}</p>;
  return <p>{count === null ? 'Counting…' : `${count} open incidents`}</p>;
}
```

The second version is correct and still has no cache, no dedupe, no
revalidation, and no shared state with any other component that needs the same
number.

## How it works

Three React 19 mechanisms sit underneath every option above.

**Suspending.** A component that reads a pending promise with `use` throws a
signal React understands. React shows the nearest `<Suspense>` fallback and
retries when the promise settles. Libraries opt into this; Effects cannot,
because an Effect runs after render.

**Transitions.** An update marked with `startTransition` may suspend without
replacing already-visible content with a fallback. This is what makes
navigation feel instant rather than blank. See
[useTransition](../hooks/use-transition.md).

**Server rendering and streaming.** On the server, Suspense boundaries stream:
React sends the shell, then patches in each boundary's content as its data
resolves. Since **19.2**, those reveals are batched over a short window so that
content arriving close together appears together, matching client behavior.

## Common patterns

### Preload, then render

The single largest win in any of these approaches is starting the request
earlier. Fetch on the event that makes the data inevitable — a route match, a
hover, a click — not in the component that displays it.

```jsx static="Illustrates request timing against a real endpoint."
import { Suspense, use, useState } from 'react';

const reportCache = new Map();

function loadReport(reportId) {
  if (!reportCache.has(reportId)) {
    reportCache.set(
      reportId,
      fetch(`/api/reports/${reportId}`).then(response => response.json())
    );
  }
  return reportCache.get(reportId);
}

function Report({ reportPromise }) {
  const report = use(reportPromise);
  return <h2>{report.title}</h2>;
}

export default function ReportLauncher() {
  const [reportPromise, setReportPromise] = useState(null);

  return (
    <div>
      <button
        // Warm the cache on hover; the click then reads a settled promise.
        onMouseEnter={() => loadReport('q3')}
        onClick={() => setReportPromise(loadReport('q3'))}
      >
        Open Q3 report
      </button>
      {reportPromise ? (
        <Suspense fallback={<p>Loading report…</p>}>
          <Report reportPromise={reportPromise} />
        </Suspense>
      ) : null}
    </div>
  );
}
```

### Fetch above, read below

Whatever the mechanism, keep the request in one place — a route loader, a Server
Component, a query hook at the top of a feature — and pass data down. Components
that each fetch their own slice produce waterfalls by construction.

### Mutations are a separate concern

Queries read; actions write. Do not model a form submission as a refetch. Submit
with an action, then invalidate the query key (library) or re-render the server
route (RSC).

## Common mistakes

**Building your own cache.** The first version is 40 lines. The version that
handles two components mounting at once, a component unmounting mid-flight,
stale-while-revalidate, and cache eviction is a library.

**Fetching in a child that its parent could have fetched.** Each level of the
tree that starts its own request adds a full round trip to time-to-content.

**Treating `use()` as a replacement for a data library.** It replaces the
*reading*, not the caching. Without a real cache you have moved the problem, not
solved it.

**Putting server data into global client state.** Server data is a cache with a
freshness policy, not application state. Redux and Zustand model the second
well; use RTK Query or a query library for the first. See
[choosing an approach](../state-management/choosing-an-approach.md).

**Ignoring the RSC security floor.** If you render React on a server with an
RSC-capable bundler, pin `react` and `react-dom` to **19.2.4 or later** — earlier
patches for the Server Components advisories were incomplete. Examples on this
site use **19.2.8**.

## Related topics

- [Suspense](./suspense.md) — what actually triggers a fallback, and where to
  place boundaries.
- [use with promises](./use-with-promises.md) — the rules for reading a promise
  during render.
- [Fetching in Effects](./fetching-in-effects.md) — how to do it correctly when
  you must.
- [Data libraries](./libraries.md) — TanStack Query, SWR and RTK Query compared.
- [Server Components](../server-react/server-components.md) — the option to
  prefer when it is available.
- [Caching](./caching.md) — `cache()`, `cacheSignal()` and HTTP caching.
