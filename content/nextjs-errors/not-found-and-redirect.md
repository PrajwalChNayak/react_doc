---
title: notFound and redirect
description: End rendering with a 404, a redirect, or an auth interrupt, and understand why these functions throw and what that means for try/catch and status codes.
group: nextjs-errors
order: 30
status: current
related: [nextjs-errors/error-boundaries, nextjs-errors/catch-error, nextjs-routing/redirects, patterns/error-boundaries]
---

## Overview

Next.js has a family of functions that **stop rendering and hand control to the
framework**. All of them come from `next/navigation`:

| Function | Result | UI file | HTTP status (non-streamed) | Status |
|---|---|---|---|---|
| `notFound()` | Renders the nearest not-found UI | `not-found.tsx` | `404` | Current |
| `redirect(path)` | Sends the user to `path` | — | `307` (`303` for a form Server Action) | Current |
| `permanentRedirect(path)` | Sends the user to `path` permanently | — | `308` (`303` for a form Server Action) | Current |
| `forbidden()` | Renders the nearest forbidden UI | `forbidden.tsx` | `403` | Experimental |
| `unauthorized()` | Renders the nearest unauthorized UI | `unauthorized.tsx` | `401` | Experimental |

Each one works by **throwing** a special error, and each has the TypeScript
return type `never`. That one design decision explains every rule on this page.

