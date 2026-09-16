---
title: Webhooks
description: Receive webhooks in a Route Handler by verifying the signature on the raw body, deduplicating deliveries, and acknowledging fast.
group: nextjs-backend
order: 50
status: current
related: [nextjs-backend/route-handlers, nextjs-backend/background-work, nextjs-backend/environment-variables, nextjs-data-caching/revalidation]
---

## Overview

A webhook is an HTTP request another service sends you when something happens:
a payment succeeded, a CMS entry was published, a repository received a push. In
Next.js you receive it with a `POST` [Route Handler](./route-handlers.md).

A correct receiver does five things, in this order:

1. Read the **raw body** with `request.text()`.
2. **Verify the signature** over those exact bytes, with a constant-time
   comparison.
3. Parse and **validate** the payload.
4. **Deduplicate** by the event id, because providers retry.
5. **Respond with a `2xx` quickly**, and do slow work after the response with
   `after()` or in a queue.

## Why it exists

Your webhook URL is public. Anyone who finds it can send a request that looks
exactly like the provider's, so the body proves nothing until a signature,
computed with a secret only you and the provider share, says it does.

Providers also have delivery rules. They time out slow receivers and retry
failures, sometimes for days, and they can deliver the same event twice. A
handler that does all its work inline and is not idempotent will eventually
charge, email or fulfill something twice.

## When to use it

- A third-party service pushes events to you: payments, email delivery, CMS
  publishes, source control, form providers.
- A CMS or back office needs to tell your app to **revalidate** cached content.
- An OAuth-style callback carries a signed payload.

## When not to use it

- **Your own UI** triggers the change. Use a
  [Server Action](../nextjs-mutations/server-actions.md), which authenticates the
  user session rather than a shared secret.
- **You need guaranteed processing** of long jobs. The webhook route should
  accept and enqueue; a queue or workflow service should do the work. See
  [Background work](./background-work.md).
- **The provider offers no signature.** Then use a secret token in a header over
  HTTPS, restrict by IP if the provider publishes ranges, and treat the payload
  as a hint to fetch the real data from the provider's API.

## Basic example

The verification helper. It uses `node:crypto`, available because Route Handlers
run on the Node.js runtime:

```ts file="lib/webhooks/verify.ts"
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Expects a header of the form "sha256=<hex HMAC-SHA256 of the raw body>".
export function isValidSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;

  const received = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();

  // timingSafeEqual throws when lengths differ, so check length first.
  return received.length === expected.length && timingSafeEqual(received, expected);
}
```

The receiver:

```ts file="app/api/webhooks/orders/route.ts"
import { after } from 'next/server';
import { z } from 'zod';
import { isValidSignature } from '@/lib/webhooks/verify';
import { fulfillOrder, recordEventOnce } from '@/lib/orders';

const orderEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['order.paid', 'order.refunded']),
  data: z.object({ orderId: z.string().min(1) }),
});

export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhooks] WEBHOOK_SECRET is not set');
    return new Response(null, { status: 500 });
  }

  // 1. Raw body, read once. The signature covers these exact bytes.
  const rawBody = await request.text();

  // 2. Verify before trusting anything in it.
  if (!isValidSignature(rawBody, request.headers.get('x-signature'), secret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Parse and validate.
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = orderEventSchema.safeParse(json);
  if (!parsed.success) {
    // Acknowledge event types you do not handle, so the provider stops retrying.
    return Response.json({ received: true, ignored: true });
  }
  const event = parsed.data;

  // 4. Idempotency: a unique constraint on the event id decides.
  const isFirstDelivery: boolean = await recordEventOnce(event.id);
  if (!isFirstDelivery) {
    return Response.json({ received: true, duplicate: true });
  }

  // 5. Acknowledge now; the slow part runs after the response is sent.
  after(() => fulfillOrder(event));
  return Response.json({ received: true }, { status: 202 });
}
```

A runnable version with an in-memory idempotency store, and `curl` commands that
send valid, tampered, unsigned and duplicate deliveries, is in
[the example app](../../examples/nextjs/route-handlers-proxy/README.md).

## How it works

### Why the raw body

An HMAC is computed over bytes. `await request.json()` followed by
`JSON.stringify()` produces different bytes whenever whitespace, key order or
number formatting differ from what the provider sent, and the check fails for
legitimate requests. Read `request.text()` (or `request.arrayBuffer()` for
binary payloads) once, verify it, then `JSON.parse` the same string.

The body can be read only once. Do not call `request.json()` "just to look" first.

Route Handlers need no body-parser configuration for this. That was a Pages
Router API Routes concern.

### Why constant-time comparison

`received === expected` returns as soon as the first character differs. With
enough requests and careful timing, an attacker can learn a valid signature one
byte at a time. `timingSafeEqual` from `node:crypto` compares every byte
regardless. It requires two buffers of equal length and throws otherwise, which is
why the helper checks `length` first.

Decode both sides into bytes (`Buffer.from(hex, 'hex')` and `.digest()`) before
comparing. Comparing hex strings as UTF-8 buffers works too, but only if both
use the same letter case.

### Replay protection

