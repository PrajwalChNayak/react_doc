---
title: React Compiler
description: A build-time optimizer that memoizes your components and values so you do not have to.
group: performance
order: 20
status: current
related: [performance/memoization, performance/overview, hooks/rules-of-hooks]
---

## Overview

React Compiler is a build-time tool that reads your components and inserts
memoization for you. **Version 1.0 was released on 7 October 2025.** With it
enabled, the vast majority of hand-written `useMemo`, `useCallback` and `memo`
becomes unnecessary — you write plain code and the compiler produces the
optimized output.

It is a Babel plugin, so it runs in your build, not at runtime. The output is
ordinary JavaScript. There is no new API to learn and no runtime to ship.

It supports React 17, 18 and 19, and works best on React 19.

> [!BEST-PRACTICE]
> Adopt the compiler before you write another `useMemo`. It removes an entire
> category of code — and an entire category of stale-dependency bugs — from your
> codebase.

## Why it exists

Manual memoization is tedious, error-prone, and invisible when it breaks.

You have to decide *which* values need `useMemo`, keep every dependency array
correct as the component evolves, and remember that wrapping a child in `memo`
achieves nothing if the parent passes it a fresh object literal. Get any of it
wrong and nothing crashes — you get a silent performance regression that only a
profiler will find.

Worse, the code is noise. A component with five `useCallback` wrappers is harder
to read than the same component without them, and the wrappers describe machine
concerns, not product logic.

The compiler does this analysis mechanically, on every component, every build,
and never forgets a dependency.

## When to use it

Treat it as the project default rather than a targeted optimization. It applies
to every component you write, and the benefit compounds as the codebase grows.

### What it optimizes

It targets two costs:

- **Cascading re-renders.** Re-rendering a parent re-renders its whole subtree,
  even components whose props did not change. The compiler memoizes those
  subtrees so React can skip them.
- **Expensive recomputation.** A costly calculation inside a component body runs
  on every render. The compiler caches the result and reuses it while its inputs
  are unchanged.

It infers this from your code, so it can memoize things you would not have
bothered to memoize by hand — individual JSX elements, intermediate values,
props objects — at a granularity that is impractical to maintain manually.

### What it requires

Your code has to follow the [Rules of React](../hooks/rules-of-hooks.md):
render functions are pure, props and state are not mutated, and hooks are called
unconditionally at the top level.

The compiler's stance on code it cannot verify is conservative. From the docs:

> React Compiler is designed to handle code that follows the Rules of React.
> When it encounters code that might break these rules, it safely skips
> optimization rather than risk changing your app's behavior.

So a rule violation costs you an optimization, not a crash. The residual risk is
the reverse case: code that violates the rules in a way subtle enough that the
compiler did not notice, and compiled anyway. That is what the ESLint rules are
for.

## When not to use it

There is no class of application that should avoid the compiler. What there is,
is a set of problems people expect it to solve and it does not.

### What it does not do

- **Fix a slow algorithm.** An O(n²) loop memoized is still an O(n²) loop the
  first time and after every input change. Fix the algorithm.
- **Reduce bundle size.** It adds a small amount of code, if anything. Bundle
  size is a [code splitting](./code-splitting.md) problem.
- **Remove the need for virtualization.** Rendering 10,000 DOM nodes is
  expensive no matter how well the render is cached. See
  [lists and virtualization](./lists-and-virtualization.md).
- **Replace `useSyncExternalStore`.** Subscribing to a store outside React is a
  correctness concern, not a memoization concern.
- **Replace transitions.** `useTransition` and `useDeferredValue` change *when*
  work happens and whether it blocks. The compiler only changes how often work
  repeats.
- **Rescue code that breaks the Rules of React.** It skips what it cannot prove
  safe, so impure components stay unoptimized.

## Basic example

### Turn on the ESLint rules first

`eslint-plugin-react-hooks` ships the compiler-powered rules. Turn them on before
you turn on the compiler — you get the diagnostics with none of the build
changes, and every violation you fix is a component the compiler will be able to
optimize later.

```bash
npm install -D eslint-plugin-react-hooks@latest
```

In **v7** (the current major) the compiler rules are enabled by default in
`reactHooks.configs.recommended`; `recommended-latest` adds the experimental ones
on top. v7 is flat-config only — it removed the `recommended-legacy` and
`flat/recommended` configs that v6 had.

### Install the plugin

```bash
npm install -D babel-plugin-react-compiler@latest
```

Then wire it into your build. **The plugin must run first**, before other Babel
plugins, because it needs to see your source before anything transforms it.

:::tabs
== Babel
```js
// babel.config.js
module.exports = {
  plugins: [
    'babel-plugin-react-compiler', // must run first!
    // ... other plugins
  ],
};
```
== Vite
```js
// vite.config.js — Vite 6.0.0+
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
});
```
== Next.js
```bash
# Next.js exposes the compiler through its own config.
# See the reactCompiler option in the Next.js docs.
```
:::

> [!WARNING]
> Build tooling around the compiler is still moving. Check
> [react.dev/learn/react-compiler/installation](https://react.dev/learn/react-compiler/installation)
> for the current wiring before copying a config from anywhere — including from
> this page.

### The code you get to write

No `memo`, no `useMemo`, no `useCallback` — and the filtered list is not
recomputed on every unrelated re-render, because the compiler caches it.

```jsx live
import { useState } from 'react';

const ALL_TICKETS = Array.from({ length: 400 }, (_, index) => ({
  id: index,
  title: `Ticket #${1000 + index}`,
  priority: ['low', 'normal', 'high'][index % 3],
}));

