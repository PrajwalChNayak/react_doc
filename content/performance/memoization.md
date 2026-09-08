---
title: Memoization
description: What memo, useMemo and useCallback actually do, and the narrow cases where writing them by hand still pays.
group: performance
order: 30
status: current
related: [performance/react-compiler, hooks/use-memo, hooks/use-callback]
---

## Overview

React has three caching tools:

- **`memo`** wraps a component and skips re-rendering it when its props are
  shallowly equal to last time.
- **`useMemo`** caches a *value* between renders while its dependencies are
  unchanged.
- **`useCallback`** caches a *function* between renders while its dependencies
  are unchanged. It is `useMemo` with a nicer shape for functions.

All three trade memory and comparison work for skipped work. That trade is
sometimes worth it. It is worth it far less often than the amount of
memoization in real codebases suggests.

> [!BEST-PRACTICE]
> Write the clear version first. Enable the [React Compiler](./react-compiler.md),
> which memoizes for you at build time. Reach for these three by hand only when
> the compiler is not an option or a profile shows a specific cost.

## Why it exists

When a component re-renders, React calls it again and re-renders everything it
returns. It does not track which child read which value — it re-runs the subtree
and relies on the diff being cheap.

That default is right for most trees. It stops being right when the subtree is
genuinely expensive: a table of a thousand rows, a chart that recomputes a
layout, a component that runs a costly transform on a large array. For those,
you need a way to say "nothing this depends on changed — skip it."

That is the entire purpose of the three APIs. They are not general-purpose
speedups.

### The three tools compared

| | `memo` | `useMemo` | `useCallback` |
|---|---|---|---|
| What it caches | A rendered component | Any value | A function reference |
| What triggers a recompute | A prop that is not shallowly equal | A dependency changed | A dependency changed |
| Where it goes | Around the component definition | Inside the component | Inside the component |
| Helps when | Re-rendering the child is expensive **and** props are usually stable | The computation is expensive, or the identity is needed downstream | The function is passed to a `memo` child or an Effect dependency array |
| Does nothing when | Any prop is a fresh object, array or function each render | The computation is trivial | The consumer is a plain DOM element |
| Cost | A shallow prop comparison per render | Memory plus a dependency comparison | Memory plus a dependency comparison |

`useCallback(fn, deps)` is equivalent to `useMemo(() => fn, deps)`. It exists
because the arrow-returning-an-arrow form is unreadable.

## When to use it

Four cases survive scrutiny.

**A genuinely expensive computation.** Sorting or aggregating thousands of
items, parsing a large payload, computing a layout. "Expensive" means
milliseconds you can see in a profile, not "it loops."

**A referentially stable context value.** Every consumer of a context
re-renders when the context value changes by identity. An object literal in the
provider changes identity on every render, so every consumer re-renders on every
provider render.

**A stable dependency for an Effect.** If an Effect depends on a function or
object, an unstable identity re-runs the Effect on every render — which can mean
a re-subscription or a refetch loop. Often the better fix is to move the value
inside the Effect, or use
[`useEffectEvent`](../hooks/use-effect-event.md), rather than memoize it.

**A `memo` child whose props are otherwise stable.** `memo` only pays off if the
props actually compare equal, which means every object, array and function prop
must be memoized too.

## When not to use it

**On cheap components.** Wrapping a component that renders a label in `memo`
adds a prop comparison to every render to avoid work that costs less than the
comparison.

**On primitive values.** `useMemo(() => count * 2, [count])` is slower than
`count * 2`. The hook call, the dependency array allocation and the comparison
all cost more than the multiply.

**To "prevent re-renders" as a policy.** Re-renders are not inherently bad.
Optimize the ones a profile flags.

**When the React Compiler is enabled and the component carries the ✨ badge.**
The compiler already did it, at a finer grain, without a dependency array to
maintain.

## Basic example

`memo` in the case it was built for: a parent re-renders often, and one child is
expensive but its props rarely change.

```jsx live
import { memo, useState } from 'react';

function expensiveScore(seed) {
  let total = 0;
  for (let i = 0; i < 2_000_000; i++) {
    total += (i * seed) % 7;
  }
  return total;
}

const RiskScore = memo(function RiskScore({ seed }) {
  const score = expensiveScore(seed);
  return (
    <p>
      Risk score for seed {seed}: <strong>{score}</strong>
    </p>
  );
});

export default function RiskDashboard() {
  const [seed, setSeed] = useState(3);
  const [clicks, setClicks] = useState(0);

  return (
    <div>
      <button onClick={() => setClicks((c) => c + 1)}>
        Unrelated clicks: {clicks}
      </button>{' '}
      <button onClick={() => setSeed((s) => s + 1)}>Change seed</button>
      <RiskScore seed={seed} />
    </div>
  );
}
```

