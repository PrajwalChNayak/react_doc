---
title: Suspense
description: Show a fallback while part of the tree is waiting, and control when that fallback is allowed to appear.
group: data-fetching
order: 20
status: current
since: "19.2"
related: [data-fetching/use-with-promises, hooks/use, hooks/use-transition, performance/code-splitting]
---

## Overview

`<Suspense>` renders a fallback while its children are not yet ready.

```jsx
import { Suspense } from 'react';

export default function Panel({ children }) {
  return <Suspense fallback={<p>Loading…</p>}>{children}</Suspense>;
}
```

It is a **boundary**, not a fetching mechanism. It catches a signal that a
descendant is waiting and swaps in `fallback` until the wait ends. Nothing about
`<Suspense>` starts a request.

The critical question is therefore what counts as "waiting".

| Activates a boundary | Does **not** activate a boundary |
|---|---|
| Reading a pending promise with [`use`](../hooks/use.md) | Fetching inside `useEffect` |
| Data streamed from Server Components | Fetching in an event handler |
| Data from a Suspense-enabled framework or library | `await` in a Client Component (not supported) |
| Lazy-loading component code with `lazy` | A slow synchronous render |
| A `<link rel="stylesheet">` with a `precedence` prop | An unresolved promise nobody reads with `use` |
| Waiting for streamed HTML during server rendering | |

> [!WARNING]
> Suspense does not detect data fetched inside an Effect or an event handler.
> Wrapping a component that fetches in `useEffect` with `<Suspense>` does
> nothing at all — the boundary never activates, and the component renders with
> empty state exactly as before.

## Why it exists

Loading states are a cross-cutting concern that had no place to live. Each
component tracked its own `isLoading` boolean, so the shape of the loading UI
was decided by whichever component happened to own the request — and a page with
six of them flickered six times in an unpredictable order.

`<Suspense>` moves the decision to where it belongs: the part of the tree that
knows what the user should see while waiting. One boundary can cover a whole
page, a sidebar, or a single row. Changing the granularity of your loading UI
becomes a matter of moving a boundary, not rewriting components.

It also unlocks two things a boolean cannot express: server-side **streaming**,
where the shell is sent before the data exists, and **transitions**, where React
decides that showing stale content is better than showing a spinner.

## When to use it

- Around any component that reads a promise with `use`.
- Around `lazy`-loaded routes and heavy components. See
  [code splitting](../performance/code-splitting.md).
- To carve a server-rendered page into independently streaming sections.
- To give a slow region its own skeleton so the rest of the page ships first.

## When not to use it

- Around a component that fetches in an Effect. It will not help.
- As an error boundary. Suspense handles *pending*; rejections go to an
  [error boundary](../patterns/error-boundaries.md). You usually want both.
- Around every component. A boundary per leaf produces a page of independently
  popping skeletons, which reads as noise.
- To hide a synchronous rendering cost. Suspense does not make rendering
  faster — look at [profiling](../performance/profiling.md) instead.

## Basic example

Two boundaries, so the header does not wait for the slower list.

```jsx live
import { Suspense, use } from 'react';

const cache = new Map();

// Stands in for a network call so the example stays self-contained.
function load(key, value, ms) {
  if (!cache.has(key)) {
    cache.set(
      key,
      new Promise(resolve => setTimeout(() => resolve(value), ms))
    );
  }
  return cache.get(key);
}

function TeamName() {
  const name = use(load('team', 'Platform Infrastructure', 400));
  return <h3>{name}</h3>;
}

function MemberList() {
  const members = use(load('members', ['Ada', 'Grace', 'Katherine'], 1600));
  return (
    <ul>
      {members.map(member => (
        <li key={member}>{member}</li>
      ))}
    </ul>
  );
}

export default function TeamPage() {
  return (
    <section>
      <Suspense fallback={<h3>Loading team…</h3>}>
        <TeamName />
      </Suspense>
      <Suspense fallback={<p>Loading members…</p>}>
        <MemberList />
      </Suspense>
    </section>
  );
}
```

