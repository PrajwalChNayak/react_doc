---
title: Data Access Layer
description: The authoritative place for authentication and authorization in Next.js — a server-only module that verifies the session with React cache(), authorizes per resource, and returns safe DTOs.
group: nextjs-auth
order: 40
status: current
related: [nextjs-auth/protecting-routes, nextjs-auth/role-based-access, data-fetching/caching, server-react/directives]
---

## Overview

A Data Access Layer (DAL) is an internal module that every read and write of
protected data goes through. The Next.js data security guide recommends it for
new projects and gives it three duties:

- **Only run on the server.** Mark it `import 'server-only'`.
- **Perform authorization checks.** Verify the session, then check this user
  against this resource and this action.
- **Return safe, minimal Data Transfer Objects (DTOs).** Never raw database rows.

Pages, Server Actions and Route Handlers call the DAL. They never read the
session cookie or query protected tables themselves. That is what makes the DAL
authoritative: there is no other path to the data.

## Why it exists

A Next.js app has many entry points. A check written in each page, each action
and each Route Handler is a check that one of them will eventually forget. A
check written once, in the function that returns the data, cannot be skipped by
a new page that calls that function.

The DAL also puts authorization **after** every layer that can be bypassed.
`proxy.ts` depends on a matcher, and has had framework-level bypasses such as
CVE-2026-64642. Layouts do not re-render on client navigation. Server Actions
are public POST endpoints. A check inside `getInvoice()` runs whichever of those
paths the request took.

## When to use it

Use a DAL in every App Router app that has any data that is not public. Start
it on the first protected page, because moving data access into it later means
auditing every query.

## When not to use it

For a large organization whose data already sits behind an authenticated HTTP
API, the data security guide describes a different approach: call that API from
Server Components and forward the user's credentials, applying zero-trust rules.
The API is then the authorization layer. Do not add a second, divergent set of
rules in front of it.

The guide recommends picking one approach and not mixing it with component-level
queries, so reviewers know where to look.

## Basic example

The session check, from the
[auth example app](../../examples/nextjs/auth/README.md):

```ts file="lib/dal.ts"
import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decrypt } from '@/lib/session';
import { findUserById } from '@/lib/users';

export type Role = 'admin' | 'member';
export type Session = { userId: string; role: Role };

export const verifySession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get('session')?.value;
  const payload = await decrypt(token);
  if (!payload) return null;

  // A valid signature proves we issued the token. It does not prove the user
  // still exists or still has the same role, so look them up.
  const user = await findUserById(payload.userId);
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;

  return { userId: user.id, role: user.role };
});

export async function requireSession(): Promise<Session> {
  const session = await verifySession();
  if (!session) redirect('/login');
  return session;
}
```

`verifySession()` returns `null` instead of redirecting, so a Route Handler can
answer `401`. `requireSession()` is the page-friendly wrapper.

A DTO getter that authorizes before it returns:

```ts file="lib/dal/invoices.ts"
import 'server-only';

import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export type InvoiceDTO = {
  id: string;
  number: string;
  totalCents: number;
  status: 'draft' | 'sent' | 'paid';
};

export async function getInvoice(invoiceId: string): Promise<InvoiceDTO | null> {
  const session = await verifySession();
  if (!session) return null;

  const invoice = await db.invoices.findById(invoiceId);
  // Not yours and not found look the same, so IDs cannot be probed.
  if (!invoice || (invoice.ownerId !== session.userId && session.role !== 'admin')) {
    return null;
  }

  return {
    id: invoice.id,
    number: invoice.number,
    totalCents: invoice.totalCents,
    status: invoice.status,
  };
}
```

## How it works

### `server-only`

`import 'server-only'` makes the build fail if a Client Component imports the
module, directly or through another file. Without it, a DAL imported by mistake
into a `"use client"` tree would either break at runtime or, worse, bundle
server code for the browser. Next.js handles the `server-only` import itself.
Install the package (`server-only` 0.0.1) if your linter flags the import. See
[Directives](../server-react/directives.md) for how the client boundary
propagates through imports.

