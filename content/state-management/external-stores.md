---
title: External stores
description: Keep state outside React and subscribe to it safely with useSyncExternalStore.
group: state-management
order: 40
status: current
related: [hooks/use-sync-external-store, state-management/context, ecosystem/redux]
---

## Overview

An external store is any mutable source of truth that lives **outside** React's
render tree: a hand-rolled pub/sub object, a Redux or Zustand store, a router's
history, `document.visibilityState`, a WebSocket connection.

React cannot see those values change, so you have to tell it. The supported way
is [`useSyncExternalStore`](../hooks/use-sync-external-store.md): give it a
subscribe function and a snapshot function, and it re-renders the component when
the snapshot changes.

```jsx
import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export default function ConnectionStatus() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // Server snapshot: assume online during SSR.
  );

  return <span>{isOnline ? 'Online' : 'Offline'}</span>;
}
```

## Why it exists

The obvious approach — subscribe in a `useEffect`, copy the value into
`useState` — is wrong in a concurrent renderer, and the failure is called
**tearing**.

React can start rendering, pause, and resume. Between the pause and the resume,
the external store can change. If two components read the store at different
moments in the same render pass, one shows the old value and one shows the new
one, and the screen displays a single frame containing two inconsistent versions
of the same data: a total that does not match its own line items.

`useSyncExternalStore` closes that hole. React knows a store read happened and
can guarantee consistency across the commit. Concretely: for every Transition
update, React calls `getSnapshot` a second time immediately before touching the
DOM. If the value changed, it throws that work away and redoes the update as a
blocking one, so every component on screen reflects the same version.

The Effect-plus-state approach also renders once with a stale value before the
Effect runs (a flash), and produces the wrong markup during server rendering,
because Effects do not run on the server.

> [!WARNING]
> Never subscribe to a store by copying its value into `useState` from an
> Effect. It tears under concurrent rendering, it flashes on mount, and it
> hydrates wrong. Use `useSyncExternalStore`.

## When to use it

- You are integrating a state library that is not React-aware.
- You are reading a browser API that changes over time: online status, media
  queries, `document.visibilityState`, storage events.
- You need **selective subscription** — many components reading one state, each
  re-rendering only when its own slice changes. Context cannot do this.
- The state must be readable and writable from outside React: a keyboard
  shortcut registry, a worker message handler, a non-React widget.
- The state's lifetime is longer than any component's.

## When not to use it

**For state one component owns.** `useState` exists.

**For values that change on every frame.** A store that fires sixty times a
second will re-render sixty times a second. Read those with a ref and write to
the DOM directly, or throttle at the store boundary.

**As a way to skip lifting state up.** A global store for something two sibling
components share is a global variable with extra steps.

**For data that lives on a server.** Fetch responses are cache entries, not
application state — see [Choosing an approach](./choosing-an-approach.md). Most
store libraries agree, and tell you to pair them with a query library.

**Do not ship your own store** unless the requirement is genuinely tiny. The one
below exists to show the mechanism; a maintained library gives you devtools,
middleware, SSR handling and equality options for a few kilobytes.

## Basic example

A store is three things: some state, a way to change it, and a way to be told
that it changed. Here it lives at module scope, so it outlives every component
and anything on the page can write to it.

```jsx live
import { useSyncExternalStore } from 'react';

let count = 0;
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return count;
}

// Callable from anywhere — an event handler, a worker message, a shortcut.
function increment() {
  count += 1;
  for (const listener of listeners) listener();
}

function Display() {
  const value = useSyncExternalStore(subscribe, getSnapshot);
  return <p>Count: {value}</p>;
}

export default function App() {
  return (
    <>
      <Display />
      <p>
        <button onClick={increment}>Increment from outside React</button>
      </p>
    </>
  );
}
```

Two details are load-bearing. `subscribe` is declared **outside** the component,
so its identity never changes and React never resubscribes. And `getSnapshot`
returns the same value while nothing has changed — that contract is where the
next section's trap lives.

## How it works

`useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)` does three
things:

1. Calls `getSnapshot()` during render and returns the value.
2. Calls `subscribe(callback)` in an Effect. When `callback` fires, React calls
   `getSnapshot()` again and re-renders if the result differs by `Object.is`.
3. Calls `getSnapshot()` once more before committing a Transition, and restarts
   the update as blocking if the store moved.

### The `getSnapshot` stability trap

> [!WARNING]
> If `getSnapshot` returns a **new object every call**, React sees a changed
> snapshot on every render, re-renders, sees another new object, and loops. The
> error is *"The result of getSnapshot should be cached"*.

```jsx
import { useSyncExternalStore } from 'react';

const store = {
  todos: [{ id: 1, title: 'Buy milk' }],
  subscribe() {
    // A real store would register the listener here and return an unsubscribe.
    return () => {};
  },
};

export default function TodoCount() {
  // 🔴 Infinite loop: a fresh object identity on every call.
  const snapshot = useSyncExternalStore(store.subscribe, () => ({
    todos: store.todos,
  }));

  return <p>{snapshot.todos.length} todos</p>;
}
```

Three cures, in order of preference. **Return a primitive** — numbers, strings
and booleans compare by value, so a derived count or flag is always safe.
**Return the stored object itself**, if the store holds an immutable object and
replaces it on every change; then the identity changes exactly when the data
does. **Cache the derived object in the store**, computing it when the state
changes rather than when the snapshot is read.

The same rule applies to the server snapshot.

### Server rendering

The optional third argument is used during server rendering and during hydration
of server-rendered markup. Omitting it makes the component throw when rendered
on the server — the `ConnectionStatus` example at the top of this page passes
`() => true` for exactly that reason.

There is no `window` on the server, so the server snapshot has to be a constant
or something derived from the request. It also has to match what the client
computes on its first render, or hydration will report a mismatch. For values
that genuinely differ between server and client, render the server-safe value
first and let a later update correct it. See
[SSR and hydration](../server-react/ssr-and-hydration.md).

## Common patterns

### A selector layer

The reason to build a store rather than use context is selective subscription.
Wrap the hook so it takes a selector — `useStore(state => state.items.length)` —
and each component subscribes to its own slice; the advanced example below shows
the wrapper in full. The selector runs on every notification, but the component
re-renders only when the **selected** value changes identity, so a price edit
does not re-render the item-count badge.

> [!WARNING]
> A selector that builds a new object re-renders its component on every store
> change, defeating the entire mechanism — and can trip the "should be cached"
> error. `(state) => ({ count: state.items.length })` is new every call.
> Select primitives, call the hook once per value, or use a library that accepts
> a custom equality function.

### Actions on the store, not in components

Put `addItem`, `removeItem` and `clearCart` next to the store. Components that
only call them need no subscription, so they never re-render on a store change.

### Combine a store with context for scoping

Module-level stores are singletons, which breaks per-user server rendering and
makes tests leak into each other. Create the store in a provider and pass the
*store object* through context: the context value never changes identity, so it
never causes re-renders, and subscription happens through the hook.

## Advanced example

A cart store with a selector layer and render counters. `ItemCount` selects a
number, `FirstItemName` selects a string, and each re-renders only when its own
value moves.

```jsx live
import { useRef, useSyncExternalStore } from 'react';

function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    getState: () => state,
    setState(updater) {
      const next = updater(state);
      if (Object.is(next, state)) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const cartStore = createStore({
  items: [
    { id: 'kb', name: 'Keyboard', price: 129, quantity: 1 },
    { id: 'hub', name: 'USB-C hub', price: 79, quantity: 1 },
  ],
});

const cartActions = {
  addOne(id) {
    cartStore.setState((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    }));
  },
  rename(id, name) {
    cartStore.setState((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, name } : item,
      ),
    }));
  },
};

function useCart(selector) {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => selector(cartStore.getState()),
    () => selector(cartStore.getState()),
  );
}

function useRenderCount() {
  const renders = useRef(0);
  renders.current += 1;
  return renders.current;
}

function ItemCount() {
  // A number, not an object: stable identity while the value is unchanged.
  const count = useCart((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0),
  );
  const renders = useRenderCount();
  return (
    <p>
      Items: <strong>{count}</strong> — rendered {renders} times
    </p>
  );
}

function FirstItemName() {
  const name = useCart((state) => state.items[0].name);
  const renders = useRenderCount();
  return (
    <p>
      First item: <strong>{name}</strong> — rendered {renders} times
    </p>
  );
}

export default function Cart() {
  return (
    <>
      <ItemCount />
      <FirstItemName />
      <p>
        <button onClick={() => cartActions.addOne('kb')}>Add a keyboard</button>{' '}
        <button onClick={() => cartActions.rename('kb', 'Split keyboard')}>
          Rename the keyboard
        </button>
      </p>
    </>
  );
}
```

