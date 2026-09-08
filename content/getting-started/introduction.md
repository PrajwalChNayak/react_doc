---
title: Introduction to React
description: What React is, the mental model it asks you to adopt, and where React 19 fits today.
group: getting-started
order: 10
status: current
related: [getting-started/installation, getting-started/your-first-component, core-concepts/rendering]
---

## Overview

React is a JavaScript library for building user interfaces out of components. It
gives you a way to describe what the screen should look like for a given set of
data, and it takes responsibility for making the real DOM match that description.

React is deliberately **not** a framework. It ships a component model, a
rendering engine, and a set of hooks. It does not ship a router, a data layer, a
build tool, or an opinion about your folder structure. You either assemble those
yourself or adopt a framework built on React that has already chosen them for
you.

That narrowness is the trade. You get flexibility and a very large ecosystem; you
also get a list of decisions to make before you write your first feature. The
rest of this site is largely about making those decisions well.

### Where React 19 sits today

| Milestone | Date |
|---|---|
| React 18.0 | March 2022 |
| React 19.0 — Actions, `use()`, `ref` as a prop, Server Components | 5 December 2024 |
| React 19.2 — `<Activity />`, `useEffectEvent`, Performance Tracks | 1 October 2025 |
| React Compiler v1.0 | 7 October 2025 |
| Current stable | **19.2.8** |

React 19.0 was the large release: it introduced Actions, the `use()` API, Server
Components as a stable feature, and it removed a decade of accumulated legacy
API. React 19.2 is the current minor line and is where `<Activity />` and
`useEffectEvent` arrived.

