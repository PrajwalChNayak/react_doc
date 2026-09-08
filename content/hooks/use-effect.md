---
title: useEffect
description: Synchronize a component with a system outside React, and know when not to.
group: hooks
order: 40
status: current
related: [hooks/use-effect-event, hooks/use-layout-effect, hooks/use-sync-external-store, data-fetching/fetching-in-effects]
---

## Overview

`useEffect` lets a component **synchronize itself with something outside React**
— a socket, a subscription, a browser API, a chart library, the document title.

```text
useEffect(setup, dependencies?)
```

- `setup` — runs after React commits the render to the DOM. It may return a
  **cleanup** function.
- `dependencies` *(optional)* — an array of reactive values. React re-runs the
  Effect when any of them differs from the previous render, compared with
  `Object.is`.
  - `[a, b]` — run when `a` or `b` changes.
  - `[]` — run only on mount, clean up on unmount.
  - omitted — run after **every** render.

> [!WARNING]
> Most Effects people write should not exist. `useEffect` is an escape hatch out
> of React, not a lifecycle hook. If the Effect does not talk to a system outside
> React, [there is almost certainly a better tool](#when-not-to-use-it).

## Why it exists

Rendering must be pure: given the same props, state and context, your component
returns the same markup and touches nothing else. That purity is what lets React
render your component twice, discard the result, retry at a different priority,
or render it on a server.

But real applications must touch the outside world. Something has to open the
WebSocket, attach the listener and start the observer — and, crucially,
something has to **undo** all of that.

`useEffect` is the seam. It runs after the DOM has been updated, outside the
render, in a place where side effects are legal. Its real contribution is not
"run code after render" — it is the **cleanup contract**: every subscription you
start comes with the instruction for stopping it, colocated with the code that
started it.

Think of an Effect as answering "given the current props and state, what should
the outside world look like?" — not "what should happen when this component
mounts?"

## When to use it

- **Connecting to an external system**: a WebSocket, a server-sent-event stream,
  a video player, a map or chart instance, a third-party widget.
- **Subscribing to browser APIs**: `window` events, `IntersectionObserver`,
  `ResizeObserver`, `matchMedia`, the History API.
- **Timers** that must start and stop with the component.
- **Imperatively driving a DOM node** React does not control — playing a video,
  focusing a field after a change that is not a user event.
- **Synchronizing something global with your state**: `document.title`, a
  `<body>` class, a canvas.
- **Sending analytics for a page view** — the event is "this page was displayed",
  which is a rendering consequence, not a click.

## When not to use it

This is the important half of the page. Each item below is an Effect you can
delete.

### Transforming data for rendering

If a value can be computed from props and state, compute it during render. An
Effect that sets state from other state renders twice and is stale in between.

```jsx
import { useState } from 'react';

export default function InvoiceTotals({ lineItems }) {
  const [taxRate, setTaxRate] = useState(0.2);

  // No Effect. No state. Cannot get out of sync.
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const total = subtotal * (1 + taxRate);

  return (
    <div>
      <input
        type="number"
        step="0.01"
        value={taxRate}
        onChange={(e) => setTaxRate(Number(e.target.value))}
      />
      <p>
        Subtotal {subtotal.toFixed(2)} / total {total.toFixed(2)}
      </p>
    </div>
  );
}
```

If the calculation is genuinely expensive, wrap it in
[`useMemo`](./use-memo.md) — and check whether the
[React Compiler](../performance/react-compiler.md) already handles it.

### Handling a user event

If the code should run *because the user did something*, put it in the handler.
Effects run because the component rendered, which is a different question. An
Effect that posts a form when `isSubmitted` flips to `true` will also fire after
a hot reload, a StrictMode remount, or any other render you did not anticipate.

### Resetting state when a prop changes

Do not clear state in an Effect. Change the component's `key` so React discards
the instance and mounts a fresh one — see
[useState](./use-state.md#common-patterns).

### Initializing the application

Code that must run once per page load, not once per component mount, belongs at
module scope or in your entry file.

```js
// app-entry.js — runs once when the module is imported.
if (typeof window !== 'undefined') {
  startErrorReporting();
}
```

A `useEffect(..., [])` in your root component is not the same thing: it runs
once per *mount*, which in development under StrictMode means twice, and in
production means once per time that component appears.

### Subscribing to an external store

An Effect plus `useState` is the manual, tearing-prone version of
[`useSyncExternalStore`](./use-sync-external-store.md). Use the hook: it reads a
consistent value during render and works correctly with concurrent rendering.

### Fetching data

You *can* fetch in an Effect, and doing it correctly means handling race
conditions, cancellation, loading and error state, caching and refetching
yourself. Read [fetching in Effects](../data-fetching/fetching-in-effects.md)
for the full pattern, and [the data fetching
overview](../data-fetching/overview.md) for the approaches that do this work for
you.

> [!BEST-PRACTICE]
> Before writing an Effect, finish this sentence: "this synchronizes my component
> with **\_\_\_**." If the blank is not a system outside React, delete the
> Effect.

## Basic example

A timer is an external system: it exists outside React, it must be started, and
it must be stopped.

```jsx live
import { useState, useEffect } from 'react';

export default function ElapsedTime() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      // The updater form: never reads a stale `seconds`.
      setSeconds((current) => current + 1);
    }, 1000);

    // Cleanup: runs before the next run and on unmount.
    return () => clearInterval(id);
  }, [running]);

  return (
    <div>
      <p>{seconds}s elapsed</p>
      <button onClick={() => setRunning((r) => !r)}>
        {running ? 'Pause' : 'Resume'}
      </button>{' '}
      <button onClick={() => setSeconds(0)}>Reset</button>
    </div>
  );
}
```

Toggling `running` re-runs the Effect: React calls the cleanup for the previous
run first (clearing the old interval), then the setup. Without the cleanup you
would accumulate an interval per toggle.

## How it works

### Timing

React renders, commits the changes to the DOM, lets the browser paint, and
*then* runs your Effects. Because they run after paint, Effects never block the
first frame — which is why they are the default and
[`useLayoutEffect`](./use-layout-effect.md) is the exception.

### The dependency array is a claim, not a setting

The array is not a knob for controlling how often the Effect runs. It is your
declaration of every reactive value the Effect reads. React trusts it.

Reactive values are props, state, context, and anything computed from them
during render. If the Effect reads one and you omit it, the Effect keeps a
closure over an old render's value — a **stale closure** — and stops
synchronizing.

```jsx
import { useEffect } from 'react';

export default function RoomStatus({ serverUrl, roomId }) {
  useEffect(() => {
    const socket = new WebSocket(`${serverUrl}/${roomId}`);
    return () => socket.close();
    // Omitting roomId here means switching rooms keeps you in the old one.
  }, [serverUrl, roomId]);

  return <p>Connected to {roomId}</p>;
}
```

If a dependency changes too often, the fix is never to remove it. The fix is one
of: move the value inside the Effect, move it outside the component, use an
updater function instead of reading state, memoize the object it comes from, or —
when the value is genuinely non-reactive — wrap that logic in
[`useEffectEvent`](./use-effect-event.md).

### Cleanup runs more often than you think

React runs the cleanup:

1. Before every re-run of the Effect, using the *previous* run's closure.
2. When the component unmounts.

Cleanup is not "on unmount" code. It is "undo the last setup" code. Write it so
that setup followed by cleanup leaves the world exactly as it was.

### StrictMode: mount, unmount, remount

In development, `<StrictMode>` mounts each component, immediately unmounts it,
and mounts it again. Your Effect therefore runs **setup, cleanup, setup**.

This is a test, and there is exactly one correct response: implement the
cleanup. With a correct cleanup, the second setup starts from a clean world and
the user sees nothing. Without one, you see the symptom in development that your
users would have seen in production — two sockets, two intervals, a duplicated
analytics event, two identical requests.

> [!WARNING]
> Do not "fix" the double invocation with a `hasRun` ref or by removing
> `<StrictMode>`. The double run is not the bug; it is the detector. Production
> mounts and unmounts components constantly — on navigation, on `key` changes,
> on a Suspense boundary re-showing content.

### Concurrent rendering

React may render a component and never commit that render, or commit it much
later. Effects run only for committed renders, and React can also mount, unmount
and remount a subtree — for example when a Suspense boundary hides and reveals
content, or with [`<Activity>`](../performance/activity.md). Each of those cycles
runs your cleanup and setup again. Resilient Effects are ones whose setup and
cleanup are perfect inverses.

## Common patterns

### Subscribing to a browser API

```jsx live
import { useState, useEffect } from 'react';

export default function ViewportSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener('resize', handleResize);
    // Read once on mount too: the size may have changed before we subscribed.
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <p>
      Viewport: {size.width} x {size.height} — resize the preview to update.
    </p>
  );
}
```

For anything that is really a *store* rather than a one-off subscription, prefer
[`useSyncExternalStore`](./use-sync-external-store.md).

### Race conditions

Two requests started in order can finish out of order. Without protection, the
slower, older response overwrites the newer one and the user sees the wrong
data. Every async Effect needs a guard.

```jsx static="Talks to a network endpoint, so there is nothing to fetch in the sandbox."
import { useState, useEffect } from 'react';

export default function UserProfile({ userId }) {
  const [profile, setProfile] = useState({ name: '', bio: '' });
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    // Cancels the request itself, not only the state update.
    const controller = new AbortController();
    setStatus('loading');

    async function load() {
      try {
        const response = await fetch(`/api/users/${userId}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        setProfile(await response.json());
        setStatus('ready');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return; // superseded by a newer request; not an error
        }
        setStatus('error');
      }
    }

    load();
    return () => controller.abort();
  }, [userId]);

  if (status === 'loading') return <p>Loading...</p>;
  if (status === 'error') return <p>Could not load this profile.</p>;
  return (
    <article>
      <h2>{profile.name}</h2>
      <p>{profile.bio}</p>
    </article>
  );
}
```

If the request cannot be aborted — a third-party SDK, a promise you did not
create — use an `ignore` flag instead:

```jsx static="Talks to a network endpoint, so there is nothing to fetch in the sandbox."
import { useState, useEffect } from 'react';

