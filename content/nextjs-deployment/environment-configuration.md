---
title: Environment configuration
description: Separate build-time and runtime configuration so one Next.js build can be promoted through every environment without leaking secrets.
group: nextjs-deployment
order: 60
status: current
related: [nextjs-backend/environment-variables, nextjs-security/environment-variable-leaks, nextjs-deployment/docker, server-react/server-components]
---

## Overview

Every value your app reads from the environment is resolved at one of two
moments, and in a deployment the difference decides whether you can reuse a
build:

| Kind of value | Resolved | Where it ends up | Change it by |
|---|---|---|---|
| `NEXT_PUBLIC_*` referenced in code | `next build` | Inlined into client (and server) JavaScript | Rebuilding |
| Server variable read during prerendering | `next build` | Baked into the static shell or a build-time cache entry | Rebuilding |
| Server variable read at request time | Each request | Nowhere persistent | Restarting with new values |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `NEXT_DEPLOYMENT_ID` | `next build` | Build output | Rebuilding |
| `PORT`, `HOSTNAME` | Server start | Process | Restarting |

The goal of this page is a single build artifact, for example one Docker image,
that runs in staging and production with different runtime values. The basics of
`.env` files and load order are on
[Environment variables](../nextjs-backend/environment-variables.md).

## Why it exists

Rebuilding per environment means the thing you tested is not the thing you
ship. A different build can pick up a different dependency, a different
prerendered shell, or a different encryption key.

`next build` also runs your code: prerendering calls your Server Components.
Anything they read from `process.env` during that pass becomes part of the
output. Deciding deliberately which values are build inputs keeps secrets out of
artifacts and lets one image serve many environments.

> [!NOTE]
> `serverRuntimeConfig` and `publicRuntimeConfig` were removed in **Next.js
> 16.0**. Read environment variables on the server at request time instead, as
> shown below.

## When to use it

- **You promote one build or image** from staging to production.
- **You deploy the same app for several tenants or regions** that differ only in
  configuration.
- **You rotate secrets** and want a restart, not a rebuild, to pick them up.

## When not to use it

- **Values that are truly the same everywhere** can be `NEXT_PUBLIC_` build
  inputs, such as a public product name. Runtime indirection would only add
  requests.
- **Values the static shell must contain.** If a prerendered page needs a value,
  it is a build input by definition. Either rebuild per environment for that
  value, or render that part at request time.

## Basic example

Read and validate server configuration in a `server-only` module, as a function,
so nothing is read at import time:

```ts file="lib/server-env.ts"
import 'server-only';
import { z } from 'zod';

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  PAYMENTS_API_KEY: z.string().min(1),
  SUPPORT_CHAT_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = Object.keys(z.flattenError(result.error).fieldErrors);
    throw new Error(`Invalid server environment: ${missing.join(', ')}`);
  }
  return result.data;
}
```

Read it at request time. `connection()` tells Next.js to wait for a real request,
so the value is not captured during the build:

```tsx file="app/support/page.tsx"
import { Suspense } from 'react';
import { connection } from 'next/server';
import { getServerEnv } from '@/lib/server-env';
import { ChatWidget } from './chat-widget';

async function SupportChat() {
  await connection();
  const { SUPPORT_CHAT_URL } = getServerEnv();

  // Pass only the one public value the client needs, never the whole env.
  return <ChatWidget chatUrl={SUPPORT_CHAT_URL} />;
}

export default function SupportPage() {
  return (
    <main>
      <h1>Support</h1>
      <Suspense fallback={<p>Loading chat…</p>}>
        <SupportChat />
      </Suspense>
    </main>
  );
}
```

```tsx file="app/support/chat-widget.tsx"
'use client';

export function ChatWidget({ chatUrl }: { chatUrl: string }) {
  return (
    <a href={chatUrl} target="_blank" rel="noopener noreferrer">
      Open live chat
    </a>
  );
}
```

The same image now points at a different chat service in each environment:

```bash
docker run -e DATABASE_URL="$STAGING_DATABASE_URL" -e PAYMENTS_API_KEY="$STAGING_PAYMENTS_KEY" -e SUPPORT_CHAT_URL=https://chat.staging.example.com shop-web:1.4.0
```

## How it works

### `NEXT_PUBLIC_` is a build-time find-and-replace

During `next build`, every literal `process.env.NEXT_PUBLIC_NAME` is replaced
with the value present in the build environment. After that the bundle no longer
reads the environment. Setting the variable when the container starts changes
nothing in the browser. Dynamic lookups such as `process.env[name]` are not
inlined at all.

