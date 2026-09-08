---
title: State
description: The memory a component keeps between renders, and why each render sees a frozen snapshot of it.
group: core-concepts
order: 40
status: current
related: [hooks/use-state, core-concepts/rendering, state-management/lifting-state-up]
---

## Overview

State is the data a component remembers between renders. A local variable resets
every time the function runs; state does not.

```jsx
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
```

Two things happen when you call `setCount`: React stores the new value, and
React schedules a re-render of the component. Both matter. State that changed
without re-rendering would be invisible; a re-render without stored state would
show the old value.

This page is about how state behaves. For the full `useState` API — lazy
initializers, the returned setter's identity, resetting with a `key` — see
[`useState`](../hooks/use-state.md).

## Why it exists

React's model is that the UI is a function of state. You never write "find the
button and change its label"; you change the state and describe what the UI looks
like for that state.

For that to work, React needs a place to keep values that survive a render and
that it knows to watch. A module-level variable survives, but React has no way to
know it changed. A local variable is watched by nothing and does not survive.
State is the one storage that does both.

Each component *instance* gets its own state. Two `<Counter />` elements count
independently, with no configuration.

## When to use it

Use state for a value that changes over time **and** affects what is rendered.
Form input values, whether a menu is open, the currently selected row, the data
that came back from a request.

## When not to use it

Skip state for:

- **Anything you can compute.** A filtered list, a total, a "form is valid" flag.
  Compute it during render.
- **Values that do not affect the output.** A timeout ID, the previous value you
  only compare against, a scroll position you write but never render. Use
  [`useRef`](../hooks/use-ref.md).
- **Constants.** Put them outside the component.
- **A copy of a prop.** The copy goes stale the moment the parent changes.
- **DOM nodes.** Use a ref.

The test: if the value changed and React re-rendered, would the screen look
different? If not, it is not state.

## Basic example

```jsx live
import { useState } from 'react';

export default function SearchableList() {
  const [query, setQuery] = useState('');
  const fruits = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry'];

  // Derived during render — not state.
  const matches = fruits.filter((fruit) =>
    fruit.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter fruit"
      />
      <p>
        {matches.length} of {fruits.length} shown
      </p>
      <ul>
        {matches.map((fruit) => (
          <li key={fruit}>{fruit}</li>
        ))}
      </ul>
    </div>
  );
}
```

There is one piece of state: the query. The filtered list and the count are
derived. Storing either in state would give you two values that can disagree.

## How it works

### State is a snapshot

`count` is a `const`. It does not change during a render — it *cannot*. Calling
`setCount` does not modify the variable you are looking at; it tells React to
render again, and the next render gets its own `count`.

This is why the following button only increments once per click:

```jsx
import { useState } from 'react';

export function BrokenTripleCounter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  }

  return <button type="button" onClick={handleClick}>{count}</button>;
}
```

With `count` at 0, all three calls read the same snapshot and schedule "set it to
1". Three times. The result is 1.

Every function created during a render — including event handlers — closes over
that render's values. An event handler that fires later still sees the state from
the render that created it. That is a feature: the handler behaves consistently
with the UI the user actually clicked.

### Updater functions

To compute from the latest queued value rather than the render's snapshot, pass a
function:

```jsx live
import { useState } from 'react';

export default function BatchingDemo() {
  const [direct, setDirect] = useState(0);
  const [updater, setUpdater] = useState(0);

  function bumpBoth() {
    setDirect(direct + 1);
    setDirect(direct + 1);
    setDirect(direct + 1);

    setUpdater((value) => value + 1);
    setUpdater((value) => value + 1);
    setUpdater((value) => value + 1);
  }

  return (
    <div>
      <button type="button" onClick={bumpBoth}>
        Add three, twice over
      </button>
      <p>Snapshot form: {direct}</p>
      <p>Updater form: {updater}</p>
    </div>
  );
}
```

React puts the updater functions in a queue and runs them in order against the
result of the previous one. The rule: if the next value depends on the current
one, use an updater.

### Updates are batched

React does not re-render after each setter call. It finishes the event handler,
then renders once with all the updates applied. Setting five pieces of state in
one handler produces one render, not five.

