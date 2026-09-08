---
title: useMemo
description: Cache the result of a calculation between re-renders.
group: hooks
order: 100
status: current
related: [hooks/use-callback, performance/memoization, performance/react-compiler, performance/profiling]
---

## Overview

`useMemo` caches a computed value so React can reuse it on the next render
instead of computing it again.

```text
const cachedValue = useMemo(calculateValue, dependencies)
```

| Parameter | Meaning |
|---|---|
| `calculateValue` | A pure function taking no arguments that returns the value to cache. |
| `dependencies` | An inline array of every reactive value the calculation reads. Compared with `Object.is`. |

On the first render React calls `calculateValue()` and stores the result. On
later renders it compares the dependencies; unchanged means you get the stored
value back, changed means it recalculates.

> [!NOTE]
> The **React Compiler**, released as **v1.0 on 7 October 2025**, memoizes
> values and functions automatically for code that follows the Rules of React.
> Most `useMemo` calls in a compiled codebase are redundant. See
> [React Compiler](../performance/react-compiler.md).

## Why it exists

Every render re-executes the whole component body. A `.filter().sort()` over ten
items is free; the same thing over fifty thousand rows on every keystroke is
not.

There is a second, less obvious reason, and in practice it is the more common
one: **JavaScript creates a new object every time an object literal is
evaluated.** A fresh `{ serverUrl, roomId }` on each render is `!==` the last
one, which defeats `memo`, re-fires Effects, and re-renders every context
consumer. `useMemo` preserves the identity, not only the value.

## When to use it

React's own documentation is blunt about this, and so are we. `useMemo` is worth
adding when one of these is true:

1. **The calculation is measurably slow** and its dependencies rarely change.
   Measure with the React DevTools Profiler first — "measurably" means you saw a
   number, not that the code looks heavy.
2. **The value is a prop of a [`memo`](../performance/memoization.md) child.** A
   new array identity makes `memo` useless, so the memoization has to start
   upstream.
3. **The value is a dependency** of an Effect, a `useCallback`, or another
   `useMemo`. Stabilizing it stops the downstream hook from re-running.
4. **The value is a context value.** Every consumer re-renders when the provider
   value changes identity, so an inline object in a provider is a broadcast
   re-render on every parent render.

## When not to use it

- **By default, on everything.** `useMemo` is not free: it allocates the
  dependency array, runs the comparison, and holds the old value in memory. On
  a cheap calculation you have added work to save none.
- **When the dependencies change every render anyway.** Memoizing a value
  derived from `Math.random()` or a new object prop caches nothing.
- **For correctness.** See below — React is allowed to discard the cache.
- **Instead of fixing the real problem.** An unnecessary Effect that sets state,
  state lifted higher than it needs to be, or a component that should have
  accepted `children` will each cause more re-renders than any `useMemo` can
  claw back.
- **When the compiler already does it.** If your build runs React Compiler,
  adding manual memoization mostly adds noise.

> [!WARNING]
> `useMemo` is a **performance hint, not a semantic guarantee.** React may throw
> the cache away — in development when you edit the file, when a component
> suspends during initial mount, and in future versions for features such as
> virtualized lists. If your code breaks when the calculation runs again, the
> bug is in your code. Never put a side effect, a counter, or an object identity
> your logic depends on for correctness inside `useMemo`.

## Basic example

A genuinely expensive derivation over a large list, recomputed only when the
inputs change — not on every keystroke in an unrelated field.

