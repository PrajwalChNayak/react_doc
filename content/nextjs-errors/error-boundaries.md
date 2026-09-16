---
title: Error boundaries in Next.js
description: Catch rendering errors per route segment with error.tsx and global-error.tsx, recover with retry(), and trace redacted production errors by digest.
group: nextjs-errors
order: 10
status: current
since: "16.3"
related: [nextjs-errors/catch-error, nextjs-errors/not-found-and-redirect, nextjs-errors/loading-ui, patterns/error-boundaries]
---

## Overview

Next.js turns React error boundaries into a **file convention**. An `error.tsx`
file in a route folder wraps that segment in an error boundary, and a
`global-error.tsx` file in `app/` catches what nothing else does. You never write
the boundary class yourself.

What an error boundary is, and what it cannot catch, is covered on the React
[error boundaries](../patterns/error-boundaries.md) page. This page covers what
Next.js adds on top:

| Next.js adds | Why it matters |
|---|---|
| `error.tsx` per route segment | A failing page replaces only its own segment. Parent layouts and navigation stay usable. |
| `retry()` prop | Re-fetches and re-renders the segment, **including its Server Components**. A plain React boundary can only re-render what is already on the client. |
| `global-error.tsx` | A last-resort boundary for errors in the root layout, which no `error.tsx` can wrap. |
| Production redaction and `digest` | Messages from Server Component errors never reach the browser. A hash links the fallback to the server log. |
| `onRequestError` in `instrumentation.ts` | One hook that reports every server-side error. |

This group has four pages. For boundaries that are not tied to a route segment,
see [catchError](./catch-error.md). For expected outcomes such as a missing
record or a redirect, see [notFound and redirect](./not-found-and-redirect.md).
For the pending counterpart of an error boundary, see [Loading UI](./loading-ui.md).

The [error boundaries example app](../../examples/nextjs/error-boundaries/README.md)
has a route for each case on these pages.

## Why it exists

In the App Router most rendering happens on the server, inside Server Components
that a class-based boundary on the client cannot re-run. A React boundary's reset
clears its error state and renders the same children again, but those children
are the server's output, so the same failure comes straight back. `retry()` exists
to ask the server for a fresh render of the segment.

The file convention exists for a second reason: placement. Routes are folders, so
"one boundary per route" becomes "one file per folder". Next.js wires the
boundary at the right place in the segment hierarchy, and it resets it
automatically when the user navigates to a different route.

## When to use it

- Add an `error.tsx` to any segment whose data can fail independently of its
  parent: a dashboard panel route, a settings sub-page, a report.
- Add an `error.tsx` at `app/error.tsx` so a failure in any page keeps the root
  layout (header, navigation, session UI) on screen.
- Add `app/global-error.tsx` as the last resort for failures in the root layout
  itself.
- Use `retry()` when a failure can be transient: a timeout, a rate limit, a
  flaky upstream service.

## When not to use it

- **For expected outcomes.** A missing record is not a crash. Call
  [`notFound()`](./not-found-and-redirect.md) or render the empty state. A failed
  form submission is a return value; see
  [Server Action error handling](../nextjs-mutations/error-handling.md).
- **For a region smaller than a route segment.** A single widget inside a page
  needs a component-level boundary. Use [catchError](./catch-error.md).
- **For errors in event handlers.** No error boundary catches them. Catch them and
  put the message in state.

## Basic example

An `error.tsx` must be a Client Component. It receives the error and two recovery
functions, `retry` and `reset`.

```tsx file="app/dashboard/error.tsx"
'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Send the digest to your error reporting service. It matches the server log.
    console.error('Dashboard failed to render', error.digest ?? error.message);
  }, [error]);

  return (
    <div role="alert">
      <h2>The dashboard could not be loaded.</h2>
      {error.digest ? <p>Reference: {error.digest}</p> : null}
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
```

Any error thrown while rendering `app/dashboard/page.tsx`, or any route nested
under `app/dashboard/`, now renders this component in place of the page. The
layouts above `app/dashboard/` stay mounted and interactive.

## How it works

