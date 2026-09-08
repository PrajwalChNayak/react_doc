---
title: Profiling
description: Find what is actually slow with the React DevTools Profiler, the Profiler component, and Performance Tracks in Chrome DevTools.
group: performance
order: 60
status: current
related: [performance/overview, performance/memoization, performance/react-compiler]
---

## Overview

You have four instruments, and they answer different questions:

| Instrument | Answers | Where |
|---|---|---|
| React DevTools Profiler | Which components rendered, how long each took, and why | Browser extension |
| `<Profiler>` | What one subtree costs, as a number you can log or assert on | In your code |
| **Performance Tracks** (19.2) | How React's work interleaves with the browser's — priorities, effects, network | Chrome DevTools Performance panel |
| `performance.mark` / `PerformanceObserver` | Timings for arbitrary spans, and real-user Web Vitals | Browser API |

Start with the DevTools Profiler when something feels slow, and move to
Performance Tracks when you need to see React's work in the context of
everything else on the main thread.

> [!WARNING]
> Profile production builds. Development React runs extra checks, keeps
> component stacks, and — under StrictMode — double-invokes render functions and
> Effects. Development timings are inflated, and inflated unevenly, so the
> ranking between two components can differ from production.

## Why it exists

The relationship between the code you wrote and the time the browser spent is
not something you can read off the source. A component that looks expensive may
render in 0.2 ms. A component that looks trivial may be re-rendering 400 times a
second because of a store subscription three levels up.

Every profiler exists to answer one question: *where did the time go?* Answering
that with intuition is how teams end up memoizing components that were never on
the critical path.

## When to use it

