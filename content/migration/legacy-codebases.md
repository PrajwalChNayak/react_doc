---
title: Legacy codebases
description: Strategy for a large pre-19 React app you cannot rewrite, including class conversion, StrictMode adoption, and React Compiler readiness.
group: migration
order: 40
status: legacy
related: [migration/react-18-to-19, migration/removed-apis, migration/deprecated-apis, performance/react-compiler]
---

## Overview

This page is for the app nobody wants to touch: four hundred components, half of
them classes, a test suite that asserts on element trees, and a business that
needs features shipped next week.

The good news is narrower than the rewrite advocates suggest and better than the
"we can never upgrade" crowd fears:

- **Class components work in React 19.** They are not deprecated and nothing on
  the [removed list](./removed-apis.md) is a class component feature.
- **The upgrade and the modernization are separate projects.** You can be on
  19.2.8 with every class untouched.
- **Nothing forces a big-bang conversion.** Class and function components
  compose freely in both directions.

What actually blocks a legacy app is a short list: the legacy root API, string
refs, legacy context, and a test suite built on removed test utilities. Fix
those and you are on React 19. Everything else on this page is optional
improvement you can spend years on.

## Why it exists

React's documentation is written for greenfield code, so it answers "how do I do
this" and not "I have three hundred of the old thing, now what". The gap is
sequencing: which changes are forced, which are worth doing, and what order
keeps the app shippable throughout.

There is also a persistent myth that class components were removed in React 19.
They were not. Acting on that myth turns a two-week upgrade into a nine-month
rewrite, and rewrites of working software fail for reasons that have nothing to
do with React.

## When to use it

- The app predates React 18, or was upgraded to 18 without cleaning up.
- More than a handful of components are classes.
- You need to keep shipping features during the migration.
- You want the React Compiler eventually and need to know what stands in the
  way.

## When not to use it

- **The app is small.** Under about thirty components, converting everything in
  one pass is genuinely faster than managing a migration.
- **The app is unowned and stable.** Code nobody edits does not need
  modernizing. Upgrade React for the security patches, fix what breaks, stop.
- **You are actually replacing the app.** If the plan is a new codebase, do not
  spend a quarter improving the one being deleted.

## Basic example

The smallest useful conversion, so the shape is clear before the rules arrive.

:::tabs
== Before (class)
```jsx legacy
import { Component } from 'react';

export class OrderCounter extends Component {
  constructor(props) {
    super(props);
    this.state = { count: props.initialCount };
    this.increment = this.increment.bind(this);
  }

  increment() {
    this.setState(previous => ({ count: previous.count + 1 }));
  }

  render() {
    return (
      <button onClick={this.increment}>
        Orders: {this.state.count}
      </button>
    );
  }
}
```
== After (function)
```jsx
import { useState } from 'react';

export function OrderCounter({ initialCount = 0 }) {
  const [count, setCount] = useState(initialCount);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Orders: {count}
    </button>
  );
}
```
:::

Four things disappeared: the constructor, the `super(props)` call, the manual
`bind`, and `this`. That is the typical ratio — a converted component is
roughly half the lines.

## How it works

### Class components in React 19

React's own reference page for `Component` opens by recommending function
components. It does **not** say classes are deprecated, and it documents every
lifecycle method with working examples. There is no removal date and no warning.

So the argument for converting is not compliance. It is these four things:

| Cost of staying a class | Consequence |
|---|---|
| No hooks | Every piece of shared stateful logic needs a render prop, a HOC, or duplication. Custom hooks are the only clean answer, and classes cannot call them. |
| No React Compiler | The compiler optimizes function components. A class is skipped, so it keeps whatever hand-written `shouldComponentUpdate` you gave it and gains nothing. |
| Harder logic sharing | A concern spread across three lifecycle methods cannot be extracted. The same concern in one Effect can be lifted into a custom hook in minutes. |
| Ecosystem drift | New libraries ship hooks, not HOCs. Every hook-only library needs a function-component adapter around your class. |

None of those is urgent. All of them compound.

### Lifecycle to hook mapping