### Where `error.tsx` sits in the segment

Inside one route segment, Next.js nests the special files in a fixed order:

```text
<Layout>                      app/dashboard/layout.tsx
  <Template>                  app/dashboard/template.tsx
    <ErrorBoundary>           app/dashboard/error.tsx
      <Suspense>              app/dashboard/loading.tsx
        <NotFoundBoundary>    app/dashboard/not-found.tsx
          <Page />            app/dashboard/page.tsx (or a nested segment's layout)
```

Three consequences follow from that order:

- `error.tsx` catches errors in `page.tsx`, `loading.tsx`, `not-found.tsx` and
  every **nested** layout below it.
- `error.tsx` does **not** catch errors thrown by `layout.tsx` or `template.tsx`
  in the **same** folder, because those render above it. To catch an error in
  `app/dashboard/layout.tsx`, put an `error.tsx` in the parent folder (`app/`).
- An error travels up to the **nearest** `error.tsx`. Placing files at different
  depths gives you coarse and fine fallbacks at the same time.

If you want an `error.tsx` to hand the error on to a parent boundary, throw from
inside it while it renders.

### Why `error.tsx` must be a Client Component

React error boundaries catch errors with lifecycle methods that run in the
browser, and the fallback's recovery buttons are event handlers. Both require a
Client Component, so the file starts with `'use client'`.

A consequence: `error.tsx` cannot `await` data, read cookies, or export
`metadata`. Keep the fallback self-contained.

### `retry` and `reset`

| | `retry()` | `reset()` |
|---|---|---|
| What it does | Re-fetches and re-renders the boundary's children from the server | Clears the client error state and re-renders the existing children |
| Recovers from a Server Component error | Yes | No, the same server output renders and fails again |
| Recovers from a Client Component error | Yes | Yes |
| When to use it | Almost always | Only when you know the failure was client-side state and a server round trip is wasted |

> [!NOTE]
> The `retry` prop on `error.tsx` and `global-error.tsx` became stable in
> **Next.js 16.3.0**. It supersedes the Experimental prop name that 16.2 shipped.
> See [upgrading from 16.2 to 16.3](../nextjs-migration/next-16-2-to-16-3.md).

If `retry()` succeeds, the fallback is replaced by the re-rendered segment. If the
failure is permanent, the fallback renders again, so make sure the fallback still
offers a way out, such as a link to a parent route.

### Production error messages and `digest`

Errors that happen on the server can contain secrets: a SQL fragment, an internal
hostname, an API key in a URL. Next.js therefore treats them differently in
production:

| Where the error was thrown | `error.message` in development | `error.message` in production |
|---|---|---|
| Client Component | The original message | The original message |
| Server Component | The original message | A generic message. The original stays in the server log. |

Server-side errors also carry `error.digest`, an automatically generated hash of
the error. Show it in the fallback (as a support reference) or send it to your
reporting service, then search the server log for the same digest to find the
full error and stack.

Do not build UI logic on `error.message`. The message you see in development is
not the one users get in production.

### `global-error.tsx`

`app/global-error.tsx` is the outermost boundary. It handles errors in the root
layout and root template. Because it wraps the whole app, it also catches a
render error that no `error.tsx` caught. When it
renders, it **replaces the root layout**, so it must render its own `<html>` and
`<body>`.

```tsx file="app/global-error.tsx"
'use client';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong</title>
        <h1>Something went wrong</h1>
        {error.digest ? <p>Reference: {error.digest}</p> : null}
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
```

Because it replaces the root layout, `global-error.tsx` does not get your global
stylesheet, fonts, or theme class. Import or inline what the page needs. It is a
Client Component, so it cannot export `metadata`. Render a React `<title>`
element instead, as above.

Since Next.js 15.2, `global-error.tsx` is also displayed in development.

### Logging server errors

The `useEffect` in `error.tsx` runs in the browser, where a production Server
Component error has already been redacted. To capture the full error, export
`onRequestError` from `instrumentation.ts` at the project root. Next.js calls it
for errors captured while rendering, in Route Handlers, in Server Actions, and in
Proxy.