A valid request captured once can be sent again. If your provider signs a
timestamp together with the body, verify the signature over both and reject
timestamps outside a small window. The exact header names and signed-string
format are provider-specific, so follow your provider's documentation. The shape
of the check looks like this:

```ts file="lib/webhooks/verify-timestamped.ts"
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 300;

export function isFreshValidSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHex: string | null,
  secret: string,
): boolean {
  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp) || !signatureHex) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest();
  const received = Buffer.from(signatureHex, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
```

Idempotency by event id also defeats a replay of an event you already processed.

### Idempotency

Record the event id with a **unique constraint** before doing the work, and treat
a conflict as "already handled". A check-then-insert (`SELECT`, then `INSERT`)
races when two retries arrive together. An in-memory `Set` only works on a single
long-lived server process, which serverless hosts are not.

Return `2xx` for duplicates. A `4xx` or `5xx` tells the provider to retry again.

### Responding fast with `after()`

`after()` from `next/server` schedules a callback to run after the response is
sent. The provider gets its `202` in milliseconds, and the slow part (emails,
inventory, calls to other services) runs afterwards in the same invocation.

`after()` is not a queue. The work runs within the route's maximum duration, is
not retried if it throws, and is lost if the process dies. If losing the work is
unacceptable, write the event to a durable queue or table inside the handler and
return. [Background work](./background-work.md) compares the options.

## Caching implications

Webhook handlers are `POST`, and non-`GET` handlers are never cached.

A common webhook job is invalidating cached content when a CMS publishes. Call
`revalidateTag` with a profile. `updateTag` is for Server Actions only, so a
Route Handler uses `revalidateTag`:

```ts file="app/api/webhooks/cms/route.ts"
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { isValidSignature } from '@/lib/webhooks/verify';

const publishEventSchema = z.object({
  type: z.literal('entry.published'),
  entry: z.object({ contentType: z.enum(['post', 'page']), slug: z.string().min(1) }),
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.CMS_WEBHOOK_SECRET ?? '';
  if (!secret || !isValidSignature(rawBody, request.headers.get('x-signature'), secret)) {
    return new Response(null, { status: 401 });
  }

  let json: unknown = null;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = publishEventSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ received: true, ignored: true });
  }

  const { contentType, slug } = parsed.data.entry;
  // Serve stale content while fresh data loads in the background.
  revalidateTag(`${contentType}:${slug}`, 'max');
  revalidateTag(`${contentType}s`, 'max');

  return Response.json({ revalidated: true });
}
```

The `'max'` profile serves stale content while the next visitor's request
revalidates in the background. Pass `{ expire: 0 }` when stale content must never
be served. See [Revalidation](../nextjs-data-caching/revalidation.md).

Only invalidate tags derived from a validated, allow-listed payload. A webhook
that revalidates any tag named in the request lets anyone force cache misses.

## Common patterns

- **One route per provider** (`/api/webhooks/payments`, `/api/webhooks/cms`), each
  with its own secret, so rotating one does not affect the others.
- **Use the provider's SDK verifier** when one exists. It knows the exact signed
  format. Still pass it the raw body.
- **Acknowledge unknown event types** with `200` so the provider does not retry
  forever, and log them.
- **Accept, persist, enqueue** for anything slow or that must not be lost.
- **Test with a script** that signs a body with the same secret, as the example
  app's README does with `node -e`.

## Security considerations

- Keep the signing secret in a server environment variable, never
  `NEXT_PUBLIC_`. See [Environment variables](./environment-variables.md).
- Verify before parsing, logging or storing the payload.
- Do not echo error details, stack traces or the expected signature back to the
  caller.
- Treat verified payloads as untrusted **input** anyway: validate them, and do
  not follow URLs inside them without an allow-list.
- Exclude webhook routes from any `proxy.ts` session redirect; the provider has
  no cookie. The signature is the authentication for this route.
- General input handling is covered in
  [Input validation](../nextjs-security/input-validation.md).

## Common mistakes

- **Verifying `JSON.stringify(await request.json())`** instead of the raw body.
- **Comparing signatures with `===`**, or calling `timingSafeEqual` without a
  length check so malformed headers throw a `500`.
- **Doing all the work before responding**, so the provider times out and retries
  an event that is still being processed.
- **Returning `4xx` for duplicates or unhandled event types**, which causes
  endless retries.
- **Idempotency in memory** on a serverless host with many instances.
- **Treating `after()` as a durable queue.**
- **Letting a login redirect in `proxy.ts` match `/api/webhooks`.**
- **Logging the raw body or headers** of payment events, which can contain
  personal data.

## Related topics

- [Route Handlers](./route-handlers.md) — the request and response APIs used
  here.
- [Background work](./background-work.md) — `after()`, `maxDuration`, and when
  to use a queue instead.
- [Environment variables](./environment-variables.md) — storing and validating
  the signing secret.
- [Revalidation](../nextjs-data-caching/revalidation.md) — what `revalidateTag`
  does to cached content.
- [Server Functions](../server-react/server-functions.md) — the right tool when
  your own UI, not a third party, triggers the change.
