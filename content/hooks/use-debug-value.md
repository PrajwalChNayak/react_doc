---
title: useDebugValue
description: Label a custom hook in React DevTools.
group: hooks
order: 160
status: current
related: [hooks/custom-hooks, hooks/use-sync-external-store, performance/profiling]
---

## Overview

`useDebugValue` attaches a readable label to a custom hook in the React DevTools
component inspector.

```text
useDebugValue(value, format?)
```

| Parameter | Meaning |
|---|---|
| `value` | What to display. Any type. |
| `format?` | A function receiving `value` and returning the display value. **Only called when DevTools inspects the hook.** |

It returns nothing and has no effect on rendering, on production builds, or on
anything a user can see. It is a debugging affordance and nothing else.

## Why it exists

DevTools shows the internal hooks of a custom hook, not its meaning. A hook built
on `useSyncExternalStore` appears as `SyncExternalStore: true` — technically
accurate, unreadable in a list of twenty.

`useDebugValue` lets the hook name itself:

```text
OnlineStatus: "Online"
```

The label is taken from the hook's name with the `use` prefix stripped, so
`useOnlineStatus` becomes `OnlineStatus`.

## When to use it

- **Custom hooks in a shared library**, where the consumer cannot read your
  implementation and DevTools is their only window into it.
- **Hooks with an opaque internal structure** — a state machine's current state,
  a subscription's connection status, a cache's hit/miss ratio.

## When not to use it

- **On every custom hook.** React's own guidance: do not add debug values
  everywhere. A hook whose internal state is already obvious in DevTools gains
  nothing and costs a line of noise.
- **In application code.** If you own both the hook and its callers, reading the
  source is faster than reading a label.
- **For logging.** It is not `console.log`. It runs during render and produces no
  output unless DevTools is attached and inspecting.
- **To expose values to your app.** Nothing in your code can read it back.

## Basic example

```jsx live
import { useDebugValue, useEffect, useState } from 'react';

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Shows as: WindowWidth: "1024px (desktop)"
  useDebugValue(`${width}px (${width < 768 ? 'mobile' : 'desktop'})`);

  return width;
}

export default function ViewportReadout() {
  const width = useWindowWidth();
  return (
    <p>
      Viewport width: {width}px. Open React DevTools and inspect this component
      to see the <code>WindowWidth</code> label.
    </p>
  );
}
```

## How it works

### The `format` argument

Pass the raw value plus a formatter and React defers the formatting until
DevTools actually asks for it. That is the reason the second argument exists: it
keeps expensive formatting off the render path.

```jsx
import { useDebugValue, useState } from 'react';

export function useLastSyncedAt(initial) {
  const [syncedAt, setSyncedAt] = useState(initial);

  // toDateString() runs only when DevTools inspects this hook,
  // not on every render.
  useDebugValue(syncedAt, date => date.toDateString());

  return [syncedAt, setSyncedAt];
}
```

Do it the other way round — `useDebugValue(syncedAt.toDateString())` — and the
formatting runs on every render of every component using the hook, in
development and production alike.

> [!BEST-PRACTICE]
> If formatting is more than a template literal, pass it as the second argument.
> If it is a plain string, one argument is fine.

### Across re-renders

The value is recomputed on every render, like any expression in a component
body. React stores it against the hook so DevTools can read it. There is no
memoization and no dependency array.

`useDebugValue` must be called unconditionally at the top level of a custom hook,
like every other hook.

### StrictMode

StrictMode's double render calls `useDebugValue` twice. Because it is inert, this
is invisible — unless you passed an impure expression, in which case the usual
purity rules apply. The `format` function must be pure too; DevTools may call it
at any time.

### Concurrent rendering

No interaction worth noting. `useDebugValue` schedules nothing, subscribes to
nothing, and does not participate in prioritization. A discarded render
discards the label with it.

### Production

React DevTools reads debug values in development. In a production build the call
is inert. It is not stripped from your bundle automatically, though — if the
value or its arguments are large, they still ship.

## Common mistakes

**Formatting eagerly.** `useDebugValue(expensiveFormat(value))` runs on every
render. Pass `value` and the formatter separately.

**Adding it to every hook.** Noise in DevTools is as unhelpful as no information.
Reserve it for hooks whose internals are genuinely hard to read.

**Calling it in a component.** It is meant for custom hooks. In a component the
label has nowhere sensible to appear.

**Calling it conditionally.** It follows the Rules of Hooks: top level, every
render.

**Expecting output without DevTools.** No console line, no warning, nothing. If
you want a log, write a log.

**Side effects in `format`.** DevTools decides when and how often to call it.
Keep it pure.

## Related topics

- [Custom hooks](./custom-hooks.md) — the only place this hook belongs.
- [useSyncExternalStore](./use-sync-external-store.md) — a hook whose internals
  are opaque enough to warrant a label.
- [Profiling](../performance/profiling.md) — the other half of what React
  DevTools is for.
- [Rules of Hooks](./rules-of-hooks.md) — why this one is still subject to call
  order.
