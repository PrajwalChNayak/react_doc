---
title: useState
description: Add a piece of local state to a component and re-render when it changes.
group: hooks
order: 20
status: current
related: [hooks/use-reducer, hooks/use-ref, core-concepts/state]
---

## Overview

`useState` declares one piece of state that belongs to a component instance and
survives re-renders.

```text
const [state, setState] = useState(initialState)
```

- `initialState` — the value used on the first render only. Pass a **function**
  to compute it lazily.
- Returns a pair: the value for **this** render, and a setter that schedules a
  re-render with a new value.

```jsx live
import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((c) => c + 1)}>
      Clicked {count} times
    </button>
  );
}
```

## Why it exists

A component is a function that returns markup. Called twice with the same props,
it must produce the same output — otherwise React could not re-run it freely,
and concurrent rendering would be impossible.

But interfaces change over time. `useState` is the escape hatch: React stores
the value outside your function and hands it back on each call, so your function
stays pure while the app stays interactive.

The setter is not an assignment. It is a **request to re-render** with a
different value. That distinction explains almost every surprise on this page.

## When to use it

- A value that changes in response to a user event or a timer, and that the UI
  displays.
- A value owned by one component or its subtree. Lift it up only when a sibling
  needs it.
- Independent values. Two unrelated booleans are two `useState` calls, not one
  object.

## When not to use it

- **Values you can compute from existing state or props.** Compute them during
  render instead. Storing derived data means two sources of truth that drift.
- **Values that do not affect the output.** A timeout id, a previous scroll
  position, an interval handle — use [`useRef`](./use-ref.md). Writing them to
  state causes a pointless re-render.
- **Several values that always change together, driven by the same events.**
  Reach for [`useReducer`](./use-reducer.md).
- **Data that lives outside React** — a browser API, a third-party store, a
  global. Subscribe with
  [`useSyncExternalStore`](./use-sync-external-store.md).
- **Server data you want cached and shared.** See
  [data fetching](../data-fetching/overview.md).
- **A constant.** Move it outside the component.

## Basic example

State is a snapshot. Within one render, `count` is a plain number that never
changes — even after you call the setter.

```jsx live
import { useState } from 'react';

export default function ScoreBoard() {
  const [score, setScore] = useState(0);

  function addThreeWrong() {
    // All three read the same snapshot: 0. Final value: 1.
    setScore(score + 1);
    setScore(score + 1);
    setScore(score + 1);
  }

  function addThreeRight() {
    // Each updater receives the result of the previous one. Final value: 3.
    setScore((s) => s + 1);
    setScore((s) => s + 1);
    setScore((s) => s + 1);
  }

  return (
    <div>
      <p>Score: {score}</p>
      <button onClick={addThreeWrong}>+3 (direct)</button>{' '}
      <button onClick={addThreeRight}>+3 (updater)</button>{' '}
      <button onClick={() => setScore(0)}>Reset</button>
    </div>
  );
}
```

> [!BEST-PRACTICE]
> When the next value depends on the current one, pass the updater function.
> `setScore(s => s + 1)` is correct under batching, inside Effects, and inside
> async callbacks that captured an old render's variables.

## How it works

**Across re-renders.** `count` is a `const` bound to this render's value. Calling
`setCount` does not mutate it; it queues an update and schedules a re-render. On
the next render, `useState` returns the new value from the same slot.

**Batching.** React batches every update produced during one event — and, since
React 18, updates from timeouts, promises and native handlers too — into a
single re-render. Reading state right after calling the setter always gives you
the old value.

**Bailing out.** If the new value is identical to the current one under
`Object.is`, React skips re-rendering that component and its children. This is
why mutating an object and passing the same reference back appears to do
nothing.

**Lazy initialization.** `useState(createRows())` calls `createRows` on *every*
render and throws the result away after the first. `useState(createRows)` calls
it once.