> [!WARNING]
> Install `react@19.2.8` / `react-dom@19.2.8`. Versions below **19.2.4** carry
> unpatched Server Components security advisories. See
> [Installation](./installation.md#overview) for the details.

## Why it exists

Before React, keeping a screen in sync with changing data meant writing
instructions: find this node, set its text, add that class, remove those three
rows. Every piece of state had to be mirrored by hand into every place it
appeared, and every code path that changed state had to remember to update every
one of those places.

React inverts that. You write a function that takes data and returns a
description of the UI. When the data changes, you run the function again. React
figures out the DOM operations.

The slogan is **UI as a function of state**:

```text
view = f(state)
```

The value is not that this is shorter. The value is that the number of code paths
you have to reason about collapses. There is one description of the UI, and it is
correct for every possible state, because it is derived from the state.

## When to use it

React earns its cost when your interface has **state that changes over time** and
**pieces that repeat**. A dashboard, an editor, a checkout flow, an admin panel,
anything with forms and lists and a server behind it.

It is also a reasonable default when you want:

- A component model you can compose and reuse across a large team.
- A hiring pool and an ecosystem — routers, form libraries, data libraries,
  component libraries — that is larger than any alternative.
- The option to render on the server later without switching frameworks.

## When not to use it

Do not reach for React for a static marketing page with three interactive
widgets. A little vanilla JavaScript, or a tool that ships zero JavaScript by
default, will be smaller and faster to build.

Be honest about the alternatives too. React is a good default, not the only
correct answer.

| | React | Vue | Svelte | Angular |
|---|---|---|---|---|
| Shape | Library (view layer) | Progressive framework | Compiler + library | Full framework |
| UI syntax | JSX — JavaScript | Templates (JSX optional) | Single-file components | Templates + decorators |
| Update model | Re-run components, reconcile | Fine-grained reactivity | Compile-time reactivity | Signals / change detection |
| Batteries included | Choose your own | Official router + store | Official router (SvelteKit) | Router, HTTP, DI, forms |
| Learning curve | Moderate — hooks take practice | Gentle | Gentle | Steep |
| Best fit | Large ecosystems, teams, RSC | Gradual adoption, small teams | Smallest bundles | Enterprise, opinionated stacks |

Rough guidance: pick **Angular** when you want the whole stack decided for you
and enforced across many teams. Pick **Svelte** when bundle size and minimal
ceremony dominate. Pick **Vue** when you want a gentler on-ramp with official
answers for routing and state. Pick **React** when you want the largest ecosystem,
the deepest talent pool, and Server Components.

## Basic example

A component is a function that returns markup. Nothing more.

```jsx live
import { useState } from 'react';

export default function TemperatureConverter() {
  const [celsius, setCelsius] = useState(20);
  const fahrenheit = (celsius * 9) / 5 + 32;

  return (
    <div style={{ fontFamily: 'system-ui', lineHeight: 1.8 }}>
      <label htmlFor="celsius">Celsius: </label>
      <input
        id="celsius"
        type="range"
        min={-20}
        max={50}
        value={celsius}
        onChange={(event) => setCelsius(Number(event.target.value))}
      />
      <p>
        {celsius}°C is <strong>{fahrenheit.toFixed(1)}°F</strong>
      </p>
      <p>{fahrenheit > 90 ? 'Stay in the shade.' : 'Comfortable enough.'}</p>
    </div>
  );
}
```

Two things worth noticing. `fahrenheit` is not state — it is computed from
`celsius` on every render, so it can never drift out of sync. And there is no
code anywhere that updates the paragraph text; the paragraph is part of the
description, and the description is re-evaluated when `celsius` changes.

## How it works

### Rendering is re-running your function

When state changes, React calls your component function again. That call returns
a new tree of plain JavaScript objects — React *elements* — describing what the
UI should be now. Your function does not touch the DOM.

React then compares the new tree with the one it rendered last time, works out the
minimal set of changes, and applies them. This comparison step is called
**reconciliation**, and the phase where the DOM is actually mutated is called the
**commit**.

The three phases, in order:

1. **Trigger** — an initial render, or a state update.
2. **Render** — React calls your components and builds the new element tree. This
   phase must be pure: no DOM writes, no network calls, no mutation of anything
   outside the component.
3. **Commit** — React applies the differences to the DOM and runs layout effects,
   then paints, then runs effects.

### About the "Virtual DOM"

You will see React explained as "it keeps a virtual copy of the DOM in memory,
diffs it, and patches the real DOM." That is a useful first mental model and it is
roughly what happens, so it is worth having.

It is also a simplification, and React's own documentation has moved away from
the phrase. What React actually maintains is a tree of fiber nodes carrying state,
effects, and scheduling information — not a mirror of the DOM. Renders can be
interrupted, paused, restarted, and thrown away before anything is committed. The
same reconciler drives React Native, where there is no DOM at all.

> [!NOTE]
> Use "Virtual DOM" as intuition for *why* re-rendering is cheap. Use
> **reconciliation** as the term when you want to be precise, and read
> [Rendering](../core-concepts/rendering.md) for what actually happens.

### Why re-rendering is not a performance problem

Beginners often assume that re-running a component is expensive. It usually is
not. Calling a function and building a few objects is cheap; touching the DOM is
what costs. React re-runs your function so it can avoid touching the DOM.

Rendering only becomes a problem when a component is genuinely expensive or a
subtree is very large. That is a measurement question, not a default assumption —
see [Performance overview](../performance/overview.md) before you memoize
anything.

### Components compose; data flows down

Components take **props** (inputs from the parent) and own **state** (values that
change over time). Data flows one direction: down from parent to child. A child
changes a parent's state by calling a function the parent passed it.

That single direction is what makes a React app traceable. When a value on screen
is wrong, there is exactly one place it came from.

## Common mistakes

- **Expecting React to be a framework.** React will not tell you how to route,
  fetch, or organize files. Pick a framework, or accept that you are assembling
  one. [Installation](./installation.md) covers both routes.
- **Storing derived values in state.** If a value can be computed from existing
  props or state, compute it during render. Mirroring it into state creates two
  sources of truth and a bug waiting for the moment they disagree.
- **Treating a re-render as a DOM update.** A render produces a description. Most
  renders result in very few DOM operations, or none.
- **Optimizing before measuring.** Wrapping everything in memoization slows apps
  down as often as it speeds them up, and the
  [React Compiler](../performance/react-compiler.md) now handles most of it.
- **Reaching for an Effect to keep two pieces of state in sync.** That is almost
  always a sign that one of them should be derived instead.
- **Learning class components first.** They still work, but every current API,
  pattern, and example is written with function components and hooks.

## Related topics

- [Installation](./installation.md) — set up React 19.2.8 with Vite or a framework.
- [Your first component](./your-first-component.md) — build one from scratch, step by step.
- [Thinking in React](./thinking-in-react.md) — turn a design into a component tree.
- [Learning path](./learning-path.md) — the ordered route through this site.
- [Rendering](../core-concepts/rendering.md) — render, commit, and reconciliation in detail.
- [Components](../core-concepts/components.md) — the unit of composition.
