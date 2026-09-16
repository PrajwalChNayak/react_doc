---
title: Drizzle ORM
description: Use Drizzle ORM 0.45 with a node-postgres pool in Next.js 16.3, with a TypeScript schema, drizzle.config.ts, a server-only singleton and typed queries.
group: nextjs-databases
order: 40
status: current
related: [nextjs-databases/overview, nextjs-databases/connection-pooling, nextjs-databases/migrations-in-deployment, nextjs-security/sql-injection]
---

## Overview

Drizzle ORM is a TypeScript query builder with a schema written in TypeScript.
Queries read like SQL, results are typed from the schema, and there is no code
generation step. `drizzle-kit` is the companion CLI that turns schema changes into
SQL migration files and applies them.

This page covers **`drizzle-orm` 0.45.2** and **`drizzle-kit` 0.31.10** with
PostgreSQL through `node-postgres` (`pg`).

> [!NOTE]
> Drizzle 1.0 is in beta, and the Drizzle website increasingly shows 1.0 APIs and
> install commands with `@rc` or `@beta` tags. This page documents the stable 0.45
> line. Pin exact versions so an install does not pick up a prerelease.

## Why it exists

A schema in TypeScript means your table definitions, inferred row types and
queries live in the same language, and a type error points straight at the
query. Nothing is generated into your source tree, so a fresh clone type-checks
without running a CLI first.

Drizzle stays close to SQL on purpose. `select().from().where()` maps to one
statement, so you can predict the query from the code. In a Server Component that
matters: you see exactly how many round trips a render costs.

## When to use it

- You want the schema and migrations driven from TypeScript.
- You prefer SQL-shaped queries, including joins, to an object API.
- You want no generate step in `postinstall` or CI.

## When not to use it

- Your team prefers a declarative schema file and a higher-level query API. See
  [Prisma](./prisma.md).
- You need a TCP driver in the deprecated Edge runtime. That does not work. See
  [Edge runtime](./edge-runtime.md).

## Basic example

Install at exact versions:

```bash
npm install drizzle-orm@0.45.2 pg@8.23.0
npm install --save-dev drizzle-kit@0.31.10 dotenv @types/pg
```

Define tables in TypeScript:

```ts file="lib/db/schema.ts"
import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const guestbookEntries = pgTable('guestbook_entries', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 80 }).notNull(),
  message: varchar('message', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GuestbookEntry = typeof guestbookEntries.$inferSelect;
export type NewGuestbookEntry = typeof guestbookEntries.$inferInsert;
```

This file has no `server-only` import, because `drizzle-kit` loads it outside
Next.js. It contains table definitions only, never credentials.

Create one pool and one Drizzle instance per server process:

```ts file="lib/db/drizzle.ts"
import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDrizzle = globalThis as unknown as { drizzlePool?: Pool };

const pool =
  globalForDrizzle.drizzlePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5_000,
  });

// Reuse the pool across hot reloads in `next dev`.
if (process.env.NODE_ENV !== 'production') {
  globalForDrizzle.drizzlePool = pool;
}

export const db = drizzle({ client: pool, schema });
```

Configure `drizzle-kit`:

```ts file="drizzle.config.ts"
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Generate the first migration and apply it:

```bash
npx drizzle-kit generate --name create_guestbook_entries
npx drizzle-kit migrate
```

## How it works

### Typed queries

Every query is typed from the schema. Selecting specific columns narrows the
result type, so a Server Component cannot accidentally pass a column it did not
ask for.

```ts file="lib/data/guestbook.ts"
import 'server-only';
import { and, desc, eq, gte } from 'drizzle-orm';
import { io } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { guestbookEntries, type NewGuestbookEntry } from '@/lib/db/schema';

export async function listRecentEntries(since: Date) {
  await io();
  return db
    .select({
      id: guestbookEntries.id,
      name: guestbookEntries.name,
      message: guestbookEntries.message,
    })
    .from(guestbookEntries)
    .where(gte(guestbookEntries.createdAt, since))
    .orderBy(desc(guestbookEntries.createdAt))
    .limit(20);
}

export async function createEntry(input: Pick<NewGuestbookEntry, 'name' | 'message'>) {
  const [entry] = await db
    .insert(guestbookEntries)
    .values(input)
    .returning({ id: guestbookEntries.id });
  return entry;
}