```jsx
import { useState } from 'react';

function createEmptyGrid() {
  return Array.from({ length: 400 }, () => 0);
}

export default function Grid() {
  // Called on every render, result ignored after the first. Wasteful.
  const [wasteful] = useState(createEmptyGrid());
  // Called once, on mount.
  const [cells] = useState(createEmptyGrid);
  return <p>{cells.length} cells ({wasteful.length} wasted)</p>;
}
```

**With StrictMode.** In development, React calls your **initializer** and your
**updater** functions twice and discards one result. This is a purity check.
A pure initializer returns the same value both times and nothing else happens; an
impure one — reading a counter, pushing to an array outside the component,
generating an id from a mutable source — visibly misbehaves. That is the bug
StrictMode is showing you, not a bug in React.

**With concurrent rendering.** React may render your component with a pending
update, abandon that work and render again. Updater functions may therefore run
more than once for one logical update, so they must be pure: derive the next
value from the argument and return it. Never fire a side effect from inside one.

## Common patterns

### Objects and arrays: replace, never mutate

React compares with `Object.is`. Mutating an object keeps the same reference, so
React bails out and your screen does not update.

```jsx live
import { useState } from 'react';

export default function ProfileEditor() {
  const [person, setPerson] = useState({
    firstName: 'Ada',
    lastName: 'Lovelace',
  });
  const [languages, setLanguages] = useState(['JavaScript']);
  const [draft, setDraft] = useState('');

  return (
    <div>
      <input
        value={person.firstName}
        onChange={(e) =>
          // New object, old fields spread in.
          setPerson({ ...person, firstName: e.target.value })
        }
      />
      <p>
        {person.firstName} {person.lastName}
      </p>

      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button
        onClick={() => {
          // New array. Never languages.push(draft).
          setLanguages((current) => [...current, draft]);
          setDraft('');
        }}
      >
        Add language
      </button>
      <ul>
        {languages.map((language) => (
          <li key={language}>{language}</li>
        ))}
      </ul>
    </div>
  );
}
```

Use `[...items, next]` to append, `items.filter(...)` to remove,
`items.map(...)` to replace one entry, and `[...items].sort()` to sort a copy.
`push`, `splice`, `sort` and `reverse` mutate in place.

### Reset state with `key`, not with an Effect

When a prop changes and a component's state should start over, change its
`key`. React unmounts the old instance, discards its hook list, and mounts a
fresh one.

```jsx live
import { useState } from 'react';

function CommentBox({ articleId }) {
  const [text, setText] = useState('');
  return (
    <textarea
      rows={3}
      placeholder={`Comment on article ${articleId}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

export default function ArticleReader() {
  const [articleId, setArticleId] = useState(1);
  return (
    <div>
      <button onClick={() => setArticleId((id) => id + 1)}>
        Next article (now #{articleId})
      </button>
      {/* Changing key resets the draft. No Effect required. */}
      <CommentBox key={articleId} articleId={articleId} />
    </div>
  );
}
```

### Derive during render — do not mirror props into state

This is the single most common misuse of `useState`.

```jsx
import { useState, useEffect } from 'react';

// Anti-pattern: a third source of truth, one render behind.
export default function ProductListSlow({ products }) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(products);

  useEffect(() => {
    setVisible(products.filter((p) => p.name.includes(query)));
  }, [products, query]);

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <p>{visible.length} products</p>
    </>
  );
}
```

That renders once with stale data, runs the Effect, sets state, and renders
again. Compute it instead:

```jsx
import { useState } from 'react';

