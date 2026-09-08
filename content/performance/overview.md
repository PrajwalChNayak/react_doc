---
title: Performance overview
description: How to find out what is actually slow in a React app, and which lever fixes it.
group: performance
order: 10
status: current
related: [performance/profiling, performance/react-compiler, performance/code-splitting]
---

## Overview

Most React performance work is wasted because it starts with a guess. Someone
reads that `useMemo` makes things faster, sprinkles it over a component, and
ships a slower bundle with a harder-to-read component and no measured
improvement.

Performance work has an order of operations:

1. **Measure.** Find the slow thing with the Profiler, Performance Tracks, or a
   field-data tool. Do it on a production build.
2. **Classify.** Decide which of the three problems you have — too much
   JavaScript, too much work per render, or too much work per frame.
3. **Apply the matching fix.** Each problem has a different lever, and the
   levers are not interchangeable.
4. **Measure again.** If the number did not move, revert the change.

> [!BEST-PRACTICE]
> Do not start with memoization. The two biggest wins in almost every React app
> are shipping less JavaScript and rendering more of the page on the server.
> `useMemo` is a scalpel for a problem you have already located.

## Why it exists

React is fast by default for a reason: reconciliation is cheap relative to
touching the DOM, and React batches updates so a burst of state changes produces
one commit. An app with a few hundred components and normal-sized data does not
need optimization at all.

Apps get slow for structural reasons, not because React is slow. You shipped a
2 MB bundle. You render 8,000 rows. You do a synchronous sort of 50,000 records
inside an `onChange`. Those are the problems worth naming, and each has its own
fix.

## When to use it

Optimize when you have a measurement and a user-visible symptom. The measurement
tells you which of three problems you have, and each has its own lever.

### The three problems people conflate

| Problem | What the user feels | What it looks like in a profile | The lever |
|---|---|---|---|
| Too much JavaScript shipped | Slow first load, blank screen, poor LCP | A long parse/compile block before anything paints | [Code splitting](./code-splitting.md), server rendering, dependency diet |
| Too much work per render | Typing lags, clicks feel sticky, poor INP | Wide flamegraph, many components re-rendering per keystroke | [The React Compiler](./react-compiler.md) or targeted [memoization](./memoization.md) |
| Too much work per frame | Scroll stutters, the page freezes while a list updates | One very long commit, or thousands of DOM nodes | [Virtualization](./lists-and-virtualization.md), `useDeferredValue`, `startTransition` |

These fail independently. A perfectly memoized app with a 3 MB bundle is still
slow. A 90 KB bundle that renders 10,000 uncached rows on every keystroke is
still slow.

### Symptom to fix

| Symptom | Most likely cause | First thing to try |
|---|---|---|
| First paint takes seconds | Bundle size, no server rendering | Route-level [`lazy()`](./code-splitting.md), then [server rendering](../server-react/overview.md) |
| Typing in a filter box lags | Every keystroke re-renders a big subtree | [`useDeferredValue`](../hooks/use-deferred-value.md) + `memo`, or the Compiler |
| Clicking a tab freezes for 300 ms | Expensive synchronous render on the click | [`useTransition`](../hooks/use-transition.md) |
| Scrolling a long list stutters | Thousands of live DOM nodes | [Virtualization](./lists-and-virtualization.md) |
| One component renders 60 times a second | A subscription or an Effect writing state in a loop | [Profiling](./profiling.md) to find the caller |
| Layout jumps as images load | No reserved space, not a React problem | `width`/`height` on media, skeletons of the right size |
| Memory grows until the tab dies | Uncleaned subscriptions, timers, observers | Audit Effect cleanup — see [useEffect](../hooks/use-effect.md) |

### Core Web Vitals and which React lever moves each

The three metrics Google reports are the closest thing to an objective score for
a page. They map onto the three problems above almost exactly.

| Metric | Measures | Good | React-side lever |
|---|---|---|---|
| **LCP** — Largest Contentful Paint | How long until the main content paints | ≤ 2.5 s | Server render or prerender the shell, split routes, `preload()` / `preinit()` the hero assets |
| **INP** — Interaction to Next Paint | How long from an interaction to the next frame | ≤ 200 ms | Transitions, deferred values, fewer components re-rendering per event |
| **CLS** — Cumulative Layout Shift | How much visible content moves unexpectedly | ≤ 0.1 | Reserve space for Suspense fallbacks and lazy content so the fallback is the same size as the result |

> [!NOTE]
> INP replaced First Input Delay as a Core Web Vital in March 2024. Older React
> performance advice that optimizes for FID is aiming at the wrong target: FID
> measured only the delay before the first event handler ran, while INP measures
> the whole path to the next painted frame, which is where React work shows up.

LCP is a bundle-and-network problem. INP is a render-work problem. CLS is a
layout problem that React only contributes to through fallbacks that are the
wrong size.

## When not to use it

Do not optimize a page nobody has complained about and no metric flags. Every
optimization is code someone has to read, and most of them are neutral.

Do not optimize on a hunch about render counts. "This component renders three
times" is not a problem statement; "the list takes 180 ms to update on a
mid-range phone" is.

Do not optimize the client when the cost is elsewhere. A four-second API
response, an unoptimized 2 MB hero image, or a missing database index will not
respond to anything on this page.

## Basic example

`<Profiler>` is the cheapest way to attach a number to a suspicion. It reports
the time React spent rendering a subtree, and — via `baseDuration` — an estimate
of what that subtree would cost with no memoization at all.

