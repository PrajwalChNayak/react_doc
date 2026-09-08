---
title: Routing
description: React Router, TanStack Router and framework routing compared, plus the patterns every router needs.
group: ecosystem
order: 10
status: current
related: [ecosystem/build-tooling, performance/code-splitting, accessibility/focus-management]
---

## Overview

React does not ship a router. It renders a tree; it has no opinion about URLs,
history, or which component belongs to `/invoices/42`. Routing is entirely a
third-party concern, and the three serious answers are **React Router**,
**TanStack Router**, and **the router built into a framework** such as the
Next.js App Router.

Everything on this page is a separate project with its own release cycle. None
of it is part of React, and none of it is maintained by the React team.

React Router is the default choice for a client-rendered application, and it is
what this page uses for examples. It offers three modes, from least to most
capable: **declarative** (`<Routes>` / `<Route>`), **data** (a route object
array with loaders and actions), and **framework** (a Vite plugin that adds file
conventions, SSR and typed route modules).

> [!NOTE]
> The package name changed. In v8 there is **only** `react-router` — the
> `react-router-dom` re-export package was removed. DOM-specific entry points
> live at `react-router/dom`. React Router v8 also lists `react >= 19.2.7` as a
> peer dependency, which sits above the security floor of 19.2.4.

## Why it exists

A single-page application replaces the browser's navigation model with its own,
and the browser's model is load-bearing. Users press Back. They bookmark. They
paste a link into Slack. They open a result in a new tab. A router's real job is
to give all of that back to you after you took it away.

That is more than string matching. A router owns:

- **Matching** a URL to a tree of components, most-specific-first.
- **History** — push, replace, and the Back and Forward buttons.
- **Parameters** — path segments and query strings, parsed and typed.
- **Data** — loading what a route needs, ideally before the component renders.
- **Transitions** — keeping the current page on screen while the next one loads.
- **Restoration** — scroll position on Back, and focus on every navigation.

The last two are what separates a router from a `switch` statement over
`location.pathname`, and they are the ones hand-rolled routers always get wrong.

## When to use it

Use a dedicated router when the URL should describe what the user is looking at
— which is almost always. If a screen is worth linking to, it deserves a route.

Put in the URL anything that should survive a refresh or be shareable: the
current page, the open tab, a search query, filters, sort order, pagination.
This is the cheapest state management there is, and it is why
[Choosing an approach](../state-management/choosing-an-approach.md) puts the URL
above every store.

## When not to use it

**A modal is usually not a route** — unless it is deep-linkable, like a photo
detail overlay. A confirmation dialog is component state.

**Widgets embedded in someone else's page** do not own the URL and should not
try to. Use local state.

**If you are already on a framework, use its router.** Adding React Router on
top of the Next.js App Router gives you two history managers fighting over the
same address bar.

## Basic example

Declarative mode is the smallest thing that works. One `<BrowserRouter>` at the
root, a `<Routes>` block, and one `<Route>` per screen.

```bash
npm install react-router
```

```jsx static="Needs a bundler and a real browser history — no sandboxed preview."
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, Outlet } from 'react-router';
import Dashboard from './pages/Dashboard';
import InvoiceList from './pages/InvoiceList';
import InvoiceDetail from './pages/InvoiceDetail';
import NotFound from './pages/NotFound';

function AppLayout() {
  return (
    <>
      <nav>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/invoices">Invoices</NavLink>
      </nav>
      {/* Whichever child route matched renders here. */}
      <main>
        <Outlet />
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="invoices" element={<InvoiceList />} />
          <Route path="invoices/:invoiceId" element={<InvoiceDetail />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
```

Three things are doing real work here. `<Route element={<AppLayout />}>` has no
`path`, so it wraps its children without adding a URL segment — that is a
*layout route*. `index` marks the child that renders at the parent's own URL.
And `<Outlet />` is the hole in the layout where the matched child appears; a
parent that forgets it renders a blank page and no error.