### Prerendering reads the build environment

With Cache Components, Next.js prerenders everything that does not wait for
request data. A Server Component that reads `process.env.SUPPORT_CHAT_URL`
without `connection()`, `cookies()`, `headers()` or another request-time API
runs during `next build`, and the value it saw is written into the static shell.
The same applies to a value read inside `"use cache"` during the build.

Putting the read behind `await connection()` inside `<Suspense>` moves it to
request time. The rest of the page stays in the shell. See
[Server Components (React)](../server-react/server-components.md) for why a
component on the server can read secrets at all.

### Values that must match across instances

Some variables are consumed by `next build` and must be identical for every
instance that serves traffic together:

- **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`**: a base64 AES key used to encrypt
  Server Function closure variables. It is embedded in the build output.
- **`NEXT_DEPLOYMENT_ID`** (or `deploymentId` in config, which takes
  precedence): version skew protection.

Set both in CI from your secret store, not in a committed `.env` file.

### Where `.env` files fit

`.env`, `.env.production` and `.env.local` are loaded by Next.js from the
project root. Real environment variables (`process.env`) take precedence over
all of them. In production, treat `.env.production` as non-secret defaults that
are safe to commit, and inject everything secret from the platform.

## Server and client implications

- **The client only sees what you pass it.** A server-read value reaches the
  browser only through props, rendered HTML, or a Route Handler response. Pass
  individual values, never `process.env` or a config object.
- **A value passed to a Client Component is public.** It is serialized into the
  RSC payload. The `server-only` import makes a client import of the env module a
  build error, but it cannot stop you from passing a secret as a prop.

## Caching implications

- **Do not read per-environment secrets inside `"use cache"` without the value in
  the key.** A cache entry computed with one environment's configuration is keyed
  only by the function's arguments.
- **A new `deploymentId` starts new cache keys**, so promoting a build with a
  different ID begins with a cold cache.

## Common patterns

### Build arguments only for public values

In CI, pass public values as build arguments and secrets only at run time:

```bash
docker build --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com -t shop-web:1.4.0 .
```

If a public value differs per environment and you still want one image, render it
from the server at request time, as with `SUPPORT_CHAT_URL` above.

### Fail fast at startup

Validate required variables when the server starts, so a misconfigured
deployment fails its health check instead of its first customer request.
`register` in `instrumentation.ts` runs once per server instance before it
serves traffic:

```ts file="instrumentation.ts"
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const serverEnv = await import('./lib/server-env');
    serverEnv.getServerEnv();
  }
}
```

### Secrets management

Store secrets in your platform's secret manager or your orchestrator's secret
objects, and expose them to the process as environment variables at start.
Rotate by restarting instances. Only the build-time values listed above need a
rebuild.

## Security considerations

- **Never prefix a secret with `NEXT_PUBLIC_`.** It is inlined into JavaScript
  that anyone can download. See
  [Environment variable leaks](../nextjs-security/environment-variable-leaks.md).
- **Build logs and images contain build-time values.** Keep secrets out of build
  arguments and `COPY` steps.
- **Do not commit `.env.local` or `.env*.local`.** `create-next-app` adds `.env`
  files to `.gitignore` for this reason.

## Common mistakes

**Setting `NEXT_PUBLIC_API_URL` at run time and expecting the browser to use it.**
It was replaced during the build.

**Reading `process.env` in a prerendered component** and finding the staging
value in production. Read it behind `connection()`.

**Validating env at module scope.** The check runs during `next build`, where
runtime secrets are intentionally absent, and fails the build. Validate inside a
function called at request time or in `register`.

**Building each instance separately without a shared encryption key.** Server
Actions fail across instances.

**Looking for `serverRuntimeConfig` in the Next.js 16 docs.** It was removed in
16.0. Use runtime environment variables.

## Related topics

- [Environment variables](../nextjs-backend/environment-variables.md): `.env`
  files, load order and `@next/env`.
- [Environment variable leaks](../nextjs-security/environment-variable-leaks.md):
  how secrets escape to the client and how to stop it.
- [Docker](./docker.md): build arguments versus runtime variables in an image.
- [Self-hosting](./self-hosting.md): the encryption key and `deploymentId` across
  instances.
- [Server Components (React)](../server-react/server-components.md): why server
  code can read secrets and client code cannot.