```jsx live
import { Profiler, useRef, useState } from 'react';

function buildRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    label: `Order ${1000 + index}`,
    total: ((index * 37) % 500) + 20,
  }));
}

function OrderTable({ rowCount }) {
  const rows = buildRows(rowCount);
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.label}</td>
            <td>${row.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RenderCostMeter() {
  const timings = useRef([]);
  const [rowCount, setRowCount] = useState(50);

  function handleRender(id, phase, actualDuration, baseDuration) {
    timings.current = [
      { phase, actualDuration, baseDuration },
      ...timings.current,
    ].slice(0, 5);
  }

  return (
    <div>
      <p>
        Rendering {rowCount} rows{' '}
        <button onClick={() => setRowCount((n) => n * 2)}>Double</button>{' '}
        <button onClick={() => setRowCount(50)}>Reset</button>
      </p>
      <ol>
        {timings.current.map((entry, index) => (
          <li key={index}>
            {entry.phase} — actual {entry.actualDuration.toFixed(1)} ms, base{' '}
            {entry.baseDuration.toFixed(1)} ms
          </li>
        ))}
      </ol>
      <div style={{ maxHeight: 160, overflow: 'auto' }}>
        <Profiler id="order-table" onRender={handleRender}>
          <OrderTable rowCount={rowCount} />
        </Profiler>
      </div>
    </div>
  );
}
```

The list lags one click behind, because `onRender` fires during commit — after
the list above it has already rendered. Double the row count a few times and
watch the duration grow roughly linearly. That linear growth is the signal that
this component needs windowing, not memoization.

## How it works

Three facts about React's rendering model explain most performance behavior.

**Rendering is not the same as committing to the DOM.** React calls your
component functions, builds a tree of elements, diffs it, and only then touches
the DOM. Calling a component function again is cheap. Creating and destroying
DOM nodes is not. This is why 10,000 rows hurts far more than 10,000 re-renders
of a single small component.

**A state update re-renders the owning component and everything it renders
below.** React does not track which children read which values. It re-renders
the subtree and relies on the diff being cheap. `memo` is how you cut that
subtree short — see [Memoization](./memoization.md).

**Concurrent rendering lets React yield.** Updates started inside
`startTransition` are interruptible: React can pause mid-render to handle a
keystroke and resume afterwards. This does not make the work smaller, it makes
it non-blocking, which is exactly what INP measures.

```jsx
import { useState, useTransition } from 'react';

export default function TabSwitcher() {
  const [tab, setTab] = useState('summary');
  const [isPending, startTransition] = useTransition();

  function selectTab(nextTab) {
    startTransition(() => setTab(nextTab));
  }

  return (
    <div>
      <button onClick={() => selectTab('summary')}>Summary</button>
      <button onClick={() => selectTab('report')}>Report</button>
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        {tab === 'summary' ? <p>Summary</p> : <p>Report</p>}
      </div>
    </div>
  );
}
```

The click is acknowledged immediately; the expensive tab renders in the
background. Nothing rendered faster — the page stopped blocking.

## Common patterns

**Set a budget before you optimize.** "Under 200 KB of JavaScript on the
critical path" and "INP under 200 ms at the 75th percentile" are decisions you
can hold a pull request to. "Feels snappy" is not.

**Profile production builds only.** Development React includes warnings, extra
validation, and StrictMode double-invocation. Development timings are inflated
and unevenly so — the ratio between two components differs from production.
See [Profiling](./profiling.md).

**Reach for the Compiler before you reach for hooks.** React Compiler v1.0
(7 October 2025) memoizes components and values for you at build time. It
removes the reason for most hand-written `useMemo` and `useCallback`. Adopt it
first, then check whether you still have a render-work problem.

**Move work off the client entirely.** A [Server Component](../server-react/server-components.md)
that formats data on the server ships zero bytes of formatting code to the
browser and produces no client render work at all. That beats every
memoization strategy.

**Fix the algorithm before you cache the algorithm.** `useMemo` around an O(n²)
loop still runs the O(n²) loop, once per dependency change. Sorting inside a
`map` callback, rebuilding a lookup object per row, calling `Array.includes()`
inside a loop over the same array — those are the real cost, and no React
feature fixes them.

## Common mistakes

**Optimizing without a baseline.** If you did not record a number before the
change, you cannot tell whether the change helped. Most "optimizations" applied
this way are neutral at best.

**Treating re-renders as the enemy.** A re-render of a component that returns a
handful of elements costs microseconds. Chasing render counts leads to
memoization everywhere and measurable slowdowns from the comparison overhead
alone.

**Measuring in development.** StrictMode intentionally double-invokes render
functions and Effects in development to surface impure code. Numbers from a dev
build are not the numbers your users get.

**Optimizing the wrong metric.** A component that renders in 3 ms is not your
problem when the bundle takes 4 seconds to download on a mid-range phone. Look
at field data, not your laptop.

**Confusing "slow render" with "slow data".** A spinner that lasts two seconds
because a request is slow will not improve if you memoize the component showing
it. See [Data fetching](../data-fetching/overview.md).

**Adding a virtualization library to a 40-item list.** Windowing costs you
scroll accessibility, find-in-page, and complexity. Below a few hundred simple
rows it is a net loss.

## Related topics

- [Profiling](./profiling.md) — the tools that turn a suspicion into a number.
- [React Compiler](./react-compiler.md) — automatic memoization, and the reason
  you write less of it by hand now.
- [Memoization](./memoization.md) — `memo`, `useMemo`, `useCallback` and the
  narrow cases where each still earns its place.
- [Code splitting](./code-splitting.md) — the fix for a bundle that is too big.
- [Lists and virtualization](./lists-and-virtualization.md) — the fix for a list
  that is too long.
- [Server React](../server-react/overview.md) — moving work off the client
  entirely.
