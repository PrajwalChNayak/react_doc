---
title: Activity
description: Hide part of the UI without destroying its state, and pre-render what the user is about to need.
group: performance
order: 50
status: current
since: "19.2"
related: [performance/overview, core-concepts/conditional-rendering, hooks/use-transition]
---

## Overview

`<Activity>` is a built-in component, added in **React 19.2**, that renders its
children in one of two modes:

```jsx
import { Activity } from 'react';

export function Panel({ isActive, children }) {
  return <Activity mode={isActive ? 'visible' : 'hidden'}>{children}</Activity>;
}
```

- `mode="visible"` — children render and behave normally. This is the default
  when you omit `mode`.
- `mode="hidden"` — children are hidden from the user, **their state is
  preserved**, their DOM is kept in the document with `display: none`, and their
  Effects are cleaned up.

The prop takes exactly those two string values. `children` is the UI you want to
show and hide.

## Why it exists

`{isActive && <Panel />}` destroys everything. Scroll position, an
in-progress form, an open accordion, the video's playback position — all gone,
and all of it has to be rebuilt from scratch when the user comes back.

The usual workaround is `style={{ display: 'none' }}`. That keeps the DOM and
the state, but it is a lie to React: the component is still mounted, still
re-rendering at full priority, and its Effects are still running. Hidden tabs
keep their WebSocket subscriptions open and keep responding to store updates.

`<Activity>` is the version React understands. Hidden content keeps its state,
loses its Effects, and re-renders at a lower priority than what is on screen.

> [!NOTE]
> `<Activity>` is new in **19.2**. On earlier versions you have conditional
> rendering and `display: none`, with the trade-offs in the table below.

## When to use it

**Tab panels that must not lose their contents.** A tab with a half-written
message, a filtered table with a scroll position, an expanded tree.

**Pre-rendering what comes next.** Render the likely next route or step in a
hidden `<Activity>` so its data and its DOM are ready before the user asks for
it. React does that work at low priority, so it does not compete with what is on
screen.

**Keeping an expensive component warm.** A component whose first render costs
100 ms is painful to mount on every visit and cheap to reveal if it was never
torn down.

**Multi-step flows where users go backwards.** Each step keeps its own state
without you lifting all of it into a parent reducer.

## When not to use it

**Unbounded lists.** Hidden children keep their DOM nodes and their fiber tree
in memory. Wrapping every row of a 10,000-item list in `<Activity>` trades a
render-time problem for a memory problem, and memory pressure is worse — it
degrades the whole tab.

**Content the user will probably never see.** Pre-rendering a route with a 5%
click-through rate spends memory and low-priority CPU on nothing.

**As a substitute for [code splitting](./code-splitting.md).** `<Activity>`
does not change what you downloaded. The code for hidden children is already in
the bundle.

**When you actually want a reset.** If returning to a screen should start it
fresh, conditional rendering is correct, and simpler.

**Where the Effect must keep running while hidden.** Hidden Effects are cleaned
up. A background sync that must survive the tab being hidden belongs above the
`<Activity>`, not inside it.

### Comparison with the alternatives

| | `{show && <Panel />}` | `<div style={{ display: 'none' }}>` | `<Activity mode="hidden">` |
|---|---|---|---|
| Component state when hidden | Destroyed | Preserved | **Preserved** |
| DOM nodes when hidden | Removed | Kept | **Kept** (`display: none`) |
| Ephemeral DOM state (scroll, uncontrolled input, video position) | Lost | Kept | **Kept** |
| Effects when hidden | Cleaned up (unmounted) | **Still running** | **Cleaned up** |
| Re-renders while hidden | None (not rendered) | Yes, at full priority | Yes, at **lower** priority |
| Memory while hidden | None | Full | Full |
| Cost of showing it again | Full mount | None | Effects re-run, DOM revealed |
| Initial render cost | Nothing until shown | Full, up front | Low priority, deferred |

