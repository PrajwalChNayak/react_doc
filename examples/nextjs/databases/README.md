# Databases example: Prisma ORM 7 and Drizzle ORM in Next.js 16.3

A guestbook implemented twice against one PostgreSQL 16 database: once with
**Prisma ORM 7.10.0** (`@prisma/adapter-pg`), once with **Drizzle ORM 0.45.2**
(`drizzle-orm/node-postgres`). It backs the **Databases and ORMs** pages of the
Next.js section of this site.

A real app picks one ORM. This one uses both side by side so you can compare the
same pages, queries and migrations.

## What it demonstrates

- **Client singletons that survive hot reload.** `lib/db/prisma.ts` and
  `lib/db/drizzle.ts` each create one pooled `pg` connection per server process
  (`max: 5`) and cache it on `globalThis` outside production, so saving a file in
  `next dev` does not open a new pool.
- **`server-only`** on every module that holds a database client, so importing
  one from a Client Component fails the build.
- **A data access layer.** `lib/data/guestbook.ts` is the only module that runs
  queries, and it returns plain DTOs.
- **Reads in Server Components, at request time.** `app/prisma/page.tsx` and
  `app/drizzle/page.tsx` render the list inside `<Suspense>`, and the data
  functions call `await io()` (from `next/cache`, new in 16.3) first. With `cacheComponents: true`,
  `next build` prerenders the shell and **never connects to the database**.
- **Writes in Server Actions.** `app/actions.ts` validates `FormData` with Zod 4
  (`safeParse`, `z.flattenError`), inserts the row, and calls `refresh()`.
- **Prisma ORM 7 setup:** `prisma.config.ts`, the `prisma-client` generator with
  an explicit `output` (`lib/generated/prisma`), the `pg` driver adapter, and
  `prisma generate` on `postinstall` and `prebuild`.
- **Drizzle setup:** a TypeScript schema in `lib/db/schema.ts`,
  `drizzle.config.ts`, and SQL migrations in `drizzle/`.
- **Separate migration histories.** Prisma owns `public.guestbook_entries`
  (`prisma/migrations/`). Drizzle owns `drizzle_demo.guestbook_entries`
  (`drizzle/`) and records applied migrations in `drizzle.__drizzle_migrations`.
- **Migrations as their own step.** `npm run db:migrate` runs
  `prisma migrate deploy` and `drizzle-kit migrate`. Neither runs inside
  `next build` or at request time.

## Doc pages it backs

- [Databases overview](../../../content/nextjs-databases/overview.md)
- [Connection pooling](../../../content/nextjs-databases/connection-pooling.md)
- [Prisma](../../../content/nextjs-databases/prisma.md)
- [Drizzle](../../../content/nextjs-databases/drizzle.md)
- [Migrations in deployment](../../../content/nextjs-databases/migrations-in-deployment.md)

## Run it from a fresh clone

Requires Node.js 20.19.0 or later (Prisma ORM 7's minimum; Next.js needs
20.9.0) and Docker. All example apps share one npm workspace.

```bash
cd examples/nextjs
npm install
docker compose -f databases/docker-compose.yml up -d
cp databases/.env.example databases/.env
npm run db:migrate --workspace @nextjs-examples/databases
npm run dev --workspace @nextjs-examples/databases
```

`npm install` runs `prisma generate` (the `postinstall` script), which writes the
Prisma client to `databases/lib/generated/prisma`. It needs no database.

Open http://localhost:3000/prisma and http://localhost:3000/drizzle and sign the
guestbook on each.

Production build and server. The build does not need the database; `start` does:

```bash
npm run build --workspace @nextjs-examples/databases
npm run start --workspace @nextjs-examples/databases
```

Type-check (generates route types first; run `npm install` before, so the
Prisma client exists):

```bash
npm run typecheck --workspace @nextjs-examples/databases
```

Stop the database with `docker compose -f databases/docker-compose.yml down`.
Add `-v` to delete its data volume.

## Scripts

| Script | What it runs |
|---|---|
| `db:migrate` | Both migration commands below, in order |
| `db:migrate:prisma` | `prisma migrate deploy`: applies pending files in `prisma/migrations` |
| `db:migrate:drizzle` | `drizzle-kit migrate`: applies pending files in `drizzle/` |
| `db:generate:prisma` | `prisma migrate dev`: after editing `schema.prisma`, creates a new migration (development only) |
| `db:generate:drizzle` | `drizzle-kit generate`: after editing `lib/db/schema.ts`, writes a new SQL migration |

## Environment variables and external services

| Variable | Used by | Example |
|---|---|---|
| `DATABASE_URL` | the app at runtime, `prisma.config.ts`, `drizzle.config.ts` | `postgresql://guestbook:guestbook@localhost:5432/guestbook` |

Copy `.env.example` to `.env`. Next.js loads `.env` itself. The Prisma and
Drizzle CLIs load it through `import 'dotenv/config'` in their config files.
Never commit `.env`.

The only external service is PostgreSQL, provided by `docker-compose.yml`
(`postgres:16`). Its credentials are for local development only.

## Files you will see after running it

`lib/generated/prisma/` (the generated Prisma client), `.next/` and
`next-env.d.ts`. None of them should be committed.
