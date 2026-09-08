---
title: useTransition
description: Mark a state update as non-urgent so React can interrupt it and keep the UI responsive.
group: hooks
order: 120
status: current
since: "19.0"
related: [hooks/use-deferred-value, hooks/use-action-state, patterns/forms-and-actions, hooks/use-optimistic]
---

## Overview

`useTransition` lets you tell React that an update is not urgent.

```text
const [isPending, startTransition] = useTransition()
```

| Returned | Meaning |
|---|---|
| `isPending` | `true` while a transition started by this hook is still rendering. |
| `startTransition(action)` | Calls `action` immediately; every state update made while it runs is marked as a transition. |

`startTransition` returns `undefined` and has a **stable identity**, so it never
needs to appear in a dependency array.

React can interrupt a transition render, throw the partial work away, and start
over when something more urgent arrives — a keystroke, a click, a hover. Urgent
updates stay instant; the expensive one catches up.

## Why it exists

React 18 introduced concurrent rendering, which made it possible to render in
interruptible chunks. But React cannot guess which of your updates the user is
waiting on.

Consider a tab bar where one tab renders a 5,000-row table. Click it and the
click feels dead: React renders the whole table synchronously before the browser
can repaint, so the tab does not even appear pressed. There is no bug to fix —
the work genuinely takes that long.

`startTransition` is how you say "the table is not urgent." React renders the
pressed state right away, then renders the table in the background where a new
click can interrupt it.

## When to use it

- Switching a view that is expensive to render: tabs, routes, filters over a
  large list.
- Keeping a text input responsive while something heavy re-renders in response
  to it.
- Running an async submit — a form action, a mutation — and getting a `pending`
  flag for free. Since **19.0** this is the basis of
  [Actions](../patterns/forms-and-actions.md).
- Deferring an update triggered by a state setter you own.

## When not to use it

- **Controlled text inputs.** The input's own `value` update must be urgent, or
  characters appear late or out of order. Defer what the input *drives*, not the
  input itself.
- **When you do not own the `set` function.** You can only wrap an update if you
  can call the setter inside the callback. If you are reacting to a prop or a
  value from a custom hook, use [`useDeferredValue`](./use-deferred-value.md).
- **When the work is slow because of the network, not rendering.** A transition
  reprioritizes rendering. Fetching stays exactly as slow. Reach for
  [Suspense](../data-fetching/suspense.md) instead.
- **When the update is genuinely urgent.** Marking everything as a transition
  is the same as marking nothing.
- **Outside a component**, where hooks are illegal — import the standalone
  `startTransition` from `react` instead. You lose `isPending`.

## Basic example

A tab switch where one tab is expensive. Without the transition, the tab button
does not visibly change until the slow panel has finished rendering.

```jsx live
import { memo, useState, useTransition } from 'react';

const SlowPanel = memo(function SlowPanel() {
  const rows = [];
  for (let index = 0; index < 1500; index++) {
    rows.push(<li key={index}>Line item {index}</li>);
  }
  return <ul style={{ maxHeight: 160, overflow: 'auto' }}>{rows}</ul>;
});

export default function ReportTabs() {
  const [tab, setTab] = useState('summary');
  const [isPending, startTransition] = useTransition();

  function selectTab(nextTab) {
    startTransition(() => {
      setTab(nextTab);
    });
  }

  return (
    <div>
      <button onClick={() => selectTab('summary')}>Summary</button>
      <button onClick={() => selectTab('details')}>Details</button>
      {isPending && <span> Loading…</span>}
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        {tab === 'summary' ? <p>Everything is on track.</p> : <SlowPanel />}
      </div>
    </div>
  );
}
```

The button's active state and the `Loading…` indicator paint immediately. The
1,500 rows render at transition priority, and clicking back to **Summary**
mid-render abandons that work rather than queueing behind it.

## How it works

### Across re-renders

`startTransition` calls your function **synchronously and immediately**. It is
not a `setTimeout`. React sets an internal priority flag, runs your callback, and
clears the flag when the callback returns. Every `setState` that happens while
the flag is set is tagged as a transition.

