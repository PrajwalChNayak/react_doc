---
title: Databases in Next.js
description: Where database code belongs in an App Router app, how to keep it on the server, and how to cache reads and invalidate them after writes.
group: nextjs-databases
order: 10
status: current
related: [nextjs-databases/connection-pooling, nextjs-databases/prisma, nextjs-databases/drizzle, nextjs-auth/data-access-layer, server-react/server-components]
---

## Overview

An App Router app can talk to a database directly. There is no separate API
layer to build first, because Server Components and Server Actions already run
on the server. That convenience comes with one rule: **database code runs only
on the server, and only from a few well-defined places.**

| Operation | Where it runs | Next.js API |
|---|---|---|
| Read data to render a page | Server Component, through a data access function | `async` component, `<Suspense>` |
| Write data from a form or button | Server Action | `"use server"` |
| Write data from another system (webhook, mobile app) | Route Handler | `app/**/route.ts` |
| Cache a read shared by many visitors | Data access function | `"use cache"`, `cacheTag`, `cacheLife` |
| Invalidate that cache after a write | Server Action or Route Handler | `updateTag`, `revalidateTag` |
| Change the schema | A separate deploy step, never the app | `prisma migrate deploy`, `drizzle-kit migrate` |

This group covers the database-specific parts:

- [Connection pooling](./connection-pooling.md): why serverless instances run
  out of connections, and the singleton that survives hot reload in `next dev`.
- [Prisma](./prisma.md): Prisma ORM 7 with `prisma.config.ts` and the `pg`
  driver adapter.
- [Drizzle](./drizzle.md): Drizzle ORM 0.45 with a `node-postgres` pool.
- [Edge runtime](./edge-runtime.md): why the deprecated Edge runtime and TCP
  database drivers do not mix, and why Node.js is the answer.
- [Migrations in deployment](./migrations-in-deployment.md): running schema
  changes as their own step, with zero downtime.

The [databases example app](../../examples/nextjs/databases/README.md)
implements everything on these pages with both ORMs.

## Why it exists

Before Server Components, a React app reached its database through an HTTP
endpoint, because the component code ran in the browser. Server Components remove
that hop. React explains the model in
[Server Components](../server-react/server-components.md). Next.js decides where
those components run, when they are prerendered, and what is cached.

Removing the API layer also removes the boundary that used to keep credentials
and raw rows away from the browser. You need to put that boundary back on
purpose, as a module that only the server can import. That is what the data
access layer on this page is for.

## When to use it

- **Reads for rendering** belong in Server Components. The query runs next to
  the data, and neither the driver nor the connection string reaches the client
  bundle.
- **Writes triggered by your own UI** belong in
  [Server Actions](../nextjs-mutations/server-actions.md). They get progressive
  enhancement, pending state through
  [useActionState](../hooks/use-action-state.md), and cache invalidation in one
  round trip.
- **Writes triggered by other systems** belong in
  [Route Handlers](../nextjs-backend/route-handlers.md), which speak plain HTTP.

## When not to use it

- **Never query from a Client Component.** A `"use client"` module is bundled
  for the browser. A database driver there either fails to build or ships your
  connection logic to every visitor. Pass data down as props from a Server
  Component, or call a Server Action.
- **Do not fetch your own Route Handler from a Server Component.** Both run on
  the same server. Calling the data access function directly skips an HTTP
  round trip and a second serialization.
- **Do not run migrations from app code.** Neither `next build` nor a request is
  the right moment. See [Migrations in deployment](./migrations-in-deployment.md).

## Basic example

Start with one module that owns the database client. `import 'server-only'` makes
any attempt to import it from a Client Component fail at build time, instead of
leaking at runtime.

```ts file="lib/data/guestbook.ts"
import 'server-only';
import { io } from 'next/cache';
import { prisma } from '@/lib/db/prisma';

export type EntryDTO = { id: number; name: string; message: string };

export async function listEntries(): Promise<EntryDTO[]> {
  // Stop prerendering here: the query runs at request time, never during `next build`.
  await io();
  return prisma.guestbookEntry.findMany({
    // Select the columns the UI needs. Never hand a whole row to a component.
    select: { id: true, name: true, message: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}
```

The page is an `async` Server Component. The list sits inside `<Suspense>`, so the
heading ships in the static shell and the rows stream in when the query finishes.

```tsx file="app/guestbook/page.tsx"
import { Suspense } from 'react';
import { listEntries } from '@/lib/data/guestbook';

export default function GuestbookPage() {
  return (
    <main>
      <h1>Guestbook</h1>
      <Suspense fallback={<p>Loading entries…</p>}>
        <Entries />
      </Suspense>
    </main>
  );
}

async function Entries() {
  const entries = await listEntries();
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id}>
          <strong>{entry.name}</strong>: {entry.message}
        </li>
      ))}
    </ul>
  );
}
```

The `@/lib/db/prisma` module is a client singleton. [Prisma](./prisma.md) and
[Drizzle](./drizzle.md) show how to write it for each ORM.

## How it works

With `cacheComponents: true`, Next.js prerenders every route at build time and
treats uncached asynchronous work as request-time work. A database query is
exactly that kind of work. It has two ways to fit in:

1. **Uncached, inside `<Suspense>`.** The fallback goes into the static shell and
   the query runs for each request. Calling `await io()` from `next/cache` (new in
   16.3) first makes the intent explicit and guarantees the query never starts
   during `next build`. The 16.3 docs prefer `io()` to `connection()` from
   `next/server` under Cache Components, because `connection()` also holds back
   prefetches until a real navigation reaches the server.
