---
title: catchError
description: Build component-level error boundaries anywhere in the tree that retry Server Components and never swallow notFound() or redirect().
group: nextjs-errors
order: 20
status: current
since: "16.3"
related: [nextjs-errors/error-boundaries, nextjs-errors/not-found-and-redirect, patterns/error-boundaries, data-fetching/suspense]
---

## Overview

`catchError` from `next/error` turns a fallback function into an error boundary
component that you can place around **any** part of the tree, not only a route
segment.

```text
catchError(fallback) => Boundary component

fallback(props, { error, retry, reset }) => ReactNode
  props   the props you pass to <Boundary>, without children
  error   unknown (narrow it before reading it)
  retry   re-fetch and re-render the boundary's children, Server Components included
  reset   clear the client error state and re-render without re-fetching
```

It is the component-level counterpart of the [`error.tsx` file
convention](./error-boundaries.md), with the same `retry()` recovery. The
underlying React idea, a boundary that swaps a failed subtree for a fallback, is
explained on the React [error boundaries](../patterns/error-boundaries.md) page.

`catchError` is **stable in Next.js 16.3**.

> [!NOTE]
> **Renamed in 16.3.** Next.js 16.2 shipped this API as Experimental, under an
> `unstable_`-prefixed name for both the function and the retry prop. 16.3 renamed
> them to `catchError` and `retry` and made them stable. See
> [upgrading from 16.2 to 16.3](../nextjs-migration/next-16-2-to-16-3.md) for the
> rename.

## Why it exists

Before 16.3 a component-level boundary in the App Router meant a hand-written
React class, and that class had three problems in Next.js:

1. **It caught framework control flow.** `notFound()` and `redirect()` work by
   throwing special errors. A generic boundary catches those too, so a missing
   record showed "Something went wrong" instead of the 404 page, and a redirect
   never happened.
2. **It could only reset client state.** Its children are Server Component output.
   Resetting renders the same failed output again. There was no way to ask the
   server for a fresh render.
3. **It stayed stuck across navigations** unless you wired a reset key to the
   pathname yourself.

`catchError` fixes all three: it lets Next.js control-flow errors through, its
`retry()` re-fetches the Server Components inside it, and its error state clears
on client navigation to a different route.

## When to use it

- Around an independent region of a page whose failure should not take down the
  rest: a recommendations rail, a chart, a third-party embed, a comments section.
- Around a Suspense boundary that streams server data which can fail, so the
  error replaces only that section.
- For a reusable boundary with configurable copy (`title`, `compact`) used in
  several routes.

## When not to use it

- **To wrap a whole route segment.** Use `error.tsx`. It is already a boundary,
  so do not wrap its default export in `catchError` either.
- **For expected failures.** Return a value, render an empty state, or call
  [`notFound()`](./not-found-and-redirect.md).
- **For errors in event handlers or effects.** Like every React error boundary,
  it only catches errors thrown while rendering.
- **In server-only code.** `catchError` belongs to the client module graph. It
  cannot be imported in `proxy.ts`, `instrumentation.ts`, or other server-only
  environments.

## Basic example

Define the boundary once in a Client Component module:

```tsx file="app/ui/section-boundary.tsx"
'use client';

import { catchError, type ErrorInfo } from 'next/error';

function SectionFallback({ title }: { title: string }, { error, retry }: ErrorInfo) {
  // `error` is `unknown`: anything can be thrown, not only Error instances.
  const message = error instanceof Error ? error.message : 'Unexpected error';

  return (
    <section role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </section>
  );
}

export default catchError(SectionFallback);
```

Then use it from any page or layout, including a Server Component:

```tsx file="app/dashboard/page.tsx"
import { Suspense } from 'react';
import SectionBoundary from '@/app/ui/section-boundary';
import { RevenueChart } from '@/app/dashboard/revenue-chart';
import { RecentOrders } from '@/app/dashboard/recent-orders';

export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <SectionBoundary title="Revenue is unavailable">
        <Suspense fallback={<p>Loading revenue...</p>}>
          <RevenueChart />
        </Suspense>
      </SectionBoundary>
      <SectionBoundary title="Recent orders are unavailable">
        <Suspense fallback={<p>Loading orders...</p>}>
          <RecentOrders />
        </Suspense>
      </SectionBoundary>
    </main>
  );
}
```