export async function renameAuthor(id: number, oldName: string, newName: string) {
  return db
    .update(guestbookEntries)
    .set({ name: newName })
    .where(and(eq(guestbookEntries.id, id), eq(guestbookEntries.name, oldName)))
    .returning({ id: guestbookEntries.id });
}
```

`io()` from `next/cache` (16.3) stops prerendering before the query, so
`next build` never needs the database. Omit it inside a `"use cache"` function,
where the result is meant to be computed ahead of time.

### What `drizzle-kit` does

- `drizzle-kit generate` compares your TypeScript schema with the last snapshot in
  `out` (`drizzle/meta/`) and writes a new SQL file. Commit the SQL and the
  `meta` folder together.
- `drizzle-kit migrate` reads the SQL files, checks which ones the database has
  already applied (recorded in `drizzle.__drizzle_migrations` by default), and
  runs the rest in order.
- `drizzle-kit push` applies the schema directly without migration files. It is
  meant for prototyping, not for production databases.

The Next.js app never imports `drizzle.config.ts`. Only the CLI reads it, which is
why it loads `.env` with `dotenv/config`.

### Why the singleton

`drizzle()` wraps the pool you give it. The pool is what holds connections, so the
pool is what you cache on `globalThis` in development. See
[Connection pooling](./connection-pooling.md).

## Server and client implications

`lib/db/drizzle.ts` is server-only. Import it from your data access layer, Server
Actions and Route Handlers, never from a `"use client"` module.

Types exported from `lib/db/schema.ts` (such as `GuestbookEntry`) are safe to use
in Client Components with `import type`: type imports are erased at build time
and pull in no database code.

## Caching implications

Drizzle queries are plain async work. Leave request-time reads uncached behind
`<Suspense>`, or wrap shared reads in `"use cache"` with a `cacheTag`, and call
`updateTag` after writes. A cached function that is reached during prerendering
runs at `next build`, which then needs database access. See
[use cache](../nextjs-data-caching/use-cache.md).

## Common patterns

### Validated insert in a Server Action

```ts file="app/guestbook/drizzle-actions.ts"
'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { guestbookEntries } from '@/lib/db/schema';

const Entry = z.object({
  name: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(500),
});

export async function signGuestbook(formData: FormData) {
  const parsed = Entry.safeParse({
    name: formData.get('name'),
    message: formData.get('message'),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  await db.insert(guestbookEntries).values(parsed.data);
  refresh();
  return { fieldErrors: {} };
}
```

### Transactions

```ts file="lib/data/transfers.ts"
import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts } from '@/lib/db/schema';

export async function moveCredits(fromId: number, toId: number, amount: number) {
  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ credits: sql`${accounts.credits} - ${amount}` })
      .where(eq(accounts.id, fromId));
    await tx
      .update(accounts)
      .set({ credits: sql`${accounts.credits} + ${amount}` })
      .where(eq(accounts.id, toId));
  });
}
```

A transaction holds one pooled connection until it finishes. Keep network calls
and slow work outside it.

### SQL fragments with `` sql`...` ``

The `` sql`...` `` tag is how you write expressions the builder does not cover.
Columns and tables interpolated into it become escaped identifiers, and any other
value becomes a bound parameter:

```ts file="lib/data/search.ts"
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { guestbookEntries } from '@/lib/db/schema';

export async function searchEntries(term: string) {
  return db
    .select({ id: guestbookEntries.id, message: guestbookEntries.message })
    .from(guestbookEntries)
    .where(sql`${guestbookEntries.message} ILIKE ${'%' + term + '%'}`)
    .limit(20);
}
```

`sql.raw()` does the opposite: it inserts a string into the query verbatim. Never
pass user input to it. [SQL injection](../nextjs-security/sql-injection.md)
shows the exploit.

## Security considerations

- Keep `DATABASE_URL` server-only. Only `lib/db/drizzle.ts` and
  `drizzle.config.ts` read it.
- Filter by owner inside the `where` clause, for example
  `and(eq(posts.id, id), eq(posts.ownerId, session.userId))`.
- Run `drizzle-kit migrate` with a migration role, not the app's runtime role.

## Common mistakes

**Following 1.0 docs with 0.45 installed.** Install commands with `@rc` or
`@beta`, and new APIs from the 1.0 documentation, do not match the stable
release. Check the version you pinned.

**Creating the pool inside a query function.** Each call opens a new pool. Create
it once at module scope and cache it on `globalThis` in development.

**Adding `server-only` to the schema file.** `drizzle-kit` loads the schema
outside Next.js and fails. Keep the schema free of it, and free of secrets.

**Using `drizzle-kit push` against production.** It skips the reviewed migration
history. Generate migrations and apply them with `drizzle-kit migrate`.

**Editing a generated migration after it was applied.** `drizzle-kit migrate`
skips files older than the last applied migration, so the edit never reaches
databases that already ran it. Write a new migration instead
(`drizzle-kit generate --custom` creates an empty SQL file for hand-written
statements).

**String-building SQL.** Concatenating input into `sql.raw()` reopens SQL
injection. Use `` sql`...` `` interpolation.

**Returning full rows to Client Components.** `select()` with no arguments returns
every column. Pass an explicit column object for data the UI receives.

## Related topics

- [Connection pooling](./connection-pooling.md): sizing the `pg` pool and the
  development singleton.
- [Migrations in deployment](./migrations-in-deployment.md): where
  `drizzle-kit migrate` runs.
- [SQL injection](../nextjs-security/sql-injection.md): `` sql`...` `` versus
  `sql.raw()`.
- [Prisma](./prisma.md): the schema-file alternative.
- [Server Components](../server-react/server-components.md): the React model
  behind components that await queries.
- [The databases example](../../examples/nextjs/databases/README.md): Drizzle and
  Prisma side by side.
