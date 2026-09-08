---
title: Error boundaries
description: Catching render errors with a class component, and the React 19 root options that changed error logging.
group: patterns
order: 20
status: current
related: [patterns/composition, data-fetching/suspense, core-concepts/strict-mode, reference/troubleshooting]
---

## Overview

An error boundary is a component that catches errors thrown while rendering its
subtree and shows a fallback instead of unmounting your whole app.

**This is one of exactly two places where a class component is still required.**
React has no hook-based error boundary. `static getDerivedStateFromError` and
`componentDidCatch` are lifecycle methods, and there is no hook equivalent — so
you write a class once, and use it from function components everywhere else.

That is not a legacy wart to apologize for. It is the current, supported API:

```jsx
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error !== null) {
      return <p>Something went wrong.</p>;
    }
    return this.props.children;
  }
}
```

React 19 also added three root-level callbacks — `onUncaughtError`,
`onCaughtError` and `onRecoverableError` — which handle *reporting*. They do not
render a fallback, so they complement boundaries rather than replace them.

## Why it exists

Without a boundary, an error thrown during render unmounts the entire React
tree. React does this deliberately: a half-rendered UI built from corrupt state
is worse than no UI, especially for anything involving money or permissions.

A boundary lets you scope that blast radius. One failing chart becomes one
"could not load" panel instead of a blank page, and you get a place to log the
error with the component stack that produced it.

## When to use it

- **Around each route.** A broken page should not take down the shell, the
  navigation or the session.
- **Around independent widgets.** Dashboards, embedded third-party components,
  markdown or chart renderers fed by user data, anything that parses.
- **At the top of the app**, as the last resort that renders a real error page
  with a reload action.
- **Around lazy or data-suspending subtrees**, to catch failed chunk loads and
  rejected promises.

## When not to use it

An error boundary is a crash handler, not a control-flow tool. Do not use it for
outcomes you expected — a 404, a failed validation, an empty result. Those are
values, and they belong in your normal render logic.

Do not wrap every component either. A boundary you cannot write a meaningful
fallback for is a boundary that hides bugs; if the honest fallback is "nothing
useful," let the error rise to a level where the fallback means something.

## Basic example

A production-shaped boundary takes a `fallback` render prop (so callers can show
something specific), exposes a `reset`, and accepts a `resetKey` so navigating
away from the failure clears it automatically.

```jsx live
import { Component, useState } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Send to your reporting service here.
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error !== null && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error !== null) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}

function RevenueChart({ shouldFail }) {
  if (shouldFail) {
    throw new Error('Cannot read property "total" of undefined');
  }
  return <p style={{ margin: 0 }}>Revenue is up 12% this quarter.</p>;
}

export default function Dashboard() {
  const [shouldFail, setShouldFail] = useState(false);

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <ErrorBoundary
        resetKey={shouldFail}
        fallback={(error, reset) => (
          <div style={{ border: '1px solid #fca5a5', padding: 12, borderRadius: 8 }}>
            <strong>This chart failed to render.</strong>
            <p style={{ fontFamily: 'monospace', fontSize: 12 }}>{error.message}</p>
            <button
              type="button"
              onClick={() => {
                setShouldFail(false);
                reset();
              }}
            >
              Try again
            </button>
          </div>
        )}
      >
        <RevenueChart shouldFail={shouldFail} />
      </ErrorBoundary>

      <button type="button" onClick={() => setShouldFail(true)}>
        Break the chart
      </button>
    </div>
  );
}
```

The same boundary, typed:

```tsx
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
  resetKey?: unknown;
  onError?: (error: Error, componentStack: string) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info.componentStack ?? '');
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error !== null && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error !== null) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}
```

`getDerivedStateFromError` receives whatever was thrown. JavaScript allows
throwing any value, so treat `error` defensively in your fallback rather than
assuming `.message` exists.

## How it works

The two methods run in different phases, and the split is the point.

