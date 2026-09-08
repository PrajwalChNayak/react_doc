---
title: Choosing an approach
description: A ladder from local state to server-state libraries, and the one distinction that decides most of it.
group: state-management
order: 50
status: current
related: [state-management/lifting-state-up, state-management/external-stores, data-fetching/libraries]
---

## Overview

Most state-management arguments are arguments about the wrong question. The
useful question is not "Redux or Zustand?" — it is "what kind of thing is this
value, and who needs it?"

There is a ladder. Climb it one rung at a time, and stop at the first rung that
works.

1. **Derive it.** If the value can be computed from other values, do not store
   it at all.
2. **Local state.** `useState` in the component that owns it.
3. **Lift it.** Move it to the closest common ancestor and pass props down.
4. **Compose.** Pass elements as props to delete the prop drilling that lifting
   created.
5. **Reducer.** When the transitions get complicated, put them in one pure
   function.
6. **Context.** For values that are wide and change rarely: theme, locale,
   session, feature flags.
7. **External store.** For frequently-changing shared state that many
   components read *selectively*.
8. **A server-state library.** For anything whose source of truth is a server.

Rung 8 is not the last resort. For most applications it is the *first* thing you
should reach for, because most of what people call "global state" is a cache.

## Why it exists

Two mistakes cost teams the most time, and they pull in opposite directions.

The first is starting too high: a global store on day one, every value in it,
every component subscribed. The store becomes a dumping ground, nothing is
colocated, and deleting a feature never deletes its state.

The second is staying too low for too long: fifteen `useState` calls threaded
through six layers, three Effects keeping copies in sync, and a bug where the
header shows a different cart total than the checkout page.

The ladder exists so you can name where you are and what would justify the next
step. Every rung has a specific trigger; if you cannot name the trigger, do not
climb.

> [!BEST-PRACTICE]
> Sort state by two axes before choosing anything: **who needs it** (one
> component, one subtree, the whole app) and **how often it changes** (once, on
> interaction, on every frame). Context is fine for wide-and-slow and terrible
> for wide-and-fast.

## When to use it

Each rung, with the trigger that justifies it:

| Rung | Use when | Cost |
|---|---|---|
| Derive | The value is a function of other state or props | None |
| `useState` | One component reads and writes it | None |
| Lift up | Two or more components need the same value | Props to thread |
| Compose | Lifting produced intermediate components that only forward props | A little indirection in layout |
| `useReducer` | Transitions are complex or must stay consistent together | A reducer to keep pure |
| Context | The value is needed across a subtree and changes rarely | Every consumer re-renders on change |
| External store | Many components read one changing value, each needing a slice | A dependency, and a subscription model |
| Server-state library | The value's source of truth is a server | A dependency, and a cache to configure |

## When not to use it

**Do not put server data in a client store.** This is the single most common
architectural mistake in React applications, and it deserves its own section
below.

**Do not use context for values that change at interaction speed.** There is no
selector; every consumer re-renders. A text input's value, a drag position, or
a scroll offset in a widely-consumed context will make the whole tree render at
input speed.

**Do not add a store to avoid two props.** Try
[composition](../patterns/composition.md) first.

**Do not keep state that the URL should hold.** The current page, an open tab, a
search query, a filter, a sort order and pagination all belong in the URL. Then
the back button works, links are shareable, and a refresh does not lose the
view. Your router already gives you this for free — see
[Routing](../ecosystem/routing.md).

**Do not keep in state what the DOM already knows.** Focus, scroll position and
uncontrolled input values can be read from the DOM with a ref when you need
them.

## Basic example

Rung one, which people skip. Everything visible below is computed during render.
There is exactly as much state as there is user input.