The name appears at 400ms and the list at 1600ms. Move both components inside a
single boundary and nothing appears until 1600ms — the boundary waits for
everything under it.

## How it works

When a descendant suspends, React unwinds to the nearest `<Suspense>` boundary
and renders `fallback` in place of `children`. The children are not unmounted in
the DOM sense on a re-suspend — React hides them with `display: none` and cleans
up their layout Effects, then restores both when the content is ready. This is
why an Effect that measures the DOM does not run against hidden content.

There are two important asymmetries.

**A first mount discards state.** React does not preserve state for a tree that
suspended before it ever mounted. When the data arrives, React renders that
subtree from scratch.

**A re-suspend shows the fallback again — unless it was a transition.** If a
boundary already displayed content and then suspends again, the fallback comes
back, replacing visible content. That is the jarring case, and
[`startTransition`](../hooks/use-transition.md) is the fix.

### Reveal order and throttling

Nested boundaries reveal from the outside in. React also throttles reveals: it
reveals suspended content **at most once every 300ms**, measured from the last
reveal, so boundaries that become ready inside that window appear together
instead of one at a time.

> [!NOTE]
> **Since 19.2**, server-rendered Suspense boundary reveals are batched the same
> way. Before 19.2, streaming SSR replaced each fallback the instant its HTML
> arrived, so a server-rendered page revealed content in a different rhythm from
> the identical page rendered on the client. React now batches SSR reveals over
> a short window to match. React backs off from the batching when total page
> load time approaches the 2.5s "good" threshold for Largest Contentful Paint,
> so the throttle does not cost you the metric.

### StrictMode

StrictMode double-invokes render. A component that reads a **cached** promise is
unaffected. A component that creates its promise during render suspends twice
with two different promises and never resolves — StrictMode surfaces that bug in
development rather than shipping it.

### `<Activity>`

`<Activity mode="hidden">` pre-renders content at low priority without showing
it. Data read through a Suspense-activating source *is* fetched during that
pre-render, so a hidden `<Activity>` containing a `use` call warms the cache.
Data fetched in an Effect is not — hiding an Activity destroys its Effects. See
[Activity](../performance/activity.md).

## Common patterns

### Keeping visible content on screen with a transition

Without a transition, navigating from one loaded record to another blanks the
pane. With one, React keeps the old content and lets you render a pending hint.

```jsx live
import { Suspense, use, useState, useTransition } from 'react';

const cache = new Map();

function loadArticle(id) {
  if (!cache.has(id)) {
    cache.set(
      id,
      new Promise(resolve =>
        setTimeout(() => resolve({ id, body: `Body of article ${id}.` }), 900)
      )
    );
  }
  return cache.get(id);
}

function Article({ id }) {
  const article = use(loadArticle(id));
  return <p>{article.body}</p>;
}

export default function ArticleReader() {
  const [id, setId] = useState(1);
  const [isPending, startTransition] = useTransition();

  function openNext() {
    startTransition(() => {
      setId(current => current + 1);
    });
  }

  return (
    <div style={{ opacity: isPending ? 0.6 : 1 }}>
      <button onClick={openNext} disabled={isPending}>
        {isPending ? 'Loading…' : 'Next article'}
      </button>
      <Suspense fallback={<p>Loading article…</p>}>
        <Article id={id} />
      </Suspense>
    </div>
  );
}
```

The fallback appears once, for article 1. After that the previous article stays
on screen, dimmed, until the next one is ready. Delete `startTransition` and
every navigation flashes the fallback.

`useDeferredValue` produces the same effect for a value you derive rather than
set — see [useDeferredValue](../hooks/use-deferred-value.md).

### Boundary granularity

Choose boundaries by **what the user is waiting for**, not by component
structure.

