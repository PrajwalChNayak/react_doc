---
title: Databases and the Edge runtime
description: Why the deprecated Edge runtime cannot use TCP database drivers, what HTTP and WebSocket drivers change, and why database code belongs on the Node.js runtime.
group: nextjs-databases
order: 50
status: current
related: [nextjs-backend/runtimes, nextjs-databases/connection-pooling, nextjs-databases/overview, nextjs-data-caching/caching-model]
---

## Overview

Next.js has two server runtimes. The **Node.js runtime** is the default and runs
your pages, layouts, Route Handlers, Server Actions and `proxy.ts`. The **Edge
runtime** is a restricted, Web-API-only environment that routes could opt into
with a `runtime` segment export.

> [!DEPRECATED]
> The Edge runtime is deprecated. The Next.js 16.3.5 documentation says to
> remove the `runtime` export from your route files, which returns them to the
> Node.js runtime. Cache Components requires the Node.js runtime, and `proxy.ts`
> always runs on Node.js. Do not start new database code on the Edge runtime.

For databases, the short version is:

| | Node.js runtime (default) | Edge runtime (deprecated) |
|---|---|---|
| TCP sockets | Yes | No |
| `pg` pool, Prisma with `@prisma/adapter-pg`, Drizzle `node-postgres` | Yes | No |
| HTTP or WebSocket database drivers | Yes | Yes |
| Cache Components (`"use cache"`, `cacheTag`) | Yes | No |
| Incremental Static Regeneration | Yes | No |

## Why it exists

The Edge runtime was designed to start fast and run close to users, by exposing
only standard Web APIs: `fetch`, `Request`, `Response`, streams, `crypto`,
`WebSocket`. It omits the Node.js APIs, including filesystem access and raw TCP
sockets, so code can run in lightweight isolates.

That trade-off is exactly what breaks databases. PostgreSQL speaks its own
protocol over TCP. The `pg` driver opens a TCP socket, and both Prisma ORM 7
(through `@prisma/adapter-pg`) and Drizzle's `node-postgres` driver sit on top of
`pg`. Without sockets, none of them can connect.

The locality benefit is also weaker than it looks for database work. A route
running next to the user but far from a single-region database pays the long
round trip on every query, instead of once between the user and the server.

## When to use it

For database access, don't. Use the Node.js runtime, which needs no configuration
because it is the default.

The only reason to think about the Edge runtime in this context is an existing
route that still exports it. Move that route to Node.js, as described below.

## When not to use it

- **Any route that uses a pooled TCP driver**: `pg`, Prisma with the `pg`
  adapter, Drizzle with `node-postgres`.
- **Any route under Cache Components.** `cacheComponents: true` does not support
  the Edge runtime.
- **Request interception.** `proxy.ts` runs on Node.js and cannot be configured
  otherwise. It is also the wrong place for database queries: it runs before
  every matched request, and authorization belongs next to the data. See
  [Proxy](../nextjs-backend/proxy.md).

## How it works

### What an HTTP or WebSocket driver changes

Some hosted PostgreSQL providers offer drivers that tunnel queries over HTTPS or
WebSockets, both of which the Edge runtime supports. `@neondatabase/serverless`
(1.1.0) is one example:

- Its `neon()` function sends each query as an HTTPS request. There is no
  connection to hold, so nothing to pool. It supports one-shot queries and
  non-interactive transactions.
- Its `Pool` and `Client` use WebSockets and support interactive transactions.
  In serverless and edge environments, the driver's documentation says they must
  be connected, used and closed **within a single request handler**, because a
  WebSocket cannot outlive the request.

These drivers do not bring back what the Edge runtime lacks. You still cannot use
`"use cache"` there, and each request still pays for a round trip to the database
region.

### Moving a route to the Node.js runtime

1. Delete the `runtime` export from the route's `page.tsx`, `layout.tsx` or
   `route.ts`. Node.js is the default, so nothing replaces it.
2. Replace per-request HTTP or WebSocket connections with a module-scope pool
   singleton, if you want to use a TCP driver. See
   [Connection pooling](./connection-pooling.md).
3. Enable Cache Components and cache shared reads with `"use cache"` where it
   helps.
4. If you deploy on Vercel and chose the Edge runtime for its regions, use the
   `preferredRegion` segment export instead. It no longer requires the Edge
   runtime. Put the function in the database's region.

## Basic example

After migration, a Route Handler that reads the database is ordinary Node.js
code with no runtime export:

```ts file="app/api/guestbook/route.ts"
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { guestbookEntries } from '@/lib/db/schema';

// No `runtime` export: this route runs on the Node.js runtime, so it can use the
// pooled node-postgres client from lib/db/drizzle.ts.
export async function GET() {
  const entries = await db
    .select({ id: guestbookEntries.id, name: guestbookEntries.name })
    .from(guestbookEntries)
    .orderBy(desc(guestbookEntries.createdAt))
    .limit(20);

  return Response.json(entries);
}
```

## Caching implications

Cache Components requires the Node.js runtime. A route that stays on the Edge
runtime cannot use `"use cache"`, `cacheLife` or `cacheTag`, and the Edge runtime
does not support Incremental Static Regeneration. Moving database routes to
Node.js is what makes caching their reads possible. See
[The caching model](../nextjs-data-caching/caching-model.md).

## Common patterns

### HTTP drivers on the Node.js runtime

An HTTP driver also works on Node.js. It can suit serverless platforms where
instances are short-lived and you would rather not hold connections at all:

```ts file="lib/db/neon.ts"
import 'server-only';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function countEntries(): Promise<number> {
  // Tagged template: interpolated values are sent as parameters.
  const rows = await sql`SELECT count(*)::int AS count FROM guestbook_entries`;
  return rows[0].count;
}
```

The choice between HTTP and a TCP pool is then about latency and connection
limits, not about which runtime can run it.

### One runtime for the whole app

Keeping every route on Node.js means one set of drivers, one pool per process,
and one caching model. Mixed runtimes force two database clients and two sets of
constraints in the same codebase.

## Common mistakes

**Adding a `runtime` export "for speed" to a database route.** The TCP driver
fails to connect, and the route loses Cache Components. Leave the default.

**Treating an HTTP driver as a pool.** Each `neon()` query is its own HTTPS
request. A render that runs twenty queries makes twenty requests. Batch, or join
in SQL.

**Keeping a WebSocket `Pool` at module scope on an edge or serverless platform.**
The driver's documentation requires connecting, using and closing it within one
request there.

**Querying the database in `proxy.ts`.** It runs on every matched request,
before rendering. Check authorization in the data access layer instead.

**Expecting `"use cache"` to work on the Edge runtime.** Cache Components requires
Node.js.

## Related topics

- [Runtimes](../nextjs-backend/runtimes.md): the Node.js and Edge runtimes in
  full, including the deprecation.
- [Connection pooling](./connection-pooling.md): the TCP pool you can use once
  the route is on Node.js.
- [The caching model](../nextjs-data-caching/caching-model.md): why Cache
  Components needs Node.js.
- [Route Handlers](../nextjs-backend/route-handlers.md): the file convention used
  in the example above.
- [Streaming](../server-react/streaming.md): the React streaming model, which the
  Node.js runtime supports.