```ts file="instrumentation.ts"
import { type Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined;

  await fetch('https://errors.example.com/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      digest,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  });
};
```

The `error` parameter is typed `unknown`, so narrow it before reading `message`
or `digest`. Await any asynchronous reporting inside the function. Logging the
digest on both sides is what lets you join a user's "Reference" to a stack trace.

## Server and client implications

- **Server errors mid-stream.** If a component throws after the response has
  started streaming, the nearest `error.tsx` replaces that section in the streamed
  HTML. The HTTP status is already `200` and cannot change. See
  [Streaming](../nextjs-rendering/streaming.md).
- **Event handlers and async callbacks** in Client Components are not caught by
  any boundary. An error thrown inside `startTransition` is, because React runs it
  through rendering. The React page covers the details in
  [what boundaries do not catch](../patterns/error-boundaries.md#what-boundaries-do-not-catch).
- **Navigation resets the boundary.** Moving to a different route clears the error
  state, so users are not stuck on a fallback after clicking a link.

## Common patterns

### A boundary per level of the UI

```text
app/
  global-error.tsx        root layout failed: full-page error document
  error.tsx               any page failed: keep the header and navigation
  dashboard/
    layout.tsx            dashboard sidebar (caught by app/error.tsx)
    error.tsx             a dashboard page failed: keep the sidebar
    page.tsx
    analytics/
      error.tsx           only analytics failed: keep the dashboard layout
      page.tsx
```

Start with `app/error.tsx` and `app/global-error.tsx`. Add deeper files where a
more specific message or a cheaper retry is worth it. For a region inside a page,
use [catchError](./catch-error.md) instead of another route segment.

### Always offer a way out

`retry()` fails again when the error is permanent. Pair it with a link to a
parent route so the user is never trapped.

```tsx file="app/dashboard/analytics/error.tsx"
'use client';

import Link from 'next/link';

export default function AnalyticsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert">
      <p>Analytics are unavailable right now.</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>{' '}
      <Link href="/dashboard">Back to the dashboard</Link>
    </div>
  );
}
```

## Security considerations

Never render a Server Component error's details into the page yourself, for
example by catching the error in a Server Component and passing `String(error)`
to a Client Component. That bypasses the production redaction described above.
Log the details on the server and show the user a digest or a generic message.

## Common mistakes

**Forgetting `'use client'`.** `error.tsx` and `global-error.tsx` are Client
Components, because error boundaries and their recovery buttons run in the
browser.

**Expecting `error.tsx` to catch its own layout.** It wraps the page and nested
segments, not the `layout.tsx` beside it. Move the file up one folder, or use
`global-error.tsx` for the root layout.

**Calling `reset()` after a server failure.** `reset()` re-renders the same
server output and fails again. Use `retry()`.

**Omitting `<html>` and `<body>` from `global-error.tsx`.** It replaces the root
layout, so there is no document around it.

**Showing `error.message` and testing only in development.** Production users
see a generic message for server errors. Design the fallback around the digest.

**Using `error.tsx` for a 404.** A missing record should call `notFound()`, which
renders `not-found.tsx` with a 404 status when possible. An error boundary
reports it as a crash.

**No server-side reporting.** A boundary hides failures from users by design.
Without `onRequestError` (or another reporter) they never reach you either.

## Related topics

- [Error boundaries (React)](../patterns/error-boundaries.md) — what a boundary is,
  what it cannot catch, and the React 19 root error callbacks.
- [catchError](./catch-error.md) — the same recovery, including `retry()`, for any
  part of the component tree.
- [notFound and redirect](./not-found-and-redirect.md) — expected outcomes that
  throw special errors which boundaries let through.
- [Loading UI](./loading-ui.md) — `loading.tsx`, the Suspense counterpart that
  sits just inside `error.tsx`.
- [File conventions](../nextjs-routing/file-conventions.md) — every special file
  in a route segment and the order Next.js nests them in.
- [Debugging production](../nextjs-deployment/debugging-production.md) — finding
  the server log entry behind a digest.