| Placement | Effect | Use when |
|---|---|---|
| One boundary per route | Whole page swaps at once | The page is meaningless without its data |
| Boundary around each independent region | Regions fill in separately | Sidebar, feed and header have different sources |
| Boundary per list item | Each row pops in | Rarely — reads as flicker |

A useful default: put a boundary wherever you would draw a skeleton in a design
mock.

### Streaming server-rendered sections

On the server, each boundary is a streaming unit. React sends the shell with
fallbacks in place, then streams each boundary's HTML as its data resolves — no
client JavaScript required for the reveal.

```jsx static="Server Components require a framework with an RSC bundler."
import { Suspense } from 'react';
import Revenue from './Revenue.js';
import RecentSignups from './RecentSignups.js';

export default function DashboardPage() {
  return (
    <main>
      <h2>Dashboard</h2>
      <Suspense fallback={<p>Loading revenue…</p>}>
        <Revenue />
      </Suspense>
      <Suspense fallback={<p>Loading signups…</p>}>
        <RecentSignups />
      </Suspense>
    </main>
  );
}
```

The `<h2>` reaches the browser immediately. See
[streaming](../server-react/streaming.md).

## Advanced example

Nested boundaries create a reveal sequence: the outer content appears as soon as
it can, and the slower inner region keeps its own skeleton.

```jsx live
import { Suspense, use } from 'react';

const cache = new Map();

function load(key, value, ms) {
  if (!cache.has(key)) {
    cache.set(
      key,
      new Promise(resolve => setTimeout(() => resolve(value), ms))
    );
  }
  return cache.get(key);
}

function Profile() {
  const profile = use(load('profile', { name: 'Ada Lovelace' }, 500));
  return <h3>{profile.name}</h3>;
}

function ActivityFeed() {
  const events = use(load('events', ['Opened a PR', 'Closed an issue'], 2000));
  return (
    <ul>
      {events.map(event => (
        <li key={event}>{event}</li>
      ))}
    </ul>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<p>Loading profile…</p>}>
      <Profile />
      <Suspense fallback={<p>Loading activity…</p>}>
        <ActivityFeed />
      </Suspense>
    </Suspense>
  );
}
```

At 500ms the outer fallback is replaced by the name plus the inner fallback. At
2000ms the feed fills in. Remove the inner boundary and the name waits for the
feed, because a component's closest boundary is the one that governs it.

## Common mistakes

**Expecting an Effect-based fetch to suspend.** This is the most common
misunderstanding. `<Suspense>` sees render-time signals only.

**Creating the promise inside the suspending component.** A new promise per
render means an endless fallback. The promise must come from a cache, a prop, or
a Server Component. See
[use with promises](./use-with-promises.md#common-mistakes).

**No error boundary.** A Suspense boundary handles pending; a rejected promise
sails past it to the nearest error boundary, and if there is none, it unmounts
your app. Pair them.

**Putting the boundary below the suspending component.** The boundary must be an
**ancestor**. A `<Suspense>` rendered as a sibling, or inside the component that
suspends, never catches it.

**Forgetting `startTransition` on navigation.** Every route change that replaces
loaded content with a spinner is a missing transition.

**A fallback that changes layout.** Swapping a 400px list for a one-line
"Loading…" shifts the page twice. Size fallbacks like the content they replace.

**One boundary per component.** Granularity is a design decision. Six
independently resolving skeletons on one screen is worse than one.

## Related topics

- [use with promises](./use-with-promises.md) — how to produce a promise a
  boundary can actually wait on.
- [use](../hooks/use.md) — the API that suspends.
- [useTransition](../hooks/use-transition.md) — keep visible content on screen
  while new content loads.
- [Error boundaries](../patterns/error-boundaries.md) — the other half of the
  pair.
- [Code splitting](../performance/code-splitting.md) — `lazy` and route-level
  boundaries.
- [Streaming](../server-react/streaming.md) — what boundaries mean during server
  rendering.
