---
title: Connection pooling
description: Keep a Next.js app within the database's connection limit on long-lived servers, serverless platforms and in next dev.
group: nextjs-databases
order: 20
status: current
related: [nextjs-databases/overview, nextjs-databases/prisma, nextjs-databases/drizzle, nextjs-backend/runtimes]
---

## Overview

PostgreSQL gives every client connection its own server process, and it accepts
only a fixed number of them (`max_connections`, 100 by default). A Next.js app
that opens connections carelessly hits that ceiling long before it runs out of
CPU. The error looks like `sorry, too many clients already`, and it tends to
appear under load or after a few hours of `next dev`.

Three tools keep you under the limit:

| Tool | What it does | Where it lives |
|---|---|---|
| An in-process pool (`pg` `Pool`) | Reuses a small, capped set of connections inside one server process | Your app, created once per process |
| An external pooler (PgBouncer, or your provider's pooled URL) | Multiplexes many client connections onto few database connections | Between the app and the database |
| The development singleton | Stops `next dev` from creating a new pool on every hot reload | `globalThis`, outside production only |

Both ORMs in this group use the `pg` driver's pool:
[Prisma](./prisma.md) through `@prisma/adapter-pg`, and [Drizzle](./drizzle.md)
through `drizzle-orm/node-postgres`.

## Why it exists

Opening a PostgreSQL connection costs a TCP handshake, usually TLS, and
authentication. Doing that per query adds tens of milliseconds and a new server
process each time. A pool pays that cost once and hands the open connection to
the next query.

The pool alone is not enough once you scale out. Each server process has its
**own** pool. Ten instances with `max: 10` can hold 100 connections, which is the
whole default budget, before a migration job or an admin console connects.

Serverless platforms make the multiplication worse and harder to see. The
platform starts a new instance for each burst of concurrent requests, each
instance loads your module and creates its own pool, and idle instances can keep
their connections open until the platform freezes or recycles them.

## When to use it

- **Always use a pool** for a server that handles more than one request at a
  time. That is every Next.js server.
- **Add an external pooler** when you deploy to a serverless or autoscaling
  platform, or when several services share one database.
- **Use the `globalThis` singleton** in every module that creates a client or a
  pool, so `next dev` does not leak connections.

## When not to use it

- **Do not create a pool per request.** A pool inside a Route Handler or Server
  Action body opens new connections every call and never reuses them.
- **Do not raise `max` to fix timeouts** without checking the arithmetic below.
  A larger pool per instance multiplies across instances.
- **Do not route migrations through a transaction-mode pooler.** Migration tools
  use session features. Give them a direct connection string.

## Basic example

One pool per process, created at module scope, with explicit limits:

```ts file="lib/db/pool.ts"
import 'server-only';
import { Pool } from 'pg';

const globalForPool = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Upper bound for this process. Multiply by your instance count.
    max: 5,
    // Close idle connections so a quiet instance gives them back.
    idleTimeoutMillis: 10_000,
    // Fail fast instead of waiting forever when the pool is exhausted.
    connectionTimeoutMillis: 5_000,
  });

  // An idle connection can be dropped by the server or the network. Without
  // a listener, that error crashes the Node.js process.
  pool.on('error', (error: Error) => {
    console.error('Unexpected error on idle PostgreSQL connection', error);
  });

  return pool;
}

export const pool = globalForPool.pgPool ?? createPool();

// `next dev` re-evaluates modules on every edit. Reuse the pool across those
// reloads. In production each process evaluates this module once.
if (process.env.NODE_ENV !== 'production') {
  globalForPool.pgPool = pool;
}
```

`new Pool()` does not connect. It opens the first connection on the first query,
so importing this module during `next build` does not need a database.

## How it works

### The arithmetic

The number you have to keep under `max_connections` is:

```text
instances × pool max  +  connections used by everything else  <  max_connections
```

"Everything else" includes migration jobs, background workers, admin tools and
the reserved superuser slots. If your platform can run 50 instances, a pool of
`max: 5` can already hold 250 connections. That is why serverless deployments
put a pooler in front of the database.

The `pg` pool defaults are `max: 10`, `idleTimeoutMillis: 10_000` and
`connectionTimeoutMillis: 0` (wait forever). Set all three explicitly so the
behavior is visible in code review.

### Why `next dev` leaks connections

In development, editing a file makes Next.js re-evaluate the modules that depend
on it. A module-scope `new Pool()` then runs again, and the old pool is no longer
referenced but still holds its open connections. After enough saves, PostgreSQL
refuses new clients.

Caching the pool on `globalThis` fixes this, because `globalThis` survives module
re-evaluation. The check on `NODE_ENV` keeps production code plain: there, the
module is evaluated once per process and the cache adds nothing.

### What an external pooler changes

A pooler such as PgBouncer accepts thousands of cheap client connections and
maps them onto a small number of real database connections. In **transaction
mode**, a database connection is assigned to a client only for the length of one
transaction, then returned.

That changes what you can rely on. Anything that lives on the session rather
than the transaction (`SET` without `LOCAL`, `LISTEN`, session advisory locks,
temporary tables) can land on a different connection next time. ORM queries do
not depend on those features. Migration tools and some admin scripts do, which is
why they use a direct URL.

Most managed PostgreSQL providers expose both a pooled and a direct connection
string. Name them clearly:

```text file=".env.example"
# Pooled: used by the Next.js app at runtime.
DATABASE_URL="postgresql://app:secret@db-pooler.example.com:6543/app"
# Direct: used by migration commands only.
DIRECT_DATABASE_URL="postgresql://migrator:secret@db.example.com:5432/app"
```

Prisma documents specific settings for PgBouncer (transaction mode, and prepared
statements through `max_prepared_statements` on PgBouncer 1.21.0 and later). See
[Prisma](./prisma.md). Check your provider's documentation for the port and
parameters of its pooled URL.

## Server and client implications

Pools exist only on the server. Keep every module that creates one behind
`import 'server-only'`, and read `DATABASE_URL` only there. The connection string
must never carry a `NEXT_PUBLIC_` prefix.

Pools need the Node.js runtime. TCP sockets are not available in the deprecated
Edge runtime. See [Edge runtime](./edge-runtime.md).

## Common patterns

### Long-lived servers

`next start`, a Docker container or a VM runs one Node.js process for a long
time. A single in-process pool per process is usually enough. Size it from the
arithmetic above, with the number of processes (containers × replicas) as the
instance count. [Self-hosting](../nextjs-deployment/self-hosting.md) covers
running `next start` in production.

### Serverless and autoscaling platforms

The instance count is not under your control, so cap each instance hard (`max`
between 1 and 5 is common), keep `idleTimeoutMillis` short so frozen instances
release connections sooner, and connect through the provider's pooled URL or
your own PgBouncer.

### One pool, several consumers

If one process uses both a query builder and raw `pg` queries, share one pool
between them. Both Prisma's `PrismaPg` adapter and Drizzle's `drizzle()` accept
an existing `pg` `Pool` instance, so the process has one connection budget, not
two.

### Watching the pool

A `pg` `Pool` exposes `totalCount`, `idleCount` and `waitingCount`. A steadily
non-zero `waitingCount` means queries are queuing for a connection: look for slow
queries or long transactions before raising `max`.

## Common mistakes

**Creating the pool inside a function.** Every call opens a new pool that is
never closed. Create it once at module scope.

**Skipping the `globalThis` cache.** `next dev` works for a while, then fails
with "too many clients". Cache the client or pool outside production.

**Caching on `globalThis` in production too.** It is harmless but hides the
intent. Guard it with `process.env.NODE_ENV !== 'production'`, as both ORM guides
do.

**Leaving `connectionTimeoutMillis` at 0.** When the pool is exhausted, requests
hang instead of failing. Set a timeout so errors surface.

**Sizing the pool per instance without counting instances.** Always multiply by
the maximum number of processes your platform can run.

**Running migrations through the pooled URL.** Session-level statements fail or
behave unpredictably in transaction mode. Use a direct connection for migration
commands, as described in
[Migrations in deployment](./migrations-in-deployment.md).

**Not listening for pool errors.** An idle connection dropped by the network
emits an `error` event. Without a listener, it takes down the process.

## Related topics

- [Prisma](./prisma.md): passing pool options to `@prisma/adapter-pg` and the
  Prisma client singleton.
- [Drizzle](./drizzle.md): a `node-postgres` pool with `drizzle()`.
- [Runtimes](../nextjs-backend/runtimes.md): why database pools need the Node.js
  runtime.
- [Environment variables](../nextjs-backend/environment-variables.md): keeping
  `DATABASE_URL` server-only.
- [Server Components](../server-react/server-components.md): the React model
  behind code that runs on the server and can hold a pool.
- [The databases example](../../examples/nextjs/databases/README.md): both
  singletons running against a local PostgreSQL.
