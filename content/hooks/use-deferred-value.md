---
title: useDeferredValue
description: Show a stale value while a new one renders in the background.
group: hooks
order: 130
status: current
since: "19.0"
related: [hooks/use-transition, performance/memoization, data-fetching/suspense, performance/lists-and-virtualization]
---

## Overview

`useDeferredValue` gives you a lagging copy of a value so an expensive subtree
can render at a lower priority.

```text
const deferredValue = useDeferredValue(value, initialValue?)
```

| Parameter | Meaning |
|---|---|
| `value` | The value to defer. Any type. |
| `initialValue?` | What to return on the **initial** render. **Added in 19.0.** Omit it and the initial render is not deferred at all. |

On an update it returns the **previous** value first, renders that immediately,
then re-renders in the background with the new value. If the value changes again
mid-flight, the background render is abandoned and restarted.

## Why it exists

[`useTransition`](./use-transition.md) requires you to wrap the `set` call. That
only works when you own the setter.

You often do not. The value arrives as a prop, or comes out of a custom hook, a
router, or a form library. You cannot wrap an update you never make.
`useDeferredValue` solves the same problem from the other end: instead of
marking the update non-urgent, you mark the **value** as one that is allowed to
lag.

It also expresses something a transition cannot: "keep showing the old results
while the new ones are computed." That stale-content behavior is the entire
point of search-as-you-type.

## When to use it

- **Search-as-you-type over an expensive list.** The input updates on every
  keystroke; the results trail behind and stay interactive.
- **A value you do not control.** A prop, a context value, a hook's return
  value.
- **Keeping old content visible across a Suspense boundary.** If the background
  render suspends, React shows the previous deferred value instead of the
  fallback — no spinner flash between results.
- **Signalling staleness.** Compare `value !== deferredValue` to dim the stale
  UI.

## When not to use it

- **To make the work cheaper.** It does not. The same filtering, the same
  sorting, the same rendering all still happen — only off the urgent path, and
  possibly *more* than once, since interrupted renders restart. It buys
  responsiveness, not throughput.
- **Without `memo` on the expensive child.** This is the most important
  constraint on the page. If the child re-renders anyway because its parent did,
  deferring the value changes nothing.
- **To reduce network requests.** It has no effect on fetching. If you want
  fewer requests, debounce the request, not the render.
- **When you own the setter and want a pending flag.** `useTransition` gives you
  `isPending` directly.
- **On a value that is a new object every render.** A fresh `{ ... }` literal
  created during render is never equal to the deferred copy, so React spins on
  background re-renders forever. Defer a primitive, or an object created outside
  rendering.
- **When the work is trivial.** A list of twelve items does not need this.

## Basic example

Typing stays at full speed while an 8,000-item filter renders behind it.

```jsx live
import { memo, useDeferredValue, useState } from 'react';

const packages = Array.from({ length: 8000 }, (_, index) => ({
  id: index,
  name: `@acme/module-${index}`,
  weeklyDownloads: (index * 977) % 90000,
}));

const PackageResults = memo(function PackageResults({ query }) {
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? packages.filter(pkg => pkg.name.includes(needle))
    : packages;

  return (
    <ul style={{ maxHeight: 160, overflow: 'auto' }}>
      {matches.slice(0, 100).map(pkg => (
        <li key={pkg.id}>
          {pkg.name} — {pkg.weeklyDownloads.toLocaleString()} downloads
        </li>
      ))}
    </ul>
  );
});

export default function PackageSearch() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div>
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Filter packages"
      />
      <div
        style={{
          opacity: isStale ? 0.5 : 1,
          transition: 'opacity 0.15s linear',
        }}
      >
        <PackageResults query={deferredQuery} />
      </div>
    </div>
  );
}
```

Three things are load-bearing here:

1. The `<input>` reads `query`, never `deferredQuery` — otherwise typing lags.
2. `PackageResults` is wrapped in `memo`, so React can skip it entirely while
   `deferredQuery` is unchanged.
3. `isStale` is derived by comparing the two, not from a flag React gives you.

Remove the `memo` and the optimization evaporates: `PackageSearch` re-renders on
every keystroke, and a non-memoized child re-renders with it.

