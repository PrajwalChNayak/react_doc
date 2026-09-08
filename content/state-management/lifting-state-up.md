---
title: Lifting state up
description: Move shared state to the closest common ancestor and pass it down as props.
group: state-management
order: 10
status: current
related: [state-management/context, patterns/composition, patterns/controlled-inputs]
---

## Overview

When two components need the same piece of state, that state does not belong to
either of them. It belongs to their closest common ancestor. You move the
`useState` call up to that ancestor, pass the value down as a prop, and pass a
callback down so children can request a change.

This is the default answer to "how do I share state in React", and it is the
answer far more often than people expect. Context, reducers and external stores
all exist to solve problems that lifting state up cannot solve — not to replace
it.

```text
        ProductBrowser        <- state lives here
        /      |      \
  SearchBox  Count  ProductList   <- read it as props
```

## Why it exists

React data flow is one-directional: a parent renders a child and hands it props.
A child cannot reach sideways to a sibling, and it cannot reach up to a parent.
So the only place two siblings can agree on a value is above both of them.

The alternative — each sibling keeping its own copy — produces two sources of
truth that drift apart. You then write synchronization code (usually an Effect)
to keep them equal, and that code is a bug factory. Lifting removes the second
copy instead of synchronizing it.

> [!BEST-PRACTICE]
> One piece of information, one owner. If you find yourself copying state from
> props into state, or writing an Effect whose only job is to keep two states
> equal, you have a lifting problem, not an Effect problem.

## When to use it

- Two or more components read the same value.
- One component changes a value that another component displays.
- A parent needs to coordinate its children (a tab strip that closes other
  panels, a form that disables submit until every field is valid).
- You want a single source of truth you can log, test, or serialize.

## When not to use it

Keep state local when only one component uses it. Lifting state that nobody
else needs makes the parent re-render on every keystroke in a child, and turns
a self-contained component into one that cannot be moved without also moving
its state.

Do not lift past the closest common ancestor. If the state is shared by two
list items, it belongs on the list — not on the page, and not on the app root.
Every level you lift above the necessary one is a level of extra re-rendering
and a level of extra prop plumbing.

And do not lift server data. A response from an API is a cache, not component
state; see [Choosing an approach](./choosing-an-approach.md).

## Basic example

Three components need the search query: the input owns the text, the counter
reports how many rows survived the filter, and the list renders them. The state
goes on their common parent.

```jsx live
import { useState } from 'react';

const PRODUCTS = [
  { id: 1, name: 'Mechanical keyboard', price: 129 },
  { id: 2, name: 'Ultrawide monitor', price: 549 },
  { id: 3, name: 'Desk mat', price: 29 },
  { id: 4, name: 'USB-C hub', price: 79 },
];

function SearchBox({ query, onQueryChange }) {
  return (
    <input
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      placeholder="Filter products"
      aria-label="Filter products"
    />
  );
}

function ResultCount({ shown, total }) {
  return (
    <p>
      Showing {shown} of {total} products
    </p>
  );
}

function ProductList({ products }) {
  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>
          {product.name} — ${product.price}
        </li>
      ))}
    </ul>
  );
}

export default function ProductBrowser() {
  const [query, setQuery] = useState('');

  const visible = PRODUCTS.filter((product) =>
    product.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section>
      <SearchBox query={query} onQueryChange={setQuery} />
      <ResultCount shown={visible.length} total={PRODUCTS.length} />
      <ProductList products={visible} />
    </section>
  );
}
```

Note what is *not* state. `visible` is derived from `query` and `PRODUCTS`, so
it is computed during render. Storing it in a second `useState` would create a
value that can disagree with the query.

## How it works

Lifting changes three things at once:

1. **Ownership.** The ancestor holds the `useState`. It is the only place the
   value can change.
2. **Reading.** Children receive the value as a prop. They are now pure
   functions of their props — the same props always produce the same output.
3. **Writing.** Children receive a function. They do not know what happens when
   they call it; they only announce that something happened.

The naming matters. A child prop called `onQueryChange` describes an event. A
child prop called `setQuery` leaks the parent's implementation. Prefer the
event name: it lets the parent later validate, debounce, or ignore the change
without renaming anything.

When state changes, the owning ancestor re-renders, and React re-renders its
subtree. That is the cost, and it is usually irrelevant — React re-rendering a
few dozen components is cheap. Reach for memoization only after profiling; see
[Memoization](../performance/memoization.md) and
[React Compiler](../performance/react-compiler.md).

### Controlled and uncontrolled, at component scale

"Controlled" and "uncontrolled" are usually taught about `<input>`, but they
describe any component:

| | Uncontrolled | Controlled |
|---|---|---|
| Where state lives | Inside the component | In the parent |
| Parent can read it | No | Yes |
| Parent can set it | No (only reset via `key`) | Yes |
| Reuse | Drop it in anywhere | Parent must wire it up |

An uncontrolled `<Accordion>` tracks its own open panel. A controlled one takes
`openPanel` and `onOpenPanelChange`. Start uncontrolled; convert to controlled
the moment something outside needs to read or set that value. Many library
components support both, defaulting to uncontrolled when the controlling prop is
`undefined`. See [Controlled inputs](../patterns/controlled-inputs.md) for the
form-specific version of this idea.

