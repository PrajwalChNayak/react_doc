---
title: Code splitting
description: Ship less JavaScript on first load with lazy() and Suspense, without making the app feel slower.
group: performance
order: 40
status: current
related: [performance/overview, data-fetching/suspense, ecosystem/routing]
---

## Overview

Code splitting breaks your bundle into chunks the browser downloads on demand.
The user pays for the settings page when they open the settings page, not on
first load.

React's part of this is two APIs:

- `lazy(load)` turns a dynamic `import()` into a component. React does not call
  `load` until something first tries to render that component.
- `<Suspense fallback={...}>` displays something while the chunk is in flight.

Everything else — how chunks are named, how they are split, whether they are
preloaded — belongs to your bundler.

> [!BEST-PRACTICE]
> Split at route boundaries first. It is the highest ratio of bytes saved to
> complexity added, and it matches how users actually navigate.

## Why it exists

JavaScript is the most expensive kind of byte. An image that arrives late shows
a placeholder; JavaScript that arrives late blocks interaction, because it must
be downloaded, parsed, compiled and executed before the page responds.

A single-bundle app makes every user pay for every feature. The admin dashboard,
the rich text editor, the charting library and the PDF exporter all download
before the login screen paints. That is an LCP problem you cannot memoize your
way out of.

Splitting inverts the default: pay for what you render.

## When to use it

**Routes.** The obvious and largest win. Users land on one route and often never
visit the others.

**Heavy, conditionally rendered components.** A modal with a date-range picker,
a WYSIWYG editor, a charting library, a map, a video player. These are large
dependencies gated behind an interaction.

**Rarely used branches.** An admin panel behind a role check. An export flow
three clicks deep. A debug overlay.

**Large third-party dependencies with a single entry point.** If one screen
pulls in a 300 KB library, that library should live in that screen's chunk.

## When not to use it

**Small components.** A chunk has overhead: an extra request, a Suspense
boundary, and a possible loading flash. Splitting a 3 KB component makes the app
slower and more complicated.

**Anything above the fold on the initial route.** Splitting content the user
sees immediately converts one download into two sequential downloads. That is
strictly worse.

**Components rendered on nearly every page.** The shared header does not need
its own chunk. It needs to be in the main one.

**As a substitute for removing the dependency.** If you pull in a 200 KB date
library to format one timestamp, splitting the chunk hides the problem.
`Intl.DateTimeFormat` is built into the browser and costs nothing.

## Basic example

`lazy` is declared at module scope; `<Suspense>` sits above the place the lazy
component renders.

```jsx live
import { lazy, Suspense, useState } from 'react';

function RevenueReport() {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    id: index,
    month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][index],
    revenue: 12000 + index * 1450,
  }));

  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.month}</td>
            <td>${row.revenue.toLocaleString('en-US')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Stands in for lazy(() => import('./RevenueReport.jsx')) so the preview can
// run without a bundler. The 700 ms delay imitates a chunk download.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const LazyRevenueReport = lazy(async () => {
  await delay(700);
  return { default: RevenueReport };
});

export default function ReportsPage() {
  const [showReport, setShowReport] = useState(false);

  return (
    <div>
      <button onClick={() => setShowReport(true)} disabled={showReport}>
        Open revenue report
      </button>
      <div style={{ minHeight: 160, marginTop: 12 }}>
        {showReport ? (
          <Suspense fallback={<p>Loading report…</p>}>
            <LazyRevenueReport />
          </Suspense>
        ) : (
          <p>The report chunk has not been requested yet.</p>
        )}
      </div>
    </div>
  );
}
```

The real version replaces the hand-made promise with a dynamic import:

```jsx static="A dynamic import needs a bundler, so this cannot run in the sandboxed preview."
import { lazy } from 'react';

const RevenueReport = lazy(() => import('./RevenueReport.jsx'));
```

Note the reserved `minHeight` in the live version. A fallback that is much
smaller than the content it replaces produces a layout shift when the real
content arrives, which is a CLS regression you introduced while fixing an LCP
problem.