If `RevenueChart` throws while rendering on the server, only the revenue section
shows its fallback. The heading and the orders section keep rendering. **Try
again** re-fetches the revenue Server Component without reloading the page.

## How it works

### The fallback signature

`catchError` takes one argument, a function shaped like a component with a second
parameter:

- **`props`**: whatever you pass to the returned component, **minus `children`**.
  The fallback replaces the children, so it never receives them.
- **`errorInfo`**: `{ error, retry, reset }`.

The returned component accepts the same props plus `children`, which it wraps in
the boundary. TypeScript infers those props from the fallback's first parameter,
so `<SectionBoundary>` without `title` is a type error.

The fallback must run on the client. Define it in a module that starts with
`'use client'`, as above. The component that **uses** the boundary can be a Server
Component, because it only renders a Client Component with serializable props and
server-rendered children.

### Narrowing `error`

`ErrorInfo['error']` is typed `unknown`, not `Error`. JavaScript can throw any
value, and a boundary must not crash while rendering its own fallback. Reading
`error.message` directly is a type error, so narrow it in one helper:

```tsx file="app/ui/report-boundary.tsx"
'use client';

import { catchError, type ErrorInfo } from 'next/error';

function describe(error: unknown): { message: string; digest?: string } {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined;
  return { message, digest };
}

function ReportFallback(_props: {}, { error, retry }: ErrorInfo) {
  const { message, digest } = describe(error);

  return (
    <div role="alert">
      <p>{message}</p>
      {digest ? <p>Reference: {digest}</p> : null}
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}

export default catchError(ReportFallback);
```

The same production rule as `error.tsx` applies: an error thrown in a Server
Component reaches the browser with a generic message and a `digest`, never the
original message. Show the digest and look it up in the server log. See
[production error messages](./error-boundaries.md).

### `retry()` versus `reset()`

`retry()` re-fetches and re-renders the boundary's children, including any Server
Components among them. It runs inside a React
[transition](../hooks/use-transition.md), so Client Component state **outside**
the boundary is preserved while the new server output loads. If the re-render
succeeds, the fallback is replaced.

`reset()` only clears the error state and re-renders the children that are
already on the client. That cannot fix a Server Component failure, because the
same output renders again. Use `retry()` unless you know the failure was purely
client-side.

### Framework errors pass through

`notFound()`, `redirect()`, and `permanentRedirect()` stop rendering by throwing
special errors. `catchError` recognizes them and does not catch them, so they
reach Next.js and do their job:

```tsx file="app/invoices/[invoiceId]/page.tsx"
import { notFound } from 'next/navigation';
import SectionBoundary from '@/app/ui/section-boundary';
import { getInvoice } from '@/lib/invoices';

async function InvoiceDetails({ id }: { id: string }) {
  const invoice = await getInvoice(id);
  if (!invoice) {
    // Thrown inside SectionBoundary, but not caught by it.
    notFound();
  }
  return <p>Total: {invoice.total}</p>;
}

export default async function InvoicePage({ params }: PageProps<'/invoices/[invoiceId]'>) {
  const { invoiceId } = await params;

  return (
    <main>
      <h1>Invoice {invoiceId}</h1>
      <SectionBoundary title="The invoice failed to load">
        <InvoiceDetails id={invoiceId} />
      </SectionBoundary>
    </main>
  );
}
```

An unknown invoice renders the nearest `not-found.tsx`, not the section's error
fallback. A hand-written class boundary in the same position would have caught the
`notFound()` error and shown "The invoice failed to load". See
[notFound and redirect](./not-found-and-redirect.md) for the status code rules.

### Navigation clears the error

When the user navigates on the client to a different route, the boundary's error
state clears automatically. You do not need a reset key tied to the pathname.

## Server and client implications

