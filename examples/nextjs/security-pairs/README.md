# Security pairs: vulnerable and fixed Next.js 16.3 routes

> [!WARNING]
> **This app is intentionally insecure. Never deploy it.** Every route under
> `/vulnerable` and `/api/vulnerable` is exploitable on purpose, and the
> session "authentication" is a plain-text cookie anyone can forge. Run it on
> `localhost` only.

Each pair puts an exploitable route next to its fix. The Playwright tests prove
both halves: the attack succeeds against the vulnerable route, and the same
request fails against the fixed one.

## The pairs

| Pair | Vulnerable | Fixed | Test | Doc page |
|---|---|---|---|---|
| Server Action trusts the UI | `app/vulnerable/invoices/actions.ts` deletes with no checks. The page only hides the button. | `app/fixed/invoices/actions.ts` calls `deleteInvoiceAsAdmin()` in `lib/dal.ts`. | `e2e/server-action-authorization.spec.ts` | [Server Actions authorization](../../../content/nextjs-security/server-actions-authorization.md) |
| `NEXT_PUBLIC_` secret | `app/vulnerable/env-leak/payments-widget.tsx` reads `NEXT_PUBLIC_PAYMENTS_SECRET_KEY` in a Client Component. | `lib/payments.ts` (`server-only`) reads `PAYMENTS_SECRET_KEY`. The client calls a Server Action. | `e2e/env-leak.spec.ts` and `npm run test:leak` | [Environment variable leaks](../../../content/nextjs-security/environment-variable-leaks.md) |
| IDOR | `app/api/vulnerable/invoices/[id]/route.ts` returns any invoice to any signed-in user. | `app/api/fixed/invoices/[id]/route.ts` uses `getInvoiceForCurrentUser()`. Not yours = 404. | `e2e/idor.spec.ts` | [IDOR](../../../content/nextjs-security/idor.md) |
| Open redirect | `app/vulnerable/auth/callback/route.ts` calls `redirect(next)`. | `app/fixed/auth/callback/route.ts` passes `next` through `lib/safe-redirect.ts`. | `e2e/open-redirect.spec.ts` | [Open redirects](../../../content/nextjs-security/open-redirects.md) |

The rest of the [Security](../../../content/nextjs-security/overview.md) group
(SQL injection, CORS, uploads, input validation, proxy) is documented with
self-contained examples on each page.

## Fake users and data

- The `demo_session` cookie holds a user ID: `admin` (role `admin`), `alice` or
  `bob` (role `member`). See `lib/session.ts`.
- Invoices live in memory (`lib/store.ts`): `inv_1001` belongs to alice,
  `inv_1002` and `inv_1003` belong to bob. Each pair has its own table, and a
  server restart resets everything.

## Run the tests from a fresh clone

Requires Node.js 20.9.0 or later. All example apps share one npm workspace.

```bash
cd examples/nextjs
npm install
npm run test --workspace @nextjs-examples/security-pairs
```

Playwright's `webServer` runs `npm run build && npm run start -- --port 3100`
with fake keys set, then runs the API tests against that production server.
Every test uses Playwright's `request` fixture, so **no browser download is
needed**.

The build-output check for the env-leak pair builds the app itself and searches
`.next/static`:

```bash
npm run test:leak --workspace @nextjs-examples/security-pairs
```

Type-check without building:

```bash
npm run typecheck --workspace @nextjs-examples/security-pairs
```

## Try the exploits by hand

Start a production server with the fake keys from `.env.example`:

```bash
cd examples/nextjs/security-pairs
cp .env.example .env.local
npm run build
npm run start
```

**IDOR.** Alice reads bob's invoice, including `internalNotes`, then gets a 404
from the fixed route:

```bash
curl -i http://localhost:3000/api/vulnerable/invoices/inv_1002 -H 'Cookie: demo_session=alice'
curl -i http://localhost:3000/api/fixed/invoices/inv_1002 -H 'Cookie: demo_session=alice'
```

**Open redirect.** The vulnerable callback answers `307` with
`location: https://evil.example/login`. The fixed one answers
`location: /dashboard`:

```bash
curl -i 'http://localhost:3000/vulnerable/auth/callback?next=https://evil.example/login'
curl -i 'http://localhost:3000/fixed/auth/callback?next=%2F%2Fevil.example%2Flogin'
```

**Server Action.** Copy the action ID from the admin's HTML, then replay the
form POST as alice. Afterward `inv_1002` is gone from `/vulnerable/invoices`:

```bash
curl -s http://localhost:3000/vulnerable/invoices -H 'Cookie: demo_session=admin' | grep -o 'ACTION_ID_[0-9a-f]*' | head -1
curl -s http://localhost:3000/vulnerable/invoices \
  -H 'Cookie: demo_session=alice' \
  -F '$ACTION_ID_<id-from-above>=' \
  -F 'invoiceId=inv_1002' > /dev/null
```

The same POST against `/fixed/invoices` (with that page's own action ID) fails
and deletes nothing.

**NEXT_PUBLIC_ leak.** Search the files served to browsers:

```bash
grep -rl sk_test_DEMO_LEAKED_0000 .next/static
grep -rl sk_test_DEMO_SERVER_ONLY_0000 .next/static
```

The first command prints a chunk file. The second prints nothing.

## Environment variables and external services

`.env.example` lists the two fake keys. Tests and `test:leak` set them
themselves. No database or network service is needed.