## How it works

### The `lazy` call must be at module scope

React uses the component identity returned by `lazy` as the cache key for the
loaded module. Create it during render and you get a new component type on every
render, which means React unmounts the old tree and mounts a fresh one — losing
all of its state.

```jsx
import { lazy } from 'react';

export function Editor() {
  // 🔴 Bad: This will cause all state to be reset on re-renders
  const MarkdownPreview = lazy(() => import('./MarkdownPreview.js'));
  return <MarkdownPreview />;
}
```

```jsx
import { lazy } from 'react';

// ✅ Good: Declare lazy components outside of your components
const MarkdownPreview = lazy(() => import('./MarkdownPreview.js'));

export function Editor() {
  return <MarkdownPreview />;
}
```

The same rule applies to a `lazy` created inside a custom hook or a `useMemo`
that can be invalidated.

### Suspense boundaries decide what the user sees

The nearest `<Suspense>` above the lazy component provides the fallback. Where
you put that boundary is a design decision:

- A boundary around the whole route means the entire page is replaced by a
  spinner.
- A boundary around the lazy panel only means the rest of the page stays on
  screen and the panel shows a placeholder.

Prefer the tighter boundary. Replacing a working page with a spinner is a
downgrade the user can feel.

### Errors need a boundary too

A chunk request can fail — a deploy invalidated the file, the network dropped.
React surfaces that as a render error, so wrap lazy routes in an
[error boundary](../patterns/error-boundaries.md) that offers a retry rather
than showing a blank screen.

## Common patterns

### Route-level splitting

```jsx static="Depends on a router and a bundler."
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';

const Dashboard = lazy(() => import('./routes/Dashboard.jsx'));
const Settings = lazy(() => import('./routes/Settings.jsx'));
const AdminPanel = lazy(() => import('./routes/AdminPanel.jsx'));

export function AppRoutes() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Suspense>
  );
}
```

### Wrap the navigation in a transition

Without a transition, navigating replaces the current page with the fallback the
instant you click. With `startTransition`, React keeps the old page on screen
while the new chunk loads, and you can show a subtle pending indicator instead.

```jsx static="Depends on a router and a bundler."
import { useTransition } from 'react';

export function NavLink({ href, children, onNavigate }) {
  const [isPending, startTransition] = useTransition();

  function handleClick(event) {
    event.preventDefault();
    startTransition(() => onNavigate(href));
  }

  return (
    <a href={href} onClick={handleClick} aria-busy={isPending}>
      {children}
    </a>
  );
}
```

See [useTransition](../hooks/use-transition.md) for the full behavior of
`isPending`.

### Preload on intent

The latency you cannot remove, you can hide. Start the download when the user
hovers or focuses the link — typically 100–300 ms before the click.

```jsx static="Depends on a bundler for the dynamic import."
import { lazy, Suspense, useState } from 'react';

// One module-scope function, called by both the preloader and `lazy`.
const loadChartPanel = () => import('./ChartPanel.jsx');
const ChartPanel = lazy(loadChartPanel);

export function AnalyticsSection() {
  const [showChart, setShowChart] = useState(false);

  return (
    <div>
      <button
        onMouseEnter={loadChartPanel}
        onFocus={loadChartPanel}
        onClick={() => setShowChart(true)}
      >
        Show chart
      </button>
      <Suspense fallback={<div style={{ height: 240 }} />}>
        {showChart ? <ChartPanel /> : null}
      </Suspense>
    </div>
  );
}
```

Dynamic imports are cached by the module system, so calling `loadChartPanel`
twice downloads once. Hovering a link the user never clicks costs one wasted
request; measure before preloading dozens of them.

> [!TIP]
> For assets rather than modules — fonts, hero images, the CSS a route needs —
> React 19 provides `preload()`, `preinit()`, `preconnect()` and
> `prefetchDNS()` from `react-dom`. They express the same intent to the browser
> at a lower level.

### Separate code that changes rarely