function TicketList({ tickets }) {
  return (
    <ul style={{ maxHeight: 140, overflow: 'auto', margin: 0 }}>
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          {ticket.title} — {ticket.priority}
        </li>
      ))}
    </ul>
  );
}

export default function TicketBoard() {
  const [priority, setPriority] = useState('high');
  const [refreshCount, setRefreshCount] = useState(0);

  // Plain code. With the compiler, this is memoized on `priority`.
  const visible = ALL_TICKETS.filter((ticket) => ticket.priority === priority);

  return (
    <div>
      <label>
        Priority{' '}
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="low">low</option>
          <option value="normal">normal</option>
          <option value="high">high</option>
        </select>
      </label>{' '}
      <button onClick={() => setRefreshCount((n) => n + 1)}>
        Unrelated state change ({refreshCount})
      </button>
      <p>{visible.length} tickets</p>
      <TicketList tickets={visible} />
    </div>
  );
}
```

> [!NOTE]
> The preview above runs uncompiled React 19.2.8 in a sandbox — no build step,
> so no compiler. It shows the *source shape* the compiler lets you write, not
> the optimized output.

## How it works

The compiler builds a model of the data flow inside each component: which values
depend on which, which are stable across renders, and which JSX elements depend
on which values. It then emits code that stores those values in a cache attached
to the component instance and reuses them while their inputs are unchanged.

Two consequences follow.

**It memoizes at a finer grain than you would.** A single component can end up
with a dozen independently cached slots — a formatted string here, a JSX
subtree there. Nobody writes that by hand.

**It reasons about the whole function.** A mutation anywhere in the render path
can make a value uncacheable, and the compiler will notice and skip it rather
than produce wrong output.

### Checking whether a component was optimized

Open React DevTools and look at the component in the tree. Compiled components
carry a **✨ badge**. No badge means the compiler skipped it — usually a Rules of
React violation, or a `"use no memo"` you forgot to remove.

This is also the verification step after fixing a bail-out: remove the
`"use no memo"`, rebuild, and confirm the badge appears.

## Common patterns

### Incremental adoption

Three supported strategies, from coarsest to finest.

**Directory allowlist.** Use Babel's `overrides` to compile one part of the tree
and expand outwards.

```js
// babel.config.js
module.exports = {
  plugins: [
    // Global plugins that apply to all files
  ],
  overrides: [
    {
      test: './src/modern/**/*.{js,jsx,ts,tsx}',
      plugins: ['babel-plugin-react-compiler'],
    },
  ],
};
```

**Opt in per function with `"use memo"`.** Set `compilationMode: 'annotation'`
and nothing is compiled unless it says so.

```js
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-react-compiler', {
      compilationMode: 'annotation',
    }],
  ],
};
```

```jsx
export function TodoList({ todos }) {
  "use memo"; // Opt this component into compilation
  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

**Runtime gating.** The `gating` option compiles both versions and picks one
behind a feature flag, so you can roll the compiler out to a percentage of
traffic and compare field metrics.

```js
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-react-compiler', {
      gating: {
        source: 'ReactCompilerFeatureFlags',
        importSpecifierName: 'isCompilerEnabled',
      },
    }],
  ],
};
```

The escape hatch in the other direction is `"use no memo"`, which excludes a
single function from compilation. Treat it as temporary: it marks a component
you have not fixed yet, not a design decision.

### Delete manual memoization as you migrate, not before

Existing `useMemo` and `useCallback` calls keep working alongside compiled
output. Remove them component by component once the ✨ badge confirms the
compiler took over, so a regression is attributable to one change.

### Keep the memoization that is a semantic guarantee

If a downstream Effect depends on referential identity for correctness, an
explicit `useMemo` documents that requirement. Prefer restructuring so the
correctness does not hinge on identity at all — see
[useEffectEvent](../hooks/use-effect-event.md).

### Treat a missing badge as a lint finding

A component the compiler skips is usually a component with a purity bug. The
performance loss is the least interesting part of that.

### Do not gate your architecture on it

The compiler is an optimization pass. Component boundaries, state placement, and
where data is fetched matter more and are unaffected by it.

## Common mistakes

**Expecting it to fix a bundle-size or data-fetching problem.** It changes how
often your components re-render. That is all. If the profile shows four seconds
of network and 8 ms of render, the compiler has nothing to give you.

**Mutating props or state during render and blaming the compiler.** Pushing to
an array you received as a prop, or assigning to `state.field` before calling
the setter, breaks the Rules of React. Uncompiled React tolerates it by
accident; the compiler is where it starts to matter.

**Leaving `"use no memo"` in the codebase permanently.** It is a debugging
marker. Every one left behind is a component running unoptimized forever, with
no warning.

**Installing the plugin last in the Babel chain.** It has to run first. Placed
after a transform that has already rewritten your JSX, it cannot analyze the
code.

**Assuming compiled means fast.** The ✨ badge means "cached", not "cheap". A
component that renders 5,000 rows is slow on its first render and slow every
time its data changes, badge or not.

## Related topics

- [Memoization](./memoization.md) — what `memo`, `useMemo` and `useCallback`
  actually do, for the code the compiler has not reached yet.
- [Rules of Hooks](../hooks/rules-of-hooks.md) — the constraints the compiler
  relies on.
- [Performance overview](./overview.md) — deciding whether render work is even
  your problem.
- [Profiling](./profiling.md) — confirming the compiler moved a real number.
- [Build tooling](../ecosystem/build-tooling.md) — where the Babel plugin fits
  into your pipeline.