2. **Cached with `"use cache"`.** The result is stored and reused across
   requests. If the function is reached while prerendering, **it runs at build
   time**, so the build machine needs database access.

Pick the first when data must be fresh or is per-user. Pick the second when many
visitors see the same result and a short delay after a change is acceptable.
[The caching model](../nextjs-data-caching/caching-model.md) covers the full
decision.

Next.js already treats `pg`, `@prisma/client` and `prisma` as server external
packages. It loads them with Node.js `require` instead of bundling them, so they
need no `next.config` entry.

## Server and client implications

The data access layer is the server boundary. Keep three properties:

- **`server-only` at the top** of every module that imports a database client.
- **Explicit `select` or column lists**, so a new column (say, `passwordHash`)
  does not flow to the UI by default.
- **Plain objects out.** Whatever a Server Component passes to a Client
  Component is serialized into the page payload. Return DTOs shaped for the UI.

Authorization belongs in the same layer. The
[data access layer](../nextjs-auth/data-access-layer.md) page shows how to check
the session next to each query, so that no page can forget it.

## Caching implications

Cache reads that many visitors share, tag them, and invalidate the tag after a
write. `"use cache"` needs Cache Components enabled:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

```ts file="lib/data/posts.ts"
import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { prisma } from '@/lib/db/prisma';

export async function getPublishedPosts() {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');

  return prisma.post.findMany({
    where: { published: true },
    select: { id: true, slug: true, title: true },
    orderBy: { publishedAt: 'desc' },
  });
}
```

After a write in a Server Action, `updateTag` expires the entry immediately, so
the author sees their change on the next render:

```ts file="app/admin/posts/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth';

const PublishPost = z.object({ id: z.coerce.number().int().positive() });

export async function publishPost(formData: FormData) {
  await requireAdmin();
  const { id } = PublishPost.parse({ id: formData.get('id') });

  await prisma.post.update({
    where: { id },
    data: { published: true, publishedAt: new Date() },
  });

  updateTag('posts');
}
```

From a Route Handler, `updateTag` is not available. Use
`revalidateTag('posts', 'max')`, which serves the stale list while a fresh one
loads in the background. [Cache life and tags](../nextjs-data-caching/cache-life-and-tags.md)
and [Revalidation](../nextjs-data-caching/revalidation.md) explain both.

> [!WARNING]
> Never read cookies or the session inside a `"use cache"` function. The cached
> result is shared by every visitor who passes the same arguments. Check access
> outside the cached function, then call it with plain arguments.

## Common patterns

### One client per process

Create the Prisma client or Drizzle pool once at module scope and import it
everywhere. In `next dev`, cache it on `globalThis` so hot reloads reuse it.
[Connection pooling](./connection-pooling.md) explains why this matters for
connection limits.

### Validate before you write

Server Actions are public HTTP endpoints. Parse `FormData` with a schema before
it reaches the ORM, and use the parsed value, not the raw form data.
[Input validation](../nextjs-security/input-validation.md) covers the pattern.

### Stay on parameterized queries

Both ORMs send values as bound parameters. When you drop to raw SQL, use the
tagged-template forms (`prisma.$queryRaw`, Drizzle's `` sql`...` ``), never
string concatenation. [SQL injection](../nextjs-security/sql-injection.md) shows
the exploit and the fix.

### Keep the database close to the server

Every query is a network round trip. Deploy your Next.js server in the same
region as the database. A fast render in the wrong region still waits on
cross-region latency for each query.

## Security considerations

- The connection string lives in a server-only environment variable
  (`DATABASE_URL`). Never prefix it with `NEXT_PUBLIC_`. See
  [environment variable leaks](../nextjs-security/environment-variable-leaks.md).
- Filter by the current user in the query itself (`where: { ownerId: session.userId }`),
  not after loading the row. Loading by ID alone is how
  [IDOR](../nextjs-security/idor.md) bugs happen.
- Use a database role with only the privileges the app needs. Run migrations
  with a separate, more privileged role.

## Common mistakes

**Importing the database client into a Client Component.** It fails the build
at best. Add `import 'server-only'` to every module that touches the client, so
the failure is immediate and clear.

**Passing whole rows to Client Components.** Every field is serialized into the
page. Select only what the UI renders.

**Caching per-user data with `"use cache"`.** One user's result is served to
another. Keep per-user reads uncached behind `<Suspense>`, or pass the user ID in
as an argument after checking access outside the cache.

**Writing without invalidating.** The row changes, the cached list does not.
Call `updateTag` in the Server Action for every tag the write affects.

**Calling `revalidateTag` with one argument.** The single-argument form is
deprecated and a type error in 16.3. Pass a profile: `revalidateTag('posts', 'max')`.

**Querying during `next build` by accident.** An uncached query outside
`<Suspense>`, or without `await io()` before it, either blocks prerendering or
makes the build depend on the database. Decide explicitly: cached or request-time.

**Creating a new client inside a function.** Each call opens a new pool. Create
it once at module scope.

## Related topics

- [Connection pooling](./connection-pooling.md): the singleton pattern and why
  serverless apps exhaust connections.
- [Data access layer](../nextjs-auth/data-access-layer.md): authorization and
  DTOs next to every query.
- [use cache](../nextjs-data-caching/use-cache.md): cache keys, serialization and
  what a cached function may not read.
- [Server Actions](../nextjs-mutations/server-actions.md): where writes from your
  own UI belong.
- [Server Components](../server-react/server-components.md): the React model
  that lets a component query the database.
- [Caching in React](../data-fetching/caching.md): `cache()` for per-request
  deduplication, which is different from `"use cache"`.
