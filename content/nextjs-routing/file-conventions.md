---
title: Routing File Conventions
description: How folders and special files in the app directory become routes, and the order in which Next.js nests them.
group: nextjs-routing
order: 10
status: current
related: [nextjs-routing/pages-and-layouts, nextjs-routing/dynamic-segments, nextjs-errors/error-boundaries, data-fetching/suspense]
---

## Overview

The App Router maps the file system to URLs. **Folders** define URL segments.
**Special files** inside a folder define the UI for that segment: `page`,
`layout`, `template`, `loading`, `error`, `not-found`, `default`, and `route`.

Next.js reads those files and composes them into one React tree per route. A
`loading` file becomes a Suspense boundary, an `error` file becomes an error
boundary, and a `layout` wraps everything below it. You never write that
wiring yourself.

This page is the guide: what each file is for and how they nest. For the
one-table summary of every convention, including metadata files, see the
[file conventions reference](../nextjs-reference/file-conventions.md).

| File | Purpose | Component type |
|---|---|---|
| `page.tsx` | Makes a segment publicly reachable and renders its unique UI | Server Component by default |
| `layout.tsx` | Shared UI that persists across navigations between its children | Server Component by default |
| `template.tsx` | Like a layout, but remounts when its child segment changes | Server Component by default |
| `loading.tsx` | Fallback shown while the segment below streams in | Server Component by default |
| `error.tsx` | Fallback for errors thrown below it | **Must** be a Client Component |
| `not-found.tsx` | UI for `notFound()` in the segment (and unmatched URLs at the root) | Server Component by default |
| `default.tsx` | Fallback for a parallel route slot that has no match | Server Component by default |
| `route.ts` | An HTTP endpoint (a Route Handler) instead of UI | Not a component |
| `global-error.tsx` | Replaces the root layout when the root layout itself throws | **Must** be a Client Component |

The rest of the Routing section builds on these files:

- [Pages and layouts](./pages-and-layouts.md) and [dynamic segments](./dynamic-segments.md)
  cover the everyday route shapes.
- [Typed routes](./typed-routes.md) explains the generated `PageProps`,
  `LayoutProps` and `RouteContext` types.
- [Route groups](./route-groups.md), [parallel routes](./parallel-routes.md) and
  [intercepting routes](./intercepting-routes.md) change how folders map to URLs.
- [Linking and navigation](./linking-and-navigation.md) and
  [redirects](./redirects.md) move users between routes.
- [Root params](./root-params.md) and [internationalization](./internationalization.md)
  cover a dynamic segment above the root layout, such as `app/[lang]`.

The [routing example app](../../examples/nextjs/routing/README.md) puts most of
these conventions in one runnable project.

## Why it exists

A router needs to know three things for every URL: what to render, what to
share with neighboring URLs, and what to show while loading or failing. In a
client-side router you express that in a route config and wrap boundaries by
hand. The App Router moves it into the file system.

That has two practical effects. The boundary structure of your app is visible in
the folder tree, so a reviewer can see where loading and error states exist
without reading components. And because Next.js knows the structure ahead of
time, it can prefetch a layout and a loading state without rendering the page,
and keep a layout mounted while only the page below it changes.

## When to use it

Use the special files whenever a segment needs the behavior they encode:

- Add `page.tsx` to make a URL exist.
- Add `layout.tsx` for navigation chrome or providers that should survive
  navigation between sibling pages.
- Add `loading.tsx` to a segment whose page awaits slow or request-time data, so
  navigation shows feedback immediately.
- Add `error.tsx` where a failure should replace only part of the screen.
- Add `route.ts` for a JSON endpoint, webhook, or file download.

## When not to use it

**Do not create a folder for every component.** A folder without a `page` or
`route` file is not routable, so colocating components inside `app/` is safe.
If you want to be explicit, prefix the folder with an underscore (`_components`),
which opts it and all its subfolders out of routing.

**Do not use `template.tsx` as a default.** It throws away Client Component state
and re-runs Effects on every navigation. Reach for it only when you want that
reset.

**Do not put `route.ts` and `page.tsx` in the same folder.** A segment is either
UI or an endpoint. Next.js reports a conflict if both exist at the same level.

## Basic example

A dashboard segment with its own layout, loading state, error state, and page:

```text
app/
├── layout.tsx          ← root layout (required, renders <html> and <body>)
├── page.tsx            ← /
└── dashboard/
    ├── layout.tsx      ← wraps every /dashboard/* route
    ├── loading.tsx     ← Suspense fallback for the page below
    ├── error.tsx       ← error boundary for the page below
    └── page.tsx        ← /dashboard
```

```tsx file="app/dashboard/layout.tsx"
import Link from 'next/link'

export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return (
    <div className="dashboard">
      <nav aria-label="Dashboard">
        <Link href="/dashboard">Overview</Link>
        <Link href="/dashboard/settings">Settings</Link>
      </nav>
      <section>{children}</section>
    </div>
  )
}
```

```tsx file="app/dashboard/loading.tsx"
export default function DashboardLoading() {
  return <p aria-busy="true">Loading your dashboard…</p>
}
```

```tsx file="app/dashboard/error.tsx"
'use client'

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div role="alert">
      <h2>We could not load your dashboard.</h2>
      {error.digest && <p>Reference: {error.digest}</p>}
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  )
}
```

```tsx file="app/dashboard/page.tsx"
async function getOpenInvoiceCount(): Promise<number> {
  const response = await fetch('https://api.example.com/invoices/open-count')
  if (!response.ok) throw new Error('Invoice service unavailable')
  const body: { count: number } = await response.json()
  return body.count
}

export default async function DashboardPage() {
  const openInvoices = await getOpenInvoiceCount()
  return <h1>{openInvoices} open invoices</h1>
}
```

If the invoice request is slow, the dashboard navigation still shows the layout
and the loading message immediately. If it throws, the error UI replaces the
page while the dashboard navigation stays usable.

## How it works

### The component hierarchy

Within one segment, Next.js nests the special files in a fixed order:

```text
<Layout>
  <Template>
    <ErrorBoundary fallback={<Error />}>
      <Suspense fallback={<Loading />}>
        <NotFoundBoundary fallback={<NotFound />}>
          <Page />            ← or the next segment's <Layout>
        </NotFoundBoundary>
      </Suspense>
    </ErrorBoundary>
  </Template>
</Layout>
```

Nested segments repeat the pattern inside the parent's innermost slot. So
`app/dashboard/settings/page.tsx` renders inside the dashboard's error boundary
and Suspense boundary, which render inside the root layout.

The order explains the two most common surprises:

- **`error.tsx` does not catch errors from the `layout.tsx` in the same
  folder.** The layout sits outside the boundary. An error thrown by
  `app/dashboard/layout.tsx` is caught by `app/error.tsx`, one level up.
  Errors in the root layout need `app/global-error.tsx`.
- **`loading.tsx` does not cover the layout in the same folder.** If a layout
  awaits request-time data, the loading fallback cannot show for it. Move the
  slow read into the page, or wrap it in its own `<Suspense>` inside the layout.

The underlying mechanisms are ordinary React. See
[Suspense](../data-fetching/suspense.md) and
[error boundaries](../patterns/error-boundaries.md) for how they behave. The
[error boundaries guide for Next.js](../nextjs-errors/error-boundaries.md) and
[loading UI](../nextjs-errors/loading-ui.md) pages cover the framework details,
including `retry()` versus `reset()`.

### Pages and layouts

`page.tsx` is always the leaf of a route. A folder only becomes a URL when it
has a `page.tsx` (or a `route.ts`). `layout.tsx` receives the matched child as
`children` and stays mounted while you navigate between its descendants. The
root layout is required and must render `<html>` and `<body>`. See
[pages and layouts](./pages-and-layouts.md).

### Templates

`template.tsx` sits between a layout and its children, but Next.js gives it a
key derived from the child segment. When that segment changes, the template and
everything inside it remount. Search-param changes do not remount it.

```tsx file="app/checkout/template.tsx"
import type { ReactNode } from 'react'

// Each checkout step starts with fresh form state and re-runs its Effects.
export default function CheckoutTemplate({ children }: { children: ReactNode }) {
  return <div className="checkout-step">{children}</div>
}
```

Use it for enter animations, per-page analytics Effects, or forms that must not
carry state from one step to the next.

### Not found

Calling `notFound()` from `next/navigation` renders the nearest `not-found.tsx`.
The root `app/not-found.tsx` also handles every URL that matches no route.

