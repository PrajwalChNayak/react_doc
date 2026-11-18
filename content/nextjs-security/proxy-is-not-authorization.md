---
title: Proxy is not authorization
description: Why an auth check that lives only in proxy.ts leaves Route Handlers, Server Actions and rewritten paths open, and how to make the data layer authoritative.
group: nextjs-security
order: 30
status: current
related: [nextjs-backend/proxy, nextjs-auth/data-access-layer, nextjs-auth/protecting-routes, server-react/server-functions]
---

## Overview

`proxy.ts` runs before routes render. That makes it an attractive place for a
single "is the user signed in?" check. Next.js documents it as a place for
**optimistic** checks: read the session cookie and redirect early, for speed
and UX. The Next.js authentication guide adds that Proxy "should not be your
only line of defense", and the security checks belong as close to the data as
possible.

This page shows an app whose only protection is `proxy.ts`, three ways past it,
and the fix: an authoritative check in a `server-only` Data Access Layer that
every page, Route Handler and Server Action calls.

## The threat

Proxy decides whether to run from its `matcher` and from the path of the
incoming request. Authorization that exists only there fails whenever a request
reaches the data without matching:

- **Matcher gaps.** The matcher covers `/admin/:path*`, but the same report is
  also served by `/api/reports/revenue`, which the admin page's client code
  fetches. Nobody added `/api` to the matcher.
- **Server Actions follow the page, not the data.** The proxy reference notes
  that Server Functions "are handled as POST requests to the route where they
  are used", so a matcher that excludes a path also skips Server Function calls
  on that path. Moving an admin action onto an unmatched page silently removes
  its coverage.
- **Rewrites.** Proxy runs before `beforeFiles`, `afterFiles` and `fallback`
  rewrites in the documented execution order. A rewrite from `/legacy-reports`
  to `/admin/reports` serves the admin page to a request path the
  `/admin/:path*` matcher never saw.
- **Framework bypasses.** CVE-2026-64642 (High, July 2026) let requests bypass
  proxy entirely in App Router apps built with Turbopack with a single entry in
  `i18n.locales`. Every check that lived only in proxy was skipped. It is fixed
  in 16.3.0 and later; the current floor is `next@16.3.3`. See
  [Security advisories](./security-advisories.md).
- **Optimistic by design.** Proxy runs on every matched request, including
  prefetches, so it should only read the cookie. It cannot see that a session
  was revoked or that a user lost the `admin` role, and a presence check cannot
  tell a real cookie from a forged one.

## Exploit

The vulnerable app. Proxy is the only check:

```ts file="proxy.ts" vulnerable
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Presence check only, and only for the paths in the matcher.
  if (!request.cookies.has('session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

```tsx file="app/admin/reports/page.tsx" vulnerable
import { getRevenueReport } from '@/lib/reports';

// "Proxy already checked." It checked that a cookie named session exists.
export default async function RevenueReportPage() {
  const report = await getRevenueReport();
  return <pre>{JSON.stringify(report, null, 2)}</pre>;
}
```

```ts file="app/api/reports/revenue/route.ts" vulnerable
import { getRevenueReport } from '@/lib/reports';

// Outside the matcher. No check at all.
export async function GET() {
  return Response.json(await getRevenueReport());
}
```

```ts file="next.config.ts" vulnerable
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/legacy-reports', destination: '/admin/reports' }];
  },
};

export default nextConfig;
```

Three requests, none with a real session:

```bash
# 1. Matcher gap: the API route is not under /admin.
curl -i https://app.example.com/api/reports/revenue

# 2. Rewrite: proxy matches the incoming path, /legacy-reports.
curl -i https://app.example.com/legacy-reports

# 3. Forged cookie: proxy only checks that a cookie named "session" exists.
curl -i https://app.example.com/admin/reports -H 'Cookie: session=anything'
```

All three return `200` with the revenue report. A signed-in member with a
genuine session also reaches `/admin/reports`, because proxy never checks the
role.

## Fix

Make the data layer authoritative. `requireAdmin()` verifies the session
(signature *and* current user record) and the role, and it is marked
`server-only` so it cannot be bundled for the browser:

```ts file="lib/dal/admin.ts"
import 'server-only';

import { verifySession } from '@/lib/dal';

export class AccessError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await verifySession();
  if (!session) throw new AccessError(401, 'Sign in required');
  if (session.role !== 'admin') throw new AccessError(403, 'Admins only');
  return { userId: session.userId };
}
```

Put the check inside the function that returns the data, so no route can call
it without passing:

```ts file="lib/reports.ts"
import 'server-only';

import { requireAdmin } from '@/lib/dal/admin';
import { db } from '@/lib/db';

export async function getRevenueReport(): Promise<{ month: string; revenueCents: number }[]> {
  await requireAdmin();
  return db.revenue.byMonth();
}
```

Then each entry point turns the error into the right response for its kind:

```ts file="app/api/reports/revenue/route.ts"
import { AccessError } from '@/lib/dal/admin';
import { getRevenueReport } from '@/lib/reports';

