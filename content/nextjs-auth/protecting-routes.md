---
title: Protecting routes
description: Use proxy.ts for fast, optimistic redirects based on the session cookie, and re-check in the Data Access Layer on every page, Server Action and Route Handler.
group: nextjs-auth
order: 50
status: current
since: "16.0"
related: [nextjs-auth/data-access-layer, nextjs-auth/overview, nextjs-backend/proxy, server-react/server-functions]
---

## Overview

Protecting a route in Next.js takes two checks with different jobs:

| | Optimistic check | Authoritative check |
|---|---|---|
| Where | `proxy.ts` | The [Data Access Layer](./data-access-layer.md), called from the page, action or handler |
| Looks at | The session cookie: present, or at most validly signed | The verified session **and** the current user record |
| Database calls | None | Yes, as needed |
| Covers | Whatever the `matcher` matches | Every call to the DAL function, whatever the entry point |
| Failure means | A slower redirect, or a page that renders a sign-in prompt | Data exposure |
| Purpose | User experience and routing | Security |

In Next.js 16, `proxy.ts` replaced `middleware.ts`, which is deprecated. It
runs on the Node.js runtime, before routing.

## Why it exists

Without an early check, a signed-out user who opens `/dashboard` starts a full
server render that ends in a redirect. `proxy.ts` can answer with a redirect
before any rendering work, and it can keep signed-in users away from `/login`.

That is a routing convenience. It is not authorization, for three reasons:

1. **The matcher decides coverage.** A path outside the matcher, a new route, or
   a moved Server Function is not covered, and nothing warns you.
2. **Proxy sees a cookie, not a user.** The Next.js guide tells you to avoid
   database calls in `proxy.ts`, because it runs on every matched request
   including prefetches. So it cannot know the user was deleted or demoted.
3. **Proxy can be bypassed.** CVE-2026-64642, fixed in the July 2026 security
   release (16.2.11, 15.5.21 and 16.3.0), was a proxy/middleware bypass with
   Turbopack and a single `i18n` locale. Apps that also checked in the DAL were
   not exposed.

## When to use it

- Redirect signed-out browsers from `/dashboard` and `/admin` to `/login`.
- Redirect signed-in users from `/login` to `/dashboard`.
- Protect prerendered pages that do not run per-request code. The
  authentication guide notes that a DAL protects request-time data, but data
  fetched at build time for a static route is not re-checked, so proxy is the
  place to gate it. Anything truly sensitive should not be prerendered.

## When not to use it

- As the only check for any page, Server Action or Route Handler.
- For role checks that read the database. Do those in the DAL.
- For API routes whose clients are not browsers. A redirect to `/login` is the
  wrong answer for `curl` or a mobile app. Let the Route Handler return `401`.

## Basic example

The optimistic check from the
[auth example app](../../examples/nextjs/auth/README.md):

```ts file="proxy.ts"
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has('session');

  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
```

And the authoritative check in the page, after `verifySession()`:

```tsx file="app/dashboard/page.tsx"
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal';

export default async function DashboardPage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as user {session.userId}.</p>
    </main>
  );
}
```

A request with a forged `session=anything` cookie passes `proxy.ts`, because a
cookie is present. `verifySession()` then fails to verify the signature and the
page redirects. The example app's README shows this with `curl`.

## How it works

### What `proxy.ts` receives

`proxy.ts` lives at the project root (or in `src/`) and exports one function,
named `proxy` or as the default export. It receives a `NextRequest`, whose
`request.cookies.has()` and `request.cookies.get()` read the incoming cookies.
It can return `NextResponse.redirect()`, `NextResponse.rewrite()`,
`NextResponse.next()` or a `Response`.

The official authentication guide goes one step further and verifies the token
signature in proxy, which costs no database call. That is still optimistic: a
validly signed token can belong to a user who was deleted a minute ago.

### Execution order

The `proxy` reference lists where proxy runs: after `headers` and `redirects`
from `next.config`, before `beforeFiles` rewrites and filesystem routes. It runs
before any page, layout or Route Handler code.

### Page-level `redirect()`