### `verifySession()` in React `cache()`

A page, its layout, a header component and a sidebar may all need the user.
[`cache()`](../data-fetching/caching.md) memoizes `verifySession()` for the
duration of one server request, so the cookie is verified and the user looked up
once. React clears the memo for each request, so one user's session is never
returned to another.

Two rules from the React `cache()` page apply. Wrap once, at module scope, and
export the wrapped function. And do not wrap mutations.

### Authentication, then authorization

`verifySession()` answers "who is calling". It is not enough on its own.
Authorization asks a second question per resource and per action:

| Action | Rule in `lib/dal/invoices.ts` |
|---|---|
| Read an invoice | Owner or admin |
| Send an invoice | Owner, and status is `draft` |
| Delete an invoice | Admin only |

Put the rule in the function that performs the action. A check in the page that
renders the "Delete" button does not protect the delete.

### DTOs

A DTO is a plain object holding only the fields the caller may see. It matters
because everything a Server Component passes to a Client Component is
serialized into the RSC payload that reaches the browser. If `getInvoice()`
returned the database row, the next developer to pass `invoice` as a prop would
ship internal notes and foreign keys to the client.

Build the DTO field by field, as above, rather than spreading the row and
deleting fields. A column added to the table later is then excluded by default.

## Server and client implications

The DAL is callable from three places, all on the server.

**Server Components.** Call the DAL and render the DTO:

```tsx file="app/invoices/[invoiceId]/page.tsx"
import { notFound } from 'next/navigation';
import { getInvoice } from '@/lib/dal/invoices';

export default async function InvoicePage({ params }: PageProps<'/invoices/[invoiceId]'>) {
  const { invoiceId } = await params;
  const invoice = await getInvoice(invoiceId);
  if (!invoice) notFound();

  return (
    <main>
      <h1>Invoice {invoice.number}</h1>
      <p>Status: {invoice.status}</p>
    </main>
  );
}
```

**Server Actions.** The action is a public endpoint that receives
client-controlled arguments. Keep it thin and let the DAL authorize:

```ts file="lib/dal/invoices-mutations.ts"
import 'server-only';

import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export type MutationResult = { ok: true } | { ok: false; error: string };

export async function deleteInvoice(invoiceId: string): Promise<MutationResult> {
  const session = await verifySession();
  if (!session) return { ok: false, error: 'Sign in to continue.' };
  if (session.role !== 'admin') return { ok: false, error: 'Only admins can delete invoices.' };

  const invoice = await db.invoices.findById(invoiceId);
  if (!invoice) return { ok: false, error: 'Invoice not found.' };

  await db.invoices.delete(invoice.id);
  return { ok: true };
}
```

```ts file="app/invoices/actions.ts"
'use server';

import * as z from 'zod';
import { revalidatePath } from 'next/cache';
import { deleteInvoice } from '@/lib/dal/invoices-mutations';

export async function deleteInvoiceAction(invoiceId: unknown) {
  const parsed = z.string().min(1).safeParse(invoiceId);
  if (!parsed.success) return { ok: false as const, error: 'Invalid invoice.' };

  // Authentication and authorization happen inside the DAL.
  const result = await deleteInvoice(parsed.data);
  if (result.ok) revalidatePath('/invoices');
  return result;
}
```

The argument is typed `unknown` because the client sends whatever it wants.
Validation happens before the DAL. Authorization happens in it.

**Route Handlers.** Map the DAL's answer to HTTP status codes:

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

Returning a result union (`ok` / `unauthenticated` / `forbidden`) instead of
redirecting lets the same DAL function serve a page, which redirects, and an API,
which returns a status code. The example app's `/admin` page and
`/api/admin/users` route share `listUsersForAdmin()` this way.

