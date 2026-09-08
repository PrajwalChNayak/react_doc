---
title: Strict Mode
description: The development-only checks that double-invoke your components and Effects to expose impure render and missing cleanup.
group: core-concepts
order: 90
status: current
related: [core-concepts/rendering, hooks/use-effect, performance/activity]
---

## Overview

`<StrictMode>` turns on extra checks for the tree inside it. It renders nothing
and changes no behavior in production. In development it deliberately does things
twice so that bugs which would otherwise appear rarely — under load, after a
back-navigation, when a Suspense boundary re-renders — appear on every save.

```jsx static="Application entry point — needs a real DOM container and a bundler."
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
```

Every mainstream React starter enables it by default. If your app has it and you
are seeing doubled logs, that is Strict Mode working, not a bug.

## Why it exists

React's model assumes your components are pure and your Effects clean up after
themselves. Both assumptions are invisible until they are violated, and when they
are violated the symptom is usually intermittent: a duplicated network request, a
counter that is occasionally off by one, a subscription that leaks only after a
route has been visited twice.

Strict Mode converts those intermittent bugs into deterministic ones. It does not
find *new* bugs — it makes existing ones happen every time.

The stakes rose with React 18 and 19. Concurrent rendering can start, abandon and
restart a render. [`<Activity>`](../performance/activity.md) unmounts Effects and
later re-creates them for a subtree whose state survives. Suspense can re-render
a tree when data resolves. All three break impure components and uncleaned
Effects. Strict Mode is the practice run.

## When to use it

Wrap your whole app, in development and in your production build alike — the
checks compile away in production, so there is no cost to leaving it in.

You can also wrap part of a tree while you migrate a large codebase:

```jsx
import { StrictMode } from 'react';

function SettingsPanel() {
  return <section>Settings</section>;
}

function LegacyDashboard() {
  return <section>Dashboard</section>;
}

export function App() {
  return (
    <div>
      <StrictMode>
        <SettingsPanel />
      </StrictMode>
      <LegacyDashboard />
    </div>
  );
}
```

Only components inside the boundary get the extra checks. This is the practical
way to adopt it incrementally rather than turning it off entirely.

## When not to use it

There is no good reason to remove it permanently. If a component misbehaves under
Strict Mode, that component has a bug that will surface in production sooner or
later.

The one legitimate temporary move is the scoped adoption above: leave an old
subtree outside the boundary while you fix it, rather than disabling the checks
for everything.

## Basic example

An Effect that cleans up correctly behaves identically with and without Strict
Mode. This one starts an interval and stops it:

```jsx live
import { useEffect, useState } from 'react';

export default function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);

    // Without this, Strict Mode's second setup leaves two intervals running
    // and the timer counts double.
    return () => clearInterval(id);
  }, [running]);

  return (
    <div>
      <p>Elapsed: {seconds}s</p>
      <button type="button" onClick={() => setRunning((value) => !value)}>
        {running ? 'Pause' : 'Resume'}
      </button>
      <button type="button" onClick={() => setSeconds(0)}>
        Reset
      </button>
    </div>
  );
}
```

Delete the `clearInterval` line mentally: on mount, Strict Mode runs setup,
cleanup, setup. With no cleanup, the first interval is never cancelled and the
counter increments twice a second. The same thing happens in production whenever
`running` changes — Strict Mode just shows it to you on the first render.

## How it works

### What runs twice

In development only, inside a Strict Mode boundary, React calls these twice:

- The **component function body** — the top-level logic, not code inside event
  handlers.
- **`useState` initializers**, including the lazy `useState(() => expensive())`
  form.
- **`set` functions from `useState`** — the updater functions you pass to them.
- **`useMemo` calculations.**
- **`useReducer` reducers.**
- Class component `constructor`, `render` and `shouldComponentUpdate`.

React also runs an extra **setup → cleanup → setup** cycle for:

- Every Effect (`useEffect` and `useLayoutEffect`) on mount.
- Every **ref callback** on mount.

And it checks the tree for deprecated APIs, warning about things like the
`UNSAFE_` class lifecycle methods.

React keeps only the result of the first call of a pure function; the second call
exists purely so that an impure one misbehaves visibly.

### What it does not do

- **Nothing in production.** All of it is stripped from the production build.
  Your Effects run once, your components render once per update.
- **It does not double network requests in production.** A duplicated `fetch` in
  development is a real signal — it means the Effect has no cleanup — but it is
  not what your users will experience.
