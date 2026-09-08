---
title: Rendering
description: The trigger, render and commit phases, how reconciliation preserves component state, and what concurrent rendering changes.
group: core-concepts
order: 50
status: current
related: [core-concepts/state, core-concepts/strict-mode, performance/activity]
---

## Overview

"Render" in React means one specific thing: React calls your component function
and collects the elements it returns. It does not mean "touch the DOM". Those are
separate steps, and keeping them separate is what lets React batch, interrupt and
prioritize work.

Every update goes through three phases:

1. **Trigger** — something asks for a render: the initial mount, or a state
   update.
2. **Render** — React calls the components that need re-rendering and compares
   the result with the previous one.
3. **Commit** — React applies the minimum set of DOM changes, then runs layout
   effects and, after the browser paints, Effects.

## Why it exists

Splitting render from commit is the whole design.

Because the render phase only computes objects, React can do it without the user
seeing anything. It can throw the work away, redo it, or do it in the background
for a route the user has not navigated to yet. Nothing has been shown, so nothing
has to be undone.

Because the commit phase is a single synchronous pass over a finished result, the
user never sees a half-updated screen. There is no moment where the header shows
new data and the body shows old data.

This is also why your components must be pure. React reserves the right to call
them more than once, and to discard the result.

## When to use it

You do not call render. You trigger it, and there are exactly two triggers:

- The **initial render**: `createRoot(container).render(<App />)` at startup, or
  a hydration root on the server-rendered page.
- A **state update**: any `set` function from `useState` or a `dispatch` from
  `useReducer`, including updates that come from context or an external store.

Nothing else causes a render. Not mutating an object. Not the passage of time.
Not a change to a module variable. If the screen is stale, the value you changed
is not state.

## Basic example

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

`createRoot` creates the root once. Calling `render` again on the same root
updates it. See [removed APIs](../migration/removed-apis.md) if you are moving
from the React 17 entry point.

## How it works

### Initial render

React starts at the root element and walks down. For each component it calls the
function, gets elements back, and recurses into those. When it reaches host
elements (`div`, `input`), it creates the DOM nodes. At commit it appends the
whole tree to the container in one go.

Along the way it builds an internal tree of nodes — one per element — which is
where your component's state and Effects are stored. Your component function
holds no state itself; the tree does.

### Re-render

A state update marks that component as needing work. React re-renders it, and by
default re-renders its children too, because their props may have changed.

That last part surprises people: **React re-renders the subtree, not just the
component whose state changed.** Rendering a child is cheap — it is a function
call producing objects — and React only touches the DOM where the output
actually differs. Reach for [memoization](../performance/memoization.md) when
profiling shows a real cost, not on principle.

React then diffs the new element tree against the previous one and produces a
list of DOM operations. If a text node's content is the same, it is not touched.
If an attribute did not change, it is not set. This diff is called
**reconciliation**.

### Commit

React applies the DOM changes, then:

- runs cleanup and setup for [`useLayoutEffect`](../hooks/use-layout-effect.md)
  synchronously, before the browser paints — this is where you measure layout;
- lets the browser paint;
- runs [`useEffect`](../hooks/use-effect.md) cleanup and setup.

Refs are attached during commit, which is why `ref.current` is `null` during
render and populated by the time an Effect runs.

### How React decides to keep or recreate a component

This is the rule that explains most "why did my state disappear?" bugs.

React matches an element in the new tree to one in the old tree by **position in
the tree**, plus **element type**, plus **`key`** if one is present. If all match,
it is the same component instance: state is kept, the DOM node is reused, and the
Effects are not re-run unless their dependencies changed.

If the type differs, or the key differs, React treats it as a different
component. The old one unmounts — state destroyed, Effects cleaned up, DOM node
removed — and the new one mounts from scratch.

```jsx live
import { useState } from 'react';

function Counter({ label }) {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      {label}: {count}
    </button>
  );
}

export default function IdentityDemo() {
  const [version, setVersion] = useState(0);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p>Click both counters up, then press Reset.</p>
      <Counter label="Stable identity" />
      <Counter key={version} label="Keyed by version" />
      <button type="button" onClick={() => setVersion((v) => v + 1)}>
        Reset (changes the key)
      </button>
    </div>
  );
}
```

The first counter keeps its value forever. The second resets every time its key
changes, because React unmounts the old instance and mounts a new one.

This is a technique, not only a hazard. Giving a form a `key` of the record it is
editing guarantees the draft state resets when you switch records, with no
Effect and no manual clearing.

The inverse is the trap:

```jsx
import { useState } from 'react';

export function ConditionalWrapper({ boxed }) {
  const [text, setText] = useState('');
  const input = <input value={text} onChange={(e) => setText(e.target.value)} />;

  // Both branches render <input> at the same position, but under different
  // parents — so React unmounts and remounts it, losing focus and cursor.
  if (boxed) {
    return <div className="box">{input}</div>;
  }
  return <section>{input}</section>;
}
```