export default function SearchResults({ query }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    let ignore = false;

    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((response) => response.json())
      .then((data) => {
        // The request still completes; we discard a stale answer.
        if (!ignore) setResults(data);
      });

    return () => {
      ignore = true;
    };
  }, [query]);

  return <p>{results.length} results for “{query}”</p>;
}
```

### Choosing between the three Effect hooks

| | `useEffect` | `useLayoutEffect` | `useEffectEvent` |
|---|---|---|---|
| What it is | An Effect | An Effect | A function you call **from** an Effect |
| When it runs | After the browser paints | After DOM mutation, **before** paint | Only when you call it |
| Blocks paint | No | **Yes** | N/A |
| Runs during SSR | No | No (warns if you rely on it) | N/A |
| Has a dependency array | Yes | Yes | **No — never list it as a dependency** |
| Reads latest values | Only what its dependencies allow | Same | Always the latest committed values |
| Use it for | Synchronizing with external systems | Measuring layout and adjusting before paint | Non-reactive logic that should not re-trigger the Effect |
| Available since | React 16.8 | React 16.8 | **React 19.2** |

### Before and after: deleting an unnecessary Effect

A form that reports its validity upward. The version with an Effect:

```jsx
import { useState, useEffect } from 'react';

export default function SignupFormWithEffect({ onValidityChange }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isValid, setIsValid] = useState(false);

  // Renders with the old validity, then again with the new one.
  useEffect(() => {
    const valid = email.includes('@') && password.length >= 8;
    setIsValid(valid);
    onValidityChange(valid);
  }, [email, password, onValidityChange]);

  return (
    <form>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button disabled={!isValid}>Sign up</button>
    </form>
  );
}
```

Three problems: an extra render pass, a frame where the button's disabled state
lies, and an Effect that re-runs whenever the parent passes a new
`onValidityChange` function. Now without it:

```jsx live
import { useState } from 'react';

