---
title: Authentication and authorization overview
description: Authentication, session management and authorization in a Next.js 16.3 app, and which layer is allowed to make the final decision.
group: nextjs-auth
order: 10
status: current
related: [nextjs-auth/sessions, nextjs-auth/data-access-layer, nextjs-auth/protecting-routes, server-react/server-functions]
---

## Overview

Auth in a Next.js app is three separate jobs, and most security bugs come from
doing one of them in the wrong place:

| Job | Question it answers | Where it lives in Next.js |
|---|---|---|
| **Authentication** | Who is this person? | A Server Action (or an auth library's Route Handler) that checks credentials |
| **Session management** | How do we remember them on the next request? | A signed or encrypted cookie, set with `await cookies()` in a Server Action or Route Handler |
| **Authorization** | May this user read or change *this* data? | The Data Access Layer (DAL), on every request, next to the data |

This group documents all three for the App Router in Next.js 16.3:

- [Sessions](./sessions.md): stateless cookies with `jose` versus database
  sessions, and the cookie attributes that matter.
- [Auth libraries](./auth-libraries.md): Better Auth, Auth.js (beta) and hosted
  providers, and why each still needs your DAL.
- [Data Access Layer](./data-access-layer.md): the authoritative pattern, with
  `server-only`, `verifySession()` in React `cache()`, and DTOs.
- [Protecting routes](./protecting-routes.md): what `proxy.ts` is for, and what
  it cannot do.
- [Role-based access](./role-based-access.md): roles, permissions, and the
  experimental `forbidden()` / `unauthorized()`.

Every page is backed by the runnable
[auth example app](../../examples/nextjs/auth/README.md).

## Why it exists

A single-page app has one entry point: the JavaScript bundle. If the router
hides a screen, the user never sees it, and the real checks live in a separate
API.

A Next.js app has many entry points in one codebase. Every page, every Server
Action and every Route Handler is reachable directly over HTTP. `proxy.ts` runs
in front of some of them, depending on its matcher. So the question is not
"where do I put *the* auth check" but "which of these layers is allowed to be
the one that says no".

The answer this site gives, following the official Next.js guides, is: `proxy.ts`
and layouts give fast, optimistic redirects for a better user experience. The
DAL makes the authoritative decision, close to the data, every time.

## When to use it

Read this group when you are:

- adding sign-in to an App Router app, with or without a library,
- deciding where session checks go before writing the first protected page,
- reviewing an app whose only protection is `proxy.ts` or a check in a layout,
- adding roles to an app that so far only distinguished signed in from signed out.

## When not to use it

This group does not teach the React side of forms and Server Functions. For
`useActionState`, pending state and form resets, see
[Forms and actions](../patterns/forms-and-actions.md). For the exploit
walkthroughs, see the [Security](../nextjs-security/overview.md) group. For an
identity protocol such as OAuth or OpenID Connect, follow your provider's
documentation. A library or hosted provider should implement those flows, not
your app.

## Basic example

The whole chain in four files. Each is shown in full on its own page.

A Server Action authenticates and creates the session:

```ts file="app/actions/auth.ts"
'use server';

import { redirect } from 'next/navigation';
import { checkCredentials } from '@/lib/users';
import { createSession } from '@/lib/session';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const user = await checkCredentials(email, password);
  if (!user) {
    return;
  }

  await createSession(user.id, user.sessionVersion);
  redirect('/dashboard');
}
```

The DAL verifies the session once per request:

```ts file="lib/dal.ts"
import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/session';
import { findUserById } from '@/lib/users';

export const verifySession = cache(async () => {
  const token = (await cookies()).get('session')?.value;
  const payload = await decrypt(token);
  if (!payload) return null;

  const user = await findUserById(payload.userId);
  if (!user) return null;

  return { userId: user.id, role: user.role };
});
```

A page uses the DAL, not the cookie:

```tsx file="app/dashboard/page.tsx"
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal';

export default async function DashboardPage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  return <h1>Your dashboard</h1>;
}
```

And `proxy.ts` redirects signed-out browsers early, without being trusted:

```ts file="proxy.ts"
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (!request.cookies.has('session')) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

Delete `proxy.ts` and the app is exactly as secure as before. It only redirects
sooner. That property is the test of a correct design.

## How it works

### Where each check runs

| Layer | Runs for | Can it be skipped? | Use it for |
|---|---|---|---|
| `proxy.ts` | Requests its `matcher` matches, before routing | Yes: a matcher that omits a path, a moved Server Function, or a framework bug | Optimistic redirects based on the cookie. No database calls. |
| Layout | The first render of a segment | Yes: layouts are kept, not re-rendered, on client navigation | Showing session-derived UI, such as a user menu |
| Page | Each render of that page | No, for that page | Redirecting when the DAL returns no session |
| Server Action | Each POST that invokes the action | No, but it is **its own** endpoint | Calling the DAL before any mutation |
| Route Handler | Each request to that route | No, but it is **its own** endpoint | Calling the DAL and returning `401` / `403` |
| **DAL** | Every data read and write that goes through it | Only if code bypasses the DAL | **The authoritative authentication and authorization check** |

### Why a layout is not an authorization boundary

The official authentication guide gives two reasons.

First, **partial rendering**. On a client-side navigation, Next.js keeps shared
layouts and replaces only the page below them. A session check in
`app/dashboard/layout.tsx` runs when the user first enters `/dashboard`, and not
again when they move to `/dashboard/settings`. The session could have expired or
been revoked in between.

Second, **a layout does not control whether the rest of the route renders**.
Pages and parallel route slots are rendered by the router. A layout that returns
`null` or swaps out `children` for signed-out users does not stop those segments
from running, or from appearing in the RSC payload.

And a layout check never covers a Server Action defined on a page below it:
the action is a separate POST endpoint.

### Why Server Actions and Route Handlers check for themselves

A Server Action is a public HTTP endpoint. Next.js gives it an encrypted,
non-deterministic ID and removes unused actions from the client bundle, but
the data security guide is explicit that you must still treat every action as
reachable by a direct POST. React says the same about
[Server Functions](../server-react/server-functions.md). A Route Handler is an
ordinary HTTP endpoint that anyone can call with `curl`.

`proxy.ts` does not reliably stand in front of either. The `proxy` reference
notes that Server Functions are handled as POST requests to the route where they
are used, so a matcher that excludes that path also skips the action. A refactor
that moves the action changes its coverage silently.

## Server and client implications

All of this code runs on the server. Client Components cannot import the DAL:
mark it `import 'server-only'` so a mistaken import fails the build.

To show the user in a Client Component, read the session in a Server Component
and pass only the fields the UI needs as props. Hiding a button in a Client
Component based on those props is a user-experience decision, never an
authorization decision. See [Role-based access](./role-based-access.md).

## Caching implications

Reading `cookies()` makes the code that reads it request-time work. With Cache
Components enabled (`cacheComponents: true`), a plain `"use cache"` function
cannot call `cookies()` or `headers()`. The bundled authentication-with-Cache-
Components guide gives two options:

- Resolve the user outside the cached scope, then pass only the user ID into a
  `"use cache"` function that is **not exported**, so no caller can pass another
  user's ID.
- Use `"use cache: private"`, which may read `cookies()` and `headers()`
  directly. Its results are not stored in a server cache across requests. They
  can be kept in browser memory for the `cacheLife` `stale` time.

With Cache Components, a component that reads the session must also sit behind
a `<Suspense>` boundary. The [Data Access Layer](./data-access-layer.md) page
shows the pattern, and [use cache](../nextjs-data-caching/use-cache.md) covers
the directives.

## Security considerations

`proxy.ts` has been bypassed in the real world. The July 2026 Next.js security
release fixed a proxy/middleware bypass with Turbopack and a single `i18n`
locale (CVE-2026-64642), patched in 16.2.11, 15.5.21 and 16.3.0. An app whose
only protection was `proxy.ts` was exposed. An app that authorized in its DAL
was not. Run `next@16.3.3` or later, and pin 16.3.5, for the later fixes in the
[security advisories](../nextjs-security/security-advisories.md).

The exploit walkthroughs are in
[Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md)
and [Server Actions authorization](../nextjs-security/server-actions-authorization.md).

## Common mistakes

**Treating `proxy.ts` as the security boundary.** It is optimistic. It sees a
cookie, not a verified user, and its matcher decides what it covers.

**Checking auth only in a layout.** Layouts do not re-render on client
navigation, and they do not stop nested pages or Server Actions from running.

**Checking auth on the page but not in its Server Action.** The action is a
separate endpoint. A page-level redirect does not protect it.

**Stopping at authentication.** "Signed in" is not "allowed to edit invoice
42". Authorize per resource and per action, in the DAL.

**Setting cookies while rendering.** Cookies can be set only in a Server Action
or Route Handler. A Server Component that tries to log a user out during render
fails.

**Returning whole database rows to components.** Pass DTOs with only the safe
fields, so a password hash cannot reach a Client Component through props.

## Related topics

- [Sessions](./sessions.md) — create, read, rotate and delete the session cookie.
- [Data Access Layer](./data-access-layer.md) — where the authoritative check
  lives.
- [Protecting routes](./protecting-routes.md) — what `proxy.ts` is good for, and
  its matcher pitfalls.
- [Server Functions](../server-react/server-functions.md) — the React view of
  why every Server Function is a public endpoint.
- [Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md)
  — the exploit, step by step.
