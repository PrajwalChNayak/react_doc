---
title: Custom hooks
description: Extract reusable logic into your own hooks without sharing state between components.
group: hooks
order: 210
status: current
related: [hooks/rules-of-hooks, hooks/use-sync-external-store, hooks/use-debug-value]
---

## Overview

A custom hook is a JavaScript function whose name starts with `use` and which
calls at least one other hook.

```jsx live
import { useState } from 'react';

function useCounter(initialCount) {
  const [count, setCount] = useState(initialCount);
  const increment = () => setCount((c) => c + 1);
  const reset = () => setCount(initialCount);
  return { count, increment, reset };
}

export default function Scoreboard() {
  // Two calls, two completely separate pieces of state.
  const home = useCounter(0);
  const away = useCounter(0);

  return (
    <div>
      <p>
        Home {home.count} — Away {away.count}
      </p>
      <button onClick={home.increment}>Home scores</button>{' '}
      <button onClick={away.increment}>Away scores</button>{' '}
      <button
        onClick={() => {
          home.reset();
          away.reset();
        }}
      >
        Reset
      </button>
    </div>
  );
}
```

There is no new API here. A custom hook is a plain function; the `use` prefix is
a convention that tells React's linter — and every reader — that the Rules of
Hooks apply to it.

## Why it exists

Before hooks, sharing stateful logic between components meant higher-order
components or render props: wrapper layers that showed up in the tree, collided
over prop names, and made types unpleasant.

Custom hooks share the *logic* while leaving the tree alone. A component that
uses `useOnlineStatus` renders exactly what it rendered before — no extra
wrapper, no injected props.

The key property is stated in the heading of every good custom hook discussion:
**custom hooks share stateful logic, not state itself.** Each call site gets its
own independent state, exactly as two `useState` calls would. If you want two
components to share one value, that is a different problem — lift the state up,
or put it in [context](./use-context.md).

## When to use it

- **The same `useState` + `useEffect` pair appears in several components.**
  A subscription, a media query, a keyboard shortcut, a debounce.
- **A component is doing two unrelated things.** Even with a single call site,
  extracting `useChatConnection(roomId)` leaves the component describing what it
  renders rather than how it connects.
- **You want to name a concept.** `useOnlineStatus()` says what the code is
  about; `useState` plus two listeners does not.
- **The logic deserves its own tests.** A custom hook can be tested once instead
  of through every component that contains a copy of it.
- **You are wrapping an external system.** Custom hooks are the natural place for
  `useSyncExternalStore` and Effect-based subscriptions, so the escape hatch
  lives in one file.

## When not to use it

- **The function does not call a hook.** Then it is not a hook — it is a
  function. `formatCurrency(amount)`, `sortByDate(items)`, and
  `isValidEmail(value)` should be plain functions with plain names, importable
  from anywhere, testable without a renderer.
- **To share state between components.** Two call sites get two states. Lift the
  state up or use context.