Click "Unrelated clicks" repeatedly — it stays responsive, because `RiskScore`
is skipped. Click "Change seed" and you will feel the two-million-iteration
loop.

Now the honest part: remove `memo` and the unrelated clicks become sluggish.
Keep `memo` but make the loop 200 iterations instead of two million, and
removing `memo` makes no perceptible difference at all. **The win exists only
because the child render is genuinely expensive.**

## How it works

### `memo` compares props shallowly

`memo` stores the previous props and compares each key with `Object.is`. If
every key matches, React reuses the previous render output and does not call the
function.

Shallow means one level. A prop whose value is a new object with identical
contents is *not* equal:

```jsx
import { memo } from 'react';

const Legend = memo(function Legend({ config }) {
  return <p>{config.label}</p>;
});

export function Chart() {
  // 🔴 New object every render — Legend re-renders every time.
  return <Legend config={{ label: 'Revenue' }} />;
}
```

This is the single most common reason `memo` appears to do nothing. Same story
for inline callbacks: `onSelect={() => select(id)}` creates a new function on
every render and defeats the comparison.

`memo` accepts a second argument, a custom comparison function, but reaching for
it usually means the prop shape is wrong. Pass primitives, or memoize the object
at its source.

> [!WARNING]
> `memo` is a hint, not a guarantee. React may re-render a memoized component
> anyway — for example when state inside it changes, or when a context it
> consumes updates. Never write code whose correctness depends on a component
> being skipped.

### `useMemo` caches during render

`useMemo(compute, deps)` runs `compute` on the first render and on any render
where a dependency changed by `Object.is`. Otherwise it returns the stored
value.

The cache holds one entry, and it is discarded when the component unmounts.
`useMemo` is not a data cache — see [caching](../data-fetching/caching.md) for
that.

### Both interact with StrictMode and concurrent rendering

In development, StrictMode double-invokes render functions, which means your
`useMemo` factory runs twice. That is a purity check, not a bug: if running it
twice produces a different result, the function is not pure and the compiler
will not be able to optimize it either.

React may also discard a render in progress (a transition that got interrupted)
and start over, re-running memo factories. Both behaviors are why the factory
must have no side effects.

## Common patterns

### Before and after: an unstable context value

Every consumer of this context re-renders whenever `Session` re-renders, because
the value object is new each time.

```jsx
import { createContext, useState } from 'react';

const SessionContext = createContext({ user: { name: 'Guest' }, signOut: () => {} });

export function Session({ children }) {
  const [user, setUser] = useState({ name: 'Priya' });

  // 🔴 New object identity on every render.
  return (
    <SessionContext value={{ user, signOut: () => setUser({ name: 'Guest' }) }}>
      {children}
    </SessionContext>
  );
}
```

Memoize both the callback and the value, and the identity only changes when
`user` does:

```diff
-import { createContext, useState } from 'react';
+import { createContext, useCallback, useMemo, useState } from 'react';

+  // `setUser` is stable, so `signOut` never changes identity.
+  const signOut = useCallback(() => setUser({ name: 'Guest' }), []);
+  const value = useMemo(() => ({ user, signOut }), [user, signOut]);

-    <SessionContext value={{ user, signOut: () => setUser({ name: 'Guest' }) }}>
+    <SessionContext value={value}>
```

> [!NOTE]
> Since React 19 you render `<SessionContext>` directly as the provider. The
> `.Provider` form is deprecated. The memoization advice is unchanged.

### Before and after: a callback that defeats `memo`

```jsx
import { memo, useState } from 'react';

const RowList = memo(function RowList({ rows, onSelect }) {
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          <button onClick={() => onSelect(row.id)}>{row.label}</button>
        </li>
      ))}
    </ul>
  );
});

export function Inbox({ rows }) {
  const [selectedId, setSelectedId] = useState(null);

  // 🔴 New function identity every render — `memo` never skips.
  return (
    <div>
      <p>Selected: {String(selectedId)}</p>
      <RowList rows={rows} onSelect={(id) => setSelectedId(id)} />
    </div>
  );
}
```

The fix is `useCallback`. The state setter is already stable, so the dependency
array is empty:

```diff
-import { memo, useState } from 'react';
+import { memo, useCallback, useState } from 'react';

 export function Inbox({ rows }) {
   const [selectedId, setSelectedId] = useState(null);
+  const handleSelect = useCallback((id) => setSelectedId(id), []);

-      <RowList rows={rows} onSelect={(id) => setSelectedId(id)} />
+      <RowList rows={rows} onSelect={handleSelect} />
```

`rows` still has to be stable at the call site for this to pay off. Memoization
is only as strong as the least stable prop.

### Restructure instead of memoizing

Often the cheaper fix is not to cache but to move state down or pass children
through. A component that receives `children` does not re-render them when its
own state changes, because the elements were created by the parent:

```jsx
import { useState } from 'react';

export function Panel({ children }) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button onClick={() => setOpen((o) => !o)}>Toggle</button>
      {open ? children : null}
    </section>
  );
}
```

Render `<Panel><ExpensiveReport /></Panel>` and toggling `open` re-renders
`Panel`, but `children` is the same element object the parent already created,
so `ExpensiveReport` is not re-rendered. No `memo` required. See
[composition](../patterns/composition.md).

## Advanced example

`useMemo` earning its place: a derived index built from a large dataset, kept
out of the keystroke path.

```jsx live
import { useMemo, useState } from 'react';

const EMPLOYEES = Array.from({ length: 5000 }, (_, index) => ({
  id: index,
  name: `Employee ${index}`,
  department: ['Design', 'Engineering', 'Sales', 'Support'][index % 4],
}));

export default function DepartmentBreakdown() {
  const [department, setDepartment] = useState('Engineering');
  const [note, setNote] = useState('');

  // Expensive enough to matter, and independent of `note`.
  const countsByDepartment = useMemo(() => {
    const counts = new Map();
    for (const employee of EMPLOYEES) {
      counts.set(employee.department, (counts.get(employee.department) ?? 0) + 1);
    }
    return counts;
  }, []);

  const matches = useMemo(
    () => EMPLOYEES.filter((employee) => employee.department === department),
    [department],
  );

  return (
    <div>
      <label>
        Department{' '}
        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        >
          {[...countsByDepartment.entries()].map(([name, count]) => (
            <option key={name} value={name}>
              {name} ({count})
            </option>
          ))}
        </select>
      </label>
      <p>
        <label>
          Note{' '}
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
      </p>
      <p>{matches.length} people in {department}</p>
    </div>
  );
}
```

Typing in the note field re-renders the component but does not rebuild
`matches`, because `department` did not change. Without `useMemo`, every
keystroke filters 5,000 records.

With the React Compiler enabled, both `useMemo` calls are redundant — write the
plain expressions and let the build handle it.

## Common mistakes

**Wrapping everything.** `useCallback` on every handler and `memo` on every
component is a measurable slowdown: you pay allocation, comparison and memory on
every render for wins that mostly do not exist.

**Memoizing a child while passing it a fresh object.** `<Chart memo-wrapped
options={{ theme: 'dark' }} />` never skips. The prop is new every time. This is
the most common wasted `memo` in real code.

**Forgetting the dependency array is a contract.** A missing dependency gives
you a stale value that updates "sometimes" — the hardest class of React bug to
reproduce. The `eslint-plugin-react-hooks` exhaustive-deps rule exists because
humans cannot maintain these reliably.

**Using `useMemo` to skip an Effect.** If the Effect runs too often, fix the
Effect: narrow its dependencies, move logic inside it, or use
[`useEffectEvent`](../hooks/use-effect-event.md). Memoizing the input treats the
symptom.

**Putting side effects in a `useMemo` factory.** It may run twice in
development, and may be discarded and re-run under concurrent rendering. Side
effects belong in Effects or event handlers.

**Assuming `memo` guarantees a skip.** It does not. State changes inside the
component and context updates re-render it regardless.

**Keeping hand-written memoization after adopting the compiler.** It is dead
weight the compiler now duplicates, and every dependency array is a bug waiting
to happen.

## Related topics

- [React Compiler](./react-compiler.md) — why most of this page is becoming
  optional.
- [useMemo](../hooks/use-memo.md) — the hook reference.
- [useCallback](../hooks/use-callback.md) — the hook reference.
- [Context](../state-management/context.md) — where an unstable value causes the
  most damage.
- [Composition](../patterns/composition.md) — restructuring instead of caching.
- [Profiling](./profiling.md) — proving a memoization change did anything.