| Class | Function equivalent |
|---|---|
| `constructor` state | `useState` / `useReducer` |
| `componentDidMount` | `useEffect(fn, [])` — but ask first whether you need an Effect at all |
| `componentDidUpdate` | `useEffect(fn, [dependencies])`, comparing nothing manually |
| `componentWillUnmount` | the cleanup function returned from `useEffect` |
| all three, one concern | **one** `useEffect` — mount, update and unmount for a single concern belong together |
| `getDerivedStateFromProps` | compute during render, or reset with a `key` |
| `shouldComponentUpdate` | `memo`, or nothing once the React Compiler is on |
| `getSnapshotBeforeUpdate` | `useLayoutEffect`, reading the DOM before paint |
| `componentDidCatch` / `getDerivedStateFromError` | **still a class.** There is no hook. |
| `this.setState(updater)` | `setState(previous => next)` |
| instance fields | `useRef` |

The most important row is the fourth. A class scatters one concern — subscribing
to a socket, say — across mount, update and unmount, and the reader has to
reassemble it. An Effect states the whole thing in one place, which is why
converting usually reveals a bug: two lifecycle methods that were subtly out of
sync.

> [!WARNING]
> Do not convert lifecycle methods one-for-one into three Effects. Convert by
> **concern**. A component with `componentDidMount` doing four unrelated things
> becomes four Effects with four different dependency arrays, not one big one.

### `getDerivedStateFromProps` is usually not state

Most uses of it were "copy a prop into state so I can edit it". In a function
component that is two better options:

```jsx
// Derive during render. No state, no synchronization, no stale copy.
export function InvoiceTotal({ lineItems }) {
  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  return <strong>{total}</strong>;
}
```

When the value genuinely is editable state that must reset when the identity of
the thing changes, use a `key` instead of an Effect:

```jsx
import { useState } from 'react';

function ProfileForm({ initialName }) {
  const [name, setName] = useState(initialName);
  return <input value={name} onChange={e => setName(e.target.value)} />;
}

export function ProfilePanel({ userId, initialName }) {
  // A new userId means a new form: React remounts it and state resets.
  return <ProfileForm key={userId} initialName={initialName} />;
}
```

### Error boundaries stay classes

`componentDidCatch` and `getDerivedStateFromError` have no hook equivalent in
React 19. An error boundary is a class, and it is the one class you should
expect to keep writing.

In practice you write one, put it in your design system, and never write another
— every other component uses it as a wrapper. See
[Error boundaries](../patterns/error-boundaries.md).

> [!NOTE]
> React 19 changed how errors are reported around boundaries: errors caught by a
> boundary go to `console.error` and are no longer re-thrown, so they are not
> double-logged. Wire `onCaughtError` on the root if your monitoring depended on
> the old behavior. See [React 18 to 19](./react-18-to-19.md).

### The `UNSAFE_` lifecycles

`componentWillMount`, `componentWillReceiveProps` and `componentWillUpdate` were
renamed with an `UNSAFE_` prefix. The current status in React 19:

- The **`UNSAFE_`-prefixed** names — `UNSAFE_componentWillMount`,
  `UNSAFE_componentWillReceiveProps`, `UNSAFE_componentWillUpdate` — are
  deprecated but still supported and still documented.
- The **un-prefixed** names are deprecated. React's documentation states that in
  a future major version only the new name will work.

Neither was removed in 19. Rename them now, because the rename is free:

```bash
npx react-codemod rename-unsafe-lifecycles
```

The prefix is the point. These methods run before render commits, so under
concurrent rendering they can run on work React then throws away. That is why
they are unsafe, and why the eventual conversion should move the logic into
render, an Effect, or a `key` — not into another pre-commit hook.

### StrictMode as a staged process

`<StrictMode>` double-invokes component functions, initializers and Effects in
development, and mounts, unmounts and remounts each component once. In a legacy
app it will find real bugs immediately, in volume.

Turning it on app-wide on day one produces a hundred failures and gets it turned
back off. Stage it instead — `StrictMode` works on any subtree:

```jsx
import { StrictMode } from 'react';

function SettingsPage() {
  return <p>Settings</p>;
}

function Dashboard() {
  return <p>Dashboard</p>;
}

export function App() {
  return (
    <div>
      {/* Migrated and clean: keep it clean. */}
      <StrictMode>
        <SettingsPage />
      </StrictMode>
      {/* Not yet audited. */}
      <Dashboard />
    </div>
  );
}
```

