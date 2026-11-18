---
title: Middleware to proxy
description: Rename middleware.ts to proxy.ts, update the export and config flags, and understand the Node.js-only runtime.
group: nextjs-migration
order: 40
status: current
since: "16.0"
related: [nextjs-backend/proxy, nextjs-security/proxy-is-not-authorization, nextjs-backend/runtimes, nextjs-migration/next-15-to-16]
---

## Overview

Next.js 16.0 **deprecated** the `middleware` file convention and renamed it to
`proxy`. The file, the exported function and every config flag with
`middleware` in its name changed. What the code can do did not: matchers,
`NextRequest`, `NextResponse`, rewrites, redirects, headers and cookies all work
the same way.

| | Next.js 15 | Next.js 16.3 |
|---|---|---|
| File | `middleware.ts` | `proxy.ts` (project root, or `src/`) |
| Export | `middleware` (named) or default | `proxy` (named) or default |
| Runtime | Edge by default; Node.js stable since 15.5 | **Node.js only**; cannot be configured |
| Status | Current | `middleware.ts` still runs, **Deprecated** |

## Why it exists

The Next.js docs give two reasons. "Middleware" was routinely confused with
Express middleware, which invited people to put application logic in it. And
the feature is meant as a last resort that sits at the network boundary in front
of the app, which is what a proxy is.

The name is a signal about intent. Next.js is moving features that people used
middleware for (auth checks, i18n, redirects) into better-scoped APIs, and the
rename tells you to reach for those first.

## When to use it

Run the migration on every app that has a `middleware.ts`, as part of
[Next.js 15 to 16](./next-15-to-16.md). Deprecated code keeps working today, but
new documentation, examples and codemods target `proxy`.

## When not to use it

- **The file must keep running on the Edge runtime.** `proxy.ts` always runs on
  Node.js and cannot run on Edge at all. Setting a `runtime` in a proxy file
  throws. Only the deprecated `middleware.ts` can still run on Edge, so keep it
  for now and plan to move the logic off Edge.

> [!DEPRECATED]
> The Edge runtime is deprecated in Next.js 16. Keeping `middleware.ts` for Edge
> is a temporary state, not a destination. The 16.0 upgrade guide says further
> Edge instructions will follow in a minor release; none are in the 16.3.5 docs.

## Basic example

Run the codemod from the project root:

```bash
npx @next/codemod@latest middleware-to-proxy .
```

It renames `middleware.<ext>` to `proxy.<ext>`, renames the named export, and
renames the config flags listed below. Or do it by hand:

:::tabs
== Before (Next.js 15)
```ts legacy file="middleware.ts"
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const locale = request.cookies.get('locale')?.value ?? 'en';

  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```
== After (Next.js 16.3)
```ts file="proxy.ts"
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const locale = request.cookies.get('locale')?.value ?? 'en';

  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```
:::

```bash
git mv middleware.ts proxy.ts
```

A default export also works, but the docs recommend naming the function `proxy`
even then. If you customized `pageExtensions` (for example `.page.ts`), the file
is `proxy.page.ts`.

## How it works

### Renamed config flags

| Next.js 15 | Next.js 16.3 | Status of the new key |
|---|---|---|
| `skipMiddlewareUrlNormalize` | `skipProxyUrlNormalize` | Top-level |
| `experimental.middlewareClientMaxBodySize` | `experimental.proxyClientMaxBodySize` | Experimental key (default 10 MB) |
| `experimental.middlewarePrefetch` | `experimental.proxyPrefetch` | Experimental key |
| `experimental.externalMiddlewareRewritesResolve` | `experimental.externalProxyRewritesResolve` | Experimental key |

`skipMiddlewareUrlNormalize` still works and logs a deprecation warning. Setting
it together with `skipProxyUrlNormalize` throws.

:::tabs
== Before (Next.js 15)
```ts legacy file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  skipMiddlewareUrlNormalize: true,
  experimental: {
    middlewareClientMaxBodySize: '1mb',
  },
};

export default nextConfig;
```
== After (Next.js 16.3)
```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  skipProxyUrlNormalize: true,
  experimental: {
    proxyClientMaxBodySize: '1mb',
  },
};

export default nextConfig;
```
:::

