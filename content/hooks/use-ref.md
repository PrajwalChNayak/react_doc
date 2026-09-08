---
title: useRef
description: Hold a mutable value that survives re-renders without causing one.
group: hooks
order: 80
status: current
since: "19.0"
related: [hooks/use-state, patterns/refs-and-dom, hooks/use-imperative-handle, core-concepts/strict-mode]
---

## Overview

`useRef` gives you a mutable box that React keeps alive across re-renders.

```text
const ref = useRef(initialValue)
```

It returns the **same object** on every render, with a single property:

```text
{ current: initialValue }
```

Writing to `ref.current` does **not** schedule a re-render. That single sentence
is the whole hook. Everything else follows from it.

There are exactly two things people use it for:

1. **DOM refs** — pass `ref` to a JSX element and React writes the DOM node into
   `ref.current` after commit, and `null` on unmount.
2. **Instance-like values** — a timer id, a WebSocket, a previous value, a
   "have I already run this" flag. Data the component owns but never renders.

## Why it exists

A function component has no `this`. Between one render and the next, every local
variable is thrown away. State solves that for values you display, but state has
a cost: changing it re-renders.

Some values must persist without re-rendering. An interval id is the clearest
case — nothing on screen depends on it, so re-rendering when it changes would be
pure waste, and setting state from the callback that assigns it would loop.

`useRef` is React's escape hatch for exactly that: persistence without
reactivity.

## When to use it

- You need a DOM node to call an imperative browser API on: `focus()`,
  `scrollIntoView()`, `play()`, `showModal()`, `getBoundingClientRect()`.
- You need to remember something between renders that no rendered output reads:
  interval and timeout ids, an `AbortController`, a third-party library
  instance, the previously committed value of a prop.
- You need a "did this already happen" latch inside an Effect.

## When not to use it

- **The value is displayed.** If the UI must change when the value changes, it
  is state. A ref that you then force to show with a dummy `setState` is a bug
  wearing a costume.
- **You are reaching into a child's DOM to change it.** Prefer props. React
  owns the DOM it renders; two owners means the next render silently undoes your
  mutation.
- **You are caching a computed value.** That is [`useMemo`](./use-memo.md).
- **You are subscribing to something external.** That is
  [`useSyncExternalStore`](./use-sync-external-store.md).

### State vs ref

| | `useState` | `useRef` |
|---|---|---|
| Returns | `[value, setValue]` | `{ current }` |
| Changing it re-renders | Yes | No |
| Value identity across renders | New value each render | Same object every render |
| Safe to read during render | Yes | No |
| Safe to write during render | No | No (except lazy init) |
| Snapshot per render | Yes — closures capture that render's value | No — always the latest value |
| Use for | Anything the user sees | Anything the user never sees |

## Basic example

A DOM ref. React assigns the node before your Effects run and before the browser
paints, and sets it back to `null` when the element is removed.

```jsx live
import { useRef } from 'react';

export default function SearchBar() {
  const inputRef = useRef(null);

  function focusSearch() {
    inputRef.current?.focus();
  }

  return (
    <div>
      <input ref={inputRef} placeholder="Search products" />
      <button onClick={focusSearch}>Focus the field</button>
    </div>
  );
}
```

Note the `?.`. `inputRef.current` is `null` on the first render, before React
has committed anything, and `null` again after the element unmounts.

## How it works

### Across re-renders

React stores the ref object in the component's fiber. On the first render it
creates `{ current: initialValue }`; on every render after that it hands you the
identical object and **ignores the argument you passed**. This is why an
expensive `useRef(createThing())` still calls `createThing()` on every render —
the result is discarded, but the work is not.

Because the object never changes identity, a ref is stable enough to leave out
of a dependency array, and including it never re-fires an Effect.

### Do not read or write `ref.current` during render

React expects rendering to be pure: the same props and state produce the same
JSX, and rendering must not observe or produce side effects.

```jsx
import { useRef } from 'react';

export default function RenderCounter() {
  const renders = useRef(0);
  renders.current += 1; // Impure: rendering now has a side effect.
  return <p>Rendered {renders.current} times</p>;
}
```