export default function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Derived during render: never stale, never an extra pass.
  const isValid = email.includes('@') && password.length >= 8;

  function handleSubmit(e) {
    e.preventDefault();
    // The consequence of an event belongs in the event handler.
    console.log('submitting', email);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />{' '}
      <input
        type="password"
        placeholder="Password (8+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />{' '}
      <button disabled={!isValid}>Sign up</button>
      <p>{isValid ? 'Looks good.' : 'Enter an email and 8+ characters.'}</p>
    </form>
  );
}
```

One state variable fewer, one render fewer, one Effect fewer, and no way for the
validity to disagree with the fields.

## Advanced example

Connecting to an external system, with the room as a dependency and full
cleanup. The "chat server" here is a local fake so the example can run, but the
shape is exactly what a real socket needs.

```jsx live
import { useState, useEffect } from 'react';

// Stands in for a real connection library. Lives outside React.
function createConnection(roomId, onEvent) {
  let timer;
  return {
    connect() {
      onEvent(`Connected to "${roomId}"`);
      timer = setInterval(() => onEvent(`Message in "${roomId}"`), 2000);
    },
    disconnect() {
      clearInterval(timer);
      onEvent(`Disconnected from "${roomId}"`);
    },
  };
}

export default function ChatRoom() {
  const [roomId, setRoomId] = useState('general');
  const [log, setLog] = useState(['(nothing yet)']);

  useEffect(() => {
    const connection = createConnection(roomId, (line) => {
      setLog((current) => [...current.slice(-4), line]);
    });
    connection.connect();
    // Setup and cleanup are exact inverses, so StrictMode's extra
    // mount/unmount/remount cycle is invisible.
    return () => connection.disconnect();
  }, [roomId]);

  return (
    <div>
      <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        <option value="general">general</option>
        <option value="react">react</option>
        <option value="random">random</option>
      </select>
      <ul>
        {log.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
```

Switching rooms disconnects from the old one before connecting to the new one,
because that is what "re-run the Effect" means. Nothing about this code mentions
mounting or unmounting — it describes a relationship between `roomId` and the
connection, and React maintains it.

## Common mistakes

**Lying about dependencies.** Removing a value from the array to stop the Effect
re-running does not stop it needing that value; it makes the Effect read a stale
one. Fix the cause instead.

**Suppressing the lint rule.** `// eslint-disable-next-line
react-hooks/exhaustive-deps` is the most reliable source of stale-closure bugs in
React codebases.

**Missing cleanup.** Every `addEventListener`, `setInterval`, `subscribe`,
`observe` and `connect` needs its inverse in the returned function.

**Setting state unconditionally in an Effect with no dependency array.** Render
sets state, which renders, which sets state. Infinite loop.

**An object or array literal in the dependency array.** `[{ id }]` or
`[options]` where `options` is built during render is a new reference every time,
so the Effect runs after every render. Depend on the primitive fields, or
memoize the object.

**Working around StrictMode.** A `didInit` ref hides the diagnostic and leaves
the real bug — no cleanup — in production.

**Using an Effect for derived state.** The most common unnecessary Effect. Any
`useEffect` whose body is only `setSomething(...)` from other state is a
calculation in disguise.

**Using an Effect to respond to a click.** If it happens because of an
interaction, it belongs in the handler.

**Fetching without a race guard.** Type quickly into a search box and you will
see the results of a query you no longer have on screen.

**Chaining Effects.** Effect A sets state that triggers Effect B that sets state
that triggers Effect C. Each link is a full render pass. Compute the whole result
in one place instead.

**Reading a value that should not re-trigger the Effect.** The classic case: an
Effect that reconnects whenever a theme or a callback prop changes. Since React
19.2 that is what [`useEffectEvent`](./use-effect-event.md) is for.

## Related topics

- [useEffectEvent](./use-effect-event.md) — take non-reactive logic out of an Effect without lying about dependencies.
- [useLayoutEffect](./use-layout-effect.md) — the pre-paint variant, for measurement only.
- [useSyncExternalStore](./use-sync-external-store.md) — the correct way to subscribe to a store.
- [Fetching in Effects](../data-fetching/fetching-in-effects.md) — the complete pattern, and its costs.
- [useState](./use-state.md) — deriving values instead of storing them.
- [StrictMode](../core-concepts/strict-mode.md) — what the double mount is checking.
