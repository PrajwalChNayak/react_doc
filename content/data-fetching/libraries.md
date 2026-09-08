---
title: Data libraries
description: Compare TanStack Query, SWR and RTK Query, and pick the one that fits your app.
group: data-fetching
order: 60
status: current
related: [data-fetching/overview, ecosystem/redux, ecosystem/data-libraries, data-fetching/caching]
---

## Overview

TanStack Query, SWR and RTK Query are **third-party libraries. None of them is
part of React**, none is maintained by the React team, and React has no plans to
ship an equivalent. They exist because React deliberately stops at the
primitives — `use`, `<Suspense>`, transitions — and leaves the cache to you.

All three solve the same problem: server data is a **cache with a freshness
policy**, not application state. They differ in surface area and in what they
assume about the rest of your stack.

| | TanStack Query | SWR | RTK Query |
|---|---|---|---|
| Package | `@tanstack/react-query` | `swr` | `@reduxjs/toolkit/query/react` |
| Requires a provider | Yes | No (optional config) | Yes, the Redux store |
| Cache key | `queryKey` array | The key argument | Endpoint plus argument |
| Mutations | `useMutation` | `mutate` | `builder.mutation` |
| Invalidation | `invalidateQueries` | `mutate(key)` | Tag-based, automatic |
| Generated hooks | No | No | Yes, from endpoint definitions |
| DevTools | Dedicated | Via React DevTools | Redux DevTools |
| Best when | You want a full-featured cache with no other commitments | You want the smallest thing that works | You already use Redux Toolkit |

## Why it exists

Write the correct `useEffect` fetch — cleanup, cancellation, honest
dependencies, a status enum — and you still have none of this:

- One request when two components ask for the same key at the same time.
- Data still on screen while a refetch runs behind it.
- A refetch when the window regains focus or the network reconnects.
- Invalidation, so a mutation refreshes every affected view.
- Bounded memory, because entries nobody renders are collected.
- Retries with backoff for transient failures.