That component lies. Under concurrent rendering React may render it, throw the
work away, and render it again; in StrictMode it renders twice on purpose. The
number is meaningless, and worse, the mutation escaped a render that was never
committed.

The rule: read and write `ref.current` in **event handlers, Effects, and
callbacks** — anywhere that runs after a render is committed. The only
exception React sanctions is lazy initialization, guarded so it happens once:

```jsx
import { useRef } from 'react';

function createIntersectionObserver() {
  return new IntersectionObserver(() => {});
}

export default function LazyRefInit() {
  const observerRef = useRef(null);
  if (observerRef.current === null) {
    observerRef.current = createIntersectionObserver();
  }
  return <div>Observer ready</div>;
}
```

### StrictMode

In development StrictMode calls your component function twice. Each call runs
`useRef(...)`, so **two ref objects are created and one is discarded**. If your
component is pure this changes nothing.

What StrictMode does catch is the impure pattern above: a render counter will
show `2` after the first mount, an append-to-array-during-render will duplicate
entries, and a "run once" latch you set during render will already be set on the
second call. That is the double-invoke doing its job.

StrictMode also mounts, unmounts, and remounts each component once. Any DOM ref
callback runs, cleans up, and runs again — which is why ref cleanup matters.

### Concurrent rendering

Concurrent React can start a render, abandon it, and restart. Refs are outside
that model entirely: they are not versioned, not snapshotted, and not rolled
back. A render that never commits can still have mutated a ref.

That is precisely why the "don't touch it during render" rule exists. Confine
ref mutation to committed phases and concurrency is a non-issue.

## Common patterns

### `ref` is an ordinary prop (React 19.0+)

Since **19.0** a function component receives `ref` in its props like any other
prop. Nothing wraps it.

```jsx live
import { useRef } from 'react';

function TextField({ label, ref }) {
  return (
    <label>
      {label} <input ref={ref} />
    </label>
  );
}

export default function LoginForm() {
  const emailRef = useRef(null);

  return (
    <form onSubmit={e => e.preventDefault()}>
      <TextField label="Email" ref={emailRef} />
      <button type="button" onClick={() => emailRef.current?.focus()}>
        Focus email
      </button>
    </form>
  );
}
```

> [!DEPRECATED]
> Before **19.0** this required `forwardRef`, because `ref` was stripped out of
> props. `forwardRef` still works in React 19 but is deprecated and slated for
> removal — write `ref` as a plain prop in new code, and run
> `npx codemod@latest react/19/migration-recipe` to convert existing components.

> [!DEPRECATED]
> Reading `element.ref` — the ref off a JSX element object — is deprecated as of
> **19.0** and warns. Read `element.props.ref` instead, now that `ref` is a
> normal prop.

### Ref callbacks, and cleanup functions (React 19.0+)

Instead of a ref object you can pass a function. React calls it with the node on
mount and, historically, with `null` on unmount.

Since **19.0** a ref callback may **return a cleanup function**. React runs it
when the element is removed, which is a much better fit for anything you set up
against the node.

```jsx live
import { useState } from 'react';

export default function ResizeReporter() {
  const [size, setSize] = useState(null);
  const [mounted, setMounted] = useState(true);

  return (
    <div>
      <button onClick={() => setMounted(m => !m)}>
        {mounted ? 'Unmount' : 'Mount'} the box
      </button>
      {mounted && (
        <div
          ref={node => {
            const observer = new ResizeObserver(([entry]) => {
              setSize(Math.round(entry.contentRect.width));
            });
            observer.observe(node);
            // React 19: returning a function registers cleanup.
            return () => observer.disconnect();
          }}
          style={{ border: '1px solid currentColor', padding: 8 }}
        >
          Width: {size ?? '—'}px
        </div>
      )}
    </div>
  );
}
```

> [!WARNING]
> Because a returned function is now meaningful, returning **anything else**
> from a ref callback is an error. TypeScript rejects it in React 19. The usual
> culprit is an implicit arrow return, and the fix is a pair of braces.

```diff
- <div ref={current => (instanceRef.current = current)} />
+ <div ref={current => { instanceRef.current = current; }} />
```

