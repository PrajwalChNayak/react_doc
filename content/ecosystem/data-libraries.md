---
title: Data libraries
description: Choosing between TanStack Query, SWR, RTK Query, Apollo Client and tRPC, and why server state never belongs in a client store.
group: ecosystem
order: 40
status: current
related: [data-fetching/libraries, state-management/choosing-an-approach, server-react/server-components]
---

## Overview

Five projects come up whenever an application needs data from a server. All five
are third-party packages; **none of them is part of React**, and the React team
does not ship an equivalent.

| Library | Package | One-line identity |
|---|---|---|
| TanStack Query | `@tanstack/react-query` | The full-featured async cache. The default. |
| SWR | `swr` | The small one. Stale-while-revalidate with a tiny API. |
| RTK Query | `@reduxjs/toolkit/query/react` | The cache you already own if you use Redux Toolkit. |
| Apollo Client | `@apollo/client` | A *normalized* cache, built for GraphQL. |
| tRPC | `@trpc/client`, `@trpc/react-query` | Not a cache — end-to-end types over your own TypeScript API. |

This page is about **which one to pick**.
[Data fetching → Libraries](../data-fetching/libraries.md) is about **how to use
them**, with working examples of queries, mutations and invalidation for the
first three. Read this one to decide, that one to build.

## Why it exists

The single most expensive architectural mistake in React applications is putting
server data in a client store — Redux, Zustand, or a context — and treating it
like application state.

It is not application state. It is a **cache of a database you do not control**,
going stale while your user reads it. That distinction generates a list of
requirements no client store has:

- A cache key, and a policy for when an entry is stale.
- Deduplication when six components request the same resource in one tick.
- Revalidation on window focus, on reconnect, on an interval.
- Invalidation after a mutation, across every affected view.
- Cancellation when the user navigates away mid-request.
- Retries with backoff for transient failures.
- Pagination and infinite-scroll cursors.
- Optimistic updates with rollback when the server disagrees.
- Garbage collection of entries nothing renders any more.

