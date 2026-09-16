---
title: Environment variables
description: How Next.js loads .env files, which variables reach the browser, and when a value is read at build time or at request time.
group: nextjs-backend
order: 40
status: current
related: [nextjs-security/environment-variable-leaks, nextjs-deployment/environment-configuration, nextjs-backend/route-handlers, server-react/directives]
---

## Overview

Next.js loads `.env*` files from the project root into `process.env` for
`next dev`, `next build` and `next start`. From there, two rules decide what
happens to a variable:

| Variable | Available in | When the value is fixed |
|---|---|---|
| `DATABASE_URL` (no prefix) | Server code only: Server Components, Route Handlers, Server Actions, `proxy.ts`, `instrumentation.ts` | Read from `process.env` when the code runs. For a prerendered route, that is at build time. |
| `NEXT_PUBLIC_ANALYTICS_ID` | Server **and** browser | **Inlined as a literal** into the JavaScript bundle during `next build` |

Everything on this page follows from those two rows.

## Why it exists

Configuration differs between your laptop, CI, staging and production, and
secrets must not be committed. `.env` files give you a conventional place for
local values, while real deployments inject variables through the host.

The `NEXT_PUBLIC_` prefix exists because the browser has no `process.env`. The
only way to give client code a value is to write it into the bundle. Making that
opt-in, by name, means a secret cannot reach the browser unless someone renames
it.

## When to use it

- **Secrets and credentials** for server code: database URLs, API keys, signing
  secrets. No prefix.
- **Values that differ per environment** and are safe to be public: an analytics
  id, a public API base URL, a feature flag the UI reads. `NEXT_PUBLIC_`.
- **Tooling outside Next.js** (ORM configs, seed scripts, test setup) that must
  see the same `.env` values. Use `@next/env`.

## When not to use it

- **Per-tenant or per-user configuration.** Put it in a database.
- **Public values that must change without a rebuild.** `NEXT_PUBLIC_` values
  are frozen into the bundle. Read a server variable at request time and pass it
  down as a prop, or serve it from a Route Handler.
- **Large or structured configuration.** A typed module checked into the repo is
  easier to review than a JSON string in a variable.
- **Anything secret with a `NEXT_PUBLIC_` prefix.** Every visitor can read it in
  the downloaded JavaScript.

## Basic example

Local values in `.env.local`, which is git-ignored:

```text file=".env.local"
DATABASE_URL=postgres://app:app@localhost:5432/app
WEBHOOK_SECRET=dev-webhook-secret-change-me
NEXT_PUBLIC_ANALYTICS_ID=G-DEV000000
```

Validate server variables in one module, on first use, behind `server-only`:

```ts file="lib/env.ts"
import 'server-only';
import { z } from 'zod';

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  WEBHOOK_SECRET: z.string().min(16),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;
let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    // Name the variables, never print their values.
    throw new Error(
      `Invalid server environment: ${Object.keys(z.flattenError(result.error).fieldErrors).join(', ')}`,
    );
  }
  cached = result.data;
  return cached;
}
```

Three choices in that module are deliberate. `server-only` makes the build fail
if a Client Component imports it. Parsing inside a function, rather than at
module scope, keeps `next build` working on a CI machine without production
secrets, because no handler runs during the build. And the error message lists
names only, so a misconfiguration does not print a secret into logs.

Read a public variable in a Client Component by its full literal name:

```tsx file="app/components/analytics-script.tsx"
'use client';

import { useEffect } from 'react';

export function AnalyticsScript() {
  useEffect(() => {
    // Replaced with "G-DEV000000" (or the build machine's value) by next build.
    const measurementId = process.env.NEXT_PUBLIC_ANALYTICS_ID;
    if (!measurementId) return;
    console.info(`analytics enabled for ${measurementId}`);
  }, []);

  return null;
}
```

## How it works

### Load order

For each variable, Next.js uses the first place it is found:

1. `process.env` (the real environment: your shell, CI, the host)
2. `.env.$(NODE_ENV).local`
3. `.env.local` (not loaded when `NODE_ENV` is `test`)
4. `.env.$(NODE_ENV)`
5. `.env`

`NODE_ENV` is `development` for `next dev` and `production` for every other
command, unless you set it. Its allowed values are `production`, `development`
and `test`.

Two consequences matter in practice. A variable set by your host **wins over
every file**, so a stray `.env.production` cannot override production. And
`.env.test` exists so test runs are reproducible: `.env.local` is skipped when
`NODE_ENV` is `test`.

Commit `.env`, `.env.development`, `.env.production` and `.env.test` only if they
hold non-secret defaults. Never commit `.env*.local`. The `create-next-app`
template ignores `.env*` files entirely, which is the safer default.

### File details

- The files live in the **project root**, even when you use a `src/` folder.
- Values can reference other variables with `$NAME`
  (`API_URL=https://$API_HOST/v1`). Write `\$` for a literal dollar sign.
- Multi-line values work inside double quotes, either with real line breaks or
  with `\n`.

### How `NEXT_PUBLIC_` inlining works

During `next build`, Next.js replaces each **literal** occurrence of
`process.env.NEXT_PUBLIC_SOMETHING` with the value from the build environment.
Only that exact form is replaced:

```ts file="app/components/public-config.ts"
export function getPublicConfig() {
  // Inlined: the literal name is visible to the compiler.
  const analyticsId = process.env.NEXT_PUBLIC_ANALYTICS_ID;

  // NOT inlined: dynamic lookups are undefined in the browser.
  const key = 'NEXT_PUBLIC_ANALYTICS_ID';
  const missing = process.env[key];
  const env = process.env;
  const alsoMissing = env.NEXT_PUBLIC_ANALYTICS_ID;

  return { analyticsId, missing, alsoMissing };
}
```