Fix a codebase in bulk with
`npx types-react-codemod@latest no-implicit-ref-callback-return ./src`.

> [!NOTE]
> If a ref callback returns a cleanup function, React no longer calls it with
> `null` on unmount — it calls your cleanup instead. Callbacks that return
> nothing keep the old `null` behavior, so existing code is unaffected.

### Holding the previous value

```jsx live
import { useEffect, useRef, useState } from 'react';

export default function PriceTicker() {
  const [price, setPrice] = useState(100);
  const previousPrice = useRef(price);

  useEffect(() => {
    previousPrice.current = price;
  }, [price]);

  const direction = price > previousPrice.current ? 'up' : 'down';

  return (
    <div>
      <p>
        Price: {price} (previous {previousPrice.current}, moving {direction})
      </p>
      <button onClick={() => setPrice(p => p + 5)}>Raise</button>
      <button onClick={() => setPrice(p => p - 5)}>Lower</button>
    </div>
  );
}
```

Reading `previousPrice.current` during render is a deliberate exception people
make for this pattern, and it is not free: under a discarded concurrent render
the value you read may be from a render that never shipped. Reach for it only
when you cannot derive the answer from state, and prefer storing both values in
state when correctness matters.

## Advanced example

A ref carrying an imperative resource, with the resource torn down properly. The
interval id lives in a ref because no rendered output depends on it.

```jsx live
import { useEffect, useRef, useState } from 'react';

export default function Stopwatch() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef(null);

  // Guarantee the timer dies with the component.
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  function start() {
    if (intervalRef.current !== null) return;
    intervalRef.current = setInterval(() => {
      setElapsedMs(ms => ms + 100);
    }, 100);
  }

  function stop() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function reset() {
    stop();
    setElapsedMs(0);
  }

  return (
    <div>
      <p>{(elapsedMs / 1000).toFixed(1)}s</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

### Typed refs

```tsx
import { useRef } from 'react';

export function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const retryCount = useRef<number>(0);

  function play() {
    retryCount.current += 1;
    videoRef.current?.play();
  }

  return (
    <div>
      <video ref={videoRef} src={src} />
      <button onClick={play}>Play</button>
    </div>
  );
}
```

Type a DOM ref as `T | null` and initialize it with `null`. Typing it as plain
`T` and passing `null` produces a read-only `RefObject` that React cannot write
to.

## Common mistakes

**Expecting a re-render.** `countRef.current += 1` updates nothing on screen.
The next render triggered by something else will show the new number, which
makes the bug look intermittent.

**Reading `ref.current` during render.** It breaks purity, misbehaves under
StrictMode's double-invoke, and can observe work from a render React discarded.
Move the read into an event handler or Effect.

**Reading `ref.current` in the same event that set it.** A DOM ref is populated
during commit. Inside the click handler that called `setShowModal(true)`,
the modal's ref is still `null` — the element does not exist yet. Do the work in
an Effect, or in a ref callback.

**Doing work in `useRef`'s argument.** `useRef(new WebSocket(url))` opens a
socket on every render and throws away all but the first. Use the
`if (ref.current === null)` guard, or create it in an Effect.

**Using a ref to skip StrictMode's double Effect.** A `hasRun` ref that
suppresses the second invocation hides the bug instead of fixing it. The
double-invoke is telling you the Effect is not idempotent; give it a cleanup
function.

**Implicit returns from ref callbacks.** `ref={el => (nodeRef.current = el)}`
returns the element. Since 19.0 React treats a returned value as a cleanup
function, so wrap the body in braces.

**Mutating an object you also render.** If `ref.current` is an array you map
over in JSX, pushing to it changes what should have been rendered without
telling React. That data belongs in state.

## Related topics

- [useState](./use-state.md) — for values the user actually sees.
- [useImperativeHandle](./use-imperative-handle.md) — expose a narrow API on a
  ref instead of the raw DOM node.
- [Refs and the DOM](../patterns/refs-and-dom.md) — focus management, measuring,
  and integrating non-React widgets.
- [StrictMode](../core-concepts/strict-mode.md) — why your component and its
  refs are created twice in development.
- [useEffect](./use-effect.md) — where ref mutation belongs when it has to
  happen after render.