Expand the wrapper as directories are cleaned, and put the whole app inside it
last. What it will find, in order of frequency:

1. Effects with no cleanup — subscriptions, intervals, listeners that survive
   remount and then run twice.
2. Impure render — mutating a prop, pushing to a module array, incrementing a
   counter during render.
3. Ref setup without teardown, now that ref callbacks double-invoke on mount in
   19.

Each of those is a production bug, not a StrictMode artifact. See
[StrictMode](../core-concepts/strict-mode.md).

## Common patterns

### Mixing class and function components

There is no boundary to manage. A class renders function children, a function
renders class children, and context, props and refs cross freely.

Two asymmetries are worth knowing:

- **A class cannot call a hook.** If you need a hook's value inside a class,
  wrap the class in a small function component that calls the hook and passes
  the result down as a prop. That wrapper is also the first step of converting
  the class later.
- **A function component has no instance.** Code that grabbed a child class
  instance through a ref to call a method on it needs
  [`useImperativeHandle`](../hooks/use-imperative-handle.md) after conversion,
  or — better — a prop instead of an imperative call.

```jsx
import { Component, createContext, useContext } from 'react';

const LocaleContext = createContext('en-US');

class PriceTag extends Component {
  render() {
    return <span>{this.props.locale}: {this.props.amount}</span>;
  }
}

// The adapter: a function component that reads a hook and feeds the class.
export function LocalizedPriceTag({ amount }) {
  const locale = useContext(LocaleContext);
  return <PriceTag locale={locale} amount={amount} />;
}
```

### An order of operations that keeps the app shippable

1. **Unblock the upgrade.** The legacy root API, string refs, legacy context,
   removed test utilities. Nothing else. Ship React 19.
2. **Fix the leaf classes.** Presentational components with no lifecycle
   methods. Each is a ten-minute change with a trivial diff, and it builds the
   team's fluency on components that cannot break much.
3. **Convert by feature, not by file type.** When you touch a feature for a
   product reason, convert its components. Migration paid for by feature work
   never gets deprioritized.
4. **Extract custom hooks as duplication appears.** Two components with the same
   Effect is the signal. This is where the payoff shows up.
5. **Do the stateful containers last.** The big ones with six lifecycle methods
   are where the bugs live, and by then you will have converted forty easy
   components and know the patterns.
6. **Leave error boundaries alone.** They are supposed to be classes.

> [!BEST-PRACTICE]
> Add an ESLint rule banning new class components once step 2 is done. Migration
> is a race between conversion and creation, and you win it by stopping the
> creation.

### Testing during conversion

Convert a component and its test in the same commit, and make the test assert on
rendered output rather than on structure. A structural test cannot survive the
conversion, because the structure is exactly what changed.

If the suite is built on removed test utilities, that is upgrade-blocking work
rather than modernization work — see [Removed APIs](./removed-apis.md) and
[Testing Library](../testing/testing-library.md).

## Advanced example

A realistic container: state in a constructor, a fetch on mount, a refetch when
a prop changes, and cleanup on unmount. This is the shape most legacy containers
have.