```jsx live
import { useMemo, useState } from 'react';

const transactions = Array.from({ length: 20000 }, (_, index) => ({
  id: index,
  merchant: `Merchant ${index % 500}`,
  amountCents: ((index * 7919) % 50000) + 100,
}));

function summarize(rows, minimumCents) {
  const byMerchant = new Map();
  for (const row of rows) {
    if (row.amountCents < minimumCents) continue;
    byMerchant.set(row.merchant, (byMerchant.get(row.merchant) ?? 0) + row.amountCents);
  }
  return [...byMerchant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

export default function SpendingReport() {
  const [minimum, setMinimum] = useState(0);
  const [note, setNote] = useState('');

  const topMerchants = useMemo(
    () => summarize(transactions, minimum * 100),
    [minimum]
  );

  return (
    <div>
      <label>
        Minimum amount: ${minimum}
        <input
          type="range"
          min="0"
          max="400"
          value={minimum}
          onChange={e => setMinimum(Number(e.target.value))}
        />
      </label>
      <label>
        Note (typing here does not recompute the report):
        <input value={note} onChange={e => setNote(e.target.value)} />
      </label>
      <ol>
        {topMerchants.map(([merchant, cents]) => (
          <li key={merchant}>
            {merchant}: ${(cents / 100).toFixed(2)}
          </li>
        ))}
      </ol>
    </div>
  );
}
```

Typing in the note field re-renders the component but reuses the cached summary.
Remove the `useMemo` and every keystroke re-scans twenty thousand rows.

## How it works

### Across re-renders

React keeps the last dependency array and the last result on the fiber. Each
render it walks the two arrays in parallel comparing with `Object.is`. Any
difference — including a new array literal that is deeply equal to the old one —
invalidates the cache.

The dependency array must have a **constant length** and be written inline.
React reads it positionally; a conditional dependency list would misalign the
comparison.

When a component unmounts, its cache goes with it. `useMemo` is per-component-
instance, not global.

### StrictMode

In development, StrictMode calls your component function twice, so
`calculateValue` runs **twice on the render that recalculates**. React keeps one
result and discards the other.

This is a purity check. If your calculation mutates an argument, pushes to a
module-level array, or increments a counter, StrictMode makes the damage
visible. Your calculation must be pure — that is a documented requirement, not
advice.

### Concurrent rendering

Concurrent React may start rendering a component, abandon the work, and start
over — during a transition, when a higher-priority update arrives, or when a
sibling suspends. A cache that survived a discarded render is not a correctness
problem because `useMemo` is only ever a cache of a pure computation. That is
the whole reason for the purity requirement.

The practical consequence: a slow calculation inside `useMemo` still blocks the
render it runs in. Memoizing does not make the render interruptible. To keep
typing responsive while an expensive tree renders, combine `useMemo` with
[`useDeferredValue`](./use-deferred-value.md) or
[`useTransition`](./use-transition.md).

## Common patterns

### Stabilizing a context value

An inline object in a provider re-renders every consumer whenever the provider's
parent renders, no matter what the values are.

```jsx
import { createContext, useMemo, useState } from 'react';

const SessionContext = createContext(null);

export default function SessionProvider({ children }) {
  const [user, setUser] = useState(null);

  // Without useMemo this object is new on every render, so every
  // component reading SessionContext re-renders.
  const session = useMemo(() => ({ user, signIn: setUser }), [user]);

  return <SessionContext value={session}>{children}</SessionContext>;
}
```

> [!DEPRECATED]
> The provider is rendered as `<SessionContext>`, not `<SessionContext.Provider>`.
> Since **19.0** a context object renders directly as its own provider; the
> `.Provider` form still works but is deprecated.

### Stabilizing an Effect dependency

```jsx
import { useEffect, useMemo, useState } from 'react';

function createConnection(options) {
  return {
    connect() {},
    disconnect() {},
    url: options.serverUrl,
  };
}

export default function ChatRoom() {
  const [roomId, setRoomId] = useState('general');

  const options = useMemo(
    () => ({ serverUrl: 'https://chat.example.com', roomId }),
    [roomId]
  );

  useEffect(() => {
    const connection = createConnection(options);
    connection.connect();
    return () => connection.disconnect();
  }, [options]);

  return (
    <button onClick={() => setRoomId(id => (id === 'general' ? 'random' : 'general'))}>
      Room: {roomId}
    </button>
  );
}
```

Often the better fix is to move the object *inside* the Effect and depend on
`roomId` directly — then no memoization is needed at all. Prefer that when you
can.

### Returning an object literal

A concise arrow returning an object needs parentheses, or the braces are read as
a function body and you get `undefined`.