> [!NOTE]
> Since **React 18**, this automatic batching applies everywhere — inside
> promises, `setTimeout` callbacks and native event handlers as well as React
> event handlers. In React 17 only React event handlers were batched, which is
> why older code sometimes shows extra renders after an `await`.

Batching is also why logging the state variable immediately after calling its
setter prints the old value — the current render's snapshot has not changed and
cannot. If you need the new value inside the same handler, compute it into a
local variable and pass that variable to both the setter and the rest of the
handler.

### State must be updated immutably

React decides whether to re-render by comparing the new state to the old one with
`Object.is`. If you mutate an object and pass the same reference back, the
comparison says "unchanged" and nothing happens.

```jsx
import { useState } from 'react';

export function BrokenProfile() {
  const [user, setUser] = useState({ name: 'Ana', role: 'editor' });

  function promote() {
    user.role = 'admin'; // Mutation.
    setUser(user); // Same reference — React sees no change.
  }

  return (
    <button type="button" onClick={promote}>
      {user.name}: {user.role}
    </button>
  );
}
```

Create a new value instead.

**Objects** — copy with spread, then override:

```js
setUser({ ...user, role: 'admin' });
setSettings({ ...settings, theme: { ...settings.theme, mode: 'dark' } });
```

Spread is shallow. Nested objects need their own copy, as the second line shows.

**Arrays** — use the methods that return a new array, not the ones that mutate:

| Goal | Use | Avoid |
|---|---|---|
| Add to the end | `[...items, item]` | `push` |
| Add to the front | `[item, ...items]` | `unshift` |
| Remove | `items.filter((i) => i.id !== id)` | `splice` |
| Replace one | `items.map((i) => (i.id === id ? next : i))` | `items[index] = next` |
| Sort or reverse | `[...items].sort(compare)` | `sort`, `reverse` in place |
| Insert at an index | `[...items.slice(0, i), item, ...items.slice(i)]` | `splice` |

`sort` and `reverse` mutate the array they are called on, which is easy to miss.
Copy first.