:::tabs
== Before (class)
```jsx legacy
import { Component } from 'react';

export class ProjectPanel extends Component {
  constructor(props) {
    super(props);
    this.state = { project: null, error: null, isLoading: true };
  }

  componentDidMount() {
    this.load(this.props.projectId);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.projectId !== this.props.projectId) {
      this.setState({ isLoading: true });
      this.load(this.props.projectId);
    }
  }

  componentWillUnmount() {
    if (this.controller) this.controller.abort();
  }

  load(projectId) {
    this.controller = new AbortController();
    fetch(`/api/projects/${projectId}`, { signal: this.controller.signal })
      .then(response => response.json())
      .then(project => this.setState({ project, isLoading: false }))
      .catch(error => this.setState({ error, isLoading: false }));
  }

  render() {
    if (this.state.isLoading) return <p>Loading…</p>;
    if (this.state.error) return <p>Could not load the project.</p>;
    return <h2>{this.state.project.name}</h2>;
  }
}
```
== After (function)
```jsx
import { useEffect, useState } from 'react';

export function ProjectPanel({ projectId }) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/projects/${projectId}`, { signal: controller.signal })
      .then(response => response.json())
      .then(loaded => {
        setProject(loaded);
        setIsLoading(false);
      })
      .catch(caught => {
        if (caught.name === 'AbortError') return;
        setError(caught);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [projectId]);

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Could not load the project.</p>;
  return <h2>{project.name}</h2>;
}
```
:::

Read the two carefully and note what the conversion fixed for free:

- The class **never aborted on refetch**, only on unmount. Changing the project
  id twice quickly could resolve the requests out of order and render the wrong
  project. The Effect's cleanup runs before every re-run, so the previous
  request is aborted.
- The class had **no `AbortError` guard**, so aborting a request set an error
  into state. The function version ignores it.
- Mount and update logic were duplicated. In the Effect there is one path.

That is the usual outcome: the mechanical conversion surfaces a race the
lifecycle split was hiding.

> [!TIP]
> Once this component is a function, the next step is to stop hand-rolling the
> fetch entirely. See [Data fetching](../data-fetching/overview.md) and
> [Data-fetching libraries](../data-fetching/libraries.md) — a legacy app
> usually has thirty variants of the block above, each subtly different.

### Getting ready for the React Compiler

The React Compiler memoizes function components automatically, and it is the
single largest payoff available to a legacy codebase — the hand-written
`shouldComponentUpdate` and `useMemo` layer stops being your job. It has
prerequisites:

- **Function components.** Classes are skipped entirely. This is the strongest
  practical argument for conversion.
- **Rules of Hooks compliance**, checked rather than assumed. Install
  `eslint-plugin-react-hooks` v7 — flat config only, since v7 removed the
  `recommended-legacy` config — and get to zero errors.
- **Pure render.** No mutation of props, state or module scope during render.
  StrictMode adoption above is how you find the violations.
- **No mid-render ref reads.** They are impure and the compiler's analysis
  depends on purity.

The compiler bails out on components it cannot prove safe, so a non-compliant
codebase does not break — it just gets nothing. That makes readiness measurable:
turn the lint on, count the bailouts, work the number down.

See [React Compiler](../performance/react-compiler.md).

## Common mistakes

**Believing class components were removed.** They were not, they are not
deprecated, and error boundaries still require one. Nothing on the
[removed list](./removed-apis.md) is a class feature.

**Rewriting instead of migrating.** A rewrite pauses feature work, discards
years of encoded bug fixes, and finishes late. Conversion by feature never
pauses anything.

**Converting the hardest component first** to prove it can be done. It proves
the opposite when it takes three weeks. Start with leaves.

**Mapping each lifecycle method to its own Effect.** You get three Effects with
overlapping dependencies and a new class of bug. Group by concern.

**Copying props into state during conversion** because that is what
`getDerivedStateFromProps` did. Derive during render, or reset with a `key`.

**Turning StrictMode on everywhere at once.** A hundred simultaneous failures
gets it reverted. Wrap one clean subtree and grow it.

**Suppressing what StrictMode finds.** A `hasRun` ref that skips the second
Effect invocation hides a missing cleanup function. The double-invoke is the
test, not the bug.

**Leaving the un-prefixed `componentWillReceiveProps` in place** because it still
works. It is deprecated, the rename is a single codemod, and doing it now costs
nothing.

**Expecting the React Compiler to help classes.** It does not touch them. If the
compiler is the goal, conversion is the prerequisite, not an optional extra.

**Converting a component without converting its test.** A structural test
written against the class asserts on the thing you just changed. Do both in one
commit or the conversion looks like a regression.

## Related topics

- [React 18 to 19](./react-18-to-19.md) — the upgrade itself, which comes before
  any of this.
- [Removed APIs](./removed-apis.md) — the short list that actually blocks a
  legacy app from running on 19.
- [Deprecated APIs](./deprecated-apis.md) — what to clean up once you are green.
- [Error boundaries](../patterns/error-boundaries.md) — the one class you keep.
- [StrictMode](../core-concepts/strict-mode.md) — what the double-invoke is
  looking for, and why the findings are real.
- [React Compiler](../performance/react-compiler.md) — the payoff, and the
  readiness checklist in full.
- [Custom hooks](../hooks/custom-hooks.md) — where the logic sharing that
  classes could not do actually happens.