The row that decides most cases is the Effects row. `display: none` leaves
subscriptions, intervals and observers alive in UI nobody can see.
`<Activity>` does not.

## Basic example

Two tabs. Each keeps a draft and a counter. Switch back and forth: nothing is
lost, and the mount log shows Effects being cleaned up and re-created as
visibility changes.

```jsx live
import { Activity, useCallback, useEffect, useState } from 'react';

function DraftPanel({ label, onLog }) {
  const [draft, setDraft] = useState('');
  const [revisions, setRevisions] = useState(0);

  useEffect(() => {
    onLog(`${label}: Effect ran`);
    return () => onLog(`${label}: Effect cleaned up`);
  }, [label, onLog]);

  return (
    <div style={{ border: '1px solid #ccc', padding: 8 }}>
      <textarea
        value={draft}
        rows={3}
        placeholder={`Draft for ${label}`}
        onChange={(event) => setDraft(event.target.value)}
      />
      <p>
        Revisions: {revisions}{' '}
        <button onClick={() => setRevisions((n) => n + 1)}>Bump</button>
      </p>
    </div>
  );
}

export default function ComposeTabs() {
  const [tab, setTab] = useState('email');
  const [log, setLog] = useState([]);

  const handleLog = useCallback((entry) => {
    setLog((entries) => [entry, ...entries].slice(0, 6));
  }, []);

  return (
    <div>
      <button onClick={() => setTab('email')} disabled={tab === 'email'}>
        Email
      </button>{' '}
      <button onClick={() => setTab('sms')} disabled={tab === 'sms'}>
        SMS
      </button>

      <Activity mode={tab === 'email' ? 'visible' : 'hidden'}>
        <DraftPanel label="Email" onLog={handleLog} />
      </Activity>
      <Activity mode={tab === 'sms' ? 'visible' : 'hidden'}>
        <DraftPanel label="SMS" onLog={handleLog} />
      </Activity>

      <ol>
        {log.map((entry, index) => (
          <li key={index}>{entry}</li>
        ))}
      </ol>
    </div>
  );
}
```

Type something in Email, bump the counter, switch to SMS and back. The text and
the count survive. The log shows the Email panel's Effect being cleaned up on
the way out and running again on the way back.

Replace both `<Activity>` wrappers with `{tab === 'email' && <DraftPanel .../>}`
and the draft is gone every time you switch.

## How it works

### Hidden means "conceptually unmounted, state kept"

React's own framing, from the `<Activity>` reference:

> When an `<Activity>` is "hidden", all its children's Effects are cleaned up.
> Conceptually, the children are unmounted, but React saves their state for
> later.

So the model is: **state and DOM survive, Effects do not.** That is deliberate —
it means a hidden tab is not holding open subscriptions, and hiding content
reduces the work React has to do rather than merely making it invisible.

When the mode flips back to `visible`, the Effects run again, from the top, with
setup as if the component had mounted. Write Effects that tolerate this: setup
and cleanup must be symmetrical. Rendering under
[StrictMode](../core-concepts/strict-mode.md) surfaces Effects with missing or
asymmetric cleanup before `<Activity>` does.

### Hidden children still render, at lower priority

From the reference:

> While hidden, children still re-render in response to new props, albeit at a
> lower priority than the rest of the content.

That is what makes pre-rendering useful. React fits the hidden work into time
left over after visible work, so mounting a hidden `<Activity>` on page load
does not delay the content the user is waiting for.

### The DOM is hidden, not removed

React applies `display: none` to the hidden subtree's DOM. Two consequences
worth knowing:

- Ephemeral DOM state survives: scroll offsets, uncontrolled input values, video
  playback position.
- A hidden `<Activity>` whose child renders only text produces **no DOM output
  at all**, because there is no element to hide. `<Activity mode="hidden">` around
  a component that returns a bare string renders nothing.

### Interaction with View Transitions

If an `<Activity>` inside a `<ViewTransition>` becomes visible as the result of
an update from `startTransition`, it activates that transition's `enter`
animation; becoming hidden activates the `exit` animation.

