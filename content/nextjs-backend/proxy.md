---
title: Proxy
description: Run code before a request is routed with proxy.ts, to redirect, rewrite, set headers and cookies, or answer directly.
group: nextjs-backend
order: 20
status: current
since: "16.0"
related: [nextjs-backend/route-handlers, nextjs-security/proxy-is-not-authorization, nextjs-auth/protecting-routes, nextjs-migration/middleware-to-proxy]
---

## Overview

`proxy.ts` is a single file at the project root (or in `src/`, next to `app/`)
that exports a function Next.js runs **before** a request reaches a page or a
Route Handler. Based on the incoming request, it can let the request continue,
redirect it, rewrite it to a different route, add request or response headers,
set cookies, or return a response itself.

The function is exported either as a named `proxy` export or as the default
export. An optional `config` export holds a `matcher` that limits which paths it
runs on. Proxy runs on the **Node.js runtime**, and that cannot be changed.

> [!DEPRECATED]
> `middleware.ts` with an exported `middleware` function is the name this file
> had before Next.js 16.0, when it was renamed to `proxy.ts`. The old name still
> works but is deprecated. See [Middleware to proxy](../nextjs-migration/middleware-to-proxy.md).

## Why it exists

Some decisions have to be made before Next.js picks a route: sending an old URL
to its new home, choosing a variant for an experiment, redirecting a visitor with
no session cookie to `/login`, or stamping every request with an id for your
logs. Doing that in every page and handler repeats code, and some of it (a
rewrite) is impossible after routing.

The rename to "proxy" is deliberate. The Next.js docs describe it as a network
boundary in front of the app and recommend it as a last resort, not as an
Express-style place to put application logic.

## When to use it

- **Redirects and rewrites that depend on the request**: a cookie, a header, the
  user agent, a query parameter. Static redirects belong in
  [`redirects` in next.config](../nextjs-routing/redirects.md), which is simpler.
- **Optimistic checks**: redirecting to `/login` when there is no session
  cookie, reading only the cookie, never the database.
- **Headers for many routes**: a request id, security headers, CORS for all of
  `/api`.
- **Experiments and feature flags** that rewrite to a different page while the
  URL stays the same.

## When not to use it

- **As your authorization layer.** Proxy decides where a request goes. It is not
  the place that decides whether a user may read a record. The security
  considerations below explain why.
- **For slow data fetching.** Proxy runs on every matched request, including
  prefetches. A database query or a slow API call here slows every navigation.
  Using `fetch` with cache options has no effect in proxy.
- **For logic that belongs to one route.** Put it in that page, layout or Route
  Handler.
- **For static redirects.** `redirects()` in `next.config.ts` runs earlier and
  needs no code.

## Basic example

This `proxy.ts` tags every request with an id and sends visitors without a
session cookie away from `/dashboard`:

```ts file="proxy.ts"
import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'session';

export function proxy(request: NextRequest) {
  // Always mint a fresh id. Do not trust a client-supplied x-request-id.
  const requestId = crypto.randomUUID();
  const { pathname } = request.nextUrl;

  // Optimistic check: is there a cookie at all? It is not verified here.
  if (pathname.startsWith('/dashboard') && !request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Forward the id upstream as a request header...
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // ...and echo it to the client as a response header.
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

A request with a forged `session=anything` cookie passes this check. That is
expected: the dashboard page verifies the cookie's signature itself. The
[example app](../../examples/nextjs/route-handlers-proxy/README.md) includes a
`curl` command that shows exactly that.

## How it works

### Where it runs in the request

Next.js evaluates a request in this order:

1. `headers` from `next.config`
2. `redirects` from `next.config`
3. **Proxy** (rewrites, redirects, headers, responses)
4. `beforeFiles` rewrites from `next.config`
5. Filesystem routes: `public/`, `_next/static/`, `app/`
6. `afterFiles` rewrites from `next.config`
7. Dynamic routes such as `/blog/[slug]`
8. `fallback` rewrites from `next.config`

Only one proxy file is supported per project. Split the logic into modules and
import them into `proxy.ts` if it grows.

### What the function can return

| Return | Effect |
|---|---|
| Nothing, or `NextResponse.next()` | Continue routing unchanged |
| `NextResponse.next({ request: { headers } })` | Continue, with modified **request** headers visible to the route |
| `NextResponse.redirect(url)` | Send the browser a redirect (`307` by default) |
| `NextResponse.rewrite(url)` | Serve a different route while the address bar keeps the original URL |
| `Response.json(...)` or any `Response` | Answer directly; no route runs |

Set **response** headers and cookies on the object you return:
`response.headers.set(...)` and `response.cookies.set(...)`.

> [!WARNING]
> `NextResponse.next({ headers })` (without the `request` key) sends those headers
> **to the client**, not to your route. Copying incoming request headers that way
> can leak cookies or authorization headers, and overriding `Content-Type` can
> break Server Actions and streaming. Use `{ request: { headers } }` to pass data
> upstream, and forward an allow-listed subset rather than every incoming header.

### The matcher

Without a `matcher`, proxy runs on **every** request, including `_next/static`,
`_next/image` and files in `public/`. A redirect written for pages can then
block your CSS and JavaScript.

`matcher` accepts a string, an array of strings, or objects with `source`,
optional `has` and `missing` conditions, and `locale`. Paths start with `/`, can
use named parameters (`/about/:path*`), and can use regular expressions.
Matcher values must be constants, because Next.js reads them at build time; a
value computed from a variable is ignored.

```ts file="proxy.ts"
import { type NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const bucket = request.cookies.get('pricing-experiment')?.value;
  if (bucket === 'b') {
    return NextResponse.rewrite(new URL('/pricing/variant-b', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    {
      source: '/pricing',
      // Do not run for router prefetches, only for real navigations.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
```

### Server Functions share the page's path

Server Actions are not separate routes. They are `POST` requests to the page
that uses them. A matcher that excludes `/settings` also skips every Server
Action invoked from `/settings`, and moving an action to another page can
silently change whether proxy covers it. This is one more reason every
[Server Function](../server-react/server-functions.md) must check the session
itself.

### Background work after the response

Proxy receives a second argument, a `NextFetchEvent`, whose `waitUntil(promise)`
keeps the invocation alive until the promise settles. `after()` from
`next/server` also works in proxy. Use either for logging that should not delay
the response:

```ts file="proxy.ts"
import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest, event: NextFetchEvent) {
  event.waitUntil(
    fetch('https://analytics.example.com/v1/page-hits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathname: request.nextUrl.pathname }),
    }),
  );
  return NextResponse.next();
}

export const config = {
  matcher: ['/blog/:path*'],
};
```

See [Background work](./background-work.md) for the limits that apply.

### Runtime

Proxy always runs on the Node.js runtime. Exporting the `runtime` segment option
from `proxy.ts` throws an error. See [Runtimes](./runtimes.md).

## Server and client implications

Proxy runs on the server for document requests and for the requests the client
router makes during navigation and prefetching. Keep it fast and free of shared
mutable state: Next.js may deploy it separately from your render code, so do not
rely on module-level globals being shared with pages. Pass information to the
route with request headers, cookies, rewrites or the URL.

## Caching implications

A redirect or rewrite in proxy happens per request, before any cached or
prerendered response is chosen. `fetch` cache options have no effect inside
proxy. If proxy varies the response by a cookie or header that a CDN does not
know about, set `Vary` or make sure the CDN does not cache that path; see
[Caching and CDNs](../nextjs-deployment/caching-and-cdn.md).

## Common patterns

- **Request ids** forwarded with `NextResponse.next({ request: { headers } })`
  and logged in handlers, as in the basic example.
- **Optimistic auth redirects** that read only the session cookie. The full
  pattern, with the page-level check, is in
  [Protecting routes](../nextjs-auth/protecting-routes.md).
- **CORS for all of `/api`**: answer `OPTIONS` with the preflight headers for
  allow-listed origins and add `Access-Control-Allow-Origin` to other responses.
  Per-handler CORS is shown on [Route Handlers](./route-handlers.md), and the
  pitfalls on [CORS](../nextjs-security/cors.md).
- **Device-specific rewrites** with `userAgent(request)` from `next/server`,
  which returns `device.type`, `browser`, `os` and `isBot`.
- **Locale detection** for internationalized routes; see
  [Internationalization](../nextjs-routing/internationalization.md).

## Security considerations

Proxy is a routing layer. It is **not** a sufficient authorization layer, for
three reasons:

1. **It can be skipped by configuration.** A matcher edit, a new route outside
   the pattern, or a Server Action moved to another page changes coverage
   without any error.
2. **It can be skipped by bugs.** The July 2026 Next.js security release fixed
   CVE-2026-64642, a proxy/middleware bypass in apps built with Turbopack that
   configure a single `i18n` locale, patched in 15.5.21, 16.2.11 and 16.3.0.
   An app that checked authorization only in proxy was exposed by it; an app
   that also checked in the data layer still refused the request. Run
   `next@16.3.3` or later, the current security floor, and pin 16.3.5.
3. **It should only read the cookie.** Proxy runs on every matched request,
   including prefetches, so the recommended check is presence or a cheap
   signature check, not a database lookup for revoked sessions or roles.

Verify the session and the user's right to the specific resource in every page,
Route Handler and Server Action that reads or writes private data. The attack
and the fix are on [Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md),
and the recommended structure is the
[Data access layer](../nextjs-auth/data-access-layer.md).

Two more rules:

- Do not build redirect or rewrite targets from request-controlled hostnames or
  query parameters without an allow-list. See
  [Open redirects](../nextjs-security/open-redirects.md).
- Do not copy all incoming request headers into a response or an upstream call.

## Common mistakes

- **Writing new code in `middleware.ts`.** That name is deprecated since 16.0.
  Rename the file and the export with `npx @next/codemod@canary middleware-to-proxy .`
- **No matcher**, so a login redirect also applies to `/_next/static` and breaks
  every stylesheet on the login page.
- **Treating the redirect as the security check** and skipping it in the page or
  handler.
- **Querying a database in proxy** on every request, including prefetches.
- **Exporting `runtime`** from `proxy.ts`. It throws; proxy is always Node.js.
- **Using `NextResponse.next({ headers })`** to pass data to the route. That
  sends headers to the client. Use `{ request: { headers } }`.
- **Trusting `x-request-id` or `x-forwarded-*` headers from the client** without
  knowing which proxy in front of you sets them.
- **Computing `matcher` from a variable.** It must be a literal the build can
  read.

## Related topics

- [Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md)
  — the bypass walkthrough and the data-layer fix.
- [Protecting routes](../nextjs-auth/protecting-routes.md) — optimistic checks in
  proxy combined with real checks in pages and actions.
- [Server Functions](../server-react/server-functions.md) — why actions need
  their own checks when proxy coverage is path-based.
- [Route Handlers](./route-handlers.md) — per-endpoint logic, including CORS.
- [Redirects](../nextjs-routing/redirects.md) — static redirects in
  `next.config.ts` and `redirect()` in code.
- [Middleware to proxy](../nextjs-migration/middleware-to-proxy.md) — renaming
  an existing `middleware.ts`.
