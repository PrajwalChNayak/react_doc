---
title: Migrations in deployment
description: Run Prisma and Drizzle schema migrations as a separate deploy step, in the right order, without downtime.
group: nextjs-databases
order: 60
status: current
related: [nextjs-databases/prisma, nextjs-databases/drizzle, nextjs-deployment/checklist, nextjs-databases/connection-pooling]
---

## Overview

A schema migration changes shared state that every running copy of your app
depends on. It should run **once per release, as its own deploy step, before the
new code takes traffic**. It should not run inside `next build`, and it should
not run when the server starts or handles a request.

| ORM | Create a migration (development) | Apply migrations (deployment) |
|---|---|---|
| Prisma ORM 7 | `npx prisma migrate dev --name <name>` | `npx prisma migrate deploy` |
| Drizzle (`drizzle-kit` 0.31) | `npx drizzle-kit generate --name <name>` | `npx drizzle-kit migrate` |

Both deployment commands read the committed migration files, check which ones the
database has already applied, and apply the rest in order. Neither generates new
migrations or resets data.

## Why it exists

**Not in `next build`.** A build is meant to be repeatable and free of side
effects. It runs in preview deployments, in CI for pull requests, and sometimes
several times for one commit. A migration inside it would change the production
schema from a branch that never ships, or before the release is approved. Build
machines also often have no network path to the production database.

**Not at startup or request time.** A deployment starts several instances at once.
Each one would race to apply the same migration, and a slow migration would hold
up readiness checks or the first request. A failure would leave instances
half-started instead of stopping the release.

**As its own step**, a migration runs once, with its own credentials and logs, and
a failure stops the pipeline before any new code is live.

## When to use it

- Every release that includes files in `prisma/migrations/` or `drizzle/`.
- Every environment that has its own database: staging, production, and
  long-lived preview databases.

## When not to use it

- **`prisma migrate dev` and `drizzle-kit push` are development tools.**
  `migrate dev` can prompt to reset the database, and `push` applies schema
  changes without a migration history. Neither belongs in a pipeline that touches
  production.
- **A local terminal with the production URL** is not a deploy step. Prisma's
  deployment guide recommends running `migrate deploy` from CI/CD instead of
  keeping production credentials on developer machines.

## Basic example

Give both CLIs the connection string from the environment, and add scripts for
the deploy step:

```json file="package.json"
{
  "scripts": {
    "build": "next build",
    "db:migrate:prisma": "prisma migrate deploy",
    "db:migrate:drizzle": "drizzle-kit migrate"
  }
}
```

A GitHub Actions workflow that migrates, then deploys. The migration job must
succeed before the deploy job starts:

```text file=".github/workflows/deploy.yml"
name: Deploy
on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      # Pick the command for your ORM.
      - run: npm run db:migrate:prisma
        env:
          DATABASE_URL: ${{ secrets.MIGRATION_DATABASE_URL }}

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      # Build and ship the app with your platform's deploy step here.
      # The app's runtime DATABASE_URL is configured on the platform,
      # not in this workflow.
```

`npm ci` installs devDependencies, so `prisma` and `drizzle-kit` are available.
If your platform prunes devDependencies before a step that needs a CLI, Prisma's
guide suggests moving `prisma` to `dependencies`.

## How it works

### What each command records

- **Prisma** stores applied migrations in a `_prisma_migrations` table.
  `prisma migrate deploy` applies pending folders from `prisma/migrations`.
  `prisma migrate status` compares the files with the database, and
  `prisma migrate resolve` marks a failed migration as applied or rolled back
  after you fix it by hand.
- **Drizzle** stores applied migrations in `drizzle.__drizzle_migrations` by
  default. `drizzle-kit migrate` applies the SQL files in the `out` folder listed
  in `drizzle/meta/_journal.json`.

### Which connection string

Migrations need a **direct** connection, not a transaction-mode pooler, because
migration tools rely on session behavior. They also deserve a role that may run
DDL, while the app's runtime role should not. In Prisma ORM 7 the CLI reads its
URL from `prisma.config.ts`, so point it at the direct URL there:

```ts file="prisma.config.ts"
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // CLI only. The app connects through the pooled DATABASE_URL via the adapter.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!,
  },
});
```

For Drizzle, set `dbCredentials.url` in `drizzle.config.ts` the same way.
[Connection pooling](./connection-pooling.md) explains the pooled versus direct
URLs.

### Order in a release

During a rolling deploy, old and new versions of the app run at the same time.
The migration runs **before** the new version, so **the old version must keep
working against the new schema**. That rule decides how you split a change.

## Common patterns

### Expand and contract

Split a breaking change into backward-compatible releases. Renaming
`users.name` to `users.full_name`:

| Release | Migration (runs first) | App code (deploys after) |
|---|---|---|
| 1. Expand | Add nullable `full_name` | Write both columns, read `name` |
| 2. Backfill | Copy `name` into `full_name` for existing rows | Unchanged |
| 3. Switch | Make `full_name` `NOT NULL` if needed | Read and write only `full_name` |
| 4. Contract | Drop `name` | Unchanged |

Each migration is safe for the code that is running while it applies. If a
release has to be rolled back, the previous code still finds the columns it
expects.

Destructive steps (dropping a column or table, narrowing a type) always go in a
**later** release than the code that stopped using them.

### Hand-written migration steps

Backfills and data fixes are SQL you write yourself. With Drizzle,
`drizzle-kit generate --custom --name backfill_full_name` creates an empty SQL
file in the migration history for that. With Prisma, edit the SQL in a new
migration folder before you apply it.

### Large tables

Some DDL locks a table for the length of the statement. On large, busy tables,
prefer operations your PostgreSQL version performs without rewriting the table,
backfill in batches, and create indexes with `CREATE INDEX CONCURRENTLY` in a
migration step of its own. Test the migration against a copy of production data
first.

### Rolling forward

Neither `prisma migrate deploy` nor `drizzle-kit migrate` rolls a migration back.
When a released migration is wrong, write a new migration that corrects it. This
is another reason to keep each step small and backward-compatible.

### Drizzle's runtime migrator

Drizzle also exports `migrate()` from `drizzle-orm/node-postgres/migrator`, which
applies the same migration folder from code. It fits a single long-lived process
or a one-off job script run as a deploy step. Do not call it from Next.js route
code or on server startup when more than one instance can start at once.

## Security considerations

- Store the migration connection string as a deployment secret, scoped to the
  migration job. The running app never needs it.
- Review generated SQL in pull requests like application code. A dropped column
  is a data loss event.

## Common mistakes

**Adding `prisma migrate deploy` to the `build` script.** Preview and pull-request
builds would migrate the database. Keep `prisma generate` in the build, and
migrations in a separate step.

**Running migrations on server start.** Multiple instances race, and a failure
surfaces as crashing pods instead of a failed pipeline step.

**Deploying code before its migration.** New code queries a column that does not
exist yet. Migrate first, then deploy.

**Dropping a column in the same release that stops using it.** Old instances still
serving traffic during the rollout fail. Contract in a later release.

**Migrating through the pooled URL.** Transaction-mode poolers break session
features migrations depend on. Use a direct URL.

**Using `prisma db push` or `drizzle-kit push` in CI.** They skip the migration
history and can apply destructive changes without a reviewed SQL file.

**Editing a migration that already ran somewhere.** The change never reaches
databases that applied the original. Add a new migration.

## Related topics

- [Deployment checklist](../nextjs-deployment/checklist.md): where the migration
  step sits among the other release checks.
- [Prisma](./prisma.md): `prisma.config.ts`, the migration folder and
  `prisma generate` in the build.
- [Drizzle](./drizzle.md): `drizzle.config.ts` and `drizzle-kit generate`.
- [Connection pooling](./connection-pooling.md): pooled runtime URLs versus direct
  migration URLs.
- [Environment variables](../nextjs-backend/environment-variables.md): keeping
  database URLs out of the client bundle.
- [Server Components](../server-react/server-components.md): the React model
  behind the queries that must keep working during a rollout.
