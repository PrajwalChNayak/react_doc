---
title: useEffectEvent
description: Read the latest props and state from an Effect without making them dependencies.
group: hooks
order: 60
status: current
since: "19.2"
related: [hooks/use-effect, hooks/use-ref, hooks/use-callback]
---

## Overview

`useEffectEvent` extracts a piece of **non-reactive** logic out of an Effect, so
that the values it reads do not force the Effect to re-run.

```text
const onEvent = useEffectEvent(callback)
```

- `callback` — a function containing the logic. It may take any arguments and
  return any value. When you call the returned function, the callback always
  reads the **latest committed** props and state, whatever the Effect's own
  closure captured.
- Returns an *Effect Event*: a function with the same signature as `callback`,
  callable from `useEffect`, `useLayoutEffect`, `useInsertionEffect`, or another
  Effect Event **in the same component**.

`useEffectEvent` shipped in **React 19.2**. Before that release it existed only
in experimental builds under different names; react.dev now documents it as a
regular API alongside the other hooks. If you are on 19.0 or 19.1, it is not
available — use the ref workaround at the end of this page and upgrade when you
can (the security floor is `>= 19.2.4`, and the examples here assume 19.2.8).

## Why it exists

Effects have exactly one lever for controlling when they re-run: the dependency
array. And you are not allowed to lie about it — every reactive value the Effect
reads must be listed, or the Effect keeps working with stale values.

That creates a genuine conflict. Consider an Effect that connects to a chat room
and shows a themed notification on connect. It reads `roomId` and `theme`. Both
are reactive, so both go in the array — and now changing the theme disconnects
and reconnects the socket.

The dependency array cannot express the difference, because the difference is
not about *which values are read*. It is about **why** they are read:

- `roomId` is **reactive**: when it changes, the connection must change. It
  describes what the Effect synchronizes.
- `theme` is **not**: it is whatever the theme happens to be *at the moment the
  notification fires*. Its change should not restart anything.

`useEffectEvent` gives that second category a home. Code inside an Effect Event
is not reactive: it always sees the latest values, and it never appears in a
dependency array. The Effect keeps a truthful, minimal dependency list, and the
"what should happen at the moment this fires" logic reads fresh data.

The name is deliberate. An Effect Event behaves like an event handler — it runs
in response to something happening, reads the current state, and does not
describe an ongoing synchronization.

## When to use it

- **An Effect re-runs because of a value it only reads at fire time.** The
  canonical case: reconnect on `roomId`, but read `theme`, `userName`, or
  `isMuted` at the moment of connecting.
- **A callback prop used inside an Effect.** `onConnected`, `onMessage`,
  `onVisible` — the parent recreates the function every render, so listing it
  restarts the Effect constantly.
- **Analytics or logging from an Effect** that should include the current state
  without that state driving the Effect.
- **An interval or subscription whose handler needs the current state** but whose
  lifetime must not depend on it.

## When not to use it

- **To silence the dependency linter.** If a value genuinely determines what the
  Effect synchronizes, it belongs in the array. Wrapping it in an Effect Event
  hides a real bug: the Effect stops re-synchronizing when it should.
- **For plain event handlers.** A click handler already reads the latest state.
  This hook has no role outside Effects.
- **Anywhere outside an Effect.** Calling an Effect Event during render is not
  supported.
- **As a memoized callback to pass down.** It is not
  [`useCallback`](./use-callback.md), its identity is intentionally unstable, and
  passing it to a child is forbidden.
