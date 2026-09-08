---
title: Lists and virtualization
description: Why long lists get slow, the cheap fixes to try first, and what windowing costs you.
group: performance
order: 70
status: current
related: [core-concepts/lists-and-keys, performance/overview, hooks/use-deferred-value]
---

## Overview

A list gets slow for two independent reasons:

- **DOM node count.** Every row you render becomes real elements. Ten thousand
  rows at ten nodes each is 100,000 nodes for the browser to lay out, style,
  paint and keep in memory. This cost is the browser's, not React's, and no
  amount of memoization touches it.
- **Per-item render cost.** Each row runs a component function, allocates
  elements, and gets diffed. A row that formats three dates and runs a lookup is
  cheap once and expensive ten thousand times.

The fixes, in the order you should try them:

1. Fix the keys. Bad keys turn an update into a full remount.
2. Render fewer items — pagination, or a "load more" list.
3. Keep the expensive work off the keystroke path with `useDeferredValue` and
   `memo`.
4. Try `content-visibility: auto`, which is one CSS declaration.
5. Virtualize with a library, accepting the accessibility cost.

> [!BEST-PRACTICE]
> Virtualization is the last step, not the first. Below a few hundred simple
> rows it makes the app slower, less accessible, and harder to maintain.

## Why it exists

React's reconciler is efficient at diffing lists — provided you give it stable
identity. What it cannot do is make the browser cheap at holding tens of
thousands of elements. Layout and paint scale with node count, and the main
thread is where both happen.

Windowing exists because the user can only see about 20 rows. Rendering the
other 9,980 buys nothing and costs everything.

### Fix the keys first

Keys tell React which element in the new list corresponds to which element in
the old one. Get them wrong and React destroys and recreates DOM nodes that
could have been reused — which also resets component state, loses focus, and
clears uncontrolled inputs.

```jsx
export function TodoList({ todos }) {
  return (
    <ul>
      {todos.map((todo) => (
        // ✅ Stable identity that belongs to the data.
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

The three failures, in order of how much damage they do:

- `key={Math.random()}` — a new key every render. React remounts every row on
  every render. This is the worst thing you can do to a list.
- `key={index}` — stable only if the list is append-only. Insert at the front,
  sort, or filter, and every row after the change point is now paired with the
  wrong data.
- No key at all — React warns and falls back to index behavior.

Index keys are acceptable for a list that never reorders and whose rows hold no
state. That is a narrower case than people assume: any row containing an input,
a toggle, or an animation is stateful.

See [Lists and keys](../core-concepts/lists-and-keys.md) for the full
reconciliation model.

## When to use it

Reach for the heavier tools only once the list is genuinely long — thousands of
rows, or hundreds of expensive ones — and a [profile](./profiling.md) shows the
list is what the user is waiting for.

### Render fewer items first

Before you reach for a windowing library, ask whether the user needs all the
rows at once.

**Pagination** is the simplest and the most accessible. A fixed page size caps
DOM nodes, render cost, and payload size at the same time, and every browser
feature — find-in-page, scroll restoration, screen reader list semantics — keeps
working.

**Infinite scroll** with an `IntersectionObserver` sentinel is a good fit for
feeds. It has one performance trap: appending without ever removing means the
DOM grows without bound, and the page gets slower the longer someone scrolls.
Either cap the retained window or accept that a session has a length limit.

**Server-side filtering and sorting** removes the problem. If the user is
searching 50,000 records, sending 50,000 records to the browser to filter is the
actual bug.

## When not to use it

Windowing removes rows from the DOM, and browser features that depend on the DOM
stop working. Below a few hundred simple rows, or when any of the costs below
matters more than the milliseconds you save, do not virtualize.

Do not virtualize a list whose height is unknown or `auto`. Windowing needs a
fixed scroll viewport; without one it renders everything and you get the
complexity with none of the benefit.

### What virtualization costs you

| Feature | What breaks | Mitigation |
|---|---|---|
| Find-in-page (Ctrl+F) | Only rendered rows are searchable | Provide an in-app search that operates on the full dataset |
| Screen reader list semantics | The list appears to have 20 items, not 8,000 | Set `role="list"` / `role="listitem"` explicitly and expose the true count |
| Tab and arrow-key navigation | Focus can land on a row that gets unmounted mid-scroll | Track the focused item by id, restore focus when it re-renders |
| Ctrl+A / select all, copy | Selects only visible rows | Offer an explicit export or "select all" action |
| Anchor links to a row | The target may not be rendered | Scroll to the index programmatically before focusing |
| Browser scroll restoration | Position is lost on back-navigation | Persist and restore the scroll offset yourself |

The accessibility items are the ones to take seriously. A virtualized list
announced as "list, 20 items" when it holds 8,000 is actively misleading. At
minimum, expose the real count in text near the list and keep row semantics
explicit — see [Semantics](../accessibility/semantics.md) and
[Announcements](../accessibility/announcements.md).

Pagination has none of these problems. That is the strongest argument for trying
it first.

## Basic example

The specific pain of a filter box over a long list is that every keystroke
triggers a synchronous re-render of the whole list. The input lags behind the
typing, which is an INP problem.

`useDeferredValue` splits the update in two: the input updates immediately with
the new value, and the list re-renders in the background with the old one still
on screen. `memo` on the list is what makes it work — without it the list
re-renders anyway and the split buys nothing.

```jsx live
import { memo, useDeferredValue, useState } from 'react';