```tsx file="app/not-found.tsx"
import Link from 'next/link'

export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>The page you asked for does not exist or has moved.</p>
      <Link href="/">Go to the home page</Link>
    </main>
  )
}
```

> [!WARNING]
> **Experimental.** `app/global-not-found.tsx` requires
> `experimental.globalNotFound: true`. It returns a full HTML document for
> unmatched URLs and is meant for apps with multiple root layouts or a dynamic
> root segment such as `app/[lang]`, where no single layout can wrap a 404 page.

### Default

`default.tsx` belongs to [parallel routes](./parallel-routes.md). It renders in a
slot when Next.js cannot determine what that slot should show, typically after a
full page load. Since Next.js 16.0, every slot must have one or the build fails.

### Route handlers

`route.ts` exports functions named after HTTP methods and returns a Web
`Response`. It is covered in depth in
[Route Handlers](../nextjs-backend/route-handlers.md).

```ts file="app/api/health/route.ts"
export async function GET() {
  return Response.json({ status: 'ok', checkedAt: new Date().toISOString() })
}
```

### Forbidden and unauthorized

> [!WARNING]
> **Experimental.** `forbidden.tsx` and `unauthorized.tsx`, and the `forbidden()`
> and `unauthorized()` functions that trigger them, require
> `experimental.authInterrupts: true` in `next.config.ts`. They render with a
> `403` and `401` status respectively. Do not rely on them in production code
> until they are stable.

## Server and client implications

Every special file except `error.tsx` and `global-error.tsx` is a Server
Component unless you add `"use client"`. Error boundaries must be Client
Components because React error boundaries catch errors during client rendering
and need to offer a retry button.

Keep `layout.tsx` a Server Component where you can. A layout marked
`"use client"` pulls every component it imports into the client bundle. Put the
interactive part (an active-link highlighter, a menu toggle) in a small Client
Component and render it from the server layout. See
[Server Components](../server-react/server-components.md) for the boundary rules.

## Common patterns

### Colocating code next to routes

Only `page` and `route` files are publicly reachable, and only what they return
is sent to the client. Components, helpers, and tests can live beside the route
that uses them:

```text
app/
└── invoices/
    ├── _components/
    │   └── invoice-table.tsx   ← private folder, never routable
    ├── invoice-filters.tsx      ← also safe, no special file name
    ├── loading.tsx
    └── page.tsx
```

The underscore is not required for safety, but it prevents a future collision
with a new special file name and makes intent obvious.

### One boundary per independent region

Put `loading.tsx` and `error.tsx` at the level where a failure or delay should be
contained. A boundary at `app/dashboard/` keeps the dashboard navigation working
when one page fails. A boundary only at `app/` replaces the whole screen.

## Common mistakes

**Expecting `error.tsx` to catch the layout next to it.** It wraps the page, not
the layout in the same folder. Put an `error.tsx` in the parent segment, or use
`global-error.tsx` for the root layout.

**Forgetting `"use client"` in `error.tsx`.** The build fails, because error
boundaries must be Client Components.

**Adding `route.ts` beside `page.tsx`.** The two conflict. Move the endpoint to
its own segment, such as `app/api/invoices/route.ts`.

**Wrapping a slow layout in `loading.tsx`.** The fallback sits below the layout
in the same folder and never shows for the layout's own data.

**Using `template.tsx` where a layout was intended.** State resets on every
child navigation, and users lose what they typed in a shared search box.

**Leaving a parallel route slot without `default.tsx`.** Builds fail since
Next.js 16.0.

## Related topics

- [Pages and layouts](./pages-and-layouts.md): the two files every route uses,
  and what layouts cannot see.
- [Dynamic segments](./dynamic-segments.md): folders like `[slug]` that capture
  URL values.
- [Parallel routes](./parallel-routes.md): the convention `default.tsx` exists
  for.
- [Error boundaries in Next.js](../nextjs-errors/error-boundaries.md): `error.tsx`,
  `global-error.tsx`, `retry()` and `reset()` in depth.
- [Suspense](../data-fetching/suspense.md): the React boundary that `loading.tsx`
  creates for you.
- [File conventions reference](../nextjs-reference/file-conventions.md): every
  special file in one table.