- Something feels slow and you do not yet know which of the
  [three problems](./overview.md#the-three-problems-people-conflate) you have.
- Before and after any performance change, to prove it did something.
- When adopting the [React Compiler](./react-compiler.md), to confirm that
  render counts and durations actually dropped.
- On a regression: a page that was fast last release and is not now.

## When not to use it

Do not profile as a habit on code nobody has complained about. Profiling costs
time and produces numbers that invite changes with no user-visible payoff. Ship
the feature.

Do not profile to decide whether a component "renders too much" in the abstract.
Render counts are only interesting when they translate into milliseconds on a
frame the user is waiting for.

Do not draw conclusions from a development build. The numbers include work that
does not exist in production.

## Basic example

`<Profiler>` puts a measurement in your code, so you can log it, send it to
analytics, or assert on it in a test.

```jsx
import { Profiler } from 'react';

function onRenderProductList(
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) {
  console.log(id, phase, actualDuration, baseDuration, startTime, commitTime);
}

export function ProductPage({ children }) {
  return (
    <Profiler id="product-list" onRender={onRenderProductList}>
      {children}
    </Profiler>
  );
}
```

`<Profiler>` takes two props: `id`, a string naming the part of the UI you are
measuring, and `onRender`, called after every commit in that subtree. The
callback receives six arguments, in this order:

| Argument | Meaning |
|---|---|
| `id` | The `id` prop of the `<Profiler>` that committed |
| `phase` | `"mount"`, `"update"` or `"nested-update"` |
| `actualDuration` | Milliseconds spent rendering this subtree for this update |
| `baseDuration` | Estimated milliseconds to render the whole subtree with no memoization |
| `startTime` | Timestamp for when React began rendering this update |
| `commitTime` | Timestamp for when React committed it — shared across profilers in one commit |

The pair that matters is `actualDuration` versus `baseDuration`.
`baseDuration` is the worst case: no caching, everything re-rendered. If
`actualDuration` stays close to `baseDuration` on updates, your memoization —
hand-written or compiled — is not doing anything.

`"nested-update"` means the commit was caused by a state update inside an Effect
or layout Effect during a previous commit. A stream of them is a sign of a
render loop.

## How it works

### The React DevTools Profiler

Install React Developer Tools, open the **Profiler** tab, press record,
interact, and stop.

**The commit bar chart** across the top shows every commit in the session, sized
by duration. The tall bars are your problem. Click one to inspect it.

**The flamegraph** shows the component tree for that commit. Width is time spent
in that component and its descendants. Gray components did not re-render. Wide
bars near the root usually mean a parent is re-rendering the world; wide bars at
a leaf mean that leaf is expensive on its own.

**The ranked chart** sorts the same commit's components by their own render
time, descendants excluded. This is the view that answers "what is the single
most expensive component here", and it is usually where you should start.

**Why did this render?** Turn on the "Record why each component rendered while
profiling" setting before recording. Each component then reports the cause:
props changed (and which ones), state changed, hooks changed, or the parent
rendered. This is the most useful feature in the panel, because it turns "this
re-renders a lot" into "this re-renders because `options` is a new object every
time".

> [!TIP]
> The Components tab has a "Highlight updates when components render" setting.
> It is a fast, imprecise smell test — flashing outlines around a component
> during unrelated interactions tell you where to point the Profiler.

### Performance Tracks in Chrome DevTools

React 19.2 adds **Performance Tracks**: React's own entries on the Chrome
DevTools Performance panel timeline, alongside network requests, JavaScript
execution and the event loop. This is the view the DevTools Profiler cannot
give you, because it shows React's work *in context* — next to the layout, the
garbage collection and the fetch that were competing with it.

#### The Scheduler track

Shows React's work organized by priority, across four subtracks:

- **Blocking** — synchronous updates, usually from user interactions.
- **Transition** — non-blocking background work started with `startTransition`.
- **Suspense** — work related to Suspense boundaries.
- **Idle** — lowest priority work, run when nothing else is pending.

Each render pass is broken into phases: **Update**, **Render**, **Commit** and
**Remaining Effects**.

This track answers a question the component profiler cannot: *is this work
blocking?* An expensive render on the Transition track is not hurting INP. The
same render on the Blocking track is. If you wrapped an update in
`startTransition` and it still appears under Blocking, the transition is not
doing what you think.

#### The Components track

A flamegraph of components over time, showing:

- Render durations for each component and all of its descendants.
- Effect durations, in an aligned color scheme.
- Lifecycle events: **Mount**, **Unmount**, **Reconnect** and **Disconnect**.
- Changed props, in development builds, when you click a component entry.

The Effects rows are the part you cannot get elsewhere. A component that renders
in 2 ms but spends 40 ms in its Effects is invisible in the DevTools Profiler's
render timings and obvious here.

#### The Server track

Development builds only. It contains **Server Requests** — every Promise in
Server Components, including `fetch`, with rejected Promises shown in red — and
**Server Components**, a flamegraph of Server Component durations and awaited
Promises. Use it to find the one sequential `await` that is serializing your
whole page.

#### Availability

| Build | What you get |
|---|---|
| Development | All tracks, enabled by default |
| Profiling | Scheduler only by default. The Components track shows components wrapped in `<Profiler>`, or all components if the React Developer Tools extension is installed |
| Production | Disabled by default |

To use a profiling build, alias `react-dom/client` to `react-dom/profiling` at
build time through your bundler's alias configuration. That gives you production
optimization levels with the instrumentation still attached, which is the
closest you can get to profiling what your users experience.

The tracks appear automatically in Performance panel traces in browsers that
support the DevTools performance extensibility API.

## Common patterns

### Measure a specific span with the User Timing API

`performance.mark` and `performance.measure` put your own labeled spans on the
same timeline as the React tracks, so you can see which part of an interaction
was React and which was yours.

```js
export function importOrders(rows) {
  performance.mark('import-orders:start');

  const normalized = rows.map((row) => ({
    id: row.id,
    total: Number(row.total),
    placedAt: new Date(row.placed_at),
  }));

  performance.mark('import-orders:end');
  performance.measure(
    'import-orders',
    'import-orders:start',
    'import-orders:end',
  );

  return normalized;
}
```

The resulting `import-orders` entry appears in the Performance panel's Timings
track, lined up against the Scheduler and Components tracks.

### Collect Web Vitals from real users

Your laptop is not the device your users have. Field data is the only honest
measure of LCP, INP and CLS.

```js
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    navigator.sendBeacon(
      '/api/metrics',
      JSON.stringify({
        name: entry.entryType,
        value: entry.startTime,
        url: location.pathname,
      }),
    );
  }
});

observer.observe({
  type: 'largest-contentful-paint',
  buffered: true,
});
```

For production use the `web-vitals` library rather than hand-rolling this — the
correct definitions of INP and CLS involve buffering, session windows and
page-lifecycle handling that are unpleasant to get right by hand.

> [!WARNING]
> The `first-input` entry type measures First Input Delay, which stopped being a
> Core Web Vital in March 2024. Collect **INP** instead: it covers the whole
> path from interaction to the next painted frame, which is where React render
> work actually shows up.

### Catch regressions in CI

`<Profiler>` works in tests. Render a representative tree, record
`actualDuration`, and fail the build if it moves beyond a threshold. Keep the
threshold loose — CI machines are noisy — and treat it as a tripwire for a
tenfold regression, not a benchmark.

### Find leaks with heap snapshots

If memory grows across navigations, take a heap snapshot in the Memory panel,
navigate away and back several times, snapshot again, and compare retained
objects. Growing counts of detached DOM nodes or component instances almost
always mean an Effect that subscribes without cleaning up. See
[useEffect](../hooks/use-effect.md).

## Advanced example

An in-app measurement panel: aggregate `actualDuration` per commit and show it
on demand. Note that the callback writes to a ref, not to state — calling a
state setter inside `onRender` schedules another commit, which calls `onRender`
again.

```jsx live
import { Profiler, useRef, useState } from 'react';

const CITIES = Array.from({ length: 300 }, (_, index) => ({
  id: index,
  name: `City ${index}`,
  population: 40000 + index * 137,
}));

function CityTable({ minPopulation }) {
  const rows = CITIES.filter((city) => city.population >= minPopulation);
  return (
    <div style={{ maxHeight: 120, overflow: 'auto' }}>
      <table>
        <tbody>
          {rows.map((city) => (
            <tr key={city.id}>
              <td>{city.name}</td>
              <td>{city.population.toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProfiledCityTable() {
  const stats = useRef({ commits: 0, totalActual: 0, totalBase: 0 });
  const [minPopulation, setMinPopulation] = useState(40000);
  const [snapshot, setSnapshot] = useState(null);

  function handleRender(id, phase, actualDuration, baseDuration) {
    const current = stats.current;
    current.commits += 1;
    current.totalActual += actualDuration;
    current.totalBase += baseDuration;
  }

  return (
    <div>
      <label>
        Minimum population: {minPopulation.toLocaleString('en-US')}
        <input
          type="range"
          min={40000}
          max={80000}
          step={2000}
          value={minPopulation}
          onChange={(event) => setMinPopulation(Number(event.target.value))}
        />
      </label>
      <p>
        <button onClick={() => setSnapshot({ ...stats.current })}>
          Read measurements
        </button>
      </p>
      {snapshot ? (
        <p>
          {snapshot.commits} commits · actual{' '}
          {snapshot.totalActual.toFixed(1)} ms · base{' '}
          {snapshot.totalBase.toFixed(1)} ms
        </p>
      ) : null}
      <Profiler id="city-table" onRender={handleRender}>
        <CityTable minPopulation={minPopulation} />
      </Profiler>
    </div>
  );
}
```

Drag the slider, then read the measurements. `actualDuration` tracking
`baseDuration` closely is the expected result here — there is no memoization in
this tree, so every commit does the full amount of work.

## Common mistakes

**Profiling a development build and acting on the numbers.** They include work
that does not exist in production, including StrictMode's deliberate double
invocation.

**Calling a state setter inside `onRender`.** It schedules another commit, which
calls `onRender` again. Accumulate into a ref and read it on demand.

**Leaving `<Profiler>` in hot paths in production.** It is cheap but not free.
Wrap the sections you are actively investigating, not every component.

**Reading `actualDuration` in isolation.** Compare it against `baseDuration`,
and compare both against a recording from before your change.

**Optimizing the widest bar in the flamegraph.** Width includes descendants. The
ranked chart, which excludes them, tells you which component is actually
expensive.

**Ignoring the Effects rows on the Components track.** Slow Effects — layout
reads, synchronous storage writes, heavy subscription setup — block the commit
and are invisible in render-time-only views.

**Chasing render counts.** Sixty cheap renders can cost less than one expensive
one. Milliseconds are the unit, not counts.

## Related topics

- [Performance overview](./overview.md) — turning a measurement into a decision.
- [Memoization](./memoization.md) — what to do when the profile says a subtree
  re-renders needlessly.
- [React Compiler](./react-compiler.md) — verifying that automatic memoization
  changed the numbers.
- [Lists and virtualization](./lists-and-virtualization.md) — what to do when
  the profile says one component is expensive on its own.
- [useEffect](../hooks/use-effect.md) — where slow Effects and leaked
  subscriptions come from.