Client Components never import the DAL. Pass them DTOs as props, or pass a
promise of a DTO and read it with [`use()`](../data-fetching/use-with-promises.md).

## Caching implications

React `cache()` is request-scoped and safe for per-user data. Next.js cache
directives are not, and they have rules of their own when Cache Components is
enabled.

**A plain `"use cache"` function cannot call `cookies()` or `headers()`.** It
throws. Resolve the user first, then pass only a stable identifier into a
cached function that is **not exported**, as the bundled
authentication-with-Cache-Components guide shows:

```ts file="lib/dal/notes.ts"
import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { requireSession } from '@/lib/dal';
import { db } from '@/lib/db';

export async function getMyNotes() {
  const session = await requireSession();
  return getNotesByUserId(session.userId);
}

// Not exported: no caller can ask for another user's notes by passing an ID.
async function getNotesByUserId(userId: string) {
  'use cache';
  cacheTag(`notes:${userId}`);
  cacheLife('minutes');

  const notes = await db.notes.findManyByOwner(userId);
  return notes.map((note: { id: string; title: string }) => ({ id: note.id, title: note.title }));
}
```

Cache keys and tags are stored in plain text. Key on the user ID, never on an
email address or token.

**`"use cache: private"`** can read `cookies()` and `headers()` directly. Its
result is not stored in a server cache across requests. It can be kept in
browser memory for the `cacheLife` `stale` time. Use it when the session read
lives deep inside a helper and cannot be lifted out.

With Cache Components, put the component that awaits the DAL inside a
`<Suspense>` boundary, and keep a top-level `await verifySession()` out of
layouts so it does not hold back the rest of the page. See
[Streaming](../nextjs-rendering/streaming.md) and
[use cache](../nextjs-data-caching/use-cache.md).

## Common patterns

### Keep `process.env` in the DAL

The data security guide recommends that only the DAL reads secrets from
`process.env`. Components then cannot leak a key they never had.

### Wrap related getters

The authentication guide suggests grouping related getters, for example in a
class whose methods call `verifySession()` first. Any structure works if no
getter can return data before the check.

### Audit by grep

A DAL makes review mechanical. Your database client should be imported only
under `lib/dal*`. Every `'use server'` file should import from the DAL, not the
database. A grep for the database import in `app/` should return nothing.

## Security considerations

Two failures the DAL prevents are covered as exploits in the Security group:
[Server Actions authorization](../nextjs-security/server-actions-authorization.md)
(an action that trusted the page's check) and [IDOR](../nextjs-security/idor.md)
(an authenticated user reading another user's record by changing an ID).

## Common mistakes

**Authenticating without authorizing.** `verifySession()` passing means someone
is signed in, not that they own invoice 42.

**Exporting the `"use cache"` inner function.** Any Server Component or action
could then pass an arbitrary user ID.

**Forgetting `import 'server-only'`.** A Client Component import then fails
late, or ships server code.

**Calling `cache()` inside a component or per call.** Each call to `cache()`
creates a new memo table. Wrap once at module scope.

**Returning database rows.** Build DTOs field by field.

**Redirecting from inside a Route Handler's DAL call.** An API client expects
`401`, not an HTML redirect. Return a result and let the caller choose.

**Catching everything in a DAL function that redirects.** `redirect()`,
`notFound()` and `forbidden()` work by throwing. A broad `try/catch` swallows
them.

## Related topics

- [Protecting routes](./protecting-routes.md) — the optimistic layer in front of
  the DAL.
- [Role-based access](./role-based-access.md) — roles and permissions checked in
  the DAL.
- [Caching](../data-fetching/caching.md) — React `cache()` and its per-request
  lifetime.
- [Directives](../server-react/directives.md) — how `"use client"` boundaries
  and server-only modules interact.
- [Server Actions authorization](../nextjs-security/server-actions-authorization.md)
  — the exploit this page's pattern closes.
