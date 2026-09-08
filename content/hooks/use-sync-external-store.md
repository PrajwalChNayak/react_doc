---
title: useSyncExternalStore
description: Subscribe to an external store without tearing under concurrent rendering.
group: hooks
order: 150
status: current
related: [state-management/external-stores, hooks/use-effect, ecosystem/redux, hooks/custom-hooks]
---

## Overview

`useSyncExternalStore` subscribes a component to a data source that lives
outside React.

```text
const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)
```

| Parameter | Contract |
|---|---|
| `subscribe(callback)` | Registers `callback` with the store and returns an unsubscribe function. **Must have a stable identity.** |
| `getSnapshot()` | Returns the current value. **Must return an `Object.is`-equal value while the store has not changed.** |
| `getServerSnapshot?()` | The value used during server rendering and hydration. Must match on both sides. Omit to opt out of server rendering for this component. |

It returns the current snapshot. When the store notifies, React re-renders the
subscribed components.

## Why it exists

Before React 18, the way to read an external mutable source was an Effect: read
the value, `setState`, subscribe, clean up. That worked because rendering was
synchronous — nothing could change between the start and end of a render pass.

Concurrent rendering broke that assumption. React can now render a tree in
interruptible chunks, and the store can be mutated *in the middle*. One component
reads `count === 5`, React yields to the browser, the store increments, and a
sibling reads `count === 6`. Both commit. The screen shows two different values
for the same data.

That is **tearing**, and it is not a bug you can fix with careful Effects.
`useSyncExternalStore` fixes it in the reconciler: React reads the snapshot at a
consistent point, checks it again before committing, and if the store changed
mid-render it discards the concurrent attempt and re-renders synchronously.

It is also the official integration point for state libraries. Redux, Zustand,
Jotai, Valtio, and TanStack Query all build on it — see
[External stores](../state-management/external-stores.md).

## When to use it

- **Browser APIs that are mutable and event-driven:** `navigator.onLine`,
  `window.matchMedia`, `document.visibilityState`, `location`, scroll position,
  `localStorage` change events.
- **A third-party store** you did not write and cannot move into React state.
- **A module-level store of your own** that non-React code also writes to.
- **Authoring a state management library.** This is the supported hook for it.

## When not to use it

- **For state React can own.** If only React reads and writes it, use
  [`useState`](./use-state.md) or [`useReducer`](./use-reducer.md). This hook is
  strictly more machinery for the same result.
- **For server data.** A fetch result is not an external store; it is
  asynchronous data. Use [`use()`](./use.md) with Suspense, or a data library.
- **To share state between a few components.** That is
  [Context](../state-management/context.md) or lifting state up.
- **To suspend on.** React's docs advise against suspending based on a store
  value: store mutations cannot be marked as non-blocking transitions, so an
  update would replace your content with a Suspense fallback.
- **When the store value is expensive to derive.** `getSnapshot` runs on every
  render and more than once per commit. Keep it to a property read.

## Basic example

A real `useOnlineStatus` hook. `subscribe` and `getSnapshot` live at module
scope, which is the simplest way to guarantee stable identity.

```jsx live
import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  // The server has no network status; assume online and let the
  // client correct it after hydration.
  return true;
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function ConnectionBadge() {
  const isOnline = useOnlineStatus();
  return (
    <p>
      Status: <strong>{isOnline ? 'Online' : 'Offline'}</strong>
      <br />
      <small>Toggle your network connection to see this update.</small>
    </p>
  );
}
```

`getSnapshot` returns a boolean — a primitive, so `Object.is` comparison is
trivially stable. That is the straightforward case. The next section is the hard one.

## How it works

### The snapshot caching rule

This is the rule that breaks people, so it gets its own section.

React calls `getSnapshot` **on every render, and again before committing** to
verify nothing changed. If your function returns a new object each time, React
sees a change every time, re-renders, sees another change, and loops. In
development you get the error:

```text
The result of getSnapshot should be cached to avoid an infinite loop
```

The broken version:

```jsx
import { useSyncExternalStore } from 'react';

const store = { todos: [{ id: 1, title: 'Ship the docs' }] };

function subscribe() {
  return () => {};
}

export default function TodoCount() {
  // A new object literal every call — never Object.is-equal.
  const state = useSyncExternalStore(subscribe, () => ({ todos: store.todos }));
  return <p>{state.todos.length} todos</p>;
}
```

