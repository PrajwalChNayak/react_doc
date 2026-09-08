---
title: useCallback
description: Cache a function definition so its identity is stable between re-renders.
group: hooks
order: 110
status: current
related: [hooks/use-memo, performance/memoization, performance/react-compiler, hooks/use-effect]
---

## Overview

`useCallback` returns the same function object across renders, as long as its
dependencies do not change.

```text
const cachedFn = useCallback(fn, dependencies)
```

| Parameter | Meaning |
|---|---|
| `fn` | The function to cache. React returns it — it never calls it. |
| `dependencies` | An inline array of every reactive value `fn` reads. Compared with `Object.is`. |

It is `useMemo` with one specialization:

```js
function useCallback(fn, dependencies) {
  return useMemo(() => fn, dependencies);
}
```

That is not an analogy — it is the actual relationship. `useMemo` caches what a
function *returns*; `useCallback` caches the function *itself*.

> [!NOTE]
> The **React Compiler** (v1.0, released **7 October 2025**) memoizes functions
> automatically in code that follows the Rules of React. In a compiled codebase
> almost every `useCallback` is redundant. See
> [React Compiler](../performance/react-compiler.md).

## Why it exists

Function declarations create a new object every time they are evaluated. A
handler defined in a component body is a different function on every render,
even though the source is identical:

```js
const a = () => {};
const b = () => {};
a === b; // false
```

Usually nobody notices. But React compares props with `Object.is`, and so do
dependency arrays. A new function identity means a `memo` child re-renders, an
Effect tears down and reconnects, and a `useMemo` recalculates — all because of
an object nobody cared about.

`useCallback` freezes that identity so the comparison downstream can succeed.

## When to use it

Only when a function's **identity** is observed by something. There are exactly
three cases:

1. **The function is a prop of a [`memo`](../performance/memoization.md)
   component.** Without a stable identity, `memo` compares props, finds a
   difference, and re-renders anyway.
2. **The function is a dependency of an Effect.** A new identity on every render
   re-runs the Effect on every render — often reconnecting a socket or
   re-fetching.
3. **The function is a dependency of another hook** — a `useMemo`, another
   `useCallback`, or a custom hook that lists it.

If you cannot name which of those three applies, delete the `useCallback`.

## When not to use it

- **On every handler.** `useCallback` does not make anything faster on its own.
  It **adds** work: allocating the dependency array, comparing it, and keeping
  the previous function alive. On a plain `<button onClick={...}>` it is pure
  overhead.
- **When the child is not memoized.** A regular child re-renders when its parent
  re-renders regardless of prop identity. Stabilizing the callback changes
  nothing.
- **When the dependencies change every render anyway.** A callback that depends
  on a fresh object is never cached.
- **For correctness.** Like `useMemo`, React may discard the cache. Code that
  needs a function's identity to stay stable forever is broken code.
- **When the React Compiler is enabled.** Let it do this.

> [!BEST-PRACTICE]
> Before reaching for `useCallback`, try the structural fixes: pass JSX as
> `children` so a parent's state change does not re-render the subtree, keep
> state local to the component that uses it, and move an object or function that
> an Effect needs *inside* the Effect so it never becomes a dependency.

## Basic example

The classic case: a `memo` child defeated by an inline callback, and the fix.

```jsx live
import { memo, useCallback, useState } from 'react';

let filterRenderCount = 0;

const TagFilter = memo(function TagFilter({ onSelect }) {
  filterRenderCount += 1;
  return (
    <div>
      <p>TagFilter rendered {filterRenderCount} times</p>
      <button onClick={() => onSelect('forms')}>Forms</button>
      <button onClick={() => onSelect('layout')}>Layout</button>
    </div>
  );
});

export default function Toolbar() {
  const [tag, setTag] = useState('none');
  const [zoom, setZoom] = useState(100);

  // Stable identity: TagFilter only re-renders when it truly must.
  const handleSelect = useCallback(nextTag => {
    setTag(nextTag);
  }, []);

  return (
    <div>
      <button onClick={() => setZoom(z => z + 10)}>Zoom: {zoom}%</button>
      <TagFilter onSelect={handleSelect} />
      <p>Selected tag: {tag}</p>
    </div>
  );
}
```