Because the value is written into files at build time, **one build cannot serve
two environments** with different `NEXT_PUBLIC_` values. A Docker image built
once and promoted from staging to production keeps staging's public values. If
you need that, read a server variable at request time and pass it to the client.
[Environment configuration](../nextjs-deployment/environment-configuration.md)
covers the deployment side.

### Build time versus request time on the server

Server code reads `process.env` when it runs. The question is when that is:

- A route that is **prerendered** at build time captures the value from the
  build machine.
- Code that runs **per request** (a Route Handler that reads the request, a
  Server Action, a component behind a request-time API) reads the running
  server's environment.

To force a read at request time in a Server Component, wait for a request first.
With Cache Components, put that component inside `<Suspense>` so the rest of the
page can still be prerendered:

```tsx file="app/system/page.tsx"
import { Suspense } from 'react';
import { connection } from 'next/server';

async function DeploymentInfo() {
  await connection();
  // Read when a request arrives, from the server's environment, not the build's.
  const region = process.env.DEPLOYMENT_REGION ?? 'unknown';
  return <p>Serving from {region}</p>;
}

export default function SystemPage() {
  return (
    <main>
      <h1>System</h1>
      <Suspense fallback={<p>Loading deployment info…</p>}>
        <DeploymentInfo />
      </Suspense>
    </main>
  );
}
```

`connection()` comes from `next/server`. The 16.3 docs prefer `io()` from
`next/cache` for keeping ordinary work out of the static shell, and reserve
`connection()` for code that must wait for a real user request, which is the
case here: the whole point is the running server's environment.

### Tooling outside Next.js: `@next/env`

ORM configs, seed scripts and test setup run outside Next.js, so nothing loads
`.env.local` for them. `@next/env` is the package Next.js uses internally, and
its `loadEnvConfig` applies the same files in the same order:

```ts file="scripts/load-env.ts"
import { loadEnvConfig } from '@next/env';

// Loads .env* from the project root into process.env, same order as Next.js.
loadEnvConfig(process.cwd());
```

```ts file="scripts/seed.ts"
import './load-env';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  console.log('Seeding database…');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

Install it with `npm install @next/env`. In a test runner's global setup, call
`loadEnvConfig(process.cwd())` the same way.

## Server and client implications

A variable without the prefix is `undefined` in the browser. That is the
protection working, not a bug. The fix is never to add `NEXT_PUBLIC_` to a secret:
read the secret in server code and pass the **result** (not the key) to the
Client Component as a prop, or call it through a Server Action or Route Handler.
The server/client boundary itself is explained in
[Directives](../server-react/directives.md).

Passing `process.env` or a config object to a Client Component as a prop
serializes it into the page. [Environment variable leaks](../nextjs-security/environment-variable-leaks.md)
walks through how secrets escape and how to catch it.

## Caching implications

Values read inside a `"use cache"` function or a prerendered component become
part of the cached output. Rotating a secret or changing a flag does not change
output that was already cached or prerendered until it is revalidated or
rebuilt. Keep secrets out of cached return values entirely.

## Common patterns

- **Validate at the boundary** with a zod schema in `lib/env.ts`, as above.
- **`.env.example` committed**, listing every variable with placeholder values,
  and `.env.local` ignored. The
  [example app](../../examples/nextjs/route-handlers-proxy/README.md) follows
  this.
- **Separate public config**: a small module that reads each `NEXT_PUBLIC_`
  variable by literal name and exports typed values.
- **Runtime public values**: a Server Component reads a server variable after
  `connection()` and passes it to the client as a prop, so one image works in
  every environment.
- **Startup checks** in `instrumentation.ts` `register()`, which runs once
  before the server accepts requests; see [Background work](./background-work.md).

## Security considerations

- Nothing prefixed `NEXT_PUBLIC_` is secret, ever.
- Do not log `process.env` or return it from a handler, even in development.
- Do not interpolate secrets into error messages.
- Keep variables your build does not need out of the build environment, so a
  mistakenly prefixed name has nothing to inline.

## Common mistakes

- **Prefixing a secret with `NEXT_PUBLIC_`** to make an `undefined` go away.
- **Expecting a `NEXT_PUBLIC_` change to apply after deploy** without rebuilding.
- **Reading `process.env[name]` dynamically** in client code; only literal names
  are inlined.
- **Putting `.env` files in `src/`.** They are loaded from the project root.
- **Validating env at module scope** so `next build` fails on CI without
  production secrets.
- **Using the `env` key in `next.config`.** The docs mark it legacy, and values
  set there are **always** inlined into the JavaScript bundle, prefix or not.
- **Looking for `serverRuntimeConfig` / `publicRuntimeConfig`.** Both were
  removed in Next.js 16.0. Read environment variables directly on the server,
  after `connection()` when the value must come from the running server.
- **Committing `.env.local`.**

## Related topics

- [Environment variable leaks](../nextjs-security/environment-variable-leaks.md)
  — how secrets reach the bundle and how to prove they did not.
- [Environment configuration](../nextjs-deployment/environment-configuration.md)
  — setting variables per environment on your host.
- [Directives](../server-react/directives.md) — the React server/client boundary
  that decides where code, and therefore `process.env`, runs.
- [Route Handlers](./route-handlers.md) — where most secrets are used.
- [Webhooks](./webhooks.md) — a signing secret read from the environment.