- **It does not affect performance in production**, and its development cost is
  a doubled render of components that should be cheap functions.
- **It does not change the rules.** Strict Mode does not require anything React
  did not already require. It reports.

### Reading a doubled console.log

Your logs will appear twice. This is the intended behavior and the fastest way to
tell whether Strict Mode is on.

React DevTools dims the `console.log` calls from the second render, and offers a
setting (off by default) to suppress them completely. If you have DevTools
installed and your logs are not dimmed, you are looking at two genuine renders —
two separate updates — not the Strict Mode double-invoke.

The useful distinction:

| What you see | What it means |
|---|---|
| The same log twice, the second dimmed | Strict Mode double-invoke. Expected. |
| The same log twice, neither dimmed | Two real renders. Something set state twice. |
| An Effect's log twice with its cleanup log between | Strict Mode's setup → cleanup → setup. Expected. |
| An Effect's log twice with no cleanup log between | **Missing cleanup.** Fix it. |

That last row is the whole point of the feature.

### Failure mode 1: impure render

A component that changes something outside itself during render produces
different output on the second call.

```jsx
let sequence = 0;

export function BadRow({ label }) {
  sequence += 1; // Mutates a module variable during render.
  return (
    <li>
      #{sequence} {label}
    </li>
  );
}
```

Under Strict Mode the numbers jump by two. Under concurrent rendering in
production they jump by an amount nobody can predict, because the count includes
renders React abandoned.

The same problem in its more common disguise — mutating an object that already
existed:

```jsx
export function BadTotals({ cart }) {
  // `cart` belongs to the caller. Writing to it during render is a mutation.
  cart.total = cart.items.reduce((sum, item) => sum + item.price, 0);
  return <p>Total: {cart.total}</p>;
}

export function GoodTotals({ cart }) {
  // Compute a new value instead.
  const total = cart.items.reduce((sum, item) => sum + item.price, 0);
  return <p>Total: {total}</p>;
}
```

**The fix is always the same shape:** create new values during render, and move
anything that touches the outside world into an event handler or an Effect.
Objects you create *during* this render are fair game — mutating a local array
you just built is pure, because nothing outside the render can observe it.

### Failure mode 2: missing Effect cleanup

An Effect that acquires a resource must release it. Strict Mode's extra cycle
makes a missing release obvious immediately.

```jsx
import { useEffect, useState } from 'react';

export function BadRoomStatus({ roomId }) {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const socket = new WebSocket(`wss://chat.example.com/${roomId}`);
    socket.addEventListener('open', () => setOnline(true));
    // No cleanup: every mount and every roomId change leaks a socket.
  }, [roomId]);

  return <p>{online ? 'Connected' : 'Connecting…'}</p>;
}

export function GoodRoomStatus({ roomId }) {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const socket = new WebSocket(`wss://chat.example.com/${roomId}`);
    socket.addEventListener('open', () => setOnline(true));
    return () => socket.close();
  }, [roomId]);

  return <p>{online ? 'Connected' : 'Connecting…'}</p>;
}
```

The cleanup is not there to satisfy Strict Mode. It is there because the Effect
re-runs whenever `roomId` changes, and because
[`<Activity>`](../performance/activity.md) destroys Effects when a subtree is
hidden and re-creates them when it is shown again. An Effect without cleanup is
broken in production too; Strict Mode only made the schedule inconvenient enough
to notice.

The cleanup checklist by resource:

| Effect sets up | Cleanup returns |
|---|---|
| `setInterval` / `setTimeout` | `clearInterval` / `clearTimeout` |
| `addEventListener` | `removeEventListener` with the same function |
| A socket or subscription | `close()` / `unsubscribe()` |
| A `fetch` | `abort()` on an `AbortController`, or an ignore flag |
| An animation or observer | `cancel()` / `disconnect()` |

### What not to do about it

The tempting fix is to suppress the second run:

```jsx
import { useEffect, useRef } from 'react';

export function DoNotDoThis() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return; // Defeats the check, keeps the bug.
    hasRun.current = true;
    // ...
  }, []);

  return null;
}
```

This makes the symptom disappear in development and leaves the bug in
production, where the Effect still re-runs on every dependency change and after
every `<Activity>` reveal. Write the cleanup instead.

Turning Strict Mode off is the same move with a bigger blast radius.

### The one honest exception

If an Effect calls a non-idempotent API — creating a payment, sending an email —
running it twice is genuinely harmful. The answer is not a guard ref; it is that
this code does not belong in an Effect. Actions that happen "because the user did
something" belong in event handlers, which run once per interaction. See
[events](./events.md#when-to-use-it) and
[forms and actions](../patterns/forms-and-actions.md).

## Common patterns

### Data fetching in an Effect

If you fetch in an Effect, Strict Mode will show you two requests. The fix is an
abort or an ignore flag, which you needed anyway to prevent a slow response from
overwriting a fast one after the user navigated away:

```jsx
import { useEffect, useState } from 'react';