## How it works

### Data mode, and why it is the better default

Declarative mode matches URLs to components and stops there. Data mode moves the
route table into a plain array of objects, which lets the router see the whole
tree *before* rendering it. That single change unlocks loaders, actions, route
error boundaries, per-route code splitting, and scroll restoration.

```jsx static="Depends on a bundler, a router and a live API."
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import AppLayout from './AppLayout';
import ErrorPage from './ErrorPage';

const router = createBrowserRouter([
  {
    Component: AppLayout,
    ErrorBoundary: ErrorPage,
    children: [
      { index: true, lazy: () => import('./pages/Dashboard') },
      {
        path: 'invoices',
        lazy: () => import('./pages/InvoiceList'),
      },
      {
        path: 'invoices/:invoiceId',
        lazy: () => import('./pages/InvoiceDetail'),
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
```

`RouterProvider` is exported from both `react-router` and `react-router/dom`.
Use the `react-router/dom` one in a browser app: it wires up `flushSync` from
`react-dom` so navigations that need to be synchronous actually are.

> [!TIP]
> `lazy` is per-route code splitting that the *router* drives, so it can start
> the download the moment a link is hovered or a navigation begins — before
> React renders anything. That beats a bare `React.lazy()` in the element tree,
> which cannot start until render. See
> [Code splitting](../performance/code-splitting.md).

### The four hooks you will actually use

| Hook | Returns | Use it for |
|---|---|---|
| `useParams()` | An object of dynamic segments | Reading `:invoiceId` out of the path |
| `useNavigate()` | A `navigate(to, options)` function | Redirecting after a submit or a login |
| `useLocation()` | `{ pathname, search, hash, state, key }` | Analytics, breadcrumbs, "where did I come from" |
| `useSearchParams()` | `[URLSearchParams, setter]` | Filters, sort, pagination, tabs |

`useSearchParams` is the underused one. Filter and pagination state in
`useState` breaks the Back button, breaks refresh, and makes bug reports
unreproducible. In the URL it costs the same and fixes all three.

```jsx static="Requires a router context to provide the current location."
import { useSearchParams } from 'react-router';

export default function InvoiceFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? 'all';

  function update(value) {
    // Merge, do not replace: keep every other param the user set.
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    // Filters refine the current view; they are not navigations.
    setSearchParams(next, { replace: true });
  }

  return (
    <select value={status} onChange={(e) => update(e.target.value)}>
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="paid">Paid</option>
    </select>
  );
}
```

### Navigation is already a transition

In data mode the router runs navigations inside a React transition, so the
current page stays interactive while the next route's code and data load. You
do not need to wrap `navigate()` in `startTransition`.

You *do* need `startTransition` when **you** cause a lazy component to mount
from your own state — a tab strip that swaps a lazily-imported panel, for
example. Without it React unmounts the current panel and shows the Suspense
fallback; with it React keeps the old panel on screen until the new one is
ready.

```jsx static="Depends on route modules that only exist in a real bundle."
import { Suspense, lazy, startTransition, useState } from 'react';

const ReportPanel = lazy(() => import('./panels/ReportPanel'));
const AuditPanel = lazy(() => import('./panels/AuditPanel'));

export default function SettingsTabs() {
  const [tab, setTab] = useState('report');

  return (
    <>
      {/* Keep the current panel visible while the next chunk downloads. */}
      <button onClick={() => startTransition(() => setTab('report'))}>
        Report
      </button>
      <button onClick={() => startTransition(() => setTab('audit'))}>
        Audit
      </button>
      <Suspense fallback={<p>Loading panel…</p>}>
        {tab === 'report' ? <ReportPanel /> : <AuditPanel />}
      </Suspense>
    </>
  );
}
```

## Common patterns

### Protected routes

Guard a whole subtree with a pathless layout route. Record where the user was
going so you can send them back after login — losing that is the most common
auth-flow bug.