> [!TIP]
> Deeply nested state is painful to update immutably. That is usually a signal to
> flatten the shape — an object keyed by id beats a four-level tree. If you truly
> need the depth, [Immer](https://immerjs.github.io/immer/) lets you write
> mutating-looking code that produces a new value, and pairs well with
> [`useReducer`](../hooks/use-reducer.md).

### Derived state: compute it, do not store it

This is the single most common state mistake, so it gets its own rule: **if you
can calculate a value from props or other state during render, do not put it in
state.**

```jsx
import { useEffect, useState } from 'react';

export function BadFullName({ firstName, lastName }) {
  const [fullName, setFullName] = useState('');

  // Wrong: an extra render, and a window where fullName is stale.
  useEffect(() => {
    setFullName(`${firstName} ${lastName}`);
  }, [firstName, lastName]);

  return <h2>{fullName}</h2>;
}

export function GoodFullName({ firstName, lastName }) {
  const fullName = `${firstName} ${lastName}`;
  return <h2>{fullName}</h2>;
}
```

The stored version renders once with the wrong value, runs an Effect, then
renders again. It also has two sources of truth that can disagree if anything
else writes to `fullName`.

If the calculation is genuinely expensive — sorting ten thousand rows on every
keystroke — reach for [`useMemo`](../hooks/use-memo.md), or let the
[React Compiler](../performance/react-compiler.md) memoize it for you. Do not
reach for state.

The one case where you legitimately store something derived is when the value
must survive independently of its source: a draft the user is editing, or a
selection that should persist while the underlying list refetches.

## Common patterns

### State, ref, and module variable

| | State | Ref | Module variable |
|---|---|---|---|
| Survives a re-render | Yes | Yes | Yes |
| Triggers a re-render when changed | Yes | No | No |
| Per component instance | Yes | Yes | **No — shared by all** |
| Readable during render | Yes | Avoid it | Yes |
| Written during render | Never | Never | Never |
| Reset on unmount | Yes | Yes | No |
| Typical use | Anything on screen | Timer IDs, DOM nodes, previous values | Constants |

A ref is state's counterpart for values React should not watch. Writing
`ref.current = x` never re-renders, which is exactly what you want for a
`setInterval` handle and exactly wrong for the number on screen. See
[`useRef`](../hooks/use-ref.md).

A module-level `let` is shared by every instance of the component and by every
user in a server-rendered app. It is not a substitute for state.

### Group state that changes together

Two setters that are always called together should usually be one piece of state:

```jsx
import { useState } from 'react';

export function DragArea() {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  function handlePointerMove(event) {
    setPosition({ x: event.clientX, y: event.clientY });
  }

  return <div onPointerMove={handlePointerMove}>{position.x}, {position.y}</div>;
}
```

Keep unrelated values separate. `useState` per concern, not per component.

### Put state where it belongs

Start with state inside the component that uses it. Move it up only when a
sibling needs it — [lifting state up](../state-management/lifting-state-up.md).
Colocated state re-renders less and is easier to delete.

When several values change together according to rules, a reducer beats a pile of
setters: [`useReducer`](../hooks/use-reducer.md).

## Advanced example

A todo list doing every immutable operation — add, toggle, remove — with one
piece of state and a derived count.

```jsx live
import { useState } from 'react';

let nextId = 3;

export default function TodoList() {
  const [todos, setTodos] = useState([
    { id: 1, text: 'Read the rendering page', done: true },
    { id: 2, text: 'Stop storing derived state', done: false },
  ]);
  const [draft, setDraft] = useState('');

  const remaining = todos.filter((todo) => !todo.done).length;

  function addTodo() {
    if (draft.trim() === '') return;
    setTodos([...todos, { id: nextId++, text: draft, done: false }]);
    setDraft('');
  }

  function toggleTodo(id) {
    setTodos(
      todos.map((todo) =>
        todo.id === id ? { ...todo, done: !todo.done } : todo
      )
    );
  }

  function removeTodo(id) {
    setTodos(todos.filter((todo) => todo.id !== id));
  }

  return (
    <div>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="New task"
      />
      <button type="button" onClick={addTodo}>
        Add
      </button>
      <p>{remaining} remaining</p>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <label>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggleTodo(todo.id)}
              />{' '}
              {todo.text}
            </label>{' '}
            <button type="button" onClick={() => removeTodo(todo.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`remaining` is computed, not stored. `toggleTodo` builds a new array of new
objects for the changed row only. Both `addTodo` setters run in one batch, so the
list and the cleared input appear in a single render.

## Common mistakes

**Expecting the state variable to change after calling the setter.** It never
does in the current render. Read the new value on the next render, or from the
variable you computed.

**Calling `setCount(count + 1)` several times in one handler.** They all read the
same snapshot. Use `setCount((c) => c + 1)`.

**Mutating an object or array in state.** `todos.push(...)` followed by
`setTodos(todos)` renders nothing, because the reference is unchanged.

**Storing derived values.** A `total` alongside the `items` it comes from will
drift. Compute it.

**Copying props into state.** `useState(props.value)` reads the prop once. If you
need a component to reset when a prop changes, give it a
[`key`](./lists-and-keys.md) instead.

**Using state for values that do not render.** A timer ID in state causes a
pointless re-render every time it changes. Use a ref.

**Setting state during render.** It throws (or loops). The only supported form is
the rare "adjust state when a prop changes" pattern described in
[`useState`](../hooks/use-state.md); everything else belongs in an event handler.

**Setting state in an Effect to mirror other state.** That is derived state with
extra steps and an extra render.

## Related topics

- [`useState`](../hooks/use-state.md) — the full API, including lazy
  initialization and resetting state with a key.
- [`useReducer`](../hooks/use-reducer.md) — when several values change together
  by rules.
- [`useRef`](../hooks/use-ref.md) — remembered values that do not re-render.
- [Rendering](./rendering.md) — what React does after a state update.
- [Lifting state up](../state-management/lifting-state-up.md) — sharing state
  between siblings.
- [Strict Mode](./strict-mode.md) — why your updater function might run twice in
  development.