export function UserProfile({ userId }) {
  const [name, setName] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(`/api/users/${userId}`, {
          signal: controller.signal,
        });
        const user = await response.json();
        setName(user.name);
      } catch (error) {
        if (!controller.signal.aborted) {
          throw error;
        }
      }
    }

    load();
    return () => controller.abort();
  }, [userId]);

  return <p>{name === '' ? 'Loading…' : name}</p>;
}
```

Better still, do not fetch in an Effect at all — see
[fetching in Effects](../data-fetching/fetching-in-effects.md) for why a
framework loader or a query library is usually the right answer.

### Initializers that do work

Because `useState` initializers run twice, an initializer with a side effect runs
that side effect twice. The usual offender is an initializer that increments a
module-level counter to build a unique id — it produces ids that skip numbers in
development and unpredictable ones under concurrent rendering.

For a stable unique id, use [`useId`](../hooks/use-id.md), which is designed for
it and is also stable across server rendering.

### Effects that must run once per mount

"Run once on mount" is usually a sign the code wants to be somewhere else. When
it genuinely belongs in an Effect — connecting a subscription, setting up an
observer — write it so that running setup, cleanup, setup produces the same end
state as running setup once. That is the property React actually needs, and it is
what makes the component safe under Activity, Suspense and concurrent rendering.

## Advanced example

A component that is correct under Strict Mode: pure during render, cleaning up
everything, and computing rather than storing.

```jsx live
import { useEffect, useState } from 'react';

export default function WindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener('resize', handleResize);
    handleResize(); // Catch any change between render and subscribe.
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Derived during render, not stored in state.
  const size = width < 480 ? 'small' : width < 1024 ? 'medium' : 'large';

  return (
    <p>
      Viewport is {width}px — <strong>{size}</strong>. Resize the preview.
    </p>
  );
}
```

Three properties make it Strict Mode safe. The initializer only reads a value, so
running it twice is harmless. The listener is removed in cleanup, so a second
setup does not add a duplicate. And `size` is computed during render, so no
sequence of double-invocations can leave it disagreeing with `width`.

For values read from an external source like this, [`useSyncExternalStore`](../hooks/use-sync-external-store.md)
is the purpose-built alternative and handles the server-rendering case as well.

## Common mistakes

**Assuming the doubled behavior is a bug in React.** It is a deliberate
development check. Your logs appear twice; your Effects mount, unmount and mount
again.

**Guarding an Effect with a ref so it runs once.** The bug moves to production,
where dependency changes and `<Activity>` reveals still re-run it.

**Removing `<StrictMode>` because something broke.** The something is broken
either way. Scope the boundary while you fix it if you need to ship.

**Treating a doubled network request as the problem.** The problem is the missing
abort or the missing cleanup, and it also causes race conditions when the user
types quickly.

**Putting a non-idempotent action in an Effect.** Purchases, emails and logging a
user out belong in event handlers.

**Mutating props, state or module variables during render.** Strict Mode exists
mainly to catch this, and concurrent rendering is why it matters.

**Expecting Strict Mode to catch everything.** It catches impurity that is
observable across two calls and missing cleanup on mount. It does not check
dependency arrays — that is
[`eslint-plugin-react-hooks`](../hooks/rules-of-hooks.md), now at v7 — and it
does not detect stale closures.

## Related topics

- [Rendering](./rendering.md) — the concurrent behavior that makes purity
  mandatory rather than merely tidy.
- [Components](./components.md#how-it-works) — the purity rules Strict Mode
  enforces.
- [`useEffect`](../hooks/use-effect.md) — cleanup functions, dependencies, and
  when not to use an Effect at all.
- [`<Activity>`](../performance/activity.md) — destroys and re-creates Effects in
  production, exactly as Strict Mode simulates.
- [Rules of hooks](../hooks/rules-of-hooks.md) — the lint rules that catch what
  Strict Mode cannot.
- [Fetching in Effects](../data-fetching/fetching-in-effects.md) — race
  conditions, aborts, and better alternatives.