- **When the whole Effect is unnecessary.** Check
  [when not to use an Effect](./use-effect.md#when-not-to-use-it) first. An
  Effect Event on an Effect that should not exist is two problems.

## Basic example

The problem, written without the hook:

```jsx
import { useEffect } from 'react';

function createConnection(roomId) {
  return { connect() {}, disconnect() {} };
}

export default function ChatRoomProblem({ roomId, theme }) {
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();
    // Reads theme, so theme must be a dependency...
    console.log(`Connected to ${roomId} with the ${theme} theme`);
    return () => connection.disconnect();
    // ...and now every theme change tears down the connection.
  }, [roomId, theme]);

  return <h1>Welcome to {roomId}</h1>;
}
```

The fix — the theme is read, but it is not what the Effect synchronizes:

```jsx
import { useEffect, useEffectEvent } from 'react';

function createConnection(roomId) {
  return { connect() {}, disconnect() {} };
}

export default function ChatRoom({ roomId, theme }) {
  // Non-reactive: always sees the latest theme, never re-runs anything.
  const onConnected = useEffectEvent(() => {
    console.log(`Connected to ${roomId} with the ${theme} theme`);
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();
    onConnected();
    return () => connection.disconnect();
    // theme is intentionally absent, and the linter agrees.
  }, [roomId]);

  return <h1>Welcome to {roomId}</h1>;
}
```

Changing `theme` re-renders the component, and the next notification uses the new
theme. It does not reconnect.

You can watch the difference:

```jsx live
import { useState, useEffect, useEffectEvent } from 'react';

// Stands in for a real connection library.
function createConnection(roomId) {
  let timer;
  return {
    connect(onConnected) {
      timer = setTimeout(() => onConnected(roomId), 400);
    },
    disconnect() {
      clearTimeout(timer);
    },
  };
}

export default function ChatRoom() {
  const [roomId, setRoomId] = useState('general');
  const [theme, setTheme] = useState('dark');
  const [log, setLog] = useState(['(not connected yet)']);

  const onConnected = useEffectEvent((connectedRoom) => {
    // Reads the current theme at fire time. Not a dependency of the Effect.
    setLog((current) => [
      ...current.slice(-3),
      `Connected to "${connectedRoom}" using the ${theme} theme`,
    ]);
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    // Called from inside the Effect, never passed to a component or hook.
    connection.connect((room) => onConnected(room));
    return () => connection.disconnect();
  }, [roomId]);

  return (
    <div>
      <label>
        Room:{' '}
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="general">general</option>
          <option value="react">react</option>
        </select>
      </label>{' '}
      <button
        onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      >
        Theme: {theme}
      </button>
      <ul>
        {log.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      <p>Switching rooms adds a line. Switching themes does not.</p>
    </div>
  );
}
```

## How it works

**Across re-renders.** React stores your latest `callback` on every commit. When
you call the Effect Event, it invokes the most recently committed version — so
it reads the props and state of the latest render, not the render that created
the Effect's closure.

**Its identity is not stable, on purpose.** Unlike
[`useCallback`](./use-callback.md), the returned function is a new value every
render. That is a design decision: an unstable identity makes it impossible to
pass the Effect Event to a memoized child or store it somewhere it would be
called from the wrong place. It also means listing it in a dependency array
would make the Effect re-run after every render — which is why you must not, and
why the linter excludes it.

**With StrictMode.** Nothing special happens. StrictMode's extra mount /
unmount / remount cycle runs your Effect's setup and cleanup again, and the
Effect Event is called again as part of that. As always, correct cleanup makes
the extra cycle invisible.

**With concurrent rendering.** Effect Events read the values from the last
*committed* render, never from a render React abandoned. That is precisely why
the hook exists rather than a plain closure or a mutable variable: reading
uncommitted values would be a tearing bug.

### The restrictions

The rules are narrow, and the ESLint plugin enforces them:

- **Declare it at the top level** of a component or a custom hook, like any
  hook. Not in a loop, not in a condition.
- **Call it only from an Effect** in the same component — `useEffect`,
  `useLayoutEffect`, `useInsertionEffect` — or from another Effect Event.
- **Never call it during render.**
- **Never pass it to another component or hook.** Not as a prop, not as an
  argument, not through context.
- **Never list it in a dependency array.**
- **Never use it to remove a dependency you actually depend on.**

> [!WARNING]
> The last restriction is the one that matters. `useEffectEvent` makes it
> possible to write an Effect that never re-synchronizes and never complains.
> If you find yourself moving a value into an Effect Event because the Effect
> "runs too often", stop and ask whether the Effect should re-run — usually it
> should, and the real problem is an unmemoized object or an Effect that should
> not exist at all.

## Common patterns

### A callback prop that changes every render

```jsx
import { useEffect, useEffectEvent } from 'react';

export default function VisibilityTracker({ itemId, onVisible }) {
  // The parent recreates onVisible on every render; that must not
  // re-create the observer.
  const handleVisible = useEffectEvent(() => {
    onVisible(itemId);
  });

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        handleVisible();
      }
    });
    const node = document.getElementById(`item-${itemId}`);
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [itemId]);

  return <div id={`item-${itemId}`}>Item {itemId}</div>;
}
```

Without the Effect Event you have three bad options: list `onVisible` and
recreate the observer constantly, ask every parent to memoize the callback, or
omit it and read a stale one.

### An interval that reads current state

```jsx live
import { useState, useEffect, useEffectEvent } from 'react';

export default function AutoSaveDraft() {
  const [draft, setDraft] = useState('');
  const [saves, setSaves] = useState(['(nothing saved yet)']);
  const [intervalMs, setIntervalMs] = useState(3000);

  const save = useEffectEvent(() => {
    // Reads the newest draft every time, without restarting the timer.
    setSaves((current) => [
      ...current.slice(-2),
      draft.trim() === '' ? '(empty draft)' : draft,
    ]);
  });

  useEffect(() => {
    const id = setInterval(save, intervalMs);
    return () => clearInterval(id);
    // Only the interval length controls the timer's lifetime.
  }, [intervalMs]);

  return (
    <div>
      <textarea
        rows={2}
        value={draft}
        placeholder="Type; it saves on the interval"
        onChange={(e) => setDraft(e.target.value)}
      />
      <p>
        Interval:{' '}
        <button onClick={() => setIntervalMs(1500)}>1.5s</button>{' '}
        <button onClick={() => setIntervalMs(3000)}>3s</button> ({intervalMs}ms)
      </p>
      <ul>
        {saves.map((entry, index) => (
          <li key={index}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
```

Listing `draft` as a dependency would restart the interval on every keystroke, so
it would never fire. Omitting it would save an empty string forever. The Effect
Event is the third answer.

### Compared with the pre-19.2 workaround

Before `useEffectEvent`, people kept the latest value in a ref:

```jsx
import { useState, useRef, useEffect } from 'react';

function createConnection(roomId) {
  return { connect() {}, disconnect() {} };
}

export default function ChatRoomWithRef({ roomId, theme }) {
  const themeRef = useRef(theme);

  // Extra Effect whose only job is to keep the ref current.
  useEffect(() => {
    themeRef.current = theme;
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();
    console.log(`Connected with the ${themeRef.current} theme`);
    return () => connection.disconnect();
  }, [roomId]);

  return <h1>Welcome to {roomId}</h1>;
}
```

| | Ref workaround | `useEffectEvent` |
|---|---|---|
| Extra Effect to sync the value | Yes, one per value | No |
| Correct with concurrent rendering | Fragile — the ref may be written from a render that is later discarded | Yes, reads the last committed values |
| Linter support | None — the rule cannot tell a legitimate use from a bug | Enforced by `eslint-plugin-react-hooks` |
| Communicates intent | No, a ref looks like an escape hatch | Yes, "this part is not reactive" |
| Works with several values | One ref each | One Effect Event covers all of them |
| Requires | Any version | **React 19.2+** |

The ref version is still what you write on 19.0 and 19.1. On 19.2 and later,
replace it.

## Advanced example

Effect Events compose: one may call another in the same component, which lets
you keep each piece of non-reactive logic small.

```jsx
import { useState, useEffect, useEffectEvent } from 'react';

function createConnection(roomId) {
  return { connect() {}, disconnect() {} };
}

export default function ChatRoomAnalytics({ roomId, userName }) {
  const [connectionCount, setConnectionCount] = useState(0);

  const track = useEffectEvent((eventName) => {
    // Latest userName, whenever this fires.
    console.log(eventName, { userName, roomId });
  });

  const onConnected = useEffectEvent(() => {
    setConnectionCount((count) => count + 1);
    track('chat_connected'); // one Effect Event calling another
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();
    onConnected();
    return () => connection.disconnect();
  }, [roomId]);

  return (
    <p>
      {userName} in {roomId} ({connectionCount} connections)
    </p>
  );
}
```

`userName` changes never reconnect the socket, `roomId` changes always do, and
the dependency array says exactly that with no suppression comment.

## Common mistakes

**Listing it as a dependency.** `useEffect(..., [roomId, onConnected])` re-runs
the Effect on every render, because the Effect Event's identity changes every
render by design.

**Passing it to a child component.** Not supported, and the linter will flag it.
If a child needs to call it, the logic belongs in the child.

**Calling it during render.** It is not a way to read "the latest" value in the
render body. During render, the values in scope *are* the latest.

**Using it in place of `useCallback`.** Different purpose, opposite identity
guarantee.

**Wrapping the whole Effect body in one.** Then nothing is reactive, the Effect
never re-runs when it should, and you have written an Effect that only pretends
to synchronize.

**Using it to keep a genuinely reactive value out of the array.** If changing
the value should change what the Effect set up, it is a dependency. No exceptions.

**Expecting it on 19.0 or 19.1.** It does not exist there. Check your installed
version before reaching for it.

## Related topics

- [useEffect](./use-effect.md) — the dependency rules this hook is designed to keep honest.
- [useCallback](./use-callback.md) — for a stable identity, which is the opposite of what this gives you.
- [useRef](./use-ref.md) — the workaround this hook replaces.
- [useLayoutEffect](./use-layout-effect.md) — Effect Events may be called from there too.
- [Rules of Hooks](./rules-of-hooks.md) — where an Effect Event may be declared.
