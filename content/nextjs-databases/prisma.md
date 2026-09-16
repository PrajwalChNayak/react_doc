---
title: Prisma ORM
description: Set up Prisma ORM 7 in a Next.js 16.3 app with prisma.config.ts, the prisma-client generator, the pg driver adapter and a server-only client singleton.
group: nextjs-databases
order: 30
status: current
related: [nextjs-databases/overview, nextjs-databases/connection-pooling, nextjs-databases/migrations-in-deployment, nextjs-security/sql-injection]
---

## Overview

Prisma ORM describes your database in a schema file, generates a fully typed
client from it, and manages migrations. This page covers **Prisma ORM 7.10.0**
with PostgreSQL in a Next.js 16.3 App Router app.

> [!NOTE]
> npm's `latest` tag for `prisma` currently points at an 8.0 release candidate.
> This page documents the stable **7.10.0** line. Pin `prisma`, `@prisma/client`
> and `@prisma/adapter-pg` to `7.10.0` so `npm install` does not pick up the
> release candidate.

Prisma ORM 7 changed the setup in ways most tutorials predate:

| Topic | Prisma ORM 7 | Older tutorials |
|---|---|---|
| Generator | `provider = "prisma-client"` with a **required** `output` | `prisma-client-js`, no output |
| Import | From the generated directory, for example `@/lib/generated/prisma/client` | `from '@prisma/client'` |
| Connection | A driver adapter: `new PrismaClient({ adapter: new PrismaPg(...) })` | `url = env("DATABASE_URL")` in the schema |
| CLI configuration | `prisma.config.ts` at the project root, including the datasource URL | Schema file and `package.json` |
| `.env` loading | Not automatic. Import `dotenv/config` in `prisma.config.ts` | Loaded by the CLI |
| `prisma migrate dev` | No longer runs `prisma generate` or seeding | Did both |

## Why it exists

Hand-written SQL in a Next.js app has two weak points: nothing checks that a
query matches the schema, and nothing tracks how the schema changed over time.
Prisma answers both. The generated client knows every model and field, so a
renamed column becomes a type error in the Server Component that used it. The
migration history is a folder of SQL files you commit and review.

Version 7 moved database I/O to JavaScript driver adapters. For PostgreSQL that
means the standard `pg` driver, so Prisma shares the pooling behavior, options
and constraints of every other Node.js PostgreSQL client. That is also why it
needs the Node.js runtime.

## When to use it

- You want a schema-first workflow: model the data in `schema.prisma`, generate
  migrations and types from it.
- Your team prefers an object API (`findMany`, `create`, nested `include`) to
  writing SQL-shaped queries.
- You run on the Node.js runtime, which is the default in Next.js 16.

## When not to use it

- You want your schema in TypeScript and queries that read like SQL. See
  [Drizzle](./drizzle.md).
- You need to run inside the deprecated Edge runtime with a TCP driver. That does
  not work. See [Edge runtime](./edge-runtime.md).
- A handful of queries against an existing database may not justify a code
  generation step. Plain `pg` with parameterized queries is enough there.

## Basic example

Install the packages at exact versions:

```bash
npm install @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg@8.23.0
npm install --save-dev prisma@7.10.0 dotenv @types/pg
```

Describe the schema. The generator writes the client into your source tree, so
choose an output path inside the project:

```text file="prisma/schema.prisma"
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model GuestbookEntry {
  id        Int      @id @default(autoincrement())
  name      String   @db.VarChar(80)
  message   String   @db.VarChar(500)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("guestbook_entries")
}
```

Configure the CLI in `prisma.config.ts` at the project root:

```ts file="prisma.config.ts"
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // process.env, not the env() helper: env() throws when the variable is
    // missing, and `prisma generate` must work without a database URL.
    url: process.env.DATABASE_URL!,
  },
});
```

Create one client per server process:

```ts file="lib/db/prisma.ts"
import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Reuse the client across hot reloads in `next dev`.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

Generate the client and apply the first migration:

```bash
npx prisma generate
npx prisma migrate dev --name create_guestbook_entries
```

## How it works

### Generate, then build

The generated client is code derived from your schema. It has to exist before
TypeScript checks your app and before `next build` bundles it, and it has to be
regenerated whenever the schema changes. `prisma migrate dev` no longer does that
for you in version 7.

Run `prisma generate` in the build pipeline. Prisma's documentation suggests
`postinstall` or a step before the production build. Using both covers fresh
clones and CI caches that skip installs:

```json file="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "postinstall": "prisma generate",
    "prebuild": "prisma generate",
    "db:migrate": "prisma migrate deploy"
  }
}
```

Treat `lib/generated/prisma` like `.next`: a build artifact. Add it to
`.gitignore` so a stale copy is never committed.

### The adapter and the pool

`PrismaPg` takes `pg` pool options (`connectionString`, `max`,
`connectionTimeoutMillis`, `idleTimeoutMillis`), or an existing `pg` `Pool`
instance. The pool it creates follows `pg` defaults, which differ from Prisma 6:
a pool size of 10, an idle timeout of 10 seconds, and **no** connection timeout.
Set them explicitly. [Connection pooling](./connection-pooling.md) explains how
to size `max`.

### Why the singleton

Every `new PrismaClient()` owns a pool. In `next dev`, a hot reload re-evaluates
`lib/db/prisma.ts`, and without the `globalThis` cache each save would open a new
pool. In production the module runs once per process, so the cache is skipped.

### Bundling

Next.js already lists `@prisma/client`, `prisma` and `pg` as server external
packages. They are loaded with Node.js `require` rather than bundled, so no
`serverExternalPackages` entry is needed.

## Server and client implications

The client is server-only. `import 'server-only'` in `lib/db/prisma.ts` turns an
accidental import from a `"use client"` module into a build error. Call Prisma
from Server Components (through your data access layer), Server Actions and
Route Handlers.

Prisma model objects contain every selected field. Before a Server Component
passes one to a Client Component, narrow it with `select`, or map it to a DTO.

## Caching implications

Prisma does not integrate with the Next.js cache on its own. A query is
request-time work unless you wrap the function in `"use cache"`:

```ts file="lib/data/guestbook.ts"
import 'server-only';
import { cacheLife, cacheTag, io } from 'next/cache';
import { prisma } from '@/lib/db/prisma';

