---
title: Open redirects
description: A user-supplied next or callbackUrl passed to redirect() sends users to attacker sites — accept only same-origin relative paths or an allow-list.
group: nextjs-security
order: 70
status: current
related: [nextjs-routing/redirects, nextjs-auth/protecting-routes, nextjs-backend/proxy, nextjs-security/input-validation]
---

## Overview

An open redirect is an endpoint that redirects to a URL taken from the request.
The pattern is everywhere in auth flows: a login page reads `?next=` or
`?callbackUrl=` and, after signing the user in, sends them back where they came
from. If that value is not constrained, an attacker can point it at their own
site.

Next.js `redirect()` accepts absolute URLs by design, its own reference says it
"also accepts absolute URLs and can be used to redirect to external links", so
passing an untrusted value straight in redirects off-site. This page fixes it by
accepting only same-origin relative paths. The pair runs in the
[security-pairs example app](../../examples/nextjs/security-pairs/README.md).

## The threat

Open redirects are used for phishing. The link the victim sees begins with your
real, trusted domain:

```
https://app.example.com/login?next=https://app.examp1e.com/login
```

They sign in on your genuine page; your callback then redirects them to the
look-alike (`examp1e`) that harvests the session or asks them to "confirm" a
password. Because the visible link and the SSL certificate are yours, the usual
"check the domain" advice does not catch it. Open redirects also chain into
OAuth token theft and CSP bypasses.

Blocking obvious `http://` and `https://` prefixes is not enough. All of these
escape the origin:

- `//evil.example` — protocol-relative; the browser keeps the current scheme and
  goes to `evil.example`.
- `/\evil.example` and `/\/\evil.example` — browsers treat `\` as `/`, so this
  is `//evil.example`.
- `https:evil.example`, `https:/evil.example` — schemes with missing or single
  slashes that browsers still normalize.
- `/%2F%2Fevil.example`, tab/newline splits like `/\t/evil.example` — decode or
  strip to `//evil.example`.
- Framework-level: CVE-2026-64645 (High, July 2026) let a `redirects()` /
  `rewrites()` rule build its destination hostname from request-controlled input
  and be pointed at an arbitrary host. Patched in 16.2.11, 15.5.21 and 16.3.0;
  the floor is `next@16.3.3`. See [Security advisories](./security-advisories.md).

## Exploit

```ts file="app/vulnerable/auth/callback/route.ts" vulnerable
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // A real callback verifies the provider's response and sets the session here.
  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard';

  // redirect() accepts absolute URLs, so this trusts the attacker's value.
  redirect(next);
}
```

```bash
curl -i 'https://app.example.com/vulnerable/auth/callback?next=https://evil.example/login'
# HTTP/1.1 307 Temporary Redirect
# location: https://evil.example/login

curl -i 'https://app.example.com/vulnerable/auth/callback?next=//evil.example/login'
# location: //evil.example/login   (protocol-relative -> off-site)
```

## Fix

Reduce the untrusted value to a same-origin **path**, or fall back. Reject
anything that is not a plain relative path, and re-check after URL
normalization, because dot segments can normalize back into `//host`:

```ts file="lib/safe-redirect.ts"
export function safeRedirectPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return fallback;

  // Must be a path, and not a protocol-relative URL in disguise.
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;

  // Control characters (tab, CR, LF) are stripped by URL parsers and can turn
  // "/<TAB>/evil.example" into "//evil.example".
  if (/[\x00-\x1f\x7f]/.test(value)) return fallback;

  // Resolve against a placeholder origin; anything that escapes it is external.
  const base = 'http://same-origin.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;

  // Dot segments can normalize into "//host"; re-check after parsing.
  if (url.pathname.startsWith('//')) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
```

```ts file="app/fixed/auth/callback/route.ts"
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { safeRedirectPath } from '@/lib/safe-redirect';

export async function GET(request: NextRequest) {
  const next = safeRedirectPath(request.nextUrl.searchParams.get('next'));
  redirect(next); // always a same-origin path
}
```

Why this works:

- **Allow, don't block.** The rule is "a relative path or nothing", so a payload
  the blocklist author never imagined still fails the positive test.