This gives the rule that trips everyone up:

```jsx
import { useState, useTransition } from 'react';

export default function Scheduler() {
  const [status, setStatus] = useState('idle');
  const [, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      setTimeout(() => {
        // NOT a transition: the flag was cleared long before this ran.
        setStatus('done');
      }, 1000);
    });
  }

  return <button onClick={handleClick}>Status: {status}</button>;
}
```

The update must happen **inside the callback, synchronously**. Anything that
escapes to a later task — a timer, a `.then()`, a callback from a library — runs
after the flag is gone.

While a transition is pending, React keeps the current UI on screen. It does not
unmount the old content or show a fallback for it, which is exactly why a
`memo` boundary matters: the parts that did not change should not re-render at
transition priority either.

If a second transition starts before the first finishes, React abandons the
first. Multiple concurrent transitions are batched together.

### Async transitions and Actions (React 19.0+)

Since **19.0** the function passed to `startTransition` may be `async`. React
keeps `isPending` `true` until the async function settles, which is what makes
`useActionState`, `useFormStatus`, and `useOptimistic` possible.

The rule about synchronous updates still holds, and this is the trap: **state
updates after an `await` are no longer inside the transition.** You must wrap
them in a second `startTransition`.

```jsx
import { useState, useTransition } from 'react';

async function saveProfile(name) {
  return { ok: true, name };
}

export default function ProfileForm() {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveProfile(name);
      // The transition scope ended at the await.
      // Wrap the update to put it back.
      startTransition(() => {
        setSavedName(result.name);
      });
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={e => setName(e.target.value)} />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </button>
      <p>Saved as: {savedName || '—'}</p>
    </form>
  );
}
```

React's documentation calls this a known limitation intended to be fixed later.
Until then, wrap every post-`await` update.

### Errors

An error thrown inside the function you pass to `startTransition` is caught by
the nearest [error boundary](../patterns/error-boundaries.md). It does not
become an unhandled rejection, and there is no `try`/`catch` built into the hook.

If you want to show an inline message instead of a fallback UI, catch the error
yourself and put it in state — remembering to wrap that `setState` in a nested
`startTransition` when it comes after an `await`. For form submissions,
[`useActionState`](./use-action-state.md) does this for you and hands back the
error as part of the state.

### StrictMode

StrictMode's double-invoke applies to your component's render function, not to
the transition callback — that runs in an event handler, which React does not
double-invoke.

What you will notice is that a transition render, like any render, happens twice
in development. If the callback itself is impure — mutating a module-level
array, say — the double render surfaces it. Keep the callback to state updates.

### Concurrent rendering

This hook *is* the public API for concurrent rendering. Marking an update as a
transition puts it on a lower-priority lane, where React will:

- yield to the browser between chunks of work, so input and paint are not blocked;
- discard the work entirely if a higher-priority update arrives;
- restart from scratch with the newest state.

Because a transition render can be discarded, everything it touches must be
pure. Impure render logic that "worked" in React 17 fails here in ways that look
random.

Transitions also change Suspense behavior: if a component suspends during a
transition, React keeps showing the existing content instead of replacing it
with a fallback. That is what makes navigation feel continuous rather than
flashing a spinner.

## Common patterns

### `useTransition` vs `useDeferredValue`

Both keep the UI responsive by splitting urgent from non-urgent work. They differ
in what you wrap.

| | `useTransition` | `useDeferredValue` |
|---|---|---|
| You wrap | The **update** (the `set` call) | The **value** |
| Requires | Access to the `set` function | Nothing — works on props too |
| Gives you | `isPending` | Compare `value !== deferredValue` yourself |
| Renders | New state, at low priority | The **old** value, then the new one |
| Typical use | Tab and route switches, form submits | Search-as-you-type, filtering a heavy list |
| Async callbacks | Supported since 19.0 | Not applicable |

They compose: a value that is updated inside a transition is returned by
`useDeferredValue` immediately, without a second deferred render.

### Standalone `startTransition`