```jsx
import { useMemo } from 'react';

export default function SearchOptions({ text }) {
  const options = useMemo(() => ({ matchMode: 'whole-word', text }), [text]);
  return <pre>{JSON.stringify(options)}</pre>;
}
```

### Choosing between the three

| | Caches | Use when |
|---|---|---|
| `useMemo(fn, deps)` | The **value** `fn()` returns | A calculation is expensive, or the resulting object's identity matters downstream |
| `useCallback(fn, deps)` | The **function** `fn` itself | A function's identity matters to a `memo` child or a hook dependency |
| `memo(Component)` | The **rendered output** of a component | A component re-renders often with identical props and is expensive to render |

`useCallback(fn, deps)` is literally `useMemo(() => fn, deps)`. And `memo` on a
child is defeated unless the props you pass it are stable — which is why these
three almost always show up together, and why the React Compiler doing all three
automatically is such a large simplification.

## Advanced example

`useMemo` alone does not keep the UI responsive — it only skips *repeat* work.
The first computation still blocks. Pair it with a deferred value and a
`memo`-wrapped child so the expensive subtree renders at a lower priority.

```jsx live
import { memo, useDeferredValue, useMemo, useState } from 'react';

const catalog = Array.from({ length: 8000 }, (_, index) => ({
  id: index,
  name: `Component ${index}`,
  tags: index % 3 === 0 ? 'form input' : 'layout container',
}));

const Results = memo(function Results({ query }) {
  const matches = useMemo(() => {
    const needle = query.toLowerCase();
    return catalog
      .filter(item => `${item.name} ${item.tags}`.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [query]);

  return (
    <ul>
      {matches.map(item => (
        <li key={item.id}>
          {item.name} — {item.tags}
        </li>
      ))}
    </ul>
  );
});

export default function ComponentSearch() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Filter components"
      />
      <div style={{ opacity: isStale ? 0.5 : 1 }}>
        <Results query={deferredQuery} />
      </div>
    </div>
  );
}
```

Three pieces, each doing one job: `useMemo` avoids recomputing for a query it has
already seen, `memo` lets React skip `Results` entirely while `deferredQuery` is
unchanged, and `useDeferredValue` keeps the input typing at full speed.

## Common mistakes

**Wrapping everything.** Memoizing `const total = price * quantity` costs more
than it saves and makes the code harder to read. Profile, then memoize.

**Missing dependencies.** If the calculation reads `props.filter` and `filter`
is not in the array, you get a stale result that only refreshes by accident.
Turn on `eslint-plugin-react-hooks` (v7, flat config by default) and fix what it
reports rather than silencing it.

**Forgetting the array entirely.** `useMemo(() => compute(a, b))` recalculates on
every render. It is strictly worse than no `useMemo` at all.

**An object literal without parentheses.** `useMemo(() => { a: 1 }, [])` returns
`undefined` — `a:` parses as a label. Write `() => ({ a: 1 })` or use an explicit
`return`.

**Depending on a new object each render.** `useMemo(..., [{ id }])` never hits
the cache, because the array holds a fresh object every time. Depend on `id`.

**Putting side effects inside.** Fetching, logging, or writing to a ref inside
`calculateValue` runs twice in StrictMode, can run during a discarded render, and
may be skipped entirely when the cache hits. Side effects go in an Effect or an
event handler.

**Calling it in a loop or a condition.** Hooks run in a fixed order. Extract a
component and call `useMemo` once at its top level.

**Relying on cache retention.** "The object identity is stable, so I'll use it as
a Map key" is a bug waiting for React to reclaim the cache.

## Related topics

- [useCallback](./use-callback.md) — the same mechanism, specialized for
  functions.
- [React Compiler](../performance/react-compiler.md) — automatic memoization
  that makes most of this page unnecessary.
- [Memoization](../performance/memoization.md) — `memo`, and how the three tools
  fit together.
- [useDeferredValue](./use-deferred-value.md) — move expensive rendering off the
  urgent path instead of trying to skip it.
- [Profiling](../performance/profiling.md) — measure before you optimize.