## Common patterns

### Pre-render the next step

```jsx
import { Activity, useState } from 'react';

function ShippingStep() {
  return <p>Shipping address form.</p>;
}

function PaymentStep() {
  return <p>Payment details form.</p>;
}

export function Checkout() {
  const [step, setStep] = useState('shipping');

  return (
    <div>
      <Activity mode={step === 'shipping' ? 'visible' : 'hidden'}>
        <ShippingStep />
      </Activity>
      {/* Rendered at low priority before the user gets here. */}
      <Activity mode={step === 'payment' ? 'visible' : 'hidden'}>
        <PaymentStep />
      </Activity>
      <button onClick={() => setStep('payment')}>Continue to payment</button>
    </div>
  );
}
```

The payment step's tree, and any data it reads, are ready before the click.
Combine this with a [transition](../hooks/use-transition.md) on the step change
so the current step stays on screen if the next one suspends.

### Bound how much you keep alive

Keep the most recent few panels mounted and let the rest go. This caps memory
while still covering the common back-and-forth.

```jsx
import { Activity, useState } from 'react';

const PANELS = ['overview', 'activity', 'members', 'settings'];

function PanelBody({ name }) {
  return <p>Contents of the {name} panel.</p>;
}

export function ProjectTabs() {
  const [active, setActive] = useState('overview');
  const [visited, setVisited] = useState(['overview']);

  function open(name) {
    setActive(name);
    setVisited((previous) =>
      [name, ...previous.filter((item) => item !== name)].slice(0, 3),
    );
  }

  return (
    <div>
      {PANELS.map((name) => (
        <button key={name} onClick={() => open(name)}>
          {name}
        </button>
      ))}
      {visited.map((name) => (
        <Activity key={name} mode={name === active ? 'visible' : 'hidden'}>
          <PanelBody name={name} />
        </Activity>
      ))}
    </div>
  );
}
```

Only visited panels are ever mounted, and at most three are retained.

### Move persistent work above the boundary

If something must keep running while a panel is hidden — a connection, a poll, a
store subscription — it does not belong inside the `<Activity>`. Lift it to a
parent, or to a [store outside React](../state-management/external-stores.md),
and let the panel read from it.

## Common mistakes

**Expecting Effects to keep running.** They do not. This surprises people who
migrate from `display: none`, where they did. Anything that must survive being
hidden goes above the boundary.

**Effects with incomplete cleanup.** Because hiding runs cleanup and showing
runs setup, an Effect that adds a listener without removing it leaks a listener
per toggle. That bug existed before; `<Activity>` makes it fire constantly.

**Wrapping a list instead of a panel.** `<Activity>` per row of a long list
keeps every row's DOM alive. Use [virtualization](./lists-and-virtualization.md)
for lists.

**Using it to avoid a data refetch.** State is preserved, so cached data in
state survives — but if the data is stale when the panel reappears, you still
need a revalidation strategy. See [caching](../data-fetching/caching.md).

**Assuming it reduces bundle size.** The hidden children's code shipped with
everything else. That is a [code splitting](./code-splitting.md) concern.

**Hiding text-only children and wondering where the DOM went.** With nothing but
a string to hide, React renders nothing. Wrap the content in an element if you
need the node to exist.

## Related topics

- [Conditional rendering](../core-concepts/conditional-rendering.md) — the
  default, and when destroying state is the behavior you want.
- [useTransition](../hooks/use-transition.md) — pairs with `<Activity>` for
  step and route changes that do not blank the screen.
- [useEffect](../hooks/use-effect.md) — setup and cleanup symmetry, which
  `<Activity>` depends on.
- [Strict Mode](../core-concepts/strict-mode.md) — surfaces the Effect bugs
  `<Activity>` would otherwise expose in production.
- [Lists and virtualization](./lists-and-virtualization.md) — the right tool
  when the problem is volume rather than reuse.
- [Performance overview](./overview.md) — where this fits among the other
  levers.
