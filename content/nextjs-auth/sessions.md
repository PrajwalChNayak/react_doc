---
title: Sessions
description: Stateless and database sessions in Next.js, the cookie attributes that protect them, and creating, reading and deleting them with the async cookies() API.
group: nextjs-auth
order: 20
status: current
related: [nextjs-auth/data-access-layer, nextjs-auth/overview, nextjs-auth/auth-libraries, patterns/forms-and-actions]
---

## Overview

A session is how the server recognizes a user on the request after they signed
in. In Next.js you store it in a cookie and handle it with `cookies()` from
`next/headers`, which is **async** in Next.js 16: always
`(await cookies()).get('session')`.

There are two designs:

| | Stateless session | Database session |
|---|---|---|
| Cookie holds | The session data itself, signed (and optionally encrypted) | An opaque session ID |
| Server stores | Nothing | A row per session |
| Verify a request | Check the signature and expiry. No I/O. | Look up the ID |
| Revoke one session now | Not possible before expiry, unless you add a check (see below) | Delete the row |
| "Sign out everywhere" | Needs a per-user version or deny list | Delete the user's rows |
| Good fit | Small apps, short expiry, few revocation needs | Apps that list devices, force sign-out, or audit sessions |

The official Next.js guide recommends a session library rather than
hand-rolled cryptography, and names `jose` and `iron-session`. The examples here
use `jose` 6.2.12 for signed JWTs, as the guide does.

## Why it exists

HTTP is stateless. Without a session, every request would have to carry the
user's password. A session exchanges one successful sign-in for a credential
that expires, can be scoped to your site, and can be withdrawn.

Next.js adds a constraint that shapes the code: **cookies can be set or deleted
only in a Server Action or a Route Handler**. The `cookies` reference explains
that HTTP does not allow setting cookies after streaming starts, and Server
Component rendering streams. So creating and deleting sessions belongs in
actions, while reading them can happen anywhere on the server.

## When to use it

Write your own session layer when:

- you authenticate against your own user table with email and password, or you
  receive a verified identity from a provider and only need to remember it,
- you want to understand exactly what an auth library does for you,
- you need a small, dependency-light app, like the
  [auth example](../../examples/nextjs/auth/README.md).

## When not to use it

If you need OAuth sign-in, email verification, password reset, multi-factor
authentication or account linking, use a library or hosted provider. Each of
those flows has well-known pitfalls. See [Auth libraries](./auth-libraries.md).
A library replaces this page's code, not the
[Data Access Layer](./data-access-layer.md).

## Basic example

Generate a secret and keep it out of source control:

```bash
openssl rand -base64 32
```

```text file=".env.local"
SESSION_SECRET=paste-the-generated-value-here
```

Sign and verify tokens in a `server-only` module:

```ts file="lib/session.ts"
import 'server-only';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

type SessionPayload = { userId: string; sessionVersion: number; expiresAt: string };

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(new Date(payload.expiresAt))
    .sign(getKey());
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string' || typeof payload.sessionVersion !== 'number') {
      return null;
    }
    return {
      userId: payload.userId,
      sessionVersion: payload.sessionVersion,
      expiresAt: String(payload.expiresAt),
    };
  } catch {
    return null;
  }
}

export async function createSession(userId: string, sessionVersion: number) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encrypt({ userId, sessionVersion, expiresAt: expiresAt.toISOString() });

  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}
```

Three details are deliberate. `decrypt()` returns `null` rather than throwing,
because the token comes from the client and a malformed one is normal input.
`jwtVerify` is given `algorithms: ['HS256']`, so a token claiming a different
algorithm is rejected. And `getKey()` fails loudly on a missing secret instead
of signing with an empty key.

> [!WARNING]
> A JWT signed with `SignJWT` is **signed, not encrypted**. Anyone holding the
> cookie can base64-decode the payload. Put only an ID and a version in it.
> Never put an email address, a role you rely on without re-checking, or any
> secret. If the payload must be confidential, use an encrypting library such as
> `iron-session`, or a database session.

## How it works

### The cookie attributes

`cookieStore.set(name, value, options)` accepts the attributes the `cookies`
reference lists. These are the ones that protect a session:

| Attribute | Set it to | Why |
|---|---|---|
| `httpOnly` | `true` | Client JavaScript cannot read the cookie, so an XSS bug cannot exfiltrate it. |
| `secure` | `true` in production | The cookie is sent only over HTTPS. The example relaxes it outside production so `next dev` works over plain HTTP. |
| `sameSite` | `'lax'` | The browser does not send the cookie on cross-site subrequests and cross-site POSTs, which blunts CSRF. `'strict'` also drops it on top-level cross-site links, which breaks "open from email" flows. |
| `expires` or `maxAge` | Match the token's own expiry | The browser discards the cookie when the token would be rejected anyway. |
| `path` | `'/'` | The default. Scope it narrower only if the session is for one area. |

The cookie expiry is a convenience. The **token's** `exp` claim is the one that
counts, because a client can keep sending a cookie after its `expires` date.

### Creating a session in a Server Action

Validate input, authenticate, then create the session and redirect:

```ts file="app/actions/auth.ts"
'use server';

import * as z from 'zod';
import { redirect } from 'next/navigation';
import { createSession, deleteSession } from '@/lib/session';
import { checkCredentials } from '@/lib/users';

const LoginFormSchema = z.object({
  email: z.email({ error: 'Enter a valid email address.' }).trim(),
  password: z.string().min(1, { error: 'Enter your password.' }),
});

export type LoginFormState =
  | { errors?: { email?: string[]; password?: string[] }; message?: string }
  | undefined;

export async function login(_state: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = LoginFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const user = await checkCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    return { message: 'Invalid email or password.' };
  }

  await createSession(user.id, user.sessionVersion);
  redirect('/dashboard');
}

export async function logout() {
  await deleteSession();
  redirect('/login');
}
```

`redirect()` works by throwing, so keep it outside any `try/catch`. The form
side, with `useActionState`, is the standard React pattern in
[useActionState](../hooks/use-action-state.md). The same error message for "no
such user" and "wrong password" stops the form from confirming which emails
have accounts.

### Reading a session

Read and verify the session in exactly one place: `verifySession()` in the
[Data Access Layer](./data-access-layer.md). Pages, Server Actions and Route
Handlers call that function. None of them read the cookie directly.

```ts file="lib/dal.ts"
import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/session';
import { findUserById } from '@/lib/users';

export const verifySession = cache(async () => {
  const payload = await decrypt((await cookies()).get('session')?.value);
  if (!payload) return null;

  const user = await findUserById(payload.userId);
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;

  return { userId: user.id, role: user.role };
});
```

### Deleting a session

`cookieStore.delete('session')` is allowed only in a Server Action or Route
Handler, and only for a cookie on the same domain and protocol it was set on.
A sign-out button is a form whose `action` is the `logout` Server Action. Never
sign users out as a side effect of rendering a page, for example on
`?logout=1`. The data security guide calls this out explicitly, and a GET that
changes state is a CSRF target.

## Common patterns

### Rotation

Issue a **new** token whenever the user's privileges change:

- on sign-in (never reuse a token that existed before authentication),
- on a role change or password change,
- on "sign out of all devices".

Deleting the old cookie and setting a new one is the whole rotation for a
stateless session. For a database session, delete the old row too.

### Revoking stateless sessions early

A signed token stays valid until it expires. The example app stores a
`sessionVersion` on each user and copies it into the token. `verifySession()`
compares the two on every request, so incrementing the stored version revokes
every token issued before it. It costs one user lookup per request, which the
DAL does anyway to read the current role.

### Sliding expiry

To keep active users signed in, re-issue the cookie with a later expiry when
they return. Do it where cookies can be written: a Server Action, a Route
Handler, or `proxy.ts`, which can set cookies on the `NextResponse` it returns.
Re-sign a new token rather than extending the cookie alone, because the token's
own `exp` claim is what verification checks.

### Database sessions

The cookie carries a random, unguessable session ID and the row carries
everything else:

```ts file="lib/db-session.ts"
import 'server-only';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function createDatabaseSession(userId: string) {
  const sessionId = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.sessions.insert({ id: sessionId, userId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set('session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function readDatabaseSession() {
  const sessionId = (await cookies()).get('session')?.value;
  if (!sessionId) return null;

  const session = await db.sessions.findById(sessionId);
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return session;
}
```

`db` stands in for your database client. Store a hash of the session ID rather
than the raw value if a database leak must not hand out live sessions.

## Caching implications

`cookies()` is a request-time API. A plain `"use cache"` function cannot call
it, so do not wrap `verifySession()` in `"use cache"`. React `cache()` is the
right tool: it deduplicates within one request and never shares a result
between users. With Cache Components, `"use cache: private"` can read cookies
directly and keeps its result out of server caches. See
[Data Access Layer](./data-access-layer.md).

## Security considerations

Keep `SESSION_SECRET` in server-only environment variables, never with a
`NEXT_PUBLIC_` prefix, which would ship it to the browser. Rotating the secret
signs everyone out, which is the right response to a leak. See
[Environment variable leaks](../nextjs-security/environment-variable-leaks.md).

## Common mistakes

**Calling `cookies()` synchronously.** It returns a promise in Next.js 16. Write
`(await cookies()).get('session')`, or `const cookieStore = await cookies()`.

**Setting or deleting a cookie in a Server Component.** It fails, because the
response has already started streaming. Do it in a Server Action or Route
Handler.

**Treating a decoded JWT as a verified one.** Decoding reads the payload.
`jwtVerify` checks the signature and expiry. Only the second proves anything.

**Putting the role or email in the token and trusting it.** The payload is
readable, and it is stale the moment an admin changes the user's role. Look the
role up in the DAL.

**Letting `decrypt()` throw on bad input.** A tampered cookie then becomes a 500
error instead of a signed-out user.

**Omitting `httpOnly`.** Any script injection can then read the session.

**Reusing the pre-login cookie after sign-in.** Always issue a fresh token.

## Related topics

- [Data Access Layer](./data-access-layer.md) — the only place that reads and
  verifies the session.
- [Auth libraries](./auth-libraries.md) — when to hand sessions to Better Auth,
  Auth.js or a hosted provider.
- [Protecting routes](./protecting-routes.md) — the optimistic cookie check in
  `proxy.ts`.
- [Forms and actions](../patterns/forms-and-actions.md) — the React form
  pattern the login action plugs into.
- [Server Actions](../nextjs-mutations/server-actions.md) — where cookies may be
  written.