### The runtime

Middleware originally ran only on the Edge runtime. 15.2 added Node.js as an
experimental option and 15.5 made it stable. In 16.0, `proxy` runs **only** on
Node.js. That removes a class of bugs where code worked in a route but failed in
middleware because a Node.js API or package was unavailable on Edge.

:::tabs
== Before (Next.js 15)
```ts legacy file="middleware.ts"
import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

export const config = {
  runtime: 'nodejs',
  matcher: '/dashboard/:path*',
};
```
== After (Next.js 16.3)
```ts file="proxy.ts"
import { NextResponse } from 'next/server';

export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: '/dashboard/:path*',
};
```
:::

Remove any `runtime` key from `config` when you rename. It throws in a proxy file.

### What stays the same

- **Location**: the project root or `src/`, next to `app/` or `pages/`.
- **One function per file**, with an optional `config` export holding `matcher`.
  Matchers must be static constants.
- **Arguments**: `(request: NextRequest, event: NextFetchEvent)`, with
  `event.waitUntil()` for background work. The `NextProxy` type from
  `next/server` types both.
- **Execution order**: `headers` and `redirects` from `next.config`, then proxy,
  then `beforeFiles` rewrites, filesystem routes, `afterFiles` rewrites, dynamic
  routes, `fallback` rewrites.
- **Without a matcher, it runs on every request**, including `_next/static`,
  `_next/image` and `public/` assets.
- **`_next/data` routes still invoke it** even when a negative matcher excludes
  them, so a protected page's data route stays protected.
- **Server Functions are not separate routes.** They are POST requests to the
  page that uses them, so a matcher that skips a path also skips its Server
  Functions.
- **Passing data on** still goes through request headers
  (`NextResponse.next({ request: { headers } })`), cookies, rewrites, redirects
  or the URL, never shared module state.

## Common patterns

A typed proxy that forwards a request ID to the app and sets a response header:

```ts file="proxy.ts"
import { NextResponse, type NextProxy } from 'next/server';

export const proxy: NextProxy = (request) => {
  const requestHeaders = new Headers(request.headers);
  const requestId = crypto.randomUUID();
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
};

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Note `NextResponse.next({ request: { headers } })`: it sends headers upstream to
your routes. `NextResponse.next({ headers })` would send them to the client.

For the full API, see [Proxy](../nextjs-backend/proxy.md).

## Security considerations

- **A proxy is not an authorization layer.** A matcher change, a new route, or a
  Server Function moved to another page silently removes coverage. Check
  authorization in the data access layer and in every Server Action. See
  [Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md).
- **CVE-2026-64642**, a proxy/middleware bypass with Turbopack and a single
  `i18n` locale, was fixed in the July 2026 Security Release (16.2.11, 16.3.0).
  Install `next@16.3.5`, which is also above the August floor of 16.3.3.

## Common mistakes

- **Renaming the file but not the export.** A `proxy.ts` that still exports
  `middleware` is the deprecated name in the new file. Rename both.
- **Leaving `runtime` in `config`.** It throws in a proxy file.
- **Keeping both `middleware.ts` and `proxy.ts`.** Next.js detects both and
  fails with an error telling you to use the proxy file only. Delete the old
  file in the same commit.
- **Setting both `skipMiddlewareUrlNormalize` and `skipProxyUrlNormalize`.** The
  config fails to load.
- **Relying on Edge-only globals** after the move. `proxy` runs on Node.js.
- **Treating the rename as a reason to add more logic.** The rename exists to
  discourage exactly that.

## Related topics

- [Proxy](../nextjs-backend/proxy.md) — the current API in full, with matcher
  patterns.
- [Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md)
  — why auth checks belong next to the data.
- [Runtimes](../nextjs-backend/runtimes.md) — Node.js versus the deprecated Edge
  runtime.
- [Next.js 15 to 16](./next-15-to-16.md) — the rest of the 16.0 upgrade.
- [Server Functions](../server-react/server-functions.md) — why a matcher also
  decides whether Server Function calls pass through the proxy.