const PARTS = Array.from({ length: 8000 }, (_, index) => ({
  id: index,
  sku: `SKU-${String(index).padStart(5, '0')}`,
  name: `${['Bracket', 'Bearing', 'Gasket', 'Spindle'][index % 4]} ${index}`,
}));

const PartsList = memo(function PartsList({ query }) {
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? PARTS.filter(
        (part) =>
          part.name.toLowerCase().includes(needle) ||
          part.sku.toLowerCase().includes(needle),
      )
    : PARTS;

  return (
    <div>
      <p>
        {matches.length} of {PARTS.length} parts
      </p>
      <ul style={{ maxHeight: 150, overflow: 'auto', margin: 0 }}>
        {matches.slice(0, 200).map((part) => (
          <li key={part.id}>
            {part.sku} — {part.name}
          </li>
        ))}
      </ul>
    </div>
  );
});

export default function PartsSearch() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div>
      <input
        value={query}
        placeholder="Search parts"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div style={{ opacity: isStale ? 0.6 : 1 }}>
        <PartsList query={deferredQuery} />
      </div>
    </div>
  );
}
```

Type quickly. The input never stutters, and the list dims while it catches up.
Comparing `query` to `deferredQuery` tells you the displayed results are stale,
which is the honest thing to show the user.

> [!NOTE]
> With the [React Compiler](./react-compiler.md) enabled, the `memo` wrapper is
> inserted for you. `useDeferredValue` is still yours to write — it is a
> scheduling decision, not a caching one, and no compiler can infer it.

## How it works

Windowing renders only the rows in (and near) the viewport, and uses a spacer or
absolute positioning so the scrollbar behaves as though everything were there.
Three numbers drive it: the scroll offset, the row height, and the viewport
height. From those you compute the first visible index and how many rows fit,
render that slice, and translate it down by `firstIndex * rowHeight`.

An **overscan** of a few rows above and below the viewport hides the seam during
fast scrolling, at the cost of a handful of extra nodes.

Variable row heights are where this gets hard: you cannot compute an offset from
a height you do not know until the row is measured. Libraries solve it by
measuring rendered rows, caching the measurements, and estimating the rest.

### `content-visibility` as a cheaper option

Before adding a library, try one CSS declaration. `content-visibility: auto`
tells the browser to skip layout and paint for elements outside the viewport,
while keeping them in the DOM.

```css
.parts-list > li {
  content-visibility: auto;
  contain-intrinsic-size: auto 44px;
}
```

`contain-intrinsic-size` gives the browser a placeholder height so the scrollbar
is the right length and does not jump as rows are measured.

What you get: layout and paint costs drop for off-screen rows. What you do not
get: React still renders every row, and the DOM nodes still exist and still
consume memory. It helps with paint-bound lists, not with render-bound ones or
enormous ones.

It costs almost nothing to try, keeps find-in-page working, and has no effect on
accessibility. That combination makes it worth ten minutes before you commit to
windowing.

## Common patterns

### Windowing with a library

**Use a library.** The mechanics are simple; the edge cases are not — variable
row heights, resize handling, scroll restoration, sticky headers, dynamic
measurement, keyboard navigation. Two mature options, both third-party and
neither maintained by the React team:

- **`react-window`** — small, fixed and variable size lists and grids.
- **`@tanstack/react-virtual`** — headless, gives you the measurements and lets
  you own the markup. Better for irregular layouts.

```jsx static="Needs a third-party package that is not available in the sandboxed preview."
import { memo } from 'react';
import { FixedSizeList } from 'react-window';

const Row = memo(function Row({ index, style, data }) {
  const part = data[index];
  return (
    <div style={style}>
      {part.sku} — {part.name}
    </div>
  );
});