Every one of those is a few dozen lines. Together they are a library. Writing
them into your reducers means owning their bugs, one production incident at a
time. See
[Choosing an approach](../state-management/choosing-an-approach.md#server-state-is-not-client-state).

> [!BEST-PRACTICE]
> Let one of these libraries own everything that came from the network. Then
> look at what is left in your "global state". In most applications it is a
> theme, a session, two modals and a form draft — which fits in `useState` and a
> context, and no longer justifies a store at all.

## When to use it

- More than a couple of endpoints in a client-rendered application.
- Two components that need the same server data.
- A mutation in one place that should refresh a view somewhere else.
- Any list you paginate, poll, or refetch.
- The moment you write your own `staleTime`, `isFetching` flag, or in-flight
  request map.

## When not to use it

**You render data in Server Components.** A framework with RSC fetches on the
server, and its router cache already handles the query side. Adding a client
cache duplicates the work and ships a bundle you did not need. Keep the client
library for the genuinely interactive parts — search-as-you-type, infinite
lists, polling dashboards. See
[Server Components](../server-react/server-components.md).

**Configuration loaded once, never invalidated.** A module-level promise read
with [`use`](../data-fetching/use-with-promises.md) is the whole feature.

**A live subscription.** A WebSocket feed is a store, not a query. Use
[`useSyncExternalStore`](../hooks/use-sync-external-store.md), or the library's
own subscription API where it has one.

**Client-only state.** Modal visibility, the selected row, an unsent draft.
Those never came from a server and gain nothing from a cache.

## Basic example

The decision this page exists to make, in two shapes. First the mistake:

```jsx static="Illustrates an anti-pattern against a real store and API."
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { projectsLoaded, projectsFailed } from './projectsSlice';

// Server data in a client store. Every one of the requirements above is
// now yours: dedupe, staleness, refetch, invalidation, cancellation.
export default function ProjectList() {
  const dispatch = useDispatch();
  const { items, status } = useSelector((state) => state.projects);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/projects')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) dispatch(projectsLoaded(data));
      })
      .catch((error) => {
        if (!cancelled) dispatch(projectsFailed(error.message));
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  if (status === 'loading') return <p>Loading projects…</p>;
  return (
    <ul>
      {items.map((project) => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  );
}
```

Then the same screen with a cache doing the work:

```jsx static="Requires a QueryClientProvider and a live API."
import { useQuery } from '@tanstack/react-query';

export default function ProjectList() {
  const { data: projects = [], isPending, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: async ({ signal }) => {
      // The library aborts this request if the component unmounts.
      const response = await fetch('/api/projects', { signal });
      if (!response.ok) throw new Error('Could not load projects.');
      return response.json();
    },
  });

  if (isPending) return <p>Loading projects…</p>;
  if (isError) return <p role="alert">Could not load projects.</p>;

  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  );
}
```

The second version is shorter, but that is not the point. The point is that ten
components can render it at once and produce one request, that a mutation
elsewhere can invalidate `['projects']` and refresh all of them, and that the
list stays on screen while it refetches.

## How it works

### Cache models: document versus normalized

This is the deepest difference between the five, and the one that decides how
mutations feel.

**Document caches** — TanStack Query, SWR, RTK Query — store whatever the server
returned, keyed by a request. If `/projects` and `/projects/42` both include
project 42, the cache holds two copies. Renaming the project means telling the
cache which keys are now wrong.

**Normalized caches** — Apollo's `InMemoryCache` — split responses into entities
identified by `__typename` and `id`, and store each one once. Every query that
referenced project 42 renders from the same record, so changing its `name`
updates all of them with no invalidation at all.

Normalization is genuinely better for entity edits and genuinely worse
everywhere else: it needs a schema, it needs stable ids on every type, and list
membership still is not solved — adding a project to a list requires an explicit
cache update or a refetch, because the cache cannot know which lists it belongs
to.

### Invalidation models

| Library | How a mutation refreshes views |
|---|---|
| TanStack Query | `queryClient.invalidateQueries({ queryKey: ['projects'] })` — imperative, matches by key prefix |
| SWR | `mutate(key)` — imperative, per key or by a matcher function |
| RTK Query | Declarative: queries `providesTags`, mutations `invalidatesTags`. Wiring is done once at the endpoint |
| Apollo Client | Automatic for entity fields; explicit `update` or `refetchQueries` for list membership |
| tRPC | Whatever the underlying cache does — it delegates to TanStack Query |

RTK Query's tag system is its best feature and the reason to prefer it over
hand-invalidating TanStack Query keys in a large app: invalidation lives next to
the endpoint definition rather than scattered across the components that happen
to mutate.

### tRPC is not in the same category

tRPC does not cache anything. It is a transport that infers your API's types
from the server implementation, so a client call is checked against the real
handler with no code generation and no schema file. Its React integration lists
`@tanstack/react-query` as a peer dependency — tRPC provides the types and the
call, TanStack Query provides the cache.

The condition for using it is strict: **one TypeScript codebase, or a monorepo
where the client can import the server's router type.** A public API, a
polyglot backend, or a team that ships client and server separately makes tRPC
the wrong shape.

```ts
// server/router.ts — the API definition is the source of truth.
export const appRouter = router({
  project: {
    byId: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => db.project.findUnique({ where: { id: input.id } })),
  },
});

// The client imports only the *type*, never the implementation.
export type AppRouter = typeof appRouter;
```

Rename a field on the server and the client stops compiling. That is the entire
value proposition, and for a full-stack TypeScript product it is a large one.

### Server rendering and Server Components

| Library | SSR / hydration | Server Components |
|---|---|---|
| TanStack Query | `dehydrate` on the server, `HydrationBoundary` on the client | Prefetch in a Server Component, hydrate into client components |
| SWR | `fallback` prop seeded with server data | Same prefetch-and-seed pattern, done by hand |
| RTK Query | Works, but the store must be created per request, never module-scoped | Awkward — Redux is a client-side singleton by design |
| Apollo Client | Supported | Through a separate integration package, not the core client |
| tRPC | Follows TanStack Query | Server-side callers exist; the React hooks are client-only |

A module-level `const queryClient = new QueryClient()` or a module-level Redux
store on the server leaks one user's data into another user's response. Create
per request, always.

## Common patterns

### Choose by what you already have

Most of this decision is made for you by the rest of the stack.

- **Your API is REST or JSON over HTTP, and you have no other commitments.**
  TanStack Query. It is the most complete, has the best devtools, and has the
  largest body of answers to whatever you hit next.
- **You want the smallest possible thing and your needs are simple.** SWR. The
  API is one hook; you will feel the ceiling around complex invalidation and
  infinite queries.
- **You are already on Redux Toolkit.** RTK Query, and do not add a second
  cache. It is included in the package you have installed.
- **Your API is GraphQL.** Apollo Client, for the normalized cache. If you want
  GraphQL without normalization, TanStack Query with a plain `graphql-request`
  fetcher is a legitimate and much smaller choice.
- **Client and server are one TypeScript codebase.** tRPC on top of TanStack
  Query.
- **You use Server Components for most reads.** Fetch on the server; add a
  client cache only for the interactive surfaces.

### Do not run two caches

Two libraries caching the same resource is two sources of truth that disagree
after every mutation, and no devtool shows you both. If you are migrating,
migrate a whole resource at a time and delete the old path as you go.

The one defensible pair is a **normalized** cache for entities and nothing else
— which is really one cache with a plain `fetch` beside it.

### Bundle size is real but rarely decisive

The ordering is stable: SWR is the smallest, TanStack Query is a few times
larger, RTK Query costs nothing extra if Redux Toolkit is already in the bundle
and a lot if it is not, and Apollo Client is the largest because a normalized
cache and a GraphQL document parser are large things. Apollo Client v4 also
requires `rxjs` and `graphql` as peer dependencies, which are not small.

Measure it in your own bundle rather than trusting a number from a blog post,
and weigh it against the code you delete. A library that removes two hundred
lines of hand-rolled caching usually wins even when it is bigger on paper.

## Advanced example

### The full comparison

| | TanStack Query | SWR | RTK Query | Apollo Client | tRPC |
|---|---|---|---|---|---|
| Package | `@tanstack/react-query` | `swr` | `@reduxjs/toolkit` | `@apollo/client` | `@trpc/client` + `@trpc/react-query` |
| Protocol | Anything you can `await` | Anything you can `await` | Anything, via `baseQuery` | GraphQL | Your own TypeScript procedures |
| Cache model | Document, keyed by `queryKey` | Document, keyed by the key argument | Document, keyed by endpoint + argument | **Normalized** by type and id | Delegated to TanStack Query |
| Invalidation | Imperative, by key prefix | Imperative, by key | **Declarative tags** | Automatic per entity; manual per list | Delegated |
| Mutations | `useMutation` | `mutate` | `builder.mutation` + generated hook | `useMutation` | Procedure call through the query cache |
| Optimistic updates | `onMutate` + rollback in `onError` | `mutate` with `optimisticData` | `onQueryStarted` with `patchResult.undo()` | `optimisticResponse` | Delegated |
| Generated hooks | No | No | **Yes**, from endpoint definitions | With codegen | **Yes**, from the router type |
| Type safety | As good as your fetcher | As good as your fetcher | Typed endpoint definitions | Codegen from the schema | **End to end, no codegen** |
| SSR | `dehydrate` / `HydrationBoundary` | `fallback` | Per-request store | Supported | Follows TanStack Query |
| Server Components | Prefetch and hydrate | Prefetch and seed | Awkward | Separate integration package | Server callers only |
| Devtools | Dedicated, excellent | React DevTools | Redux DevTools | Apollo DevTools | Whatever the cache offers |
| Relative bundle cost | Medium | Smallest | Free with Redux, expensive without | Largest | Thin over TanStack Query |
| Requires a provider | Yes | No | Yes — the Redux store | Yes | Yes |

### The decision, as a list

Walk it and stop at the first yes.

1. **Is the data rendered in a Server Component?** Fetch there. No client cache.
2. **Is the API GraphQL, and do you edit entities that appear in many views?**
   Apollo Client, for the normalized cache.
3. **Are client and server one TypeScript codebase?** tRPC over TanStack Query.
4. **Is Redux Toolkit already in the app?** RTK Query. Adding a second cache
   next to it is worse than either alone.
5. **Do you need infinite queries, offline persistence, prefetching, or serious
   devtools?** TanStack Query.
6. **Is it a handful of endpoints and you want the smallest dependency?** SWR.
7. **Is it one request, made once, never invalidated?** A promise and
   [`use`](../data-fetching/use-with-promises.md).

## Common mistakes

**Keeping server data in Redux, Zustand or context.** The mistake this whole
page exists to prevent. You inherit deduplication, staleness, invalidation,
cancellation and retries, and you will implement them worse than the library
that already did.

**Copying query results into `useState`.** Now the cache and your copy disagree
after every refetch, and the Effect that syncs them renders stale data first.
Render from the cache.

**Running two caches at once.** TanStack Query for new features and RTK Query
for old ones means every mutation has to invalidate twice, and nobody remembers.

**Adding a client cache on top of Server Components.** You are paying bundle
size to re-fetch data the server already delivered.

**A module-scoped `QueryClient` or store on the server.** One user's cache
serving another user's request. Create it per request.

**Unstable query keys.** A key containing a new object or array identity every
render never hits the cache, refetches forever, and looks like a network
problem.

**Choosing Apollo Client because the API is GraphQL, without needing
normalization.** GraphQL over TanStack Query with a small fetcher is a real
option and a much smaller one.

**Choosing tRPC when the client cannot import the server's types.** Without one
TypeScript project spanning both sides, its single advantage disappears and you
have added a transport for nothing.

## Related topics

- [Data fetching → Libraries](../data-fetching/libraries.md) — working examples
  of queries, mutations and invalidation in the top three.
- [Choosing an approach](../state-management/choosing-an-approach.md) — the
  ladder that puts server state at the top and why.
- [Redux](./redux.md) — RTK Query in depth, and when Redux is still the answer.
- [Caching](../data-fetching/caching.md) — what a cache actually has to do.
- [Server Components](../server-react/server-components.md) — the reads that
  never need a client cache at all.
- [use with promises](../data-fetching/use-with-promises.md) — the one-request
  case that needs no library.