## Common patterns

### Lift the minimum

Lift the single value that must be shared, not the whole child state object. If
a dialog owns `isOpen`, `draftTitle` and `hasUnsavedChanges`, and only `isOpen`
is shared, lift only `isOpen`.

### Two setters, one source of truth

When siblings edit different representations of one value (Celsius and
Fahrenheit, a slider and a number box), store one canonical value plus which
input the user last touched, and compute the other. Storing both fields
independently guarantees they will disagree.

### Prop drilling is not automatically a problem

Passing a prop through two or three components is normal React. It is explicit,
it is greppable, it type-checks, and every consumer is visible in the tree.
Reaching for context to avoid two intermediate props trades a small annoyance
for an implicit dependency and a re-render model you now have to reason about.

Drilling becomes a real problem when:

- The chain is five or more levels deep.
- Intermediate components take props they never read and only forward.
- Adding one field to the value means editing eight files.
- The same prop is threaded to many unrelated subtrees.

Before treating that as a context problem, try composition — it removes most
drilling without adding any indirection.

## Advanced example

Composition means passing rendered elements as props (usually `children`)
instead of passing data down for a descendant to render. The intermediate
components stop knowing about the data entirely, because they never touch it.

In the example below `DashboardShell` and `Panel` are pure layout. They forward
nothing, because the elements that need `user` are created up in `Dashboard`,
where `user` already is.

```jsx live
import { useState } from 'react';

function Panel({ title, children }) {
  return (
    <section style={{ border: '1px solid #ccc', padding: 12, marginTop: 8 }}>
      <h3 style={{ margin: '0 0 8px' }}>{title}</h3>
      {children}
    </section>
  );
}

function DashboardShell({ header, main }) {
  return (
    <div>
      <header style={{ borderBottom: '1px solid #ccc', paddingBottom: 8 }}>
        {header}
      </header>
      <main>{main}</main>
    </div>
  );
}

function Greeting({ user }) {
  return <strong>Signed in as {user.name}</strong>;
}

function PlanSummary({ user }) {
  return <p>Plan: {user.plan}</p>;
}

export default function Dashboard() {
  const [user, setUser] = useState({ name: 'Ada Lovelace', plan: 'Team' });

  return (
    <DashboardShell
      header={<Greeting user={user} />}
      main={
        <Panel title="Billing">
          <PlanSummary user={user} />
          <button
            onClick={() =>
              setUser((current) => ({
                ...current,
                plan: current.plan === 'Team' ? 'Enterprise' : 'Team',
              }))
            }
          >
            Switch plan
          </button>
        </Panel>
      }
    />
  );
}
```

`DashboardShell` never mentions `user`. If you later add `user.avatarUrl`, you
edit `Greeting` and `Dashboard` — nothing in between. That is the property
context is usually bought for, at a fraction of the cost.

Composition also fixes the re-render story for free: `DashboardShell` and
`Panel` receive the same element props unless `Dashboard` re-renders, and they
have no subscription to anything. See
[Composition](../patterns/composition.md).

> [!TIP]
> The rule of thumb: exhaust lifting, then composition, then reach for
> [Context](./context.md). Most teams skip step two and land in a codebase with
> fourteen providers.

## Common mistakes

**Copying props into state.** `const [name, setName] = useState(props.name)`
captures the prop once and then ignores it. The component now has two sources of
truth. Either render `props.name` directly, or — if you genuinely want a
resettable draft — reset it by changing the component's `key`.

**Syncing two states with an Effect.** An Effect that reads state A and calls
`setB` runs after the render that already painted the stale value, causing a
visible flash and an extra render pass. Compute B during render instead.

**Storing derived values.** `filteredProducts`, `total`, `isFormValid` and
`fullName` are computations, not state. Anything you can calculate from existing
state or props should be calculated.

**Lifting to the root out of habit.** State at the app root re-renders the app.
Put it on the closest common ancestor and no higher.

**Passing `setState` where an event handler belongs.** Exporting the raw setter
lets children set any value, including invalid ones. A named callback lets the
parent keep its invariants.

**Treating drilling as an emergency.** Two levels of props is not technical
debt. Rewriting them as context adds an invisible dependency, a provider you can
forget to render, and a re-render model to reason about — for a problem you did
not have.

**Forgetting `key` on lifted lists.** When the shared state is "which row is
selected", store a stable id, not an array index. Indices change when the list
is reordered or filtered, and the selection silently follows the wrong row.

## Related topics

- [Context](./context.md) — when the value is genuinely app-wide and drilling
  has stopped scaling.
- [Composition](../patterns/composition.md) — pass elements as props to delete
  most prop drilling without indirection.
- [Controlled inputs](../patterns/controlled-inputs.md) — lifting state up,
  applied to form fields.
- [useState](../hooks/use-state.md) — the hook that holds the lifted value.
- [Choosing an approach](./choosing-an-approach.md) — the full ladder from local
  state to a server-state library.
- [State](../core-concepts/state.md) — what qualifies as state in the first
  place.
