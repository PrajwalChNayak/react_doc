---
title: Deployment checklist
description: Everything to confirm before and after deploying a Next.js 16 app, starting with the version that is actually running.
group: nextjs-deployment
order: 90
status: current
related: [nextjs-deployment/self-hosting, nextjs-security/security-advisories, nextjs-databases/migrations-in-deployment, server-react/server-components]
---

## Overview

This page collects the decisions from the rest of the Deployment section into
one list you can walk through before a release. Each item links to the page that
explains it.

> [!WARNING]
> **The minimum safe version is `next@16.3.3`.** Recommend and pin **16.3.5**.
> The August 2026 security release fixed two Critical issues: unauthenticated
> remote code execution in the Image Optimization API through a crafted AVIF
> image, and CVE-2026-75604, unauthenticated RCE on **Windows-hosted** servers in
> apps that use both routers without Cache Components. Any 16.x below 16.3.3 is
> vulnerable. Confirm the version in the running artifact, not only in
> `package.json`.

## Why it exists

Most production incidents after a Next.js upgrade are configuration, not code:
an old version still in the image, a `NEXT_PUBLIC_` value from the wrong
environment, a CDN caching private pages, a migration that ran after the new code
started. A checklist is cheap insurance against the steps nobody owns.

## When to use it

- **Before the first production deploy** of an app.
- **Before each release** that changes Next.js, Node.js, infrastructure, caching
  or the database schema.
- **After a security advisory**, to confirm every environment is patched.

## When not to use it

- **As a substitute for tests.** It checks the deployment, not your features.
- **As a one-time document.** Re-run it when the platform, the CDN or the team
  changes.

## Basic example

Confirm the version three ways. The lockfile is what CI installs, `npm ls` is
what is installed, and the artifact is what runs.

```bash
# 1. What the dependency tree resolves to.
npm ls next

# 2. What the lockfile pins.
node -p "require('./package-lock.json').packages['node_modules/next'].version"

# 3. What is inside the image you deploy.
docker run --rm shop-web:1.4.0 node -p "require('next/package.json').version"
```

All three must print `16.3.3` or later. Pin the exact version:

```json file="package.json"
{
  "dependencies": {
    "next": "16.3.5",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "engines": {
    "node": ">=20.9.0"
  }
}
```

## How it works

### 1. Versions and advisories

- `next` is **16.3.3 or later** in the lockfile, in `node_modules`, and in the
  deployed artifact. Pinned to **16.3.5**.
- You know that upgrading `next` is what patches **React Server Components
  advisories** in an App Router app. The App Router runs the React build vendored
  inside `next`, so changing `react` in `package.json` alone does not patch it.
  Keep `react` and `react-dom` at **19.2.4 or later** anyway (pin 19.2.8) for the
  Pages Router and tooling.
- Windows hosts are on **16.3.3 or later**. CVE-2026-75604 has no workaround.
- Node.js is **20.9.0 or later** in CI and in the runtime image, matching
  `engines` in `next/package.json`.
- Someone watches Next.js security releases. See
  [Security advisories](../nextjs-security/security-advisories.md).

### 2. Build

- `next build` runs in CI, not on production hosts. See
  [Build output](./build-output.md).
- The route table shows the rendering you expect (`○`, `◐`, `ƒ`).
- `.next/cache` is persisted between CI builds.
- No production build uses `--debug-prerender`.
- With `output: 'standalone'`, `public` and `.next/static` are copied or
  uploaded. See [Docker](./docker.md).

### 3. Environment variables

- No secret starts with `NEXT_PUBLIC_`. See
  [Environment variable leaks](../nextjs-security/environment-variable-leaks.md).
- `NEXT_PUBLIC_` values were correct **at build time** for this environment.
- Server secrets are injected at run time and read at request time. See
  [Environment configuration](./environment-configuration.md).
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is set from a secret store when more
  than one build can serve traffic at once.
- No `.env*.local` file is committed or copied into an image.

### 4. Images