export function VirtualPartsList({ parts }) {
  return (
    <FixedSizeList
      height={480}
      width="100%"
      itemCount={parts.length}
      itemSize={44}
      itemData={parts}
    >
      {Row}
    </FixedSizeList>
  );
}
```

> [!WARNING]
> Check the current API of whichever library you pick against its own docs.
> These packages version independently of React, and their component names and
> props have changed across major versions.

### Precompute per-row work

Formatting a date or looking up a label inside a row component runs once per
visible row per render. Do it once, when the data arrives:

```jsx
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

export function prepareOrders(orders) {
  return orders.map((order) => ({
    ...order,
    placedAtLabel: dateFormat.format(new Date(order.placedAt)),
  }));
}
```

Creating the `Intl.DateTimeFormat` once at module scope rather than per row is
itself a large win — constructing a formatter is expensive.

### Keep a stable row component

Extract the row into its own component and wrap it in `memo` (or let the
compiler do it). Then make sure the props are stable: pass primitives and the
row object itself, not a fresh options object or an inline callback. See
[Memoization](./memoization.md).

## Advanced example

The mechanics, in about thirty lines, so the library is not a black box. A tall
spacer creates the scrollbar; only the visible slice is rendered, offset into
position.

```jsx live
import { useState } from 'react';

const ROW_HEIGHT = 32;
const VIEWPORT_HEIGHT = 224;
const OVERSCAN = 4;

const SENSORS = Array.from({ length: 20000 }, (_, index) => ({
  id: index,
  label: `Sensor ${index}`,
  reading: ((index * 91) % 400) / 10,
}));

export default function VirtualSensorList() {
  const [scrollTop, setScrollTop] = useState(0);

  const firstVisible = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN,
  );
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const slice = SENSORS.slice(firstVisible, firstVisible + visibleCount);

  return (
    <div>
      <p>
        {SENSORS.length.toLocaleString('en-US')} sensors · rendering{' '}
        {slice.length} rows
      </p>
      <div
        role="list"
        aria-label={`${SENSORS.length} sensors`}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        style={{
          height: VIEWPORT_HEIGHT,
          overflowY: 'auto',
          border: '1px solid #ccc',
        }}
      >
        <div
          style={{ height: SENSORS.length * ROW_HEIGHT, position: 'relative' }}
        >
          <div
            style={{
              position: 'absolute',
              top: firstVisible * ROW_HEIGHT,
              left: 0,
              right: 0,
            }}
          >
            {slice.map((sensor) => (
              <div
                key={sensor.id}
                role="listitem"
                style={{
                  height: ROW_HEIGHT,
                  lineHeight: `${ROW_HEIGHT}px`,
                  padding: '0 8px',
                }}
              >
                {sensor.label} — {sensor.reading.toFixed(1)} °C
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Twenty thousand rows, roughly a dozen DOM nodes. Note the `aria-label` carrying
the true count, and `role="list"` / `role="listitem"` restoring the semantics
the absolutely positioned wrapper would otherwise break.

Now count what this toy does not handle: variable row heights, resizing the
viewport, scroll restoration, keyboard focus surviving a scroll, sticky headers.
That list is why you use a library in production.

## Common mistakes

**Reaching for a virtualization library first.** For 200 rows it is pure
overhead. Profile the list before you window it.

**Using the array index as a key in a list that reorders.** Sorting or filtering
then pairs each rendered row with the wrong data, which shows up as inputs
holding the previous row's value.

**Regenerating the data array on every render.** `items.filter(...)` inside the
component body creates a new array each time, which defeats `memo` on anything
downstream. Derive it once, memoize it, or let the compiler handle it.

**Putting the expensive work in the row instead of the dataset.** Formatting a
date inside a row component runs once per visible row per render. Precompute it
when the data arrives.

**Rendering a virtualized list inside a container of unknown height.** Windowing
needs a fixed scroll viewport. Given `height: auto` it renders everything.

**Forgetting that infinite scroll accumulates.** After twenty pages the DOM
holds twenty pages. Trim the top of the window, or paginate.

**Shipping a virtualized list without testing it with a keyboard and a screen
reader.** This is the failure mode that reaches production most often, because
the developer scrolls with a mouse and never notices.

## Related topics

- [Lists and keys](../core-concepts/lists-and-keys.md) — the reconciliation
  rules that make keys matter.
- [useDeferredValue](../hooks/use-deferred-value.md) — keeping input responsive
  while a large list catches up.
- [Memoization](./memoization.md) — why `memo` is required for the deferred
  pattern to pay off.
- [Semantics](../accessibility/semantics.md) — preserving list semantics when
  you remove rows from the DOM.
- [Performance overview](./overview.md) — deciding whether the list is really
  your bottleneck.
- [Data fetching overview](../data-fetching/overview.md) — filtering on the
  server instead of shipping the whole dataset.