Two fixes, and you want both habits.

**Return the stored reference directly**, not a wrapper around it:

```js
function getSnapshot() {
  return store.todos; // Same array reference until the store replaces it.
}
```

**And make the store immutable**: never mutate in place, always replace the whole
value on a write. Then the reference changes exactly when the data changes,
which is precisely the signal React needs.

If you need a derived value — a filtered list, a computed total — do not compute
it in `getSnapshot`. Return the whole snapshot and derive downstream with
[`useMemo`](./use-memo.md), or have the store cache the derived value itself.

### The stable `subscribe` rule

React resubscribes whenever `subscribe` changes identity. A function defined in
the component body is new on every render, so React unsubscribes and
resubscribes after every single render — wasted work at best, a dropped
notification at worst.

Define `subscribe` at module scope, or wrap it in
[`useCallback`](./use-callback.md) when it must close over a prop:

```jsx
import { useCallback, useSyncExternalStore } from 'react';

function getSnapshot() {
  return window.location.hash;
}

export default function HashDisplay({ eventName }) {
  const subscribe = useCallback(
    callback => {
      window.addEventListener(eventName, callback);
      return () => window.removeEventListener(eventName, callback);
    },
    [eventName]
  );

  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '');
  return <p>Hash: {hash || '(none)'}</p>;
}
```

### Across re-renders

On mount React calls `getSnapshot`, then `subscribe`. On every render it calls
`getSnapshot` again to check for a change it missed. When your callback fires,
React calls `getSnapshot`, compares with `Object.is`, and re-renders only if the
value differs.

On unmount — and whenever `subscribe` changes identity — React calls the
unsubscribe function you returned.

### StrictMode

StrictMode mounts, unmounts, and remounts each component in development. The
subscription is created, torn down, and created again. If `subscribe` does not
return a correct unsubscribe function, you end up with a duplicate listener and
double notifications. That is the check working: a leaking subscription is a real
bug in production too, it is only slower to notice.

The double render also calls `getSnapshot` extra times, which makes an uncached
snapshot fail loudly rather than intermittently.

### Concurrent rendering

The whole point. React reads the snapshot, and before committing reads it again.
If the value changed, the concurrent render is discarded and React re-renders
**synchronously and blocking** to guarantee a consistent screen.

Two consequences follow:

- A store mutation inside a transition **falls back to a blocking update**. You
  cannot make external-store updates non-urgent. If you need low-priority
  updates, the data has to live in React state.
- `getSnapshot` must be cheap, because it runs more often than you think.

### Server rendering

`getServerSnapshot` supplies the value during SSR and during hydration. Omit it
and React throws when the component is server-rendered — which is the intended
way to say "this component is client-only".

It must return the same thing the client returns on its first render, or you get
a hydration mismatch. The usual approach is to serialize the server value into
the HTML and read it from a global on the client.

## Common patterns

### A tiny store, written from scratch

Everything a store needs: a value, a listener set, a `subscribe`, and a
`getSnapshot` that returns a cached reference.

```jsx live
import { useSyncExternalStore } from 'react';

function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getSnapshot() {
      return state; // Cached: same reference until setState replaces it.
    },
    setState(updater) {
      const next = typeof updater === 'function' ? updater(state) : updater;
      if (Object.is(next, state)) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const cartStore = createStore({ items: [], couponCode: null });

function useCart() {
  return useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
    cartStore.getSnapshot
  );
}

function CartSummary() {
  const cart = useCart();
  return (
    <p>
      {cart.items.length} item(s)
      {cart.couponCode ? ` — coupon ${cart.couponCode}` : ''}
    </p>
  );
}

function CartControls() {
  return (
    <div>
      <button
        onClick={() =>
          cartStore.setState(current => ({
            ...current,
            items: [...current.items, `SKU-${current.items.length + 1}`],
          }))
        }
      >
        Add item
      </button>
      <button
        onClick={() => cartStore.setState(current => ({ ...current, couponCode: 'SAVE10' }))}
      >
        Apply coupon
      </button>
    </div>
  );
}

export default function CartPage() {
  // Two sibling components read the same store and stay in sync.
  return (
    <div>
      <CartSummary />
      <CartControls />
      <CartSummary />
    </div>
  );
}
```