Each of those is a few dozen lines. Together they are a library, and building it
yourself means owning its bugs. See
[what a client cache has to do](./caching.md#common-patterns).

## When to use it

- Any client-rendered app with more than a couple of endpoints.
- Whenever two components need the same server data.
- Whenever a mutation in one place should refresh a view somewhere else.
- Whenever you catch yourself adding a `staleTime` to your own hook.

## When not to use it

- **You already fetch in Server Components.** A framework with RSC plus its
  router cache already covers the query side. Adding a client cache duplicates
  it. See [the overview](./overview.md).
- **Load-once configuration.** A module-level promise read with
  [`use`](./use-with-promises.md) is enough.
- **Client-only state.** Form drafts, modal visibility and filter selections are
  not server data. Keep them in `useState` or a store. See
  [choosing an approach](../state-management/choosing-an-approach.md).
- **WebSocket subscriptions.** Those are a store, not a query — use
  [`useSyncExternalStore`](../hooks/use-sync-external-store.md), or the
  library's own streaming API where it has one.

## Basic example

The same feature in each library, so the shapes are comparable.

### TanStack Query

```jsx static="Requires a QueryClientProvider and a real endpoint."
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';

const queryClient = new QueryClient();

async function fetchProject(projectId) {
  const response = await fetch(`/api/projects/${projectId}`);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json();
}

function ProjectPanel({ projectId }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    staleTime: 30_000,
  });

  if (isPending) return <p>Loading project…</p>;
  if (isError) return <p role="alert">{error.message}</p>;

  return <h3>{data.name}</h3>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProjectPanel projectId="platform" />
    </QueryClientProvider>
  );
}
```

The `queryKey` array is the cache identity. Two components rendering
`['project', 'platform']` share one entry and one request.

> [!NOTE]
> In TanStack Query v5 the initial loading flag is `isPending`, not `isLoading`.
> `isLoading` still exists but means "pending **and** fetching", which is a
> different thing.

### SWR

```jsx static="Calls a real endpoint, so there is no browser preview."
import useSWR from 'swr';

const fetcher = url =>
  fetch(url).then(response => {
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }
    return response.json();
  });

export default function ProjectPanel({ projectId }) {
  const { data, error, isLoading } = useSWR(
    `/api/projects/${projectId}`,
    fetcher
  );

  if (isLoading) return <p>Loading project…</p>;
  if (error) return <p role="alert">Could not load the project.</p>;

  return <h3>{data.name}</h3>;
}
```

No provider, no query client — the key *is* the URL. That minimalism is the
whole pitch. A `<SWRConfig>` provider exists when you want shared defaults, but
it is optional.

### RTK Query

```jsx static="Requires a configured Redux store and a real endpoint."
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const projectsApi = createApi({
  reducerPath: 'projectsApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/' }),
  tagTypes: ['Project'],
  endpoints: builder => ({
    getProject: builder.query({
      query: projectId => `projects/${projectId}`,
      providesTags: (result, error, projectId) => [
        { type: 'Project', id: projectId },
      ],
    }),
    renameProject: builder.mutation({
      query: ({ projectId, name }) => ({
        url: `projects/${projectId}`,
        method: 'PATCH',
        body: { name },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'Project', id: projectId },
      ],
    }),
  }),
});

export const { useGetProjectQuery, useRenameProjectMutation } = projectsApi;
```

```jsx static="Requires a configured Redux store and a real endpoint."
import { useGetProjectQuery } from './projectsApi.js';

export default function ProjectPanel({ projectId }) {
  const { data, isLoading, isError } = useGetProjectQuery(projectId);

  if (isLoading) return <p>Loading project…</p>;
  if (isError) return <p role="alert">Could not load the project.</p>;

  return <h3>{data.name}</h3>;
}
```

You describe endpoints once and RTK Query generates the hooks. Invalidation is
declarative: `renameProject` invalidates the `Project` tag, so every component
rendering that project refetches with no explicit call. See
[Redux](../ecosystem/redux.md) for store setup and the wider Redux Toolkit
story.

## How it works

The mechanics are similar across all three.

**A key identifies an entry.** Ask for the same key from ten components and you
get one entry and one in-flight request.

**Entries have a freshness state.** Fresh entries are returned without a
request. Stale entries are returned *and* revalidated in the background — the
stale-while-revalidate strategy SWR is named after.

**Subscribers are counted.** When the last component using a key unmounts, the
entry becomes inactive and is garbage-collected after a timeout. This is the
part hand-rolled caches always omit, and it is why they leak.

**Mutations invalidate.** After a write, the affected keys are marked stale and
any mounted subscriber refetches. TanStack Query and SWR make you name the keys;
RTK Query derives them from tags.

**Suspense is opt-in.** TanStack Query has `useSuspenseQuery`, and SWR has a
`suspense` option. Both integrate with [`<Suspense>`](./suspense.md) so that
loading becomes a boundary instead of a boolean. Read the library's own notes
before switching an existing app over: suspending changes where loading and
error UI must live, and a boundary in the wrong place blanks more of the page
than you intended.

**React 19 fits underneath.** These libraries handle the query side; React 19's
Actions handle the mutation side. `useActionState` for the form,
`useOptimistic` for the prediction, and the library's invalidation for the
refresh is a good division of labor.

## Common patterns

### Mutate, then invalidate

```jsx static="Requires a QueryClientProvider and a real endpoint."
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function RenameProjectButton({ projectId }) {
  const queryClient = useQueryClient();

  const rename = useMutation({
    mutationFn: async name => {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error('Rename failed');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  return (
    <button
      onClick={() => rename.mutate('Renamed project')}
      disabled={rename.isPending}
    >
      {rename.isPending ? 'Renaming…' : 'Rename'}
    </button>
  );
}
```

The mutation does not update the cache by hand. It invalidates the key and lets
the query refetch, which keeps one source of truth.

### Optimistic updates: library or React?

Both work, and they cover different scopes.

| | `useOptimistic` | Library optimistic update |
|---|---|---|
| Scope | The component holding the action | Every subscriber of the key |
| Rollback | Automatic when the action ends | Manual, in an `onError` handler |
| Needs | React 19 only | The library's cache |
| Good for | A local list, a toggle, a form | Data shown in several places |

Use [`useOptimistic`](../hooks/use-optimistic.md) when the prediction is local
to one view. Use the library's cache update when the same record appears in a
list, a header and a detail pane.

### Server data belongs in the cache, not in Redux

If you use Redux for UI state and fetch with thunks into the same store, you are
maintaining a cache by hand inside a state container. RTK Query exists precisely
to take that over, and it lives in the package you already have. See
[Redux](../ecosystem/redux.md).

## Advanced example

Suspense-integrated querying, so the loading state is a boundary and there is no
`isPending` branch in the component.

```jsx static="Requires a QueryClientProvider and a real endpoint."
import { Suspense } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

function IncidentList({ serviceId }) {
  // Suspends instead of returning a pending flag.
  const { data } = useSuspenseQuery({
    queryKey: ['incidents', serviceId],
    queryFn: () =>
      fetch(`/api/services/${serviceId}/incidents`).then(r => r.json()),
  });

  return (
    <ul>
      {data.map(incident => (
        <li key={incident.id}>{incident.title}</li>
      ))}
    </ul>
  );
}

export default function IncidentPanel({ serviceId }) {
  return (
    <ErrorBoundary fallback={<p role="alert">Could not load incidents.</p>}>
      <Suspense fallback={<p>Loading incidents…</p>}>
        <IncidentList serviceId={serviceId} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

`data` is never `undefined` here, which removes the branch that half of all
query-hook bugs live in. The trade is that this component now requires both a
`<Suspense>` and an error boundary above it — which is a better place for those
decisions anyway.

## Common mistakes

**Treating a library as part of React.** These are external dependencies with
their own release cadence, their own major versions, and their own breaking
changes. Pin them and read their upgrade guides.

**Building your own first.** The 40-line `useFetch` becomes a 400-line cache
with none of the tests.

**Unstable cache keys.** An object literal or an inline array recreated every
render defeats the cache. Key on primitives, or on a stable serialization.

**Putting client state in the query cache.** A modal's open state has no server
counterpart and no freshness policy.

**Writing to the cache by hand instead of invalidating.** Manual `setQueryData`
after every mutation drifts from the server. Invalidate; write by hand only for
optimistic updates.

**Running two caches at once.** A framework's RSC router cache plus a client
query library means two answers to "what is the current data". Pick one per kind
of data.

**Assuming v4 APIs in v5.** TanStack Query v5 renamed flags (`isPending`) and
moved to object arguments everywhere. Old blog posts will mislead you.

## Related topics

- [Data fetching overview](./overview.md) — where these libraries sit in the
  hierarchy.
- [Caching](./caching.md) — what a cache owes you, and the server-side `cache()`.
- [Redux](../ecosystem/redux.md) — RTK Query setup and the wider Redux story.
- [Ecosystem data libraries](../ecosystem/data-libraries.md) — the broader
  landscape, including GraphQL clients.
- [useOptimistic](../hooks/use-optimistic.md) — React's own optimistic update
  primitive.
- [Suspense](./suspense.md) — the boundary that `useSuspenseQuery` relies on.