## How it works

### Across re-renders

When `value` changes, React does two renders:

1. An **urgent** render that returns the *old* `deferredValue`. This is the one
   that paints. The input shows the new character; the list still shows the old
   results.
2. A **background** render at transition priority that returns the new value.

The background render is fully interruptible. Type another character before it
finishes and React throws the partial work away and starts again with the newest
value. There is no fixed delay and no timer — React starts the background render
as soon as the urgent one commits, and adapts to how fast the device actually
is.

On the **initial** render there is nothing to be stale, so `deferredValue` equals
`value` — unless you pass `initialValue`.

### `initialValue` (React 19.0+)

Added in **19.0**. It gives the initial render something cheap to show, then
immediately schedules a background render with the real value.

```jsx live
import { memo, useDeferredValue, useState } from 'react';

const HeavyChart = memo(function HeavyChart({ range }) {
  if (range === '') {
    return <p>Preparing chart…</p>;
  }
  const bars = [];
  for (let index = 0; index < 400; index++) {
    bars.push(
      <span
        key={index}
        style={{
          display: 'inline-block',
          width: 2,
          height: 4 + ((index * 13) % 40),
          background: 'currentColor',
        }}
      />
    );
  }
  return (
    <div>
      <p>Range: {range}</p>
      {bars}
    </div>
  );
});

export default function Dashboard() {
  const [range, setRange] = useState('last-30-days');
  // First paint renders the '' branch; the real chart follows in the background.
  const deferredRange = useDeferredValue(range, '');

  return (
    <div>
      <button onClick={() => setRange('last-7-days')}>7 days</button>
      <button onClick={() => setRange('last-30-days')}>30 days</button>
      <HeavyChart range={deferredRange} />
    </div>
  );
}
```

Without `initialValue`, the first paint would be blocked by the chart. With it,
the shell appears immediately.

### Suspense

`useDeferredValue` is integrated with `<Suspense>`. If the background render
suspends — because a child reads a promise it has not resolved yet — React does
**not** swap in the fallback. It keeps showing the previous deferred value until
the new one is ready.

That is why search results built on Suspense feel continuous rather than
flickering through a spinner on every keystroke.

Note the ordering: Effects from the background render only fire once that render
is committed to the screen.

### StrictMode

StrictMode double-invokes render functions in development, so an expensive
child rendered from a deferred value runs its render body twice per render pass.
That makes an already-slow component look twice as slow in dev — a real effect
of the check, not of `useDeferredValue`.

It is also a purity check on the background render. Any impurity in the
component receiving `deferredValue` shows up here, which matters because
background renders are the ones React discards most often.

### Concurrent rendering

This hook is a thin wrapper over the same lane mechanism as transitions. Two
consequences follow.

First, an update that is already inside a transition does not get deferred again:
`useDeferredValue` returns the new value immediately and spawns no background
render. There is nothing to gain — the update is already low-priority.

Second, the background render can be started, abandoned, and restarted many
times while a user types. Everything it touches must be pure. This is the most
common way an impure component that "worked fine" starts producing nonsense.

### `useDeferredValue` vs `useTransition` vs debouncing

| | `useDeferredValue` | `useTransition` | Debounce / throttle |
|---|---|---|---|
| You wrap | The value | The `set` call | The event |
| Needs the setter | No | Yes | No |
| Delay | None; adapts to the device | None | A fixed number you guessed |
| Interruptible | Yes | Yes | No — once it fires, it blocks |
| Pending signal | `value !== deferredValue` | `isPending` | Your own state |
| Reduces network calls | No | No | Yes |

Debouncing is still the right tool for cutting down *requests*. It is the wrong
tool for cutting down *renders*, because the render it eventually triggers is
still blocking.

## Common patterns

### Deferring a prop you did not create

```jsx
import { memo, useDeferredValue } from 'react';

const Preview = memo(function Preview({ markdown }) {
  return <pre>{markdown}</pre>;
});

export default function EditorPane({ markdown }) {
  // `markdown` arrives as a prop — there is no setter to wrap.
  const deferredMarkdown = useDeferredValue(markdown);
  return <Preview markdown={deferredMarkdown} />;
}
```

