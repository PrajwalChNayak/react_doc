---
title: Role-based access
description: Model roles and permissions, check them in the Data Access Layer on every request, and render 403 and 401 pages with the experimental forbidden() and unauthorized().
group: nextjs-auth
order: 60
status: current
related: [nextjs-auth/data-access-layer, nextjs-auth/protecting-routes, nextjs-auth/sessions, server-react/server-functions]
---

## Overview

Role-based access control (RBAC) answers "may a user with this role perform this
action?" In a Next.js app, three decisions shape it:

1. **Where the role comes from:** a claim stored in the session cookie, or a
   lookup on every request.
2. **Where it is checked:** in the [Data Access Layer](./data-access-layer.md),
   in the function that reads or writes the data.
3. **How a denial is shown:** a redirect, a `403` page rendered by the
   experimental `forbidden()`, or a `401` / `403` response from a Route Handler.

Hiding a button from members is part of the user interface. It is not part of
authorization, because the endpoint behind the button is still reachable.

## Why it exists

"Signed in" is rarely the right line. A member can view the dashboard but not
the user list. A billing admin can refund, but a support agent cannot. Without a
single place to express those rules, they end up as `if (user.role === 'admin')`
scattered across pages, actions and API routes, and the copies drift apart.

Checking roles in the DAL keeps one rule per action, applied by every entry
point that performs that action.

## When to use it

- Your app has a small, stable set of roles (`admin`, `member`, `viewer`).
- Permissions map cleanly from roles, with no per-record exceptions.
- You need a clear `403` page for signed-in users who lack access.

## When not to use it

- **Ownership rules** ("only the author may edit this post") are not roles.
  Check them per resource in the DAL, as the
  [Data Access Layer](./data-access-layer.md) page shows with invoices. Most apps
  need both.
- **Complex policies** (attributes, organizations, sharing) outgrow a role map.
  A policy engine or your auth provider's authorization product may fit better,
  but the check still runs in the DAL.

## Basic example

A role-to-permission map in the DAL, from the
[auth example app](../../examples/nextjs/auth/README.md):

```ts file="lib/dal.ts"
import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/session';
import { findUserById, listAllUsers } from '@/lib/users';

export type Role = 'admin' | 'member';
export type Session = { userId: string; role: Role };
type Permission = 'dashboard:view' | 'users:list';

const permissions: Record<Role, readonly Permission[]> = {
  admin: ['dashboard:view', 'users:list'],
  member: ['dashboard:view'],
};

export function can(session: Session, permission: Permission) {
  return permissions[session.role].includes(permission);
}

export const verifySession = cache(async (): Promise<Session | null> => {
  const payload = await decrypt((await cookies()).get('session')?.value);
  if (!payload) return null;

  // The role is read from the user record on every request, not from the cookie.
  const user = await findUserById(payload.userId);
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;
  return { userId: user.id, role: user.role };
});

export type AuthResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' };

export type AdminUserRowDTO = { id: string; name: string; email: string; role: Role };

export async function listUsersForAdmin(): Promise<AuthResult<AdminUserRowDTO[]>> {
  const session = await verifySession();
  if (!session) return { status: 'unauthenticated' };
  if (!can(session, 'users:list')) return { status: 'forbidden' };

  const users = await listAllUsers();
  return {
    status: 'ok',
    data: users.map((user: AdminUserRowDTO) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })),
  };
}
```

Code outside the DAL asks for a **permission** (`users:list`), not a role. Adding
a `support` role later then means editing one map, not every page that compared
against `'admin'`.

## How it works

### Role in the session, or looked up per request

| | Role stored in the cookie | Role looked up per request |
|---|---|---|
| Cost | No lookup | One query per request, deduplicated by React `cache()` |
| Demoting a user takes effect | When the token expires or is rotated | On the next request |
| Readable by the client | Yes, if the token is only signed | No |
| Good for | Optimistic UI hints and proxy redirects | Every authoritative check |

The official authentication guide suggests keeping the minimum in the session
payload, such as the user ID and role. If you do store the role there, treat it
as a hint for [optimistic checks](./protecting-routes.md). The example app
stores only the user ID and a session version, and reads the role from the user
record in `verifySession()`.

If you keep the role in the token for performance, [rotate the
session](./sessions.md) whenever the role changes, and keep expiry short.

### The same check for pages, actions and APIs

A page maps the result to navigation:

```tsx file="app/admin/page.tsx"
import { forbidden, redirect } from 'next/navigation';
import { listUsersForAdmin } from '@/lib/dal';

type AdminUserRow = { id: string; name: string; email: string; role: string };

export default async function AdminPage() {
  const result = await listUsersForAdmin();
  if (result.status === 'unauthenticated') redirect('/login');
  if (result.status === 'forbidden') forbidden();

  return (
    <main>
      <h1>Users</h1>
      <ul>
        {result.data.map((user: AdminUserRow) => (
          <li key={user.id}>
            {user.name} ({user.role})
          </li>
        ))}
      </ul>
    </main>
  );
}
```

A Route Handler maps it to status codes, returning `401` for "who are you?" and
`403` for "I know who you are, and no":

```ts file="app/api/admin/users/route.ts"
import { listUsersForAdmin } from '@/lib/dal';

export async function GET() {
  const result = await listUsersForAdmin();

  if (result.status === 'unauthenticated') {
    return Response.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (result.status === 'forbidden') {
    return Response.json({ error: 'Admins only.' }, { status: 403 });
  }
  return Response.json({ users: result.data });
}
```