Click "Add a keyboard": only `ItemCount` re-renders. Click "Rename the
keyboard": only `FirstItemName` re-renders. That granularity is exactly what
context cannot give you, and it is the reason external stores exist.

### The real options

These are all **third-party packages**, not part of React. Check their own
documentation for current APIs — the summary below is about shape, not detail.

| | Model | Selectors | Devtools | Boilerplate | Server state |
|---|---|---|---|---|---|
| **Zustand** | One store per hook, plain functions | Built in, with optional equality fn | Redux DevTools via middleware | Very low | No — pair with a query library |
| **Jotai** | Bottom-up atoms that compose | The atom *is* the unit of subscription | Dedicated devtools package | Low | Async atoms; still prefer a query library |
| **Redux Toolkit** | One store, reducers and actions | `useSelector`, memoized with Reselect | First class, time travel | Medium | Yes — RTK Query is included |
| **Valtio** | A mutable proxy you assign to | Automatic, by tracked property access | Redux DevTools integration | Very low | No |
| **XState** | Statecharts: states, events, guards | Selectors on the running actor | Visualizer and inspector | High | No |

How to read that table. **Zustand** is the smallest step up from context: a
store, a hook and selectors, and little else. **Jotai** suits state that is
naturally a graph of small derived values. **Redux Toolkit** wins when the
*process* matters — a large team, strict conventions, an audit trail, time-travel
debugging; see [Redux](../ecosystem/redux.md). **Valtio** has the least ceremony
and the least explicitness, which cuts both ways when you are debugging an
unexpected re-render. **XState** is a different tool entirely: it models
workflows where illegal transitions must be impossible — checkout flows, media
players — not theme toggles.

Most of these are built on `useSyncExternalStore` or an equivalent subscription
primitive. Understanding the hook is what lets you debug them.

## Common mistakes

**A new `subscribe` function on every render.** Passing an inline arrow means
React resubscribes after every render. Define it outside the component or store
it on the store object.

**`getSnapshot` returning a fresh object.** The infinite-loop error. Select
primitives, or cache the derived object in the store.

**Selectors that construct objects or arrays.** `(state) => state.items.filter(...)`
returns a new array every call. Select an id list, a count, or use a library
with an equality option.

**Mutating the state in place.** Changing a property on the stored object leaves
its identity intact, so `Object.is` reports no change and nothing re-renders.
Replace the object.

**Forgetting `getServerSnapshot`.** The component throws during server
rendering, and a snapshot that disagrees with the client's first render causes a
hydration mismatch.

**Not unsubscribing.** `subscribe` must return a cleanup function, or listeners
leak and grow forever.

**Module-level singletons in an SSR app.** One store shared across requests leaks
one user's data into another's render. Create it per request.

**Suspending on a store value.** Store mutations cannot be marked as
non-blocking Transitions, so they trigger the nearest Suspense fallback and
replace visible content with a spinner. React's docs advise against it.

## Related topics

- [useSyncExternalStore](../hooks/use-sync-external-store.md) — the hook's full
  reference, parameters and caveats.
- [Context](./context.md) — the mechanism with no selectors, and why that limit
  matters.
- [Reducers and context](./reducers-and-context.md) — the built-in pattern this
  page is the next step from.
- [Redux](../ecosystem/redux.md) — the store with the deepest tooling.
- [Choosing an approach](./choosing-an-approach.md) — when a store is the right
  rung of the ladder.