| | `error.tsx` | `catchError` boundary | Hand-written class boundary |
|---|---|---|---|
| Scope | A route segment | Any subtree | Any subtree |
| Declared as | A file | A component you render | A component you render |
| Must be a Client Component | Yes | The fallback module, yes | Yes |
| `retry()` re-fetches Server Components | Yes | Yes | No |
| Lets `notFound()` / `redirect()` through | Yes | Yes | No, unless you rethrow them yourself |
| Clears on navigation | Yes | Yes | Only if you implement it |

Place the boundary **outside** the `<Suspense>` it protects, as the React page
explains in [with Suspense](../patterns/error-boundaries.md#with-suspense). Then
the error fallback replaces the loading fallback instead of waiting inside it.

## Common patterns

### A server-rendered fallback

The fallback runs on the client, but it can display content rendered on the
server. Pass a Server Component element as a prop and return it:

```tsx file="app/ui/boundary-with-fallback.tsx"
'use client';

import type { ReactNode } from 'react';
import { catchError, type ErrorInfo } from 'next/error';

function RenderFallbackProp({ fallback }: { fallback: ReactNode }, _errorInfo: ErrorInfo) {
  return fallback;
}

export default catchError(RenderFallbackProp);
```

```tsx file="app/store/page.tsx"
import BoundaryWithFallback from '@/app/ui/boundary-with-fallback';
import { getSupportContact } from '@/lib/support';
import { ProductGrid } from '@/app/store/product-grid';

async function StoreUnavailable() {
  const contact = await getSupportContact();
  return <p>The store is unavailable. Contact {contact.email} for help.</p>;
}

export default function StorePage() {
  return (
    <BoundaryWithFallback fallback={<StoreUnavailable />}>
      <ProductGrid />
    </BoundaryWithFallback>
  );
}
```

> [!WARNING]
> The fallback element is rendered on **every** page render, even when nothing
> fails, because it is an ordinary prop. Use this only when the fallback needs
> server data, and keep that data cheap.

### One boundary component, several configurations

Props flow to the fallback, so a single boundary can serve a large panel and a
small inline widget:

```tsx file="app/ui/widget-boundary.tsx"
'use client';

import { catchError, type ErrorInfo } from 'next/error';

type WidgetBoundaryProps = {
  label: string;
  compact?: boolean;
};

function WidgetFallback({ label, compact = false }: WidgetBoundaryProps, { retry }: ErrorInfo) {
  if (compact) {
    return (
      <button type="button" onClick={() => retry()}>
        Reload {label}
      </button>
    );
  }

  return (
    <div role="alert">
      <p>{label} could not be loaded.</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}

export default catchError(WidgetFallback);
```

## Common mistakes

**Reading `error.message` without narrowing.** `error` is `unknown`, so this does
not compile. Some published snippets, including the 16.3 release post, skip the
check. Use `error instanceof Error` first.

**Defining the fallback in a Server Component module.** The fallback must live in
a `'use client'` module. The page that renders the boundary can stay a Server
Component.

**Calling `reset()` to recover from a server failure.** It re-renders the same
server output. Use `retry()`.

**Wrapping `error.tsx` in `catchError`.** `error.tsx` already renders inside a
boundary that Next.js provides.

**Wrapping a `try`/`catch` around `notFound()` inside the boundary.** `catchError`
lets the framework error through, but your own `catch` does not. See
[notFound and redirect](./not-found-and-redirect.md).

**Placing the boundary inside the Suspense boundary it protects.** Put the error
boundary outside, so a failure replaces the loading fallback rather than living
inside it.

## Related topics

- [Error boundaries in Next.js](./error-boundaries.md) — `error.tsx` and
  `global-error.tsx`, the route-level boundaries, and production digests.
- [Error boundaries (React)](../patterns/error-boundaries.md) — the React model
  `catchError` builds on, including what no boundary can catch.
- [notFound and redirect](./not-found-and-redirect.md) — the control-flow errors
  `catchError` deliberately lets through.
- [Suspense](../data-fetching/suspense.md) — the pending boundary to pair with
  every error boundary.
- [Upgrading from 16.2 to 16.3](../nextjs-migration/next-16-2-to-16-3.md) — the
  rename from the Experimental 16.2 names.