The module-level counter is a demonstration device only — mutating it during
render is impure, and StrictMode's double-invoke will inflate it. Use the
DevTools Profiler for real measurements.

Clicking **Zoom** re-renders `Toolbar` but not `TagFilter`. Replace
`handleSelect` with an inline `onSelect={nextTag => setTag(nextTag)}` and the
render count climbs on every zoom click — `memo` is still there, but it has
nothing left to compare successfully.

> [!WARNING]
> `memo` plus an inline callback is the single most common wasted optimization in
> React codebases. The `memo` looks like it is working; it is being defeated by
> the prop right next to it. Either stabilize every non-primitive prop, or drop
> the `memo` and stop paying for the comparison.

## How it works

### Across re-renders

React stores the function and its dependency array on the fiber. Each render it
compares the new array to the old one item by item with `Object.is`. Equal means
you get the previous function back; different means you get the one you just
passed, and it becomes the new cached value.

The array must have a **constant length** and be written inline, because React
matches entries by position.

The function you get back always closes over the render in which it was
*created*, not the render in which it is *called*. That is the source of stale
closure bugs — see [Common mistakes](#common-mistakes).

### StrictMode

StrictMode's double-invoke calls your component body twice, so the function
literal is created twice and one copy is discarded. `useCallback` itself does
not call your function, so nothing runs twice.

Where StrictMode does bite is the second half of its behavior: mounting,
unmounting, and remounting each component. An Effect that depends on a
`useCallback` will run, clean up, and run again. If the Effect is not idempotent
that will show, which is the point.

### Concurrent rendering

Concurrent React can discard a render. Because `useCallback` never invokes your
function, a discarded render leaves no trace beyond an allocation.

The important interaction is with [`useTransition`](./use-transition.md): a
stable callback identity keeps a heavy `memo` subtree from re-rendering during a
transition, which is what makes the transition cheap enough to be interruptible
in the first place.

`startTransition` from `useTransition` already has a stable identity, so you
never need to wrap it.

## Common patterns

### Keeping an Effect from re-running

```jsx live
import { useCallback, useEffect, useState } from 'react';

export default function EventLog() {
  const [category, setCategory] = useState('clicks');
  const [entries, setEntries] = useState([]);
  const [tick, setTick] = useState(0);

  // Depends only on category, so the Effect below reconnects
  // only when the category actually changes.
  const record = useCallback(
    label => {
      setEntries(previous => [...previous, `${category}: ${label}`].slice(-5));
    },
    [category]
  );

  useEffect(() => {
    record('subscribed');
    return () => {
      // A real subscription would be torn down here.
    };
  }, [record]);

  return (
    <div>
      <button onClick={() => setTick(t => t + 1)}>
        Unrelated re-render ({tick})
      </button>
      <button
        onClick={() =>
          setCategory(c => (c === 'clicks' ? 'scrolls' : 'clicks'))
        }
      >
        Category: {category}
      </button>
      <ul>
        {entries.map((entry, index) => (
          <li key={index}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
```

> [!TIP]
> Often the better fix is to remove the dependency instead of stabilizing it.
> Move the function inside the Effect, or — when the function reads reactive
> values but should not re-trigger the Effect — use
> [`useEffectEvent`](./use-effect-event.md), added in **19.2**.

### Returning a stable function from a custom hook

A custom hook that hands back a function should stabilize it, because its
callers cannot.

```jsx
import { useCallback, useState } from 'react';

/** @returns {[boolean, () => void]} */
export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle];
}

export default function Disclosure() {
  const [open, toggle] = useToggle();
  return (
    <div>
      <button onClick={toggle}>{open ? 'Hide' : 'Show'} details</button>
      {open && <p>Shipping takes 3-5 business days.</p>}
    </div>
  );
}
```

Note the updater form `setValue(v => !v)`. It lets the dependency array stay
empty — reading `value` directly would force `[value]` and a new identity on
every change.

### Updating state without depending on it

```jsx
import { useCallback, useState } from 'react';

export default function Cart() {
  const [items, setItems] = useState([]);

  // Empty deps: the updater receives the current state,
  // so the callback never needs to read `items`.
  const addItem = useCallback(sku => {
    setItems(current => [...current, sku]);
  }, []);

  return (
    <div>
      <button onClick={() => addItem('SKU-1001')}>Add item</button>
      <p>{items.length} in cart</p>
    </div>
  );
}
```

## Advanced example

`useCallback` and `useMemo` are the same mechanism, so use whichever fits the
shape of the value. Here a list row is memoized, its handler is stabilized, and
the derived data is memoized — all three needed for the optimization to hold.

```jsx live
import { memo, useCallback, useMemo, useState } from 'react';

const inventory = Array.from({ length: 300 }, (_, index) => ({
  sku: `SKU-${1000 + index}`,
  name: `Widget ${index}`,
  inStock: index % 4 !== 0,
}));

const InventoryRow = memo(function InventoryRow({ item, onToggle }) {
  return (
    <li>
      <label>
        <input
          type="checkbox"
          checked={item.selected}
          onChange={() => onToggle(item.sku)}
        />
        {item.name} {item.inStock ? '' : '(backordered)'}
      </label>
    </li>
  );
});

export default function InventoryList() {
  const [selected, setSelected] = useState(() => new Set());
  const [showBackordered, setShowBackordered] = useState(true);

  const onToggle = useCallback(sku => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }
      return next;
    });
  }, []);

  const rows = useMemo(
    () =>
      inventory
        .filter(item => showBackordered || item.inStock)
        .slice(0, 50)
        .map(item => ({ ...item, selected: selected.has(item.sku) })),
    [showBackordered, selected]
  );

  return (
    <div>
      <button onClick={() => setShowBackordered(v => !v)}>
        {showBackordered ? 'Hide' : 'Show'} backordered
      </button>
      <p>{selected.size} selected</p>
      <ul>
        {rows.map(item => (
          <InventoryRow key={item.sku} item={item} onToggle={onToggle} />
        ))}
      </ul>
    </div>
  );
}
```

Toggling one checkbox re-creates only the rows whose `selected` flag changed;
every other `InventoryRow` bails out because both `item` and `onToggle` compare
equal.

That is three hooks and a `memo` for one list. With the React Compiler enabled
you write the same component with no `useCallback`, no `useMemo`, and no `memo`,
and get the same result — which is the strongest argument for adopting it.

## Common mistakes

**Wrapping every handler.** If the child is not `memo`-wrapped and the function
is not a dependency of anything, `useCallback` is a net loss.

**Stabilizing the callback but not the other props.** `memo` compares *all*
props. A stable `onToggle` next to an inline `style={{ margin: 8 }}` or
`items={rows.filter(...)}` still fails the comparison.

**Missing dependencies.** A callback that reads `userId` without listing it
keeps calling the API with the first `userId` forever. Let
`eslint-plugin-react-hooks` find these; do not add a suppression comment.

**Adding a dependency you could have avoided.** `useCallback(() => setCount(count + 1), [count])`
changes identity on every increment, defeating itself. Use the updater form
`setCount(c => c + 1)` and an empty array.

**Forgetting the array.** `useCallback(fn)` returns a new function every render.
Strictly worse than not using the hook.

**Calling it conditionally.** Hooks must run in the same order every render.
Extract a component instead.

**Expecting it to speed up the function.** `useCallback` caches the definition,
not the result. If the function body is slow, it is still slow every time it is
called — that is `useMemo`'s job, and only for values.

**Using it to fix a stale-closure bug.** If a callback reads an outdated value,
the dependency array is wrong. Widening it is the fix; a ref is a last resort;
[`useEffectEvent`](./use-effect-event.md) is the designed answer when an Effect
needs the latest value without re-running.

## Related topics

- [useMemo](./use-memo.md) — the general form; cache a value instead of a
  function.
- [Memoization](../performance/memoization.md) — where `memo` fits, and when the
  whole trio is worth it.
- [React Compiler](../performance/react-compiler.md) — automatic memoization
  that removes the need for this hook.
- [useEffect](./use-effect.md) — the dependency array that most often motivates a
  `useCallback`.
- [useEffectEvent](./use-effect-event.md) — read the latest values from an Effect
  without adding a dependency.