### Deferring a primitive, not an object

```jsx
import { memo, useDeferredValue, useMemo, useState } from 'react';

const Chart = memo(function Chart({ options }) {
  return <p>{options.metric} over {options.days} days</p>;
});

export default function Analytics() {
  const [days, setDays] = useState(30);
  const deferredDays = useDeferredValue(days);

  // Build the object from the deferred primitive, not the other way round.
  const options = useMemo(
    () => ({ metric: 'sessions', days: deferredDays }),
    [deferredDays]
  );

  return (
    <div>
      <button onClick={() => setDays(d => d + 30)}>Days: {days}</button>
      <Chart options={options} />
    </div>
  );
}
```

Deferring `options` itself would fail: a new object literal each render is never
`Object.is`-equal to the deferred copy, so React would schedule a background
render forever.

## Advanced example

Deferred value plus `memo` plus `useMemo` — the full stack, with a visible
staleness indicator and a count of how many rows survived the filter.

```jsx live
import { memo, useDeferredValue, useMemo, useState } from 'react';

const incidents = Array.from({ length: 12000 }, (_, index) => ({
  id: index,
  service: `service-${index % 40}`,
  severity: ['low', 'medium', 'high'][index % 3],
  summary: `Latency spike in shard ${index % 97}`,
}));

const IncidentTable = memo(function IncidentTable({ query, severity }) {
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return incidents.filter(
      incident =>
        (severity === 'all' || incident.severity === severity) &&
        (needle === '' ||
          incident.service.includes(needle) ||
          incident.summary.toLowerCase().includes(needle))
    );
  }, [query, severity]);

  return (
    <div>
      <p>{rows.length} matching incidents</p>
      <ul style={{ maxHeight: 160, overflow: 'auto' }}>
        {rows.slice(0, 60).map(incident => (
          <li key={incident.id}>
            [{incident.severity}] {incident.service} — {incident.summary}
          </li>
        ))}
      </ul>
    </div>
  );
});

export default function IncidentSearch() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('all');
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div>
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Filter incidents"
      />
      <select value={severity} onChange={event => setSeverity(event.target.value)}>
        <option value="all">All severities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
      <div style={{ opacity: isStale ? 0.5 : 1 }}>
        <IncidentTable query={deferredQuery} severity={severity} />
      </div>
    </div>
  );
}
```

`severity` is *not* deferred: changing a select is a deliberate, one-off action
where the user expects an immediate answer. Only the per-keystroke value gets
the stale treatment. Deferring everything is as unhelpful as deferring nothing.

## Common mistakes

**Forgetting `memo` on the child.** The single most common failure. Without it
the child re-renders on every parent render and nothing is deferred in practice.

**Binding the input to the deferred value.** `<input value={deferredQuery}>`
makes typing feel broken. The input reads the urgent value; only the expensive
consumer reads the deferred one.

**Deferring an object created during render.** `useDeferredValue({ query })`
creates a new object each render, so React never settles. Defer a primitive and
build the object downstream.

**Expecting fewer network requests.** If the child fetches on every `query`
change, deferring the value only changes *when* the fetch fires, not how often.
Debounce the request.

**Expecting the work to get faster.** The filter still runs. Interrupted
background renders mean it may run more times than before. The win is that the
main thread stays free between chunks.

**Using it inside an existing transition.** No extra deferral happens — React
returns the new value straight away. Pick one mechanism.

**Skipping the staleness indicator.** Without a visual cue, stale results look
like a bug. `value !== deferredValue` costs one line.

**Reaching for it before profiling.** If the child renders in two milliseconds,
this hook adds coordination overhead and no benefit. Measure first.

## Related topics

- [useTransition](./use-transition.md) — the same prioritization when you own the
  `set` function and want `isPending`.
- [Memoization](../performance/memoization.md) — `memo`, without which this hook
  does nothing.
- [useMemo](./use-memo.md) — avoid recomputing the derived data the deferred
  value feeds.
- [Suspense](../data-fetching/suspense.md) — why a deferred render shows stale
  content instead of a fallback.
- [Lists and virtualization](../performance/lists-and-virtualization.md) — when
  the real fix is rendering fewer rows.
