---
title: Server Components
description: Components that run ahead of time in a server environment and ship no JavaScript to the browser.
group: server-react
order: 20
status: current
since: "19.0"
related: [server-react/directives, server-react/server-functions, server-react/overview, data-fetching/suspense]
---

## Overview

A Server Component is a component that renders in an environment separate from
your client app and separate from your SSR server. React's own words:

> Server Components are a new type of Component that renders ahead of time,
> before bundling, in an environment separate from your client app or SSR
> server.

Two consequences follow from "separate environment", and they explain everything
else on this page.

First, the component's code is never sent to the browser. It has already run by
the time the browser sees anything, so there is nothing to send. A 200 kB
Markdown pipeline used by a Server Component costs the user zero bytes.

Second, there is no browser to talk to and no re-render to schedule. A Server
Component runs once and produces output. It cannot hold state, because nothing
will ever ask it to run again.

> [!NOTE]
> Server Components require a framework or a bundler plugin. React alone does
> not implement the module-graph split or the wire format. See
> [the overview](./overview.md) for the current options.

## Why it exists

Before RSC, every byte of component code was shipped, even code whose only job
was to turn data into markup once. The pattern was: build an API endpoint, fetch
from it in the browser, ship the transformation logic, run it on the user's
phone.

Server Components delete three of those four steps. The component reads the data
where the data already is, transforms it on a machine with a fast CPU and a
short network hop, and sends the result.

The second win is the waterfall. A Client Component cannot start fetching until
its JavaScript has downloaded and run. A Server Component starts with the
request.

## When to use it

Default to Server Components for anything that displays data and does not
respond to the user: page layouts, article bodies, tables, navigation shells,
anything rendered from a database row or a file on disk.

Use them wherever a dependency exists purely to format output — date libraries,
Markdown and MDX, syntax highlighters, sanitizers, template engines.

Use them to talk to your data layer directly. A Server Component may query a
database, read the filesystem or call an internal service with credentials that
must never reach a browser.

## When not to use it

Anything interactive must be a Client Component. If it needs `useState`,
`useReducer`, an Effect, an event handler, a ref to a DOM node, or any browser
API, it belongs on the client.

Do not push a component to the server only to shrink a bundle if it then has to
pass a large serialized payload to a Client Component. You traded JavaScript
bytes for JSON bytes, and JSON on the wire is not free either.

## Basic example

A Server Component can be `async` and can `await` directly in render.

```tsx static="Runs on the server — there is no browser environment to preview."
import { getNotebook, listNotes } from '../lib/notebooks';

export default async function NotebookPage({ notebookId }: { notebookId: string }) {
  const notebook = await getNotebook(notebookId);
  const notes = await listNotes(notebookId);

  return (
    <main>
      <h1>{notebook.title}</h1>
      <ul>
        {notes.map((note: { id: string; title: string }) => (
          <li key={note.id}>{note.title}</li>
        ))}
      </ul>
    </main>
  );
}
```

There is no `useEffect`, no loading state, no `isLoading` boolean and no
`useState`. The `await` suspends the render; React handles the rest. Wrap the
component in [`<Suspense>`](../data-fetching/suspense.md) if you want the rest
of the page to stream while this part waits.

## How it works

### What a Server Component cannot do

| Not available | Why |
|---|---|
| `useState`, `useReducer` | There is no second render to update |
| `useEffect`, `useLayoutEffect` | Effects run after paint; there is no paint |
| Event handlers (`onClick`, `onChange`) | Functions are not serializable to the client |
| `useRef` on a DOM node | There is no DOM |
| `window`, `document`, `localStorage` | No browser globals exist |
| `useContext` from a client-side provider | Client context does not cross the boundary |

The rule underneath all of these: a Server Component runs exactly once, then
ceases to exist. Anything that implies "later" is unavailable.

### The boundary is one-directional

A Server Component may render a Client Component. A Client Component may
**not** import a Server Component — importing it would pull server code into
the client bundle, which is exactly what the boundary prevents.

What a Client Component *can* receive is server-rendered elements as props,
including `children`:

```tsx static="Runs on the server."
import Collapsible from './Collapsible';
import { getChangelog } from '../lib/changelog';

export default async function ChangelogSection() {
  const entries = await getChangelog();

  return (
    <Collapsible summary="Changelog">
      {entries.map((entry: { version: string; body: string }) => (
        <article key={entry.version}>
          <h3>{entry.version}</h3>
          <p>{entry.body}</p>
        </article>
      ))}
    </Collapsible>
  );
}
```

`Collapsible` is a Client Component holding open/closed state. The `<article>`
elements inside it were produced on the server and arrive as already-rendered
children. `Collapsible` toggles their visibility without ever containing their
code.

This is the escape hatch for "I need interactivity around server content".
Composition through `children` beats moving the whole subtree to the client.

### Serialization rules

Props crossing from a Server Component into a Client Component must be
serializable by React's wire format.

**Allowed:** strings, numbers, `bigint`, booleans, `undefined`, `null`, symbols
registered with `Symbol.for`, arrays, `Map`, `Set`, `TypedArray`, `ArrayBuffer`,
`Date`, plain objects whose properties are themselves serializable, promises,
JSX elements, and functions that are Server Functions or that were exported from
a client-marked module.

**Not allowed:** ordinary functions, classes, instances of your own classes,
objects with a null prototype, and symbols that are not globally registered.