These are expected outcomes, not crashes. The React
[error boundaries](../patterns/error-boundaries.md#when-not-to-use-it) page makes
the same distinction: a 404 is data, and it should not reach an error fallback.

## Why it exists

A Server Component often discovers that a page cannot render only after awaiting
data several functions deep. Returning a sentinel value up through every caller
is noisy and easy to forget. Throwing stops the render immediately from any depth,
the same way `throw` stops any function.

Next.js catches these errors itself, outside your code, and turns them into the
right response: the `not-found.tsx` UI with a `404` status and a `noindex` tag, or
a redirect. Because the functions return `never`, TypeScript also knows that code
after them does not run, so a checked value stays narrowed.

## When to use it

- **`notFound()`** when the URL is well-formed but the record does not exist: an
  unknown slug, a deleted post, an id that belongs to nobody.
- **`redirect()`** when a request should go elsewhere for now: after sign-out, to
  a login page, after a Server Action creates something.
- **`permanentRedirect()`** when a resource moved for good and you only learn that
  while rendering, such as an old slug stored in the database.
- **`forbidden()` / `unauthorized()`** (Experimental) when you want an auth
  failure to render a dedicated page with the matching status code.

## When not to use it

- **For crashes.** A failed upstream call is an error. Throw it, and let
  [`error.tsx`](./error-boundaries.md) or [catchError](./catch-error.md) handle it.
- **For redirects that do not depend on rendering.** A fixed old-to-new path map
  belongs in `redirects` in `next.config.ts` or in `proxy.ts`, which respond before
  any rendering starts. See [Redirects](../nextjs-routing/redirects.md).
- **In Client Component event handlers.** `redirect()` works in a Client Component
  only while it renders. In an `onClick`, use `useRouter()` instead.
- **To authorize access on its own.** Rendering a 403 page is presentation.
  Authorization checks belong in your data access layer; see
  [Protecting routes](../nextjs-auth/protecting-routes.md).

## Basic example

```tsx file="app/invoices/[invoiceId]/page.tsx"
import { notFound } from 'next/navigation';
import { getInvoice } from '@/lib/invoices';

export default async function InvoicePage({ params }: PageProps<'/invoices/[invoiceId]'>) {
  const { invoiceId } = await params;
  const invoice: { customer: string; total: string } | undefined = await getInvoice(invoiceId);

  if (!invoice) {
    notFound();
  }

  // `notFound()` returns `never`, so `invoice` is defined here.
  return (
    <main>
      <h1>Invoice for {invoice.customer}</h1>
      <p>Total: {invoice.total}</p>
    </main>
  );
}
```

```tsx file="app/invoices/[invoiceId]/not-found.tsx"
import Link from 'next/link';

export default function InvoiceNotFound() {
  return (
    <main>
      <h1>Invoice not found</h1>
      <Link href="/invoices">All invoices</Link>
    </main>
  );
}
```

You do not write `return notFound()`. The call throws, so nothing after it runs.

## How it works

### `not-found.tsx`: segment and root

`notFound()` renders the **nearest** `not-found.tsx`, searching upward from the
segment where it was thrown. Without one anywhere, Next.js renders its default
404 page.

- A **segment** `not-found.tsx` (`app/invoices/[invoiceId]/not-found.tsx`) renders
  inside that segment's layouts, so the surrounding navigation stays.
- The **root** `app/not-found.tsx` does double duty. It handles `notFound()` calls
  that no deeper file caught, **and** every URL that matches no route at all.

In the segment hierarchy, `not-found.tsx` sits inside the segment's `loading.tsx`
Suspense boundary and `error.tsx` boundary, just outside `page.tsx`. It receives no
props. It is a Server Component by default, so it can be `async` and fetch data.

> [!WARNING]
> **Experimental.** `app/global-not-found.tsx` requires
> `experimental.globalNotFound: true` in `next.config.ts`. It is a 404 page for
> URLs that match no route, rendered **without** your layouts, so it must return a
> full `<html>` and `<body>` and import its own styles. It exists for apps with
> several root layouts, or a root layout under a dynamic segment such as
> `app/[country]/layout.tsx`, where no single `app/not-found.tsx` can be composed.

Next.js adds `<meta name="robots" content="noindex">` to not-found responses, so
search engines do not index them.

### Status codes and streaming

The HTTP status is part of the response headers, and headers are sent when
streaming starts. Streaming starts when a Suspense fallback renders, including a
`loading.tsx`, or when a component suspends under a `<Suspense>` boundary.

| Where `notFound()` runs | What the client gets |
|---|---|
| Before any `await` that suspends and outside any Suspense boundary | A real `404` status |
| Inside a Suspense boundary, after streaming started | Status `200`, the not-found UI streamed in place, and a `noindex` meta tag |

`redirect()` behaves the same way: before streaming it is an HTTP redirect, after
streaming starts Next.js emits it as a client-side redirect in the HTML.

The `noindex` tag keeps a soft 404 out of search results. If you need a real `404`
status for compliance or analytics, check that the resource exists before the
response streams. With Cache Components every dynamic route streams a static shell
first, so run that existence check in [`proxy.ts`](../nextjs-backend/proxy.md).
[Streaming](../nextjs-rendering/streaming.md) covers the HTTP contract in full.

### `redirect()` and `permanentRedirect()`

```tsx file="app/account/page.tsx"
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function AccountPage() {
  const session: { user: { name: string } } | null = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <h1>Signed in as {session.user.name}</h1>;
}
```

- **Status codes.** `redirect()` sends `307` and `permanentRedirect()` sends `308`.
  Both preserve the request method, unlike `302` and `301`. In a Server Action
  submitted without JavaScript (progressive enhancement), both send `303` so the
  browser follows with `GET`. When JavaScript is available, a Server Action
  redirect is a client-side navigation.
- **History.** The optional second argument is `RedirectType.push` or
  `RedirectType.replace`. The default is `push` in Server Actions and `replace`
  everywhere else. It has no effect in Server Components.
- **Where it works.** Server Components, Client Components during render, Route
  Handlers, and Server Functions. Not in event handlers.
- **Destinations.** Relative paths and absolute URLs, including external sites.

### Why `try`/`catch` breaks them

Because these functions throw, a `catch` block around them catches the framework's
error, and the 404 or redirect silently never happens:

```ts file="app/invoices/actions.ts"
'use server';

import { redirect } from 'next/navigation';
import { createInvoice } from '@/lib/invoices';

export async function createInvoiceAction(formData: FormData) {
  let invoiceId: string;

  try {
    const invoice: { id: string } = await createInvoice(formData);
    invoiceId = invoice.id;
  } catch (error) {
    console.error('Creating the invoice failed', error);
    return { message: 'The invoice could not be created.' };
  }

  // Outside the try block, so nothing here can swallow the redirect.
  redirect(`/invoices/${invoiceId}`);
}
```

When the throwing call cannot be moved out of the `try` block, call
`unstable_rethrow(error)` as the **first** statement in the `catch`. It rethrows
the error if it is one of the Next.js control-flow errors, and does nothing
otherwise:

```tsx file="app/incidents/[incidentId]/page.tsx"
import { notFound, unstable_rethrow } from 'next/navigation';

export default async function IncidentPage({ params }: PageProps<'/incidents/[incidentId]'>) {
  const { incidentId } = await params;

  try {
    const res = await fetch(`https://api.example.com/incidents/${incidentId}`);
    if (res.status === 404) notFound();
    if (!res.ok) throw new Error(`Incident API responded ${res.status}`);
    const incident: { title: string } = await res.json();
    return <h1>{incident.title}</h1>;
  } catch (error) {
    // Let notFound(), redirect() and other framework errors through first.
    unstable_rethrow(error);
    console.error(error);
    return <p>The incident is temporarily unavailable.</p>;
  }
}
```

> [!NOTE]
> `unstable_rethrow` is marked **unstable** in the Next.js 16.3.5 documentation:
> it has no configuration flag, but its name and behavior may still change. Prefer
> moving the throwing call out of the `try` block. Put cleanup that must always run
> before the call or in a `finally` block.

Error boundaries are a different matter. A [catchError](./catch-error.md) boundary
and `error.tsx` recognize these errors and let them through. A hand-written React
class boundary does not.

### `forbidden()` and `unauthorized()`

> [!WARNING]
> **Experimental.** `forbidden()`, `unauthorized()`, `forbidden.tsx` and
> `unauthorized.tsx` require `experimental.authInterrupts: true` in
> `next.config.ts`.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
```