Outside a component — in a router, a store, a data library — import it directly.

```js
import { startTransition } from 'react';

// Hooks are illegal here, but the prioritization is identical.
// The trade-off: no isPending flag.
export function navigate(path, setRoute) {
  startTransition(() => {
    setRoute(path);
  });
}
```

### Showing pending state without blocking

Prefer dimming existing content over replacing it with a spinner. The user keeps
their context, and the transition can be interrupted without a flash.

```jsx
import { useState, useTransition } from 'react';

export default function FilterBar() {
  const [filter, setFilter] = useState('all');
  const [isPending, startTransition] = useTransition();

  return (
    <div
      style={{
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity 0.15s linear',
      }}
    >
      <button onClick={() => startTransition(() => setFilter('all'))}>All</button>
      <button onClick={() => startTransition(() => setFilter('open'))}>Open</button>
      <p>Filter: {filter}</p>
    </div>
  );
}
```

## Advanced example

A search box where typing stays urgent and the results render at transition
priority. The input is *never* wrapped — only the update it triggers.

```jsx live
import { memo, useState, useTransition } from 'react';

const docs = Array.from({ length: 6000 }, (_, index) => ({
  id: index,
  title: `Guide ${index}: ${index % 2 ? 'rendering' : 'state management'}`,
}));

const ResultList = memo(function ResultList({ query }) {
  if (!query) return <p>Type to search {docs.length} documents.</p>;
  const matches = docs.filter(doc =>
    doc.title.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <ul style={{ maxHeight: 160, overflow: 'auto' }}>
      {matches.slice(0, 200).map(doc => (
        <li key={doc.id}>{doc.title}</li>
      ))}
    </ul>
  );
});

export default function DocSearch() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleChange(event) {
    const next = event.target.value;
    // Urgent: the input must show the character now.
    setText(next);
    // Non-urgent: the results can lag behind.
    startTransition(() => {
      setQuery(next);
    });
  }

  return (
    <div>
      <input value={text} onChange={handleChange} placeholder="Search docs" />
      {isPending && <span> updating…</span>}
      <ResultList query={query} />
    </div>
  );
}
```

Two pieces of state on purpose: `text` drives the input at urgent priority,
`query` drives the results at transition priority. Collapsing them into one
would either make the input laggy or the results eager.

## Common mistakes

**Wrapping a controlled input's own state.** `startTransition(() => setText(e.target.value))`
makes typing feel broken — React explicitly does not support using transitions
to control text inputs. Keep two pieces of state, as above.

**Updating state after an `await` without re-wrapping.** The update runs at
normal priority, `isPending` may already be `false`, and the interruption
guarantee is gone. Nest a `startTransition`.

**Updating state inside a timer or a `.then()` callback.** Same failure, same
cause: the transition scope ends when the callback returns.

**Expecting `startTransition` to defer execution.** It runs your function
synchronously and immediately. It changes the priority of the *renders* those
updates cause, not when the callback runs.

**Expecting it to speed up data fetching.** A transition cannot make a request
return faster. Use it with Suspense so the old content stays visible while the
new data loads.

**Forgetting an error boundary.** Errors thrown inside the callback propagate to
the nearest boundary. Without one, an async action failure takes down the tree.

**Relying on `isPending` across unrelated updates.** Each `useTransition` call
tracks only the transitions started by its own `startTransition`. Two features in
one component need two hooks.

**Adding `startTransition` to a dependency array.** Harmless but noise — its
identity is stable by contract.

## Related topics

- [useDeferredValue](./use-deferred-value.md) — the same goal when you cannot
  reach the `set` function.
- [useActionState](./use-action-state.md) — async transitions packaged for forms,
  with pending and error state built in.
- [Forms and Actions](../patterns/forms-and-actions.md) — the React 19 form
  model built on async transitions.
- [useOptimistic](./use-optimistic.md) — show the expected result while an async
  transition is pending.
- [Suspense](../data-fetching/suspense.md) — why a transition keeps old content
  visible instead of showing a fallback.