```jsx static="Needs a router context and a real session."
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from './session';

export default function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') return <p>Checking your session…</p>;

  if (status === 'signed-out') {
    // `replace` keeps the protected URL out of history, so Back after
    // logging in does not bounce the user straight to the login page again.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
```

Then wrap the private routes with it — `<Route element={<RequireAuth />}>` with
no `path`, holding every protected route as a child. One guard, any number of
routes, and adding a route to the subtree protects it automatically.

> [!WARNING]
> A client-side route guard is a **user experience**, not a security boundary.
> Anyone can open devtools and render the component. Every protected route needs
> the same check on the server that serves its data.

### Scroll and focus restoration

Two separate problems, and only one of them has a component.

**Scroll** is handled for you. Render `<ScrollRestoration />` once, near the
root, in framework or data mode. It saves the scroll offset per history entry in
`sessionStorage` and restores it on Back. It is not available in declarative
mode, which is one more reason to prefer data mode.

**Focus is yours.** After a client-side navigation the DOM changes but focus
stays wherever it was — usually on a link that no longer exists, which collapses
focus to `<body>`. Screen reader users are then silently stranded at the top of
a page they were never told had changed. Move focus to the new page's heading
container on every navigation:

The shape is one layout component holding a ref to its `<main>`, an Effect keyed
on `useLocation().pathname`, and `tabIndex={-1}` on that element so it can take
programmatic focus without joining the tab order. Pair it with a live region
announcing the new page title.

[Focus management](../accessibility/focus-management.md) has the working code
under "Route changes in a single-page app"; see also
[Announcements](../accessibility/announcements.md).

## Advanced example

### Choosing between the three

| | React Router | TanStack Router | Framework routing (Next.js App Router) |
|---|---|---|---|
| Route definition | JSX, route objects, or file conventions | Typed route objects or file-based codegen | File system |
| Type safety of params and search | Typed in framework mode via codegen | Inferred end-to-end, including validated search params | Params typed; search params are strings |
| Data loading | `loader` per route, parallel by match | `loader` per route, integrates with TanStack Query | Server Components `await` directly |
| Server Components | Experimental, subject to breaking changes in minors | No | Yes — the whole model |
| Search params as state | `useSearchParams`, string based | First-class, schema-validated and typed | Manual |
| Rendering modes | SPA, SSR, or prerendered | SPA, SSR via TanStack Start | SSR, streaming, static, RSC |
| Deployment | Static host works for SPA mode | Static host works for SPA mode | Needs a Node or edge runtime for the full model |
| Cost of adoption | Lowest — drop into any Vite app | Low, but a new mental model | Highest — it owns your whole app |

Read it this way:

- **Client-rendered app, already on Vite, want the shortest path.** React Router.
- **Large TypeScript app where wrong route parameters are a recurring bug.**
  TanStack Router. Its selling point is that `/invoices/$invoiceId` produces a
  typed `invoiceId`, and that search params are parsed and validated by a schema
  rather than read as loose strings.
- **You want Server Components, streaming, and server-side data by default.**
  Use a framework and its router. Do not bolt a client router onto it. See
  [Build tooling](./build-tooling.md).

### Everything together

A production route table composes the pieces above into one array: a root route
whose `Component` renders the app chrome, `<Outlet />` and `<ScrollRestoration />`;
a pathless `{ Component: RequireAuth, children: [...] }` node holding every
private route; `lazy` on each leaf; and `ErrorBoundary` on the root.

```jsx static="A route table — requires a bundler and a server to run against."
import { createBrowserRouter } from 'react-router';
import RootLayout from './RootLayout';
import RouteError from './RouteError';
import RequireAuth from './RequireAuth';

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    ErrorBoundary: RouteError,
    children: [
      { index: true, lazy: () => import('./pages/Marketing') },
      { path: 'login', lazy: () => import('./pages/Login') },
      {
        Component: RequireAuth,
        children: [
          { path: 'invoices', lazy: () => import('./pages/InvoiceList') },
          { path: 'invoices/:invoiceId', lazy: () => import('./pages/InvoiceDetail') },
        ],
      },
      { path: '*', lazy: () => import('./pages/NotFound') },
    ],
  },
]);
```