- **Absolute and protocol-relative URLs cannot pass.** `new URL('https://evil…', base).origin` is not `base`, and a leading `//` is rejected before and after
  normalization.
- **The browser's own quirks are covered.** Backslashes and control characters
  are rejected before parsing, so the string cannot be rewritten into `//host`.
- **Only the path survives.** Query and hash are preserved; the scheme and host
  are always the app's own, because `redirect()` receives a path.

### When you need cross-origin redirects

Some flows legitimately redirect to another site (a payment provider, an
identity provider's logout URL). Do not derive that host from the request.
Allow-list it:

```ts file="lib/redirect-allowlist.ts"
const ALLOWED_HOSTS = new Set(['checkout.stripe.com', 'auth.example.com']);

export function safeExternalUrl(value: string, fallback = '/dashboard'): string {
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:') && ALLOWED_HOSTS.has(url.host)) return url.toString();
  } catch {
    // fall through
  }
  return fallback;
}
```

## Verify the fix

Every attack lands on `/dashboard`; the legitimate path is kept:

```bash
BASE=https://app.example.com
for next in \
  'https://evil.example/login' \
  '//evil.example/login' \
  '/%2F%2Fevil.example' \
  'https:evil.example'; do
  printf '%s -> ' "$next"
  curl -s -o /dev/null -D - "$BASE/fixed/auth/callback?next=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$next")" \
    | grep -i '^location:'
done
# every line: location: /dashboard

curl -s -o /dev/null -D - "$BASE/fixed/auth/callback?next=%2Finvoices%3Fpage%3D2" | grep -i '^location:'
# location: /invoices?page=2
```

The example app tests the whole attack list, and asserts the redirect target
stays on the app's origin:

```ts file="e2e/open-redirect.spec.ts"
import { expect, test } from '@playwright/test';

const attacks = ['https://evil.example/login', '//evil.example/login', '/\\evil.example/login'];

for (const next of attacks) {
  test(`rejects ${JSON.stringify(next)}`, async ({ request, baseURL }) => {
    const response = await request.get(`/fixed/auth/callback?next=${encodeURIComponent(next)}`, {
      maxRedirects: 0,
    });
    const target = new URL(response.headers()['location'], baseURL);
    expect(target.origin).toBe(new URL(baseURL!).origin);
    expect(target.pathname).toBe('/dashboard');
  });
}
```

A unit test of `safeRedirectPath` is the fastest check: it is a pure function, so
feed it the attack list and assert each returns the fallback.

## Common patterns

- **`callbackUrl`, `returnTo`, `redirect`, `from`** are the usual parameter
  names. Treat them all the same way.
- **Store the path, not a URL.** When you persist a "return here after login"
  value in a cookie or session, store a validated relative path so the redirect
  site cannot be poisoned later.
- **Redirect in a Server Action or Route Handler,** not during render, and call
  `redirect()` outside any `try`/`catch`, because it signals via a thrown error.

## Common mistakes

**Checking only for `http://` / `https://`.** Misses `//host`, `/\host`,
`https:host` and encoded variants. Allow-list relative paths instead.

**Using `startsWith('/')` alone.** `//evil.example` and `/\evil.example` both
start with `/`. Reject a second `/` or `\` as the next character.

**Building a redirect host from a header or query value in `next.config`
rewrites/redirects.** That is the shape of CVE-2026-64645. Keep destination
hosts static or allow-listed.

**Trusting `Referer` as the return target.** It is client-controlled and often
absent. Use an explicit, validated parameter.

**Forgetting the `try`/`catch` rule.** `redirect()` throws; calling it inside a
`try` swallows the control-flow error and the redirect silently does nothing.

## Related topics

- [Redirects](../nextjs-routing/redirects.md) — `redirect()`,
  `permanentRedirect()` and config-level redirects.
- [Protecting routes](../nextjs-auth/protecting-routes.md) — the login flow that
  produces a `callbackUrl`.
- [Proxy](../nextjs-backend/proxy.md) — redirects issued before a route renders.
- [Input validation](./input-validation.md) — validating query parameters in
  general.
- [Security advisories](./security-advisories.md) — CVE-2026-64645 and the
  version floor.
- [Server Functions](../server-react/server-functions.md) — the login action
  that produces and consumes the `callbackUrl`.
