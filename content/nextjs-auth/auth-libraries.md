---
title: Auth libraries
description: Better Auth, Auth.js and hosted identity providers in a Next.js 16.3 app, how to choose between them, and why each one still needs your Data Access Layer.
group: nextjs-auth
order: 30
status: current
related: [nextjs-auth/data-access-layer, nextjs-auth/sessions, nextjs-auth/protecting-routes, data-fetching/caching]
---

## Overview

The official Next.js authentication guide shows hand-written sessions "for
educational purposes" and recommends an authentication library for real apps.
A library gives you sign-in flows, session storage, OAuth providers, and often
multi-factor authentication and account management.

There are three broad options:

| Option | What it is | Version to use (September 2026) |
|---|---|---|
| **Better Auth** | Open-source TypeScript library. Runs in your app, stores users and sessions in your database. | `better-auth` **1.7.5**, stable. Peer range `next ^14 \|\| ^15 \|\| ^16`. |
| **Auth.js** | Open-source library, formerly NextAuth.js, published as `next-auth`. | **v5 is beta** (`5.0.0-beta.32`). The stable line is **v4** (`4.24.15`), which is older. |
| **Hosted providers** | A service runs identity for you and ships a Next.js SDK. The Next.js guide lists Auth0, Clerk, Descope, Kinde, Logto, Ory, Stack Auth, Supabase, Stytch and WorkOS. | Follow each provider's own Next.js quickstart. |

Whatever you choose, it answers "who is this user". **It does not decide what
that user may do with your data.** That remains your
[Data Access Layer](./data-access-layer.md).

## Why it exists

Credentials and sessions are often subtly wrong: timing leaks in password
checks, OAuth `state` and PKCE handling, token refresh, email verification links
that never expire. A maintained library concentrates that work in code that many
teams review and patch.

What a library cannot know is your domain. It does not know that a member may
read an invoice but only its owner may void it. That rule is authorization, and
it belongs next to the data.

## When to use it

- You need social sign-in, magic links, passkeys or multi-factor authentication.
- You need password reset and email verification and do not want to design them.
- You want users and sessions in your own database: consider Better Auth.
- You want identity entirely outside your infrastructure, with an admin
  dashboard and compliance paperwork: consider a hosted provider.

## When not to use it

- An internal tool with a handful of users and a single password might need only
  the [session code](./sessions.md) and the DAL.
- Do not adopt a library to avoid writing authorization checks. It will not
  write them for you.
- Do not put a beta release into production without accepting that its API can
  change between releases. That applies to Auth.js v5.

## Basic example

### Better Auth

Install the pinned version:

```bash
npm install better-auth@1.7.5
```

Better Auth's documentation creates the server instance in `lib/auth.ts`. The
`nextCookies()` plugin lets calls made inside Server Actions set cookies, and the
Better Auth docs say to keep it last in the `plugins` array. Configure the
database adapter as the Better Auth installation guide describes. It is left
out here.

```ts file="lib/auth.ts"
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';

export const auth = betterAuth({
  // database: configure your adapter here, following the Better Auth docs.
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
});
```

Mount its HTTP API in a catch-all Route Handler at
`app/api/auth/[...all]/route.ts`, whose body is
`export const { GET, POST } = toNextJsHandler(auth);` with `toNextJsHandler`
imported from `better-auth/next-js`.

On the server, read the session by passing the request headers to
`auth.api.getSession`. Wrap it in your DAL:

```ts file="lib/dal.ts"
import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export const verifySession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { userId: session.user.id };
});
```

### Auth.js (beta)

> [!WARNING]
> **Beta.** Auth.js v5 is published as `next-auth@5.0.0-beta.32`. Its
> installation guide installs `next-auth@beta`. The latest stable `next-auth` is
> 4.24.15, an older line with a different API and its own documentation. Do not
> describe v5 as stable, and pin the exact beta you tested.

```bash
npm install next-auth@5.0.0-beta.32
```

The Auth.js guide creates `auth.ts` at the project root and exports four things
from one `NextAuth()` call:

```ts file="auth.ts"
import NextAuth from 'next-auth';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [],
});
```