// Fresh on every request. io() keeps the query out of prerendering.
export async function listRecentEntries() {
  await io();
  return prisma.guestbookEntry.findMany({
    select: { id: true, name: true, message: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

// Shared by all visitors, refreshed hourly or when the tag is invalidated.
export async function countEntries() {
  'use cache';
  cacheLife('hours');
  cacheTag('guestbook');
  return prisma.guestbookEntry.count();
}
```

A cached function reached during prerendering runs at `next build`, so the build
then needs database access. After a write, call `updateTag('guestbook')` in the
Server Action. See [Cache life and tags](../nextjs-data-caching/cache-life-and-tags.md).

## Common patterns

### Validated writes in a Server Action

```ts file="app/guestbook/actions.ts"
'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';

const Entry = z.object({
  name: z.string().trim().min(1, { error: 'Enter your name.' }).max(80),
  message: z.string().trim().min(1, { error: 'Write a message.' }).max(500),
});

export type SignState = { error: string | null };

export async function signGuestbook(_prev: SignState, formData: FormData): Promise<SignState> {
  const parsed = Entry.safeParse({
    name: formData.get('name'),
    message: formData.get('message'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid entry.' };
  }

  await prisma.guestbookEntry.create({ data: parsed.data });
  refresh();
  return { error: null };
}
```

Pass `parsed.data`, never the raw `FormData` values, so only validated fields
reach the database.

### Transactions

Use `prisma.$transaction` when several writes must succeed or fail together.
Keep interactive transactions short: they hold a pooled connection for their
whole duration.

```ts file="lib/data/transfers.ts"
import 'server-only';
import { prisma } from '@/lib/db/prisma';

export async function moveCredits(fromId: number, toId: number, amount: number) {
  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: fromId }, data: { credits: { decrement: amount } } });
    await tx.account.update({ where: { id: toId }, data: { credits: { increment: amount } } });
  });
}
```

### Raw SQL, safely

When the query API cannot express a query, use the tagged template
`prisma.$queryRaw`. Interpolated values are sent as parameters:

```ts file="lib/data/search.ts"
import 'server-only';
import { prisma } from '@/lib/db/prisma';

export async function searchEntries(term: string) {
  return prisma.$queryRaw`
    SELECT id, name, message
    FROM guestbook_entries
    WHERE message ILIKE ${'%' + term + '%'}
    LIMIT 20
  `;
}
```

The `Unsafe` variants accept a plain string and are how injection gets in.
[SQL injection](../nextjs-security/sql-injection.md) shows the exploit and the
fix.

## Security considerations

- Keep `DATABASE_URL` server-only, and give the runtime role only the privileges
  the app needs.
- Scope every query by the current user where ownership applies
  (`where: { id, ownerId: session.userId }`).
- Never pass user input to `$queryRawUnsafe` or `$executeRawUnsafe`.

## Common mistakes

**Importing `PrismaClient` from `@prisma/client`.** With the `prisma-client`
generator, import from the generated `output` directory.

**Creating `new PrismaClient()` without an adapter.** Prisma ORM 7 connects
through a driver adapter. Pass `adapter: new PrismaPg(...)`.

**Using `env('DATABASE_URL')` in `prisma.config.ts` on a machine without the
variable.** Every CLI command loads the config, so `prisma generate` fails in CI
or on `postinstall`. Use `process.env.DATABASE_URL` when the variable may be
absent.

**Expecting the CLI to read `.env` by itself.** Version 7 does not. Import
`dotenv/config` at the top of `prisma.config.ts`.

**Forgetting `prisma generate` in CI.** The build fails on a missing module, or
worse, compiles against a stale client. Add it to `postinstall` and `prebuild`.

**Committing the generated client.** It drifts from the schema. Ignore the output
directory in git.

**Running `prisma migrate dev` in production.** It is a development command. Use
`prisma migrate deploy` as a separate deploy step.

**One client per request.** Each client owns a pool. Use the module-scope
singleton.

## Related topics

- [Connection pooling](./connection-pooling.md): sizing `max` and the
  `globalThis` singleton.
- [Migrations in deployment](./migrations-in-deployment.md): where
  `prisma migrate deploy` runs.
- [SQL injection](../nextjs-security/sql-injection.md): `$queryRaw` versus
  `$queryRawUnsafe`.
- [Drizzle](./drizzle.md): the TypeScript-schema alternative.
- [Server Functions](../server-react/server-functions.md): the React model behind
  the Server Actions that perform writes.
- [The databases example](../../examples/nextjs/databases/README.md): this setup
  running end to end.