- `images.remotePatterns` lists only the hosts and paths you use. It replaces
  the deprecated `images.domains`.
- `sharp` is available where image optimization runs.
- You do not rely on AVIF output: the 16.3.3 patch disables AVIF optimization.
- `dangerouslyAllowSVG` stays off unless you also set `contentSecurityPolicy`
  and `contentDispositionType` for images.

### 5. Security headers

- A Content Security Policy is set, and tested with the app's scripts.
- Clickjacking, MIME sniffing and referrer headers are set.
- The inspector port is not reachable from the network.
- Authorization happens in Server Actions, Route Handlers and the data access
  layer, not only in `proxy.ts`. See
  [Security overview](../nextjs-security/overview.md).

### 6. Database migrations

- Migrations run as a **separate step** before the new version takes traffic,
  never from `next build` or from server start in every instance. See
  [Migrations in deployment](../nextjs-databases/migrations-in-deployment.md).
- The previous app version still works against the migrated schema, so a
  rollback does not need a down migration.

### 7. Caching and CDN

- Multi-instance deployments use shared `cacheHandler` and `cacheHandlers`
  storage with tag coordination. See [Self-hosting](./self-hosting.md).
- `deploymentId` is set per deployment for version skew protection.
- The CDN respects origin `Cache-Control`, keeps `_rsc` in the cache key and
  forwards the `rsc` header. See [Caching and CDNs](./caching-and-cdn.md).
- Dynamic pages return `private, no-store` through the CDN.
- Revalidation is followed by a CDN purge, or TTLs are short enough.

### 8. Runtime and observability

- A reverse proxy sits in front of Node.js, with buffering disabled for
  streaming.
- `--keepAliveTimeout` is longer than the load balancer's idle timeout.
- A health route runs at request time (`await connection()`).
- Shutdown sends `SIGTERM` and allows a 10 to 30 second drain for in-flight
  requests and `after()` work.
- `instrumentation.ts` reports errors with `onRequestError`, including the
  digest. See [Debugging production](./debugging-production.md).
- Logs do not contain cookies, authorization headers or secrets.

### 9. Rollback

- The previous image or build artifact is kept and can be redeployed without
  rebuilding.
- Rolling back does not need a schema rollback (see step 6).
- Old static assets stay available while old clients may still request them.
- You expect a cold runtime cache after switching deployments. Runtime caches
  are per deployment, and a CDN may still hold the newer version's pages until
  you purge it.

## Security considerations

A baseline `next.config.ts` for the image and header items above:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  deploymentId: process.env.DEPLOYMENT_VERSION,
  poweredByHeader: false,
  images: {
    remotePatterns: [new URL('https://images.example-cdn.com/products/**')],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

A Content Security Policy that uses nonces has to be generated per request in
`proxy.ts`, and nonces require dynamic rendering. Plan that with the security
section before you add it. Server Components keep secrets on the server only if
you never pass them to Client Components; see
[Server Components (React)](../server-react/server-components.md).

## Common mistakes

**Checking `package.json` instead of the artifact.** A `^16.3.0` range, a stale
lockfile or a cached image layer can still ship a vulnerable version.

**Upgrading `react` to patch an RSC advisory in an App Router app.** The App
Router uses the React vendored in `next`. Upgrade `next`.

**Running migrations on server start.** Every instance races to migrate, and a
failed migration takes all instances down.

**Rolling back code but not configuration.** A `NEXT_PUBLIC_` value or a cache
handler change can be the real cause.

**Skipping the checklist for "small" releases.** Security patches are small
releases.

## Related topics

- [Security advisories](../nextjs-security/security-advisories.md): the advisories
  behind the version floor.
- [Migrations in deployment](../nextjs-databases/migrations-in-deployment.md): run
  schema changes as their own step.
- [Self-hosting](./self-hosting.md): proxy, caches, skew and shutdown in detail.
- [Caching and CDNs](./caching-and-cdn.md): headers and purging.
- [Server Components (React)](../server-react/server-components.md): the server
  boundary that keeps secrets out of the client.