`ErrorBoundary` on the root catches thrown errors and failed loaders for every
descendant that does not define its own, and it renders *inside* the layout — so
a broken invoice page still shows your navigation. That is the behavior you
would otherwise build by hand with
[error boundaries](../patterns/error-boundaries.md).

> [!LEGACY]
> **React Router v5 to v6, kept for maintaining old code.** v6 (November 2021)
> was the largest break in the library's history, and v7 and v8 are small by
> comparison. If you are still on v5, this is the table you need.
>
> | v5 | v6 and later | Note |
> |---|---|---|
> | `<Switch>` | `<Routes>` | Also changed from first-match to best-match |
> | `component={Home}` | `element={<Home />}` | You now pass an element, so props are yours to set |
> | `render={() => <Home />}` | `element={<Home />}` | The `render` and `children` render-props are gone |
> | `exact` | *(nothing)* | Matching is exact by default; use `path="x/*"` to opt out |
> | `useHistory()` | `useNavigate()` | `history.push(to)` becomes `navigate(to)` |
> | `history.replace(to)` | `navigate(to, { replace: true })` | |
> | `history.goBack()` | `navigate(-1)` | |
> | `<Redirect to="/x" />` | `<Navigate to="/x" replace />` | `<Navigate>` does not replace by default |
> | Nested `<Route>` inside a component | `children` plus `<Outlet />` | Nesting is now declared in the route tree |
> | `useRouteMatch()` | `useMatch()` / `useMatches()` | |
> | `<NavLink activeClassName="on">` | `className={({ isActive }) => …}` | `activeStyle` became `style={({ isActive }) => …}` |
> | `react-router-dom` | `react-router` | The split package was removed in v8 |
>
> Upgrade in order: v5 → v6 → v7 → v8. Skipping majors means debugging several
> unrelated breaks at once.

## Common mistakes

**Putting filters, tabs and pagination in `useState`.** The Back button stops
working, refresh loses the view, and nobody can send you a link to the thing
they are looking at. Use `useSearchParams`.

**Forgetting `<Outlet />` in a layout route.** The child route matches, the
router reports success, and the page renders empty with no warning.

**Treating a client-side guard as authorization.** It hides UI. It does not
protect data. Check on the server too.

**Never moving focus after a navigation.** The page changes, focus does not, and
keyboard and screen reader users lose their place on every link click.

**Pushing a history entry for every filter change.** Ten dropdown tweaks means
ten presses of Back to leave the page. Use `{ replace: true }` for state that
refines the current view rather than leaving it.

**Wrapping `navigate()` in `startTransition`.** Data-mode navigations already
run in a transition; save it for lazy components you mount from your own state.

**Rendering `<a href>` for internal links.** It works, and it throws away the
entire application: full document reload, lost state, blank flash. Use `<Link>`.

**Adding React Router inside a framework that already routes.** Two routers, one
address bar. Pick the framework's.

**Assuming `react-router-dom` still exists.** In v8 there is one package,
`react-router`, plus the `react-router/dom` entry point.

## Related topics

- [Build tooling](./build-tooling.md) — the frameworks whose routers replace
  this one, and what each gives you.
- [Code splitting](../performance/code-splitting.md) — why route boundaries are
  the right place to split a bundle.
- [Focus management](../accessibility/focus-management.md) — what to do after
  every client-side navigation.
- [Choosing an approach](../state-management/choosing-an-approach.md) — why the
  URL outranks every store for view state.
- [Data libraries](./data-libraries.md) — pairing a router's loaders with a
  cache instead of duplicating one.
- [Server Components](../server-react/server-components.md) — the routing model
  frameworks use instead of a client route table.