It mounts `handlers` in `app/api/auth/[...nextauth]/route.ts` as
`export const { GET, POST } = handlers;`, requires an `AUTH_SECRET` environment
variable (its CLI generates one with `npx auth secret`), and reads the session on
the server with `await auth()`. Again, call that from your DAL:

```ts file="lib/dal.ts"
import 'server-only';

import { cache } from 'react';
import { auth } from '@/auth';

export const verifySession = cache(async () => {
  const session = await auth();
  if (!session?.user) return null;
  return { user: session.user };
});
```

### Hosted providers

Each provider ships its own SDK, its own session helper and its own proxy
integration, and they change faster than this page can track. Follow the
provider's Next.js quickstart. Then apply the same rule: one `verifySession()`
in `lib/dal.ts` that calls the provider's server-side session function, and
every data access goes through it.

## How it works

Every option splits into the same two halves:

1. **The identity half, owned by the library.** Routes for sign-in, callbacks
   and sign-out, usually a catch-all Route Handler, plus the logic that creates
   and validates the session cookie.
2. **The authorization half, owned by you.** A `server-only` DAL that calls the
   library's server-side session function, wraps it in React `cache()`, then
   checks the user's right to each resource.

Wrapping the library call in [`cache()`](../data-fetching/caching.md) matters
more with a library than without one. A database-backed `getSession` may query
the database on each call, and a page with five components that each check the
user would otherwise run five queries.

## Common patterns

### Choosing

| If you need | Lean toward |
|---|---|
| Users and sessions in your own Postgres or MySQL, open source | Better Auth |
| A stable, non-beta release today, with many OAuth providers | Better Auth, or a hosted provider |
| An app already on NextAuth.js v4 | Stay on v4 until you can test the v5 beta or migrate |
| Enterprise SSO (SAML, SCIM), audit logs, no identity infrastructure to run | A hosted provider |
| Zero third-party dependencies, one or two roles | Your own [sessions](./sessions.md) |

Weigh the exit cost too. A library that stores users in your database is easier
to leave than a hosted provider that owns the password hashes.

### Library helpers in `proxy.ts`

Both libraries document `proxy.ts` integrations. Better Auth offers
`getSessionCookie(request)` from `better-auth/cookies`, and its own docs warn
that it only checks that the cookie exists and does not validate it. The Auth.js
guide shows `export { auth as proxy } from "@/auth"` to keep the session alive.
Neither turns `proxy.ts` into an authorization layer. See
[Protecting routes](./protecting-routes.md).

## Security considerations

A library's session check proves identity. It does not check that user 7 owns
invoice 42. Insecure direct object references (IDOR) survive every auth library,
because the bug is in your data access. See
[IDOR](../nextjs-security/idor.md).

Keep library secrets (`AUTH_SECRET`, OAuth client secrets) server-only, and keep
the library itself updated: an auth library is security-critical code.

## Common mistakes

**Calling the library's session function in every component instead of the
DAL.** Authorization logic then spreads across the tree, and one component
forgets it.

**Assuming the library protects Server Actions.** It does not run inside your
actions unless you call it. Every action calls `verifySession()` first.

**Trusting `getSessionCookie()` or any cookie-presence helper as a real check.**
Anyone can set a cookie with the right name.

**Installing `next-auth` without a version and expecting v5.** Plain
`npm install next-auth` resolves to the stable v4 line. The v5 API is under the
`beta` tag.

**Copying a proxy example that calls the database on every request.** Proxy runs
for every matched request, including prefetches. The Next.js guide recommends
reading only the cookie there.

## Related topics

- [Data Access Layer](./data-access-layer.md) — where the library's session call
  belongs.
- [Sessions](./sessions.md) — what a library does for you, written out by hand.
- [Protecting routes](./protecting-routes.md) — library proxy helpers are still
  optimistic.
- [Caching](../data-fetching/caching.md) — React `cache()`, which deduplicates
  the library's session lookup per request.
- [Route Handlers](../nextjs-backend/route-handlers.md) — the file convention
  every library's catch-all auth route uses.