| Method | Phase | Purpose | Side effects allowed |
|---|---|---|---|
| `static getDerivedStateFromError(error)` | render | Return the state that shows the fallback | No — it must be pure |
| `componentDidCatch(error, info)` | commit | Log the error and its `info.componentStack` | Yes |

`info.componentStack` is the chain of components that led to the throw. In
production the names are minified, so decode it with source maps.

React walks up from the throwing component and uses the **nearest boundary
above it in the React tree**. That is the React tree, not the DOM tree — which
matters for [portals](./portals.md), whose contents are protected by the
boundary that renders the portal, not by whatever wraps the target DOM node.

### What boundaries do not catch

| Not caught | Why | What to do |
|---|---|---|
| Event handlers | Not part of render | `try` / `catch`, then set state |
| `setTimeout`, `requestAnimationFrame`, raw promises | Outside React's call stack | Catch, store in state, throw during render |
| Server-side rendering | `renderToString` and friends do not run boundaries the same way | Handle errors around the SSR call; hydration errors surface via `onRecoverableError` |
| Errors thrown by the boundary itself | It cannot catch its own render | Keep fallbacks trivial; nest a second boundary above |

Errors thrown inside `startTransition` and inside `<form action>` **are** caught
by boundaries, because those run through React's rendering pipeline.

The escape hatch for the first two rows is to convert an out-of-band error into
a render-phase error:

```jsx
import { useState } from 'react';

export function SaveButton() {
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  if (error !== null) {
    // Rethrowing during render puts it in front of the nearest boundary.
    throw error;
  }

  async function save() {
    try {
      await Promise.reject(new Error('PATCH /settings failed: 503'));
      setSaved(true);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <button type="button" onClick={save}>
      {saved ? 'Saved' : 'Save settings'}
    </button>
  );
}
```

Rendered on its own, this component unmounts the tree. Wrapped in the boundary
from the previous example, the fallback appears — which is the whole trick:
you moved the error into a phase React watches.

### React 19 root options

React 18 logged a caught error up to three times: the original throw, a React
re-throw, and a separate `console.error` describing where it happened. React 19
logs **one** error with all the information, and routes errors through three
callbacks you pass to `createRoot` or `hydrateRoot`.

```jsx static="Runs at the app entry point, outside the component tree."
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { report } from './reporting.js';

const container = document.getElementById('root');

if (container !== null) {
  const root = createRoot(container, {
    // An Error Boundary rendered a fallback. You still want to know.
    onCaughtError(error, errorInfo) {
      report({ error, level: 'handled', componentStack: errorInfo.componentStack });
    },
    // Nothing caught it. The tree unmounted.
    onUncaughtError(error, errorInfo) {
      report({ error, level: 'fatal', componentStack: errorInfo.componentStack });
    },
    // React recovered on its own — most often a hydration mismatch.
    onRecoverableError(error, errorInfo) {
      report({ error, level: 'recovered', componentStack: errorInfo.componentStack });
    },
  });

  root.render(<App />);
}
```

Each callback receives `(error, errorInfo)` where `errorInfo` has a
`componentStack`. When to use which:

- **`onCaughtError`** — a boundary handled it. Without this hook you never learn
  about degraded UI, because the user sees a tidy fallback and never reports it.
- **`onUncaughtError`** — no boundary handled it. Treat as fatal and page
  someone.
- **`onRecoverableError`** — React retried and succeeded. Hydration mismatches
  are the common case; some of these carry the original cause as `error.cause`.

> [!TIP]
> Adding `onCaughtError` is usually the highest-value change you can make to an
> existing app's error reporting. Boundaries silence errors by design; this is
> how you hear them again.

## Common patterns

### Placement strategy

Three levels, each with a different fallback:

```jsx
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { Shell } from './Shell.jsx';
import { Routes } from './Routes.jsx';
import { RevenueWidget } from './RevenueWidget.jsx';

export function App({ pathname }) {
  return (
    <ErrorBoundary fallback={() => <FullPageError />}>
      <Shell>
        <ErrorBoundary resetKey={pathname} fallback={() => <RouteError />}>
          <Routes />
          <ErrorBoundary fallback={() => <p>Revenue is unavailable.</p>}>
            <RevenueWidget />
          </ErrorBoundary>
        </ErrorBoundary>
      </Shell>
    </ErrorBoundary>
  );
}

function FullPageError() {
  return <p>The app crashed. Reload the page.</p>;
}

function RouteError() {
  return <p>This page failed to load.</p>;
}
```

The `resetKey={pathname}` on the route boundary is what makes navigation
recover: without it, a user who hits an error is stuck on the fallback even
after clicking a different link, because boundary state survives until the
boundary itself unmounts or is reset.

### With Suspense

Put the error boundary **outside** the Suspense boundary. A rejected promise or
a failed lazy chunk throws during render, so the boundary above it catches it —
and keeping the fallback outside means the error UI is not itself waiting on the
data that failed.

```jsx
import { Suspense, lazy } from 'react';
import { ErrorBoundary } from './ErrorBoundary.jsx';

const ReportEditor = lazy(() => import('./ReportEditor.jsx'));

export function ReportsPage() {
  return (
    <ErrorBoundary fallback={(error, reset) => (
      <button type="button" onClick={reset}>Retry loading the editor</button>
    )}>
      <Suspense fallback={<p>Loading the editor…</p>}>
        <ReportEditor />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### With StrictMode

[StrictMode](../core-concepts/strict-mode.md) double-invokes render in
development, so a component that throws during render throws twice. Your
boundary still shows one fallback, but `componentDidCatch` may run for both
attempts — keep logging idempotent, or deduplicate on the server.

React also re-throws caught errors to `window` in development so browser devtools
can break on them. In production it does not, which is why `componentDidCatch`
or `onCaughtError` is your only signal there.

### react-error-boundary

Most teams do not hand-roll this. The `react-error-boundary` package wraps the
same class API with a friendlier surface: a fallback component prop, reset keys,
an `onReset` callback, and a hook for pushing an event-handler or async error
into the nearest boundary without the manual rethrow shown above.

```bash
npm install react-error-boundary
```

Use it when you want the ergonomics; write your own when you want your logging,
your fallback contract and no dependency. Either way the underlying mechanism is
the class in this page.

## Common mistakes

**Expecting event handler errors to be caught.** They are not. A `throw` inside
`onClick` reaches `window.onerror`, not your boundary. Catch it and set state.

**Expecting `await` to be caught.** An awaited rejection outside a transition
never touches React's render stack. Store it and throw during render.

**One boundary at the root and nothing else.** Technically a boundary, but it
turns any component error into a blank app — which is what you were trying to
avoid.

**A fallback that can throw.** Fallbacks run inside the boundary's own render,
so a fallback that dereferences `error.response.data.message` will crash the
boundary itself and escalate to the next one up.

**Forgetting to reset.** Boundary state is sticky. Without a `resetKey` or an
explicit reset action, the user's only recovery is a full page reload.

**Using a boundary for expected failures.** A 404 is data. Render it.

**Silence in production.** A boundary with no `componentDidCatch` and no
`onCaughtError` root option means broken features never appear in your logs.

## Related topics

- [Suspense](../data-fetching/suspense.md) — the loading counterpart; pair every
  Suspense boundary with an error boundary above it.
- [Composition](./composition.md) — a boundary is a `children` wrapper, and
  where you place it is a composition decision.
- [StrictMode](../core-concepts/strict-mode.md) — why your error logs double in
  development.
- [Portals](./portals.md) — boundaries follow the React tree, so portal content
  is covered by the boundary that renders it.
- [Troubleshooting](../reference/troubleshooting.md) — decoding component stacks
  and common React error messages.