A Server Action checks the permission before mutating, because it is its own
public endpoint whatever page rendered its button:

```ts file="app/admin/users/actions.ts"
'use server';

import * as z from 'zod';
import { revalidatePath } from 'next/cache';
import { can, verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

const ChangeRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'member']),
});

export async function changeUserRole(formData: FormData) {
  const session = await verifySession();
  if (!session) return { error: 'Sign in to continue.' };
  if (!can(session, 'users:list')) return { error: 'Only admins can change roles.' };

  const parsed = ChangeRoleSchema.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { error: 'Invalid request.' };

  // Bumping the session version signs the user out everywhere, so a demoted
  // admin cannot keep acting on an old session.
  await db.users.updateRole({
    userId: parsed.data.userId,
    role: parsed.data.role,
    incrementSessionVersion: true,
  });
  revalidatePath('/admin');
  return { error: null };
}
```

In a real app, give role changes their own permission (for example
`users:manage`) rather than reusing `users:list`.

### `forbidden()` and `unauthorized()`

> [!WARNING]
> **Experimental.** `forbidden()`, `unauthorized()` and the `forbidden.tsx` /
> `unauthorized.tsx` file conventions require `experimental.authInterrupts: true`
> in `next.config.ts`. They are marked experimental in the Next.js 16.3.5 docs,
> and their behavior may change.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
```

Both come from `next/navigation` and work like `notFound()`:

- `forbidden()` throws, ends rendering of the segment, and renders the nearest
  `forbidden.tsx` with a `403` status. Use it for a signed-in user without
  permission.
- `unauthorized()` does the same with `unauthorized.tsx` and a `401` status. Use
  it for a request that is not signed in, for example to show a sign-in form in
  place instead of redirecting.
- Both can be called in Server Components, Server Functions and Route Handlers.
  Neither can be called in the root layout.
- Both return `never`, so you do not write `return forbidden()`. A `try/catch`
  around the call swallows it, unless you rethrow with `unstable_rethrow`.
- Next.js adds a `noindex` robots meta tag to the rendered page.

```tsx file="app/forbidden.tsx"
import Link from 'next/link';

export default function Forbidden() {
  return (
    <main>
      <h1>403: Forbidden</h1>
      <p>Your account does not have access to this page.</p>
      <Link href="/dashboard">Back to the dashboard</Link>
    </main>
  );
}
```

**Status codes and streaming.** If the check runs inside a `<Suspense>` boundary,
the response has already started streaming with a `200`. The `forbidden()` UI
still replaces the streamed-in content, but the status cannot change. The
`forbidden` reference notes that with Cache Components every dynamic route
streams a static shell first. If you need a real `403` status, the check must run
before streaming starts, which in that setup means `proxy.ts`. For an API, return
the status yourself from the Route Handler, as above.

## Server and client implications

Pass the result of a permission check to Client Components as a boolean prop,
never the permission map or the session. The client then decides what to show,
and the server still decides what to allow:

```tsx file="app/dashboard/page.tsx"
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, verifySession } from '@/lib/dal';

export default async function DashboardPage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  return (
    <main>
      <h1>Dashboard</h1>
      {/* UI only: /admin and /api/admin/users check the permission themselves. */}
      {can(session, 'users:list') && <Link href="/admin">Manage users</Link>}
    </main>
  );
}
```

## Common patterns

### Hide the UI, and still check

Hide links and buttons users cannot use: it is better UX. Then assume someone
will call the endpoint anyway. The data security guide's audit checklist asks, for
every `"use server"` file, whether the user is re-authorized inside the action.

### Optimistic role redirects in proxy

If the signed token carries a role hint, `proxy.ts` can send members away from
`/admin` before rendering. That improves UX for stale bookmarks. It is never the
check. The page still calls the DAL, which reads the current role.

### Deny by default

Write `can()` so an unknown role or permission returns `false`. A typo in a
permission name then locks a feature, which someone notices, instead of opening
it, which nobody notices.

## Security considerations

A member calling `POST` on an admin-only Server Action, or `GET` on an admin
API, is the most common RBAC bug. The walkthroughs are in
[Server Actions authorization](../nextjs-security/server-actions-authorization.md)
and [Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md).

## Common mistakes

**Hiding the admin link and calling it access control.** The page, the action
and the Route Handler must each check.

**Trusting a role from the cookie for authoritative checks.** It is stale after a
demotion, and readable if the token is only signed.

**Checking the role on the page but not in the Server Action.** A page-level
check does not extend to the actions defined on it.

**Using `forbidden()` without enabling `authInterrupts`.** The function is
experimental and needs the flag.

**Calling `forbidden()` inside `try`.** The catch swallows it and the page renders.

**Returning a redirect to an API client.** Return `401` or `403` from Route
Handlers.

**Comparing roles everywhere.** `role === 'admin'` in twenty files makes the
next role a twenty-file change. Ask for a permission.

## Related topics

- [Data Access Layer](./data-access-layer.md) — where the role and ownership
  checks run.
- [Sessions](./sessions.md) — rotating the session when a role changes.
- [Protecting routes](./protecting-routes.md) — optimistic role redirects in
  `proxy.ts`.
- [Server Functions](../server-react/server-functions.md) — why an admin-only
  action must authorize itself.
- [Not found and redirect](../nextjs-errors/not-found-and-redirect.md) — the
  related `notFound()` and `redirect()` interrupts.