`redirect()` from `next/navigation` throws a `NEXT_REDIRECT` error that ends
rendering of the segment. You do not write `return redirect()`. Two rules follow:

- Call it **outside** `try/catch`, or the catch swallows it.
- Call it in the render path. In a streaming context the redirect is emitted as
  a client-side meta tag, not an HTTP `307`, because the status line has already
  been sent. That still stops the user, and the data never rendered.

In a Server Action, `redirect()` performs a client-side navigation, or a `303`
for a form submitted before JavaScript loaded.

### Server Actions and Route Handlers protect themselves

The `proxy` reference is explicit: Server Functions are not separate routes.
They are POST requests to the route where they are used, so a matcher that
excludes that path also skips the action. Every action calls the DAL first:

```ts file="app/dashboard/actions.ts"
'use server';

import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export async function renameWorkspace(formData: FormData) {
  const session = await verifySession();
  if (!session) {
    return { error: 'Sign in to continue.' };
  }

  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 60) {
    return { error: 'Use 2 to 60 characters.' };
  }

  await db.workspaces.renameForOwner({ ownerId: session.userId, name });
  revalidatePath('/dashboard');
  return { error: null };
}
```

## Common patterns

### Matcher pitfalls

- **A matcher is an allowlist for proxy, not for security.** Listing
  `/dashboard/:path*` means `/reports` is not covered until someone remembers to
  add it.
- **Excluding `/api` is common and correct for redirects**, which is exactly why
  Route Handlers must authorize themselves. The authentication guide's own
  matcher excludes `api`.
- **Matcher values must be constants.** They are analyzed at build time.
  The `proxy` reference says dynamic values such as variables are ignored, so
  write the paths inline.
- **Paths are anchored to the start.** `/about` matches `/about` and
  `/about/team`, but not `/blog/about`. Use `:path*` for nested routes.
- **Without a matcher, proxy runs on every request**, including `_next/static`,
  `_next/image` and `public/` files. An auth redirect there can block CSS, JS
  and images for the login page itself. Use a negative lookahead such as
  `'/((?!api|_next/static|_next/image|favicon.ico).*)'` if you want broad coverage.

### Redirecting signed-in users away from `/login`

Add `/login` to the matcher and redirect when the cookie is present. Make sure
the page that receives a stale or forged cookie clears it or tolerates it,
otherwise `/dashboard` redirects to `/login` and proxy sends the user straight
back. The example app avoids the loop by not matching `/login`.

### Do not build open redirects

A `?from=/dashboard` parameter that the login action passes to `redirect()` is
an open redirect if it can hold `https://evil.example`. Allow only relative
paths you recognize. See [Open redirects](../nextjs-security/open-redirects.md).

## Security considerations

The full exploit, with a vulnerable proxy-only app and the fix, is in
[Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md).
Stay on `next@16.3.3` or later (pin 16.3.5): see
[Security advisories](../nextjs-security/security-advisories.md).

## Common mistakes

**Protecting only in `proxy.ts`.** A matcher gap, a moved Server Function or a
framework bypass then exposes the data.

**Querying the database in `proxy.ts`.** It runs for every matched request,
including prefetches. Keep it to the cookie.

**Checking auth in a layout instead of the page.** Layouts are not re-rendered
on client navigation, and do not stop nested pages or actions. See the
[overview](./overview.md).

**Redirecting inside `try`.** The catch block receives `NEXT_REDIRECT` and the
redirect never happens.

**Redirecting API clients.** A Route Handler should return `401` or `403`.

**Still writing `middleware.ts`.** It was renamed to `proxy.ts` in Next.js 16
and is deprecated. The codemod is
`npx @next/codemod@canary middleware-to-proxy .`

## Related topics

- [Data Access Layer](./data-access-layer.md) — the authoritative check proxy
  cannot replace.
- [Proxy](../nextjs-backend/proxy.md) — the full `proxy.ts` reference: matchers,
  rewrites and headers.
- [Server Functions](../server-react/server-functions.md) — why every action is
  its own public endpoint.
- [Role-based access](./role-based-access.md) — going beyond signed in versus
  signed out.
- [Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md)
  — the exploit walkthrough.