export async function GET() {
  try {
    return Response.json(await getRevenueReport());
  } catch (error) {
    if (error instanceof AccessError) {
      const access = error as { status: 401 | 403; message: string };
      return Response.json({ error: access.message }, { status: access.status });
    }
    throw error;
  }
}
```

```tsx file="app/admin/reports/page.tsx"
import { redirect } from 'next/navigation';
import { AccessError } from '@/lib/dal/admin';
import { getRevenueReport } from '@/lib/reports';

export default async function RevenueReportPage() {
  let report: Awaited<ReturnType<typeof getRevenueReport>>;
  try {
    report = await getRevenueReport();
  } catch (error) {
    if (error instanceof AccessError) {
      const access = error as { status: 401 | 403 };
      redirect(access.status === 401 ? '/login' : '/');
    }
    throw error;
  }
  return <pre>{JSON.stringify(report, null, 2)}</pre>;
}
```

`redirect()` is called in the `catch` block, not the `try` block, so its
control-flow error is not swallowed by the same `try`.

Keep proxy for what it is good at, an early redirect for users with no cookie at
all. It is now a UX shortcut, not the control.

Why this works:

- **Coverage no longer depends on paths.** The check runs in
  `getRevenueReport()`, so the API route, the rewritten URL, a future Server
  Action and a proxy bypass all execute it.
- **The session is verified, not just present.** A forged `session=anything`
  fails decryption in `verifySession()`.
- **The role is read at request time.** A demoted admin loses access on the
  next request, not when their cookie expires.
- **`server-only` keeps the check on the server.** Importing `lib/dal/admin.ts`
  into a Client Component fails the build.

## Verify the fix

Repeat the three requests. Each is now refused:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/reports/revenue
# 401
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/reports/revenue -H 'Cookie: session=anything'
# 401
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/reports/revenue -H 'Cookie: session=<a-member-session>'
# 403
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/legacy-reports
# 307 (redirect to /login)
```

Make it permanent with a test that deliberately does **not** go through the
matched path:

```ts file="e2e/reports-authorization.spec.ts"
import { expect, test } from '@playwright/test';

test('revenue data is refused on every path, not just /admin', async ({ request }) => {
  const api = await request.get('/api/reports/revenue', { headers: { Cookie: 'session=anything' } });
  expect(api.status()).toBe(401);

  const rewritten = await request.get('/legacy-reports', { maxRedirects: 0 });
  expect(rewritten.status()).toBe(307);
  expect(rewritten.headers()['location']).toContain('/login');
});
```

A good regression check: delete `proxy.ts`, rerun the test, and confirm it still
passes. If it fails, something still depends on proxy for authorization.

## Common patterns

### What proxy is still for

- Redirecting users with no session cookie away from app pages, before any
  rendering.
- Redirecting signed-in users away from `/login`.
- Setting request headers such as a CSP nonce or a request ID.

The authentication guide's example proxy reads the cookie and redirects, and
leaves the database checks to the DAL.

### A matcher for auth redirects

If you do use proxy for optimistic redirects, the authentication guide
recommends running it on all routes and excluding static assets, rather than
listing protected prefixes that drift out of date:

```ts file="proxy.ts"
import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = ['/login', '/signup'];

export function proxy(request: NextRequest) {
  const isPublic = publicPaths.includes(request.nextUrl.pathname);
  if (!isPublic && !request.cookies.has('session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

API routes are excluded here because they answer `401`, not a redirect. That is
fine precisely because the DAL, not proxy, enforces access.

## Common mistakes

**Believing `middleware.ts` behaves differently.** The file was renamed to
`proxy.ts` in 16.0 and the old name is deprecated. The same limits applied to it,
and CVE-2026-64642 affected both names.

**Verifying the session in proxy with a database call.** Proxy runs on every
matched request, including prefetches. Keep it to the cookie, and do the
database check in the DAL.

**Protecting the page but not its data source.** A Route Handler, a Server
Action or another page that calls the same query needs the same check. Put the
check in the query function.

**Passing "authorized" from proxy to the page in a request header.** The page
cannot tell whether proxy set that header or a client did on a path proxy
skipped. Re-derive authorization from the session.

**Assuming a layout check covers child pages.** Layouts do not re-render on
every client navigation, and Server Actions and Route Handlers never run the
layout. Check in the page or, better, the DAL.

## Related topics

- [Proxy](../nextjs-backend/proxy.md) — matchers, execution order and what proxy
  is good for.
- [Data Access Layer](../nextjs-auth/data-access-layer.md) — building
  `verifySession()` and per-resource checks.
- [Protecting routes](../nextjs-auth/protecting-routes.md) — combining an
  optimistic proxy redirect with page-level checks.
- [Server Actions authorization](./server-actions-authorization.md) — actions
  are reachable on whichever page uses them.
- [Server Functions](../server-react/server-functions.md) — React's rule that
  each Server Function authorizes itself.