```jsx live
import { useState } from 'react';

const TEAM = [
  { id: 1, name: 'Ada Lovelace', role: 'Engineering' },
  { id: 2, name: 'Grace Hopper', role: 'Engineering' },
  { id: 3, name: 'Katherine Johnson', role: 'Research' },
];

export default function TeamFilter() {
  // The only real state: what the user typed and what they picked.
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('All');

  // Everything below is derived. No useState, no useEffect, no useMemo needed.
  const visible = TEAM.filter(
    (person) =>
      (role === 'All' || person.role === role) &&
      person.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const isEmpty = visible.length === 0;
  const summary = `${visible.length} of ${TEAM.length} people`;

  return (
    <section>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name"
        aria-label="Search by name"
      />{' '}
      <select value={role} onChange={(event) => setRole(event.target.value)}>
        <option>All</option>
        <option>Engineering</option>
        <option>Research</option>
      </select>
      <p>{summary}</p>
      {isEmpty ? (
        <p>Nobody matches that filter.</p>
      ) : (
        <ul>
          {visible.map((person) => (
            <li key={person.id}>
              {person.name} — {person.role}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

The version of this component that stores `visible`, `isEmpty` and `summary` in
state needs three more `useState` calls and an Effect to keep them current — and
will render one frame with stale values every time. Deriving is not an
optimization; it removes a class of bug.

## How it works

### The decision list

Walk it top to bottom and stop at the first "yes".

1. **Can I compute it from something I already have?** Compute it. Do not store
   it.
2. **Does the server own it?** Use a server-state library. Stop reading the rest
   of this list.
3. **Should it survive a refresh or be shareable as a link?** Put it in the URL.
4. **Does only one component use it?** `useState`, right there.
5. **Do a few nearby components use it?** Lift it to their closest common
   ancestor.
6. **Did lifting create components that forward props they never read?** Pass
   elements as props instead.
7. **Are the transitions hard to keep consistent?** Move them into a
   `useReducer`.
8. **Is it needed across a whole subtree, and does it change rarely?** Context —
   with the value and the dispatch in separate contexts.
9. **Do many components read it, each needing a different slice, and does it
   change often?** An external store with selectors.
10. **Are you now writing selectors, middleware and a devtools bridge by hand?**
    Adopt a real store instead of finishing yours.

### Server state is not client state

Client state is created by the user, in the browser, and is authoritative there:
which modal is open, what is typed, which row is selected, the theme.

Server state is a **copy**. The truth lives in a database that other people are
changing while your user looks at a stale snapshot. That difference generates
requirements that no client store has:

- Caching, and a key by which to cache.
- Deduplication when six components request the same resource at once.
- Staleness and revalidation: refetch on focus, on reconnect, on an interval.
- Invalidation after a mutation.
- Request cancellation when the user navigates away.
- Retries with backoff.
- Pagination and infinite scroll cursors.
- Optimistic updates with rollback on failure.

Putting a fetch response into Redux, Zustand or context gives you exactly none
of that. You will implement it yourself, one incident at a time, and end up with
a worse version of a library that already exists.

> [!BEST-PRACTICE]
> Use a dedicated server-state library — TanStack Query, SWR, or RTK Query if
> you are already on Redux Toolkit — and let it own everything that came from
> the network. Then look at what is left. In most applications it is a theme, a
> session, a couple of modals and some form drafts, and that fits comfortably in
> `useState` plus one or two contexts.
>
> The "we need Redux for global state" conversation is usually a symptom of
> caching server data by hand.

These are third-party packages, not part of React. See
[Data libraries](../ecosystem/data-libraries.md) and
[Data fetching](../data-fetching/overview.md). If you use a framework with
Server Components, much of this moves to the server and never becomes client
state at all — see [Server Components](../server-react/server-components.md).

### Context vs external store

Once state is genuinely client-side, wide and changing, this is the real choice:

| | Context | External store |
|---|---|---|
| Re-render granularity | Every consumer, on every value identity change | Only components whose selected slice changed |
| Selectors | None | Core feature, often with a custom equality option |
| Devtools | React DevTools shows the value; no history | Time travel, action logs, state diffs |
| Server rendering | Works out of the box | Works, but the store must be created per request |
| Bundle cost | Zero — built into React | ~1–15 kB depending on the library |
| Read outside React | No | Yes — event handlers, workers, non-React code |
| Learning curve | Low | Low to high, depending on the library |
| Best for | Theme, locale, session, compound components | Carts, editors, collaborative cursors, large tables |

Context is not a slower store. It is a different tool: a way to pass a value
down a tree. When the value it passes is a *store object*, the two combine
perfectly — context handles scoping and dependency injection, the store handles
subscription and selection.

## Common patterns

### Split state by change frequency, not by feature

A "user settings" context holding both the theme (changes twice a year) and the
current draft message (changes per keystroke) will re-render every settings
consumer on every keystroke. Group by how often a value changes.

### Colocate, then promote

Start every piece of state in the component that uses it. Promote it only when a
second component needs it. Codebases that begin at the top of the ladder never
find their way back down; codebases that begin at the bottom climb exactly as
far as they must.

### Keep the store out of the render path where you can

Values that change every frame — pointer position, scroll offset, animation
progress — do not need to be state at all. Hold them in a ref and write to the
DOM directly. State is for things the UI's *structure* depends on.

### One store, or several?

Several small stores scoped to features beat one application store, for the same
reason several contexts beat one: independent change means independent
re-renders, and a deleted feature takes its store with it. Redux is the
exception by design — a single store is the point, and its selector layer makes
it work.

## Advanced example

A realistic mid-size application, with each kind of state assigned to the tool
that fits it. Nothing here is global by default.

```jsx static="Depends on a routing and data-fetching library plus a live API."
import { createContext, useContext, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';

// 1. Session: wide, changes rarely -> context.
const SessionContext = createContext(null);

function useSession() {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return session;
}

export default function InvoicesPage() {
  const session = useSession();

  // 2. Filters and pagination: shareable and refresh-safe -> the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? 'open';

  // 3. Server data: cached, revalidated, deduplicated -> a query library.
  const { data: invoices = [], isPending } = useQuery({
    queryKey: ['invoices', session.orgId, status],
    queryFn: () => fetch(`/api/invoices?status=${status}`).then((r) => r.json()),
  });

  // 4. Ephemeral UI state: one component -> useState.
  const [expandedId, setExpandedId] = useState(null);

  // 5. Derived: computed, never stored.
  const overdue = invoices.filter((invoice) => invoice.dueInDays < 0).length;

  if (isPending) return <p>Loading invoices…</p>;

  return (
    <section>
      <h2>
        {invoices.length} invoices, {overdue} overdue
      </h2>
      <select
        value={status}
        onChange={(event) => setSearchParams({ status: event.target.value })}
      >
        <option value="open">Open</option>
        <option value="paid">Paid</option>
      </select>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            <button
              onClick={() =>
                setExpandedId((current) =>
                  current === invoice.id ? null : invoice.id,
                )
              }
            >
              {invoice.reference}
            </button>
            {expandedId === invoice.id && <p>{invoice.notes}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Count what is *not* there: no global store, no `useEffect` fetching, no loading
booleans in a reducer, no cached invoice list that another screen has to
invalidate. Five kinds of state, five different homes, and the only one that
needed a library is the one that came from a server.

The rung this application has not reached is the external store. It would earn
its place the day something like a live-updating cart or a collaborative editor
appears — many components, one fast-moving value, each reader needing a
different slice.

## Common mistakes

**Caching server data in a client store.** The most expensive mistake on this
page. You inherit invalidation, deduplication, retries and staleness, and you
will implement them badly. Use a query library.

**Choosing a library before knowing the shape of the problem.** "We use Redux"
is an answer to a question nobody asked. Sort the state first, then pick tools
for each category.

**One context for the whole application.** Every consumer subscribes to every
field. Split by change frequency.

**Storing derived values.** Totals, filtered lists and validity flags are
computations. Storing them creates a second source of truth and a synchronization
Effect.

**Keeping view configuration out of the URL.** Filters and pagination in
component state break the back button, break refresh, and make bug reports
unreproducible.

**Syncing two states with an Effect.** An Effect whose only job is to call
`setB` when `A` changes runs after a render that already showed the stale value.
Compute it during render, or lift to one source of truth.

**Reaching for context to avoid two props.** Try composition. It costs nothing
and adds no indirection.

**Optimizing before profiling.** Do not restructure your state for performance
you have not measured. See [Profiling](../performance/profiling.md), and note
that the [React Compiler](../performance/react-compiler.md) removes much of the
manual memoization that used to justify these rewrites.

## Related topics

- [Lifting state up](./lifting-state-up.md) — rungs two through four, in detail.
- [Context](./context.md) — rung six, and the re-render model that limits it.
- [Reducers and context](./reducers-and-context.md) — rungs five and six
  combined.
- [External stores](./external-stores.md) — rung seven, and a survey of the
  libraries.
- [Data fetching overview](../data-fetching/overview.md) — rung eight, where
  most "state" problems actually live.
- [Data libraries](../ecosystem/data-libraries.md) — TanStack Query, SWR and
  RTK Query compared.