`setState` replaces the whole object rather than mutating it, so `getSnapshot`
returns a new reference exactly when something changed. Both `CartSummary`
instances update together — no tearing.

## Advanced example

Selecting a slice of a larger store. Naively returning a computed object from
`getSnapshot` loops; the fix is to return the whole snapshot and derive with
`useMemo`.

```jsx live
import { useMemo, useSyncExternalStore } from 'react';

const notificationStore = (() => {
  let state = {
    notifications: [
      { id: 1, channel: 'billing', read: false, text: 'Invoice #204 is due' },
      { id: 2, channel: 'deploys', read: true, text: 'Deploy 8f31c succeeded' },
      { id: 3, channel: 'billing', read: false, text: 'Card expires soon' },
    ],
  };
  const listeners = new Set();
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markAllRead() {
      state = {
        notifications: state.notifications.map(item => ({ ...item, read: true })),
      };
      listeners.forEach(listener => listener());
    },
  };
})();

function useNotificationsByChannel(channel) {
  // Subscribe to the whole store...
  const snapshot = useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.getSnapshot,
    notificationStore.getSnapshot
  );

  // ...then derive here, where a new array is harmless.
  return useMemo(
    () => snapshot.notifications.filter(item => item.channel === channel),
    [snapshot, channel]
  );
}

export default function NotificationPanel() {
  const billing = useNotificationsByChannel('billing');
  const unread = billing.filter(item => !item.read).length;

  return (
    <div>
      <p>
        Billing: {billing.length} total, {unread} unread
      </p>
      <ul>
        {billing.map(item => (
          <li key={item.id}>
            {item.read ? '✓' : '•'} {item.text}
          </li>
        ))}
      </ul>
      <button onClick={() => notificationStore.markAllRead()}>
        Mark all read
      </button>
    </div>
  );
}
```

Deriving inside `useMemo` rather than inside `getSnapshot` is the whole trick.
React only ever sees the stable store reference; the filtered array is recomputed
in render, where a new identity costs nothing.

> [!TIP]
> Libraries expose this as `useSyncExternalStoreWithSelector` (shipped in the
> `use-sync-external-store` shim package) so a selector can be applied without
> re-rendering every subscriber. If you are writing application code, `useMemo`
> is enough.

## Common mistakes

**Returning a new object from `getSnapshot`.** The infinite loop, and the reason
for the "should be cached" error. Return the stored reference, or make the store
replace values immutably.

**Computing a derived value in `getSnapshot`.** `() => store.items.filter(...)`
is a new array every call. Same loop. Derive with `useMemo` after the hook.

**Defining `subscribe` inline in the component.** New identity each render means
React resubscribes each render. Hoist it to module scope or wrap it in
`useCallback`.

**A `subscribe` that does not clean up.** StrictMode's remount will double your
listeners immediately. Always return the unsubscribe function.

**Mutating the store in place.** `state.items.push(item)` keeps the same
reference, `Object.is` reports no change, and nothing re-renders. Replace the
value.

**Forgetting `getServerSnapshot`.** React throws if the component is
server-rendered without it. Provide one, or make the component client-only on
purpose.

**A `getServerSnapshot` that disagrees with the client's first render.** Reading
`navigator.onLine` on the server is impossible; returning a different default
than the client's first render is a hydration mismatch.

**Expecting store updates to be interruptible.** They are not. React falls back
to a blocking update when a store changes during a transition.

**Using it for state React could own.** If nothing outside React writes the
value, `useState` is simpler, faster, and works with transitions.

## Related topics

- [External stores](../state-management/external-stores.md) — how Redux,
  Zustand, and Jotai build on this hook.
- [Redux](../ecosystem/redux.md) — the most widely deployed consumer of it.
- [useState](./use-state.md) — the right answer whenever React can own the state.
- [Custom hooks](./custom-hooks.md) — packaging a store subscription into
  `useOnlineStatus`-style hooks.
- [useEffect](./use-effect.md) — the subscription pattern this hook replaces, and
  why it teared.