Most bundlers let you group vendor code into its own chunk. Code that changes
rarely (framework, large libraries) belongs apart from code that changes on
every deploy, so a release does not invalidate everything in the user's cache.

### Measure and set a budget

Splitting without measuring produces a hundred tiny chunks and a slower app.

**Analyze the bundle.** Every major bundler has an analyzer that shows what is
in each chunk and how large it is, sorted by size. Run it before you split so
you know which dependency is the problem. The answer is usually one or two
libraries, not a long tail.

**Set a budget and enforce it in CI.** A concrete ceiling — for example, 200 KB
of compressed JavaScript on the critical path — turns bundle size into something
a pull request can fail on. Tools like `size-limit` do this.

```json
{
  "size-limit": [
    {
      "path": "dist/assets/index-*.js",
      "limit": "200 KB"
    }
  ]
}
```

**Watch the request waterfall, not only the total.** Five sequential chunk
requests, each waiting on the previous one, can be slower than one larger
download. Splitting has a depth limit.

## Advanced example

Combining a transition with a tight boundary so the outgoing content stays
visible while the incoming chunk arrives.

```jsx live
import { lazy, Suspense, useState, useTransition } from 'react';

function makeTabModule(label, body) {
  function TabBody() {
    return (
      <div>
        <h4>{label}</h4>
        <p>{body}</p>
      </div>
    );
  }
  return () =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ default: TabBody }), 600),
    );
}

const TABS = {
  usage: lazy(makeTabModule('Usage', 'Requests, seats and overage this month.')),
  billing: lazy(makeTabModule('Billing', 'Invoices, payment method and tax ID.')),
  audit: lazy(makeTabModule('Audit', 'Every administrative action, timestamped.')),
};

export default function AccountTabs() {
  const [tab, setTab] = useState('usage');
  const [isPending, startTransition] = useTransition();
  const ActiveTab = TABS[tab];

  return (
    <div>
      {Object.keys(TABS).map((name) => (
        <button
          key={name}
          onClick={() => startTransition(() => setTab(name))}
          disabled={name === tab}
        >
          {name}
        </button>
      ))}
      <div style={{ minHeight: 120, opacity: isPending ? 0.5 : 1 }}>
        <Suspense fallback={<p>Loading tab…</p>}>
          <ActiveTab />
        </Suspense>
      </div>
    </div>
  );
}
```

Switch tabs twice. The first visit to a tab shows the fallback; the second is
instant, because the module is cached. During the transition the previous tab
stays on screen at reduced opacity instead of being replaced.

## Common mistakes

**Creating the `lazy` component during render.** State resets on every parent
render, and the symptom (a form that clears itself) looks nothing like the
cause.

**No Suspense boundary above the lazy component.** React throws. Every lazy
component needs a boundary somewhere above it.

**One boundary at the app root.** Any lazy component anywhere blanks the entire
application. Put boundaries where the loading state should appear.

**A fallback of the wrong size.** A one-line spinner replacing a 600-pixel panel
guarantees a layout shift. Match the fallback to the content's dimensions.

**Splitting the first screen.** Content the user sees immediately should be in
the initial bundle. Splitting it adds a round trip to the critical path.

**Forgetting the error case.** Chunk loads fail in the real world, particularly
across deploys. Without an error boundary the user gets a blank page and no way
back.

**Assuming splitting reduces total bytes.** It does not — it redistributes them,
and adds a little overhead. To reduce total bytes, remove dependencies or move
work to [the server](../server-react/overview.md).

## Related topics

- [Suspense](../data-fetching/suspense.md) — the boundary that makes lazy
  loading possible, and how it behaves with data.
- [useTransition](../hooks/use-transition.md) — keeping the current screen
  visible while the next one loads.
- [Error boundaries](../patterns/error-boundaries.md) — recovering from a failed
  chunk request.
- [Routing](../ecosystem/routing.md) — where route-level splitting is wired up.
- [Build tooling](../ecosystem/build-tooling.md) — chunking, analysis and
  budgets.
- [Performance overview](./overview.md) — deciding whether bundle size is your
  bottleneck.