Passing a promise is worth knowing about: the Server Component can start the
fetch and hand the unresolved promise to a Client Component, which reads it with
[`use`](../hooks/use.md). The request starts early and the client still gets to
control the loading UI.

### Server Component vs Client Component

| | Server Component | Client Component |
|---|---|---|
| Marked by | Nothing — it is the default outside a client boundary | `"use client"` at the top of its module |
| Where it runs | A server environment, before bundling | On the server for initial HTML, then in the browser |
| Ships its code | No | Yes |
| Can be `async` | Yes | No — use `use()` or an Effect |
| State and Effects | No | Yes |
| Event handlers | No | Yes |
| Direct database access | Yes | No |
| Can render the other kind | Yes, may render Client Components | Only as `children` passed in from the server |

> [!NOTE]
> There is no `"use server"` directive for Server Components. Server Components
> are the default; `"use server"` marks
> [Server Functions](./server-functions.md). Getting this backwards is the most
> common directive mistake.

## Common patterns

### Deduplicating work with `cache`

Two Server Components in the same tree often need the same record. Rather than
threading it through props, wrap the loader in `cache` and call it in both
places. React invalidates the cache for every server request, so there is no
cross-request leakage.

```tsx static="Runs on the server."
import { cache } from 'react';
import { fetchUserById } from '../lib/users';

export const getUser = cache(fetchUserById);

export async function UserBadge({ userId }: { userId: string }) {
  const user = await getUser(userId);
  return <span className="badge">{user.displayName}</span>;
}
```

Three caveats decide whether this works for you:

- Each call to `cache()` creates a **new** memoized function with its own cache.
  Export one instance and import it; do not call `cache()` twice on the same
  function and expect shared hits.
- Arguments are compared with `Object.is`. Non-primitive arguments only hit the
  cache when you pass the same object reference.
- Errors are cached too. If `fn` throws for a set of arguments, the same error
  is re-thrown on the next call with those arguments.

Calling a memoized function outside a component does not use the cache — cache
access is provided through React's context during render.

### Aborting work when the cache lifetime ends — `cacheSignal` (19.2)

`cacheSignal()` returns an `AbortSignal` that React aborts when the cache
lifetime is over: when rendering completed successfully, when the render was
aborted, or when it failed. Pass it to anything that supports cancellation so
you stop paying for work whose result nobody will read.

```jsx nocheck="Server Components only — cacheSignal is not part of the client type environment."
import { cache, cacheSignal } from 'react';

const dedupedFetch = cache(fetch);

async function loadPricing(region) {
  const response = await dedupedFetch(`https://api.internal/pricing/${region}`, {
    signal: cacheSignal(),
  });
  return response.json();
}
```

`cacheSignal()` returns `null` outside of rendering, and currently always
returns `null` in Client Components. Treat a `null` return as "no cancellation
available" rather than an error.

## Advanced example

Start the request on the server, resolve it on the client. The Server Component
does not `await`; it passes the promise across the boundary, so the shell can
render immediately.

```tsx static="Runs on the server."
import { Suspense } from 'react';
import RecommendationList from './RecommendationList';
import { fetchRecommendations } from '../lib/recommendations';

export default function StoreFront({ customerId }: { customerId: string }) {
  const recommendations = fetchRecommendations(customerId);

  return (
    <section>
      <h2>Picked for you</h2>
      <Suspense fallback={<p>Loading recommendations…</p>}>
        <RecommendationList recommendations={recommendations} />
      </Suspense>
    </section>
  );
}
```

```tsx
'use client';

import { use } from 'react';

type Recommendation = { id: string; name: string };

export default function RecommendationList({
  recommendations,
}: {
  recommendations: Promise<Recommendation[]>;
}) {
  const items = use(recommendations);

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

The network request begins on the server at the start of the render. The client
never has to wait for its own JavaScript before the fetch starts.

## Common mistakes

**Adding `"use server"` to make a Server Component.** Server Components are the
default. `"use server"` creates a public HTTP endpoint. See
[directives](./directives.md).

**Importing a Client Component's state into a Server Component.** The data flows
one way: server to client, through props. If a Server Component needs to react
to client state, it does not — restructure so the Client Component owns that
subtree, and pass server content in as `children`.

**Passing a callback across the boundary.** `onSave={() => save()}` from a
Server Component into a Client Component fails to serialize. Pass a
[Server Function](./server-functions.md) instead.

**Reaching for `useEffect` to fetch.** In a Server Component you cannot, and you
do not need to — `await` in render. In a Client Component, prefer a framework
loader or [`use`](../hooks/use.md) over
[fetching in Effects](../data-fetching/fetching-in-effects.md).

**Assuming `cache()` persists between requests.** It does not. React invalidates
every memoized function per server request. For cross-request caching you need a
real cache; see [caching](../data-fetching/caching.md).

**Marking a leaf component `"use client"` to fix an error, over and over.** Each
one drags its whole import subtree into the bundle. Push the boundary down to
the smallest interactive piece instead.

## Related topics

- [Directives](./directives.md) — how `"use client"` splits the module graph.
- [Server Functions](./server-functions.md) — the only way client code can
  invoke server code directly.
- [use](../hooks/use.md) — reading a promise passed down from the server.
- [Suspense](../data-fetching/suspense.md) — streaming boundaries while server
  data resolves.
- [Server React overview](./overview.md) — how RSC relates to SSR and static
  generation.