```tsx file="app/admin/page.tsx"
import { forbidden, unauthorized } from 'next/navigation';
import { verifySession } from '@/lib/dal';

export default async function AdminPage() {
  const session: { role: 'admin' | 'member' } | null = await verifySession();

  if (!session) {
    unauthorized(); // renders unauthorized.tsx with a 401
  }
  if (session.role !== 'admin') {
    forbidden(); // renders forbidden.tsx with a 403
  }

  return <h1>Admin</h1>;
}
```

They follow the same rules as `notFound()`: they throw, they return `never`, a
`try`/`catch` swallows them, and a call inside a Suspense boundary after streaming
started cannot change the `200` status. Neither can be called in the root layout.
`forbidden.tsx` and `unauthorized.tsx` receive no props.

## Server and client implications

- `notFound()`, `forbidden()` and `unauthorized()` work in Server Components,
  Server Functions and Route Handlers. In a Route Handler, `notFound()` serves a
  `404` to the caller.
- `redirect()` and `permanentRedirect()` also work in Client Components while they
  render. During server rendering of that Client Component on the initial load,
  the redirect happens on the server.
- **Call them in the render path.** A call inside a promise that nothing awaits
  throws where Next.js cannot see it, so no not-found UI or redirect happens. In
  development the server logs an `unhandledRejection`. Always `await` the function
  that may call them.

## Common patterns

### Check existence in the data access function

Put the `notFound()` call in the function that loads the record, so every page
that uses it gets the same behavior:

```ts file="lib/posts.ts"
import 'server-only';
import { notFound } from 'next/navigation';

export async function getPostOrNotFound(slug: string): Promise<{ title: string; body: string }> {
  const res = await fetch(`https://cms.example.com/posts/${encodeURIComponent(slug)}`);
  if (res.status === 404) {
    notFound();
  }
  if (!res.ok) {
    throw new Error(`CMS responded ${res.status}`);
  }
  return res.json();
}
```

A `404` from the CMS becomes the not-found UI. Any other failure becomes an error
for the nearest error boundary.

## Security considerations

Never pass an unvalidated, user-controlled URL to `redirect()`. Because it accepts
absolute URLs, `redirect(searchParams.next)` is an open redirect that attackers can
use to send your users to a phishing page from a link on your domain. Allow only
relative paths from a known list. See
[Open redirects](../nextjs-security/open-redirects.md).

A `forbidden()` page is not access control. The data must be protected where it is
read, not only where the page renders.

## Common mistakes

**Wrapping `redirect()` or `notFound()` in `try`/`catch`.** The catch block
swallows the framework error. Move the call out, or call `unstable_rethrow` first.

**Writing `return notFound()`.** Harmless, but unnecessary: the function throws.

**Expecting a 404 status after a Suspense boundary.** Once streaming starts, the
status is `200` and the not-found UI streams in with `noindex`. Check existence
before the boundary, or in `proxy.ts`.

**Calling `redirect()` in an `onClick`.** It only works during render. Use
`useRouter().push()` in event handlers.

**Relying on `app/not-found.tsx` inside a dynamic root layout.** With a root
layout such as `app/[country]/layout.tsx`, a composed 404 is hard. That is the case
the Experimental `global-not-found.tsx` exists for.

**Using `forbidden()` without the flag.** `forbidden()` and `unauthorized()` need
`experimental.authInterrupts`.

## Related topics

- [Error boundaries (React)](../patterns/error-boundaries.md) — why an expected
  outcome such as a 404 should never reach an error fallback.
- [Error boundaries in Next.js](./error-boundaries.md) — where `not-found.tsx` sits
  relative to `error.tsx` in a segment.
- [catchError](./catch-error.md) — a component-level boundary that lets these
  control-flow errors through.
- [Redirects](../nextjs-routing/redirects.md) — `next.config.ts` redirects and
  `proxy.ts`, which respond before rendering starts.
- [Streaming](../nextjs-rendering/streaming.md) — why the status code is fixed once
  the first chunk is sent.
- [Protecting routes](../nextjs-auth/protecting-routes.md) — where authorization
  checks belong, and where `forbidden()` fits.