Same element, different position in the tree, so the DOM node is not reused. Keep
the structure stable and change the attribute instead:

```jsx
import { useState } from 'react';

export function StableWrapper({ boxed }) {
  const [text, setText] = useState('');
  return (
    <div className={boxed ? 'box' : ''}>
      <input value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}
```

### Concurrent rendering

Since React 18, rendering can be interruptible. When an update is marked as
non-urgent — through [`useTransition`](../hooks/use-transition.md),
[`useDeferredValue`](../hooks/use-deferred-value.md), or a Suspense boundary
revealing content — React may:

- **start** rendering the new tree,
- **pause** to let the browser handle a keystroke or a click,
- **abandon** the partial work entirely if a more urgent update arrives,
- **restart** the render from the beginning with the newer state.

Nothing has been committed yet, so the user sees none of this. But your component
function ran, possibly several times, for a result that was thrown away.

That is why the purity rules are strict. A component that increments a module
counter, pushes to a shared array, or writes to `localStorage` during render will
do it once per attempt, and the number of attempts is not something you control.
[Strict Mode](./strict-mode.md) simulates a second attempt in development so you
find these bugs before they appear under load in production.

Concurrent rendering does not make your app faster on its own. It changes *when*
work happens so the app stays responsive while it happens.

### Rendering that is not on screen

Two features render things the user cannot see, and both depend on the same
purity guarantees:

- **[`<Activity>`](../performance/activity.md)** (React 19.2) renders a subtree
  with `mode="hidden"`: React hides it with `display: none`, destroys its
  Effects, and keeps its state and DOM. Making it visible again restores the
  state and re-creates the Effects.
- **[Suspense](../data-fetching/suspense.md)** renders a fallback while a child
  is waiting, then swaps in the real content when it resolves.

Both are covered on their own pages.

## Common patterns

### Reading the phases in the Profiler

The React DevTools Profiler shows you which components rendered and why, and the
Performance Tracks added in **React 19.2** show the Scheduler and Components
tracks directly in Chrome DevTools. Use them before optimizing — the component
you suspect is usually not the expensive one.
[Profiling](../performance/profiling.md) covers the workflow.

### Resetting a subtree with a key

```jsx
import { useState } from 'react';

function EditForm({ contactId }) {
  const [draft, setDraft] = useState('');
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={`Notes for contact ${contactId}`}
    />
  );
}

export function ContactPanel({ contactId }) {
  // A new contactId gives a new instance with fresh state.
  return <EditForm key={contactId} contactId={contactId} />;
}
```

This is preferable to clearing the draft in an Effect: it happens during the same
render, so there is no flash of the previous contact's notes.

## Advanced example

Nothing about rendering guarantees that a re-render produces a DOM change. This
component re-renders on every click but commits no DOM mutation after the first,
because the output is identical:

```jsx live
import { useState } from 'react';

export default function RenderVsCommit() {
  const [clicks, setClicks] = useState(0);
  const parity = clicks % 2 === 0 ? 'even' : 'odd';

  return (
    <div>
      <p>Renders triggered: {clicks}</p>
      <p>
        This line only changes when the parity does: <strong>{parity}</strong>
      </p>
      <button type="button" onClick={() => setClicks((c) => c + 1)}>
        Trigger a render
      </button>
    </div>
  );
}
```

React re-runs the component every click, computes the same `<strong>` text on
alternating clicks, and skips the DOM write for it. "Re-rendered" and "updated
the DOM" are different events, and the Profiler distinguishes them.

## Common mistakes

**Believing a re-render means a DOM update.** Most re-renders produce very few
DOM operations. Optimize the ones the profiler flags, not the count of renders.

**Trying to prevent children from re-rendering by default.** Wrapping everything
in `memo` adds comparison cost and complexity. Let the
[React Compiler](../performance/react-compiler.md) or a profiler-driven decision
handle it.

**Doing side effects during render.** Under concurrent rendering they run on
attempts that get discarded.

**Changing a component's position in the tree without meaning to.** Conditional
wrappers, a component defined inside another component, or reordering a list
without stable keys all reset state.

**Using an index as a key in a reorderable list.** The position matches but the
data does not, so React keeps the wrong instance. See
[lists and keys](./lists-and-keys.md).

**Assuming state updates apply immediately.** They are batched; the render
happens after the handler finishes. See [state](./state.md#how-it-works).

**Reading a ref during render.** Refs are attached at commit time, so during the
first render `ref.current` is still `null`.

## Related topics

- [State](./state.md) — the trigger for every re-render after the first.
- [Strict Mode](./strict-mode.md) — the development double-render that enforces
  the purity rendering depends on.
- [Lists and keys](./lists-and-keys.md) — how `key` participates in
  reconciliation.
- [`<Activity>`](../performance/activity.md) — rendering subtrees that are not
  visible while keeping their state.
- [Suspense](../data-fetching/suspense.md) — rendering a fallback while content
  loads.
- [Profiling](../performance/profiling.md) — measuring what actually renders.