- **To hide an Effect you should have deleted.** Wrapping
  `useEffect(() => setFiltered(...))` in `useFilteredItems` makes an unnecessary
  Effect harder to find. Check
  [when not to use an Effect](./use-effect.md#when-not-to-use-it) first.
- **As a lifecycle wrapper.** `useMount(fn)` and `useUpdateEffect(fn)` are
  popular and are a step backwards: they encourage thinking in lifecycles rather
  than in synchronization, and they make the dependency linter useless because it
  cannot see through the indirection.
- **Prematurely.** Two similar-looking components are not yet a pattern. Extract
  on the third occurrence, when you know which parts actually vary.
- **When composition is simpler.** Sometimes the shared thing is markup, and a
  component is the better unit.

> [!BEST-PRACTICE]
> If a function does not call a hook, do not name it `use`. Naming it `use`
> subjects every one of its call sites to the Rules of Hooks for no reason.

## Basic example

A form field, extracted from three repeated lines into one call:

```jsx live
import { useState } from 'react';

function useTextField(initialValue) {
  const [value, setValue] = useState(initialValue);
  return {
    value,
    onChange: (e) => setValue(e.target.value),
    reset: () => setValue(initialValue),
  };
}

export default function SignupForm() {
  const name = useTextField('');
  const email = useTextField('');

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <input placeholder="Name" value={name.value} onChange={name.onChange} />{' '}
      <input placeholder="Email" value={email.value} onChange={email.onChange} />{' '}
      <button
        type="button"
        onClick={() => {
          name.reset();
          email.reset();
        }}
      >
        Clear
      </button>
      <p>
        {name.value || '(no name)'} — {email.value || '(no email)'}
      </p>
    </form>
  );
}
```

`name` and `email` never interfere with each other. The hook shares the
behavior; each call owns its data.

## How it works

**A custom hook's calls belong to the calling component.** React does not track
custom hooks as units. When `SignupForm` calls `useTextField` twice, the four
underlying `useState` calls are appended to `SignupForm`'s hook list in order.
That is why the Rules of Hooks travel: a custom hook must be called
unconditionally, from the top level, on every render.

**Across re-renders.** Each call site keeps its slots for as long as the
component instance lives. When the component re-renders, every custom hook it
calls runs again, top to bottom, returning fresh values.

**With StrictMode.** Nothing extra applies to custom hooks specifically — but
everything that applies to the hooks inside them does. State initializers and
reducers run twice, Effects run setup, cleanup, setup. A custom hook that
misbehaves under StrictMode has an impure initializer or a missing cleanup
inside it, and now that bug is shared by every component that calls it.

**With concurrent rendering.** A custom hook is part of render, so it must be
pure: no mutation of anything outside itself, no reading of values that could
change mid-render, no side effects outside an Effect. React may call it and
discard the result.

**Debug labels.** [`useDebugValue`](./use-debug-value.md) attaches a label that
React DevTools shows next to the hook. It is worth adding to hooks you ship in a
shared library, and unnecessary for hooks used in one app.

### Naming and return shape

- The name starts with `use`, then reads as a noun or a statement about what you
  get: `useOnlineStatus`, `useDebouncedValue`, `useChatConnection`.
- Be specific. `useLocalStorage` beats `useStorage`; `useProductSearch` beats
  `useFetch`.
- **Return a tuple for exactly two values** where an order convention already
  exists (`[value, setValue]`), because callers rename them at the call site.
- **Return an object past two values.** `const { data, error, isLoading } =
  useOrders()` survives the addition of a fourth field; a five-element array
  does not, and forces callers to remember positions.

```text
useToggle(false)        -> [isOpen, toggle]                tuple: 2, ordered
useDebouncedValue(q, 300) -> string                        a single value
useOrders()             -> { orders, error, isLoading, refetch }   object
```

## Common patterns

### Build one: `useOnlineStatus`

Network status lives outside React. The naive version is `useState` plus an
Effect with two listeners; the correct version is
[`useSyncExternalStore`](./use-sync-external-store.md), which reads the value
during render, cannot tear under concurrent rendering, and has a defined answer
for server rendering.

```jsx live
import { useSyncExternalStore } from 'react';

// Defined outside the hook so its identity is stable: a new subscribe
// function on every render would resubscribe on every render.
function subscribe(onStoreChange) {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe, // how to subscribe, and how to unsubscribe
    () => navigator.onLine, // read the value on the client
    () => true // read the value on the server
  );
}

export default function ConnectionBanner() {
  const isOnline = useOnlineStatus();
  return (
    <p>
      Status: <strong>{isOnline ? 'Online' : 'Offline'}</strong> — toggle your
      network connection to see this change.
    </p>
  );
}
```

Three arguments, three questions: how do I hear about changes, what is the value
now, and what is the value when there is no browser. Every component in the app
can now call `useOnlineStatus()` and none of them needs an Effect.

### Build another: `useDebouncedValue`

Debouncing *is* a synchronization with an external system — a timer — so this
one legitimately uses an Effect, with the cleanup doing the real work.

```jsx live
import { useState, useEffect } from 'react';

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    // Every keystroke cancels the pending update before scheduling a new one.
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

export default function SearchBox() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 400);

  return (
    <div>
      <input
        value={query}
        placeholder="Search products"
        onChange={(e) => setQuery(e.target.value)}
      />
      <p>Typing: {query || '(empty)'}</p>
      <p>
        Would search for: <strong>{debouncedQuery || '(empty)'}</strong>
      </p>
    </div>
  );
}
```

The cleanup is the entire mechanism. Because React runs it before every re-run,
a fast typist cancels the pending timer on each keystroke and only the final
pause schedules an update that survives.

### Compose hooks

Custom hooks call other custom hooks. This is where the real leverage is: small
hooks with one responsibility, combined into a larger one.

```jsx
import { useState, useEffect } from 'react';

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// Composes the debounce hook rather than reimplementing the timer.
function useProductSearch(query, category) {
  const debouncedQuery = useDebouncedValue(query, 300);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (debouncedQuery === '') {
      setResults([]);
      setStatus('idle');
      return;
    }
    let ignore = false;
    setStatus('loading');

    fetch(
      `/api/products?q=${encodeURIComponent(debouncedQuery)}&category=${category}`
    )
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return; // a newer query has superseded this one
        setResults(data);
        setStatus('ready');
      });

    return () => {
      ignore = true;
    };
  }, [debouncedQuery, category]);

  // Four values: return an object, not an array.
  return { results, status, query: debouncedQuery, isSearching: status === 'loading' };
}

export default function ProductSearch({ category }) {
  const [query, setQuery] = useState('');
  const { results, isSearching } = useProductSearch(query, category);

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <p>{isSearching ? 'Searching...' : `${results.length} results`}</p>
    </div>
  );
}
```

Each hook stays small enough to reason about, and the composition is the
feature. Note that the race guard lives inside the hook, so no call site can
forget it.

> [!NOTE]
> A hook like `useProductSearch` handles one component's request. It does not
> cache, deduplicate across components, or revalidate. Once you need those,
> reach for a [data library](../data-fetching/libraries.md) instead of growing
> this hook.

### Keep the linter working

A custom hook's parameters are reactive values from the caller's perspective.
List them in the dependency arrays inside the hook exactly as you would in a
component — `eslint-plugin-react-hooks` checks the inside of a custom hook the
same way it checks a component.

If a value passed in should not re-trigger an Effect inside the hook, that is
what [`useEffectEvent`](./use-effect-event.md) is for, not a suppressed lint
rule.

## Advanced example

A hook that owns a browser API, exposes an object, and cleans up completely.

```jsx live
import { useState, useEffect } from 'react';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);

    // Read once on subscribe: the value may have changed since render.
    setMatches(list.matches);
    list.addEventListener('change', handleChange);
    return () => list.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

export default function ResponsiveNotice() {
  const isNarrow = useMediaQuery('(max-width: 600px)');
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  return (
    <ul>
      <li>Layout: {isNarrow ? 'narrow' : 'wide'}</li>
      <li>Theme preference: {prefersDark ? 'dark' : 'light'}</li>
    </ul>
  );
}
```

Two calls, two independent subscriptions, one implementation. The lazy
initializer avoids calling `matchMedia` on every render, the Effect re-subscribes
when `query` changes, and the cleanup removes exactly what the setup added — so
StrictMode's extra mount and unmount cycle is invisible.

## Common mistakes

**Expecting two components to share state.** `useCounter()` in two components
gives two counters. Shared state is lifted, or provided through context.

**Naming a non-hook `use`.** A pure helper does not need the prefix, and the
prefix makes the linter enforce rules it does not need.

**Naming a hook without `use`.** The opposite error, and worse: nothing checks
its call sites, so it can be called conditionally without a warning.

**Calling a custom hook conditionally.** `if (enabled) useChatConnection(id)`
breaks the hook list. Move the condition inside the hook.

**Wrapping lifecycles.** `useMount`, `useUnmount`, `useUpdateEffect` recreate
class thinking, hide dependencies from the linter, and break under StrictMode's
remount.

**Returning a new object every render without thinking about it.** If callers
put your return value in a dependency array, an unmemoized object makes their
Effects run constantly. Return primitives and stable functions where you can.

**Hiding an unnecessary Effect inside a hook.** Extracting bad code does not
make it good; it makes it reusable.

**Extracting too early.** One call site and no clear seam usually means the
abstraction is guesswork. Wait for the third copy.

**Forgetting cleanup.** Every listener, timer and subscription created inside a
custom hook needs its inverse, or every component that calls the hook leaks.

**Doing side effects during the hook body.** A custom hook runs during render.
Mutating a global, writing to `document`, or starting a request in the hook body
is impure and breaks under concurrent rendering.

## Related topics

- [Rules of Hooks](./rules-of-hooks.md) — the rules a custom hook inherits and propagates.
- [useSyncExternalStore](./use-sync-external-store.md) — the right primitive for wrapping an external system.
- [useEffect](./use-effect.md) — cleanup, dependencies, and the Effects worth extracting.
- [useEffectEvent](./use-effect-event.md) — non-reactive logic inside a hook's Effect.
- [useDebugValue](./use-debug-value.md) — labelling your hook in React DevTools.
- [Testing Library](../testing/testing-library.md) — testing a custom hook through a component.