export default function ProductList({ products }) {
  const [query, setQuery] = useState('');
  const visible = products.filter((p) => p.name.includes(query));

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <p>{visible.length} products</p>
    </>
  );
}
```

One render, one source of truth, nothing to keep in sync. If the calculation is
genuinely expensive, wrap it in [`useMemo`](./use-memo.md) — and check first
whether the [React Compiler](../performance/react-compiler.md) has already done
it for you.

> [!BEST-PRACTICE]
> Before adding a `useState`, ask whether the value can be computed from what you
> already have. Most "derived state" bugs disappear when the answer is yes.

### Choosing between `useState`, `useReducer` and `useRef`

| | `useState` | `useReducer` | `useRef` |
|---|---|---|---|
| Triggers a re-render | Yes | Yes | **No** |
| How you update it | Call the setter with a value or updater | `dispatch` an action, a reducer computes the next state | Assign to `.current` |
| Best for | Independent values driven by events | Several values that change together, or transitions that depend on the previous state | Values the UI does not display |
| Update logic lives | In the event handler | In one pure reducer, testable in isolation | Nowhere — you assign directly |
| Identity of the updater | Stable | Stable | N/A |
| Readable during render | Yes | Yes | **Avoid** — reading or writing `.current` during render is impure |

## Advanced example

A small shopping cart: several updates in one handler, updater functions
throughout, immutable array edits, and a total derived during render.

```jsx live
import { useState } from 'react';

const CATALOG = [
  { id: 'kbd', name: 'Keyboard', price: 79 },
  { id: 'mse', name: 'Mouse', price: 29 },
  { id: 'mon', name: 'Monitor', price: 249 },
];

export default function Cart() {
  const [lines, setLines] = useState([
    { id: 'kbd', name: 'Keyboard', price: 79, quantity: 1 },
  ]);
  const [lastAction, setLastAction] = useState('none');

  function add(product) {
    // Two updates in one handler: batched into a single re-render.
    setLines((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.id === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }
      return [...current, { ...product, quantity: 1 }];
    });
    setLastAction(`added ${product.name}`);
  }

  // Derived during render. Not state.
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  return (
    <div>
      {CATALOG.map((product) => (
        <button key={product.id} onClick={() => add(product)}>
          Add {product.name}
        </button>
      ))}
      <ul>
        {lines.map((line) => (
          <li key={line.id}>
            {line.name} x{line.quantity} — ${line.price * line.quantity}
          </li>
        ))}
      </ul>
      <p>
        Total: ${total} (last action: {lastAction})
      </p>
    </div>
  );
}
```

Note what is *not* here: no `useEffect` recomputing the total, no `totalState`,
no synchronization. The total cannot be wrong because it is not stored.

## Common mistakes

**Reading state right after setting it.** `setCount(count + 1);
console.log(count)` logs the old value. The variable belongs to this render.

**Calling the setter several times with the direct form.**
`setCount(count + 1)` three times increments once. Use the updater form.

**Mutating an object or array in state.** `person.name = 'x'; setPerson(person)`
does nothing — `Object.is` sees the same reference and React bails out.

**Calling the initializer instead of passing it.** `useState(expensiveInit())`
runs on every render. `useState(expensiveInit)` runs once.

**An impure initializer.** `useState(() => nextId++)` produces different values
under StrictMode's double invocation. Anything that must be stable and unique
belongs in a ref, or comes from [`useId`](./use-id.md).

**Mirroring a prop into state.** `const [value, setValue] = useState(props.value)`
freezes the prop at mount. If you want it to follow the prop, do not copy it; if
you want it to reset, use `key`.

**Storing derived data.** Filtered lists, totals, formatted strings and "is the
form valid" are calculations, not state.

**Setting state in an Effect that runs on every render.** Guaranteed infinite
loop when the dependency is a fresh object or array each time.

**Using state for values the UI never shows.** Interval ids, "have I already
logged this", the last scrolled position — those belong in a ref.

**One giant state object.** Every update requires spreading the whole thing and
every field change re-renders everything that reads it. Split by what changes
together.

## Related topics

- [useReducer](./use-reducer.md) — when several values change together and transitions deserve a name.
- [useRef](./use-ref.md) — for values that persist but must not trigger a render.
- [State](../core-concepts/state.md) — the mental model of state as a render snapshot.
- [Rules of Hooks](./rules-of-hooks.md) — why the call must sit at the top level.
- [useEffect](./use-effect.md) — and why most state synchronization does not need one.
- [Lifting state up](../state-management/lifting-state-up.md) — when two components need the same value.
