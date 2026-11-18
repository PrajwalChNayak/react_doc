---
title: Input validation
description: Parse every server entry point with a zod schema, pick fields explicitly to stop mass assignment, and never trust a TypeScript type at runtime.
group: nextjs-security
order: 80
status: current
related: [nextjs-mutations/forms, nextjs-backend/route-handlers, nextjs-security/server-actions-authorization, hooks/use-action-state]
---

## Overview

A TypeScript type is erased at build time. At runtime, a Server Action argument
typed `Profile`, a `params` typed `{ id: string }`, and a JSON body typed
`Order` are all just whatever bytes the client sent. Validation is the step that
makes the runtime value match the type you rely on.

The rule the Next.js data security guide gives is blunt: always validate input
from the client, because it can be modified, form data, URL parameters, headers
and `searchParams` included. This page uses **zod** to parse at every server
entry point, return field errors, and pick fields explicitly so a client cannot
smuggle in extra ones.

Validation checks the *shape* of input. It is not authorization: a well-formed
object can still name a record the caller may not touch. Pair this page with
[Server Actions authorization](./server-actions-authorization.md) and
[IDOR](./idor.md).

## The threat

Two distinct problems:

1. **Malformed input reaches your logic.** A missing field, a string where a
   number was expected, an email that is not an email. Without a check it flows
   into the database or a downstream call and fails somewhere far from the cause,
   or worse, succeeds with garbage.
2. **Mass assignment.** Code that spreads a client object into a database update
   lets the client set fields you never meant to expose. A profile form that
   accepts `{ ...input }` lets an attacker add `"role": "admin"` or
   `"isVerified": true`.

## Exploit

```ts file="app/settings/profile/actions.ts" vulnerable
'use server';

import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

// The argument is typed, but the type is gone at runtime.
type ProfileUpdate = { displayName: string; bio: string };

export async function updateProfile(input: ProfileUpdate): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  // Mass assignment: every field the caller sent is written.
  await db.user.update({ where: { id: session.userId }, data: { ...input } });
}
```

A Server Action is a POST endpoint, so the caller sends any JSON they like. The
`role` field is not in the type, but the type does not exist at runtime:

```bash
curl -i https://app.example.com/settings/profile \
  -H 'Cookie: session=<a-member-session>' \
  -H 'Next-Action: <action-id>' \
  -H 'Content-Type: application/json' \
  --data '[{"displayName":"Alice","bio":"hi","role":"admin","isVerified":true}]'
```

`{ ...input }` writes `role: "admin"`. The member is now an admin.

The same bug appears in a Route Handler that does
`await db.user.update({ data: await request.json() })`, and in a page that trusts
`searchParams.isAdmin === 'true'` to render an admin panel, which the data
security guide calls out directly.

## Fix

Parse with a schema, reject on failure, and write only the fields you named.

```ts file="lib/schemas.ts"
import { z } from 'zod';

// strictObject rejects unknown keys, so an extra "role" fails parsing.
export const ProfileUpdate = z.strictObject({
  displayName: z.string().trim().min(1).max(50),
  bio: z.string().trim().max(280),
});

export type ProfileUpdate = z.infer<typeof ProfileUpdate>;
```

```ts file="app/settings/profile/actions.ts"
'use server';

import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';
import { ProfileUpdate } from '@/lib/schemas';

type ActionResult = { ok: true } | { ok: false; errors: Record<string, string[]> };

export async function updateProfile(raw: unknown): Promise<ActionResult> {
  const session = await verifySession();
  if (!session) return { ok: false, errors: { _: ['Sign in required'] } };

  const parsed = ProfileUpdate.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  // Write named fields only. Even a schema miss cannot reach `role`.
  const { displayName, bio } = parsed.data;
  await db.user.update({ where: { id: session.userId }, data: { displayName, bio } });
  return { ok: true };
}
```

Why this works:

- **The argument is typed `unknown`.** You cannot read a field without parsing,
  so validation cannot be skipped by accident.
- **`z.strictObject` rejects unknown keys.** A `role` field is a parse error, not
  a silent extra column.
- **`safeParse` returns, it does not throw.** You control the error path and can
  return field errors to the UI.
- **Explicit destructuring is the real guard.** `data: { displayName, bio }` can
  never write a field the schema did not name, even if the schema is later
  loosened.
- **`z.flattenError`** produces `{ fieldErrors, formErrors }` shaped for a form.

### Route Handler body and params

Validate the parsed body, and the path/query params too:

```ts file="app/api/orders/[orderId]/route.ts"
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

const OrderId = z.string().regex(/^ord_[0-9a-f]{8}$/);
const UpdateOrder = z.strictObject({
  status: z.enum(['pending', 'shipped', 'cancelled']),
});

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/orders/[orderId]'>) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { orderId } = await ctx.params;
  const id = OrderId.safeParse(orderId);
  if (!id.success) return Response.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateOrder.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
  }

  const { count } = await db.order.updateMany({
    where: { id: id.data, ownerId: session.userId },
    data: { status: parsed.data.status },
  });
  return count === 0
    ? Response.json({ error: 'Not found' }, { status: 404 })
    : Response.json({ ok: true });
}
```

### searchParams and params in pages

`params` and `searchParams` are Promises, and their values are strings from the
URL. Coerce and validate before use:

```tsx file="app/products/page.tsx"
import { z } from 'zod';

const ProductQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  sort: z.enum(['name', 'price', 'newest']).catch('name'),
});

export default async function ProductsPage({ searchParams }: PageProps<'/products'>) {
  const { page, sort } = ProductQuery.parse(await searchParams);
  return <p>Page {page}, sorted by {sort}</p>;
}
```

`.catch(...)` gives a safe default for display parameters instead of throwing on
junk. Use `safeParse` and an error path where a bad value should be rejected
rather than defaulted.

### Webhooks

A webhook is an unauthenticated POST from another service. Verify its signature
first (that is authentication), then validate the payload shape:

```ts file="app/api/webhooks/payments/route.ts"
import { z } from 'zod';
import { verifyWebhookSignature } from '@/lib/webhooks';
import { markInvoicePaid } from '@/lib/dal/invoices';

const PaymentEvent = z.strictObject({
  type: z.literal('payment.succeeded'),
  data: z.object({ invoiceId: z.string().min(1), amountCents: z.number().int().positive() }),
});

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const signature = request.headers.get('x-signature');
  if (!signature || !(await verifyWebhookSignature(raw, signature))) {
    return new Response('Invalid signature', { status: 401 });
  }

  const parsed = PaymentEvent.safeParse(JSON.parse(raw));
  if (!parsed.success) return new Response('Bad payload', { status: 400 });

  await markInvoicePaid(parsed.data.data.invoiceId);
  return new Response('ok');
}
```

## Verify the fix

The mass-assignment payload no longer changes `role`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/orders/ord_00000000 \
  -X PATCH -H 'Cookie: session=<member>' -H 'Content-Type: application/json' \
  --data '{"status":"shipped","ownerId":"someone-else"}'
# 400  (strictObject rejects the extra ownerId)

curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/orders/not-an-id \
  -X PATCH -H 'Cookie: session=<member>' -H 'Content-Type: application/json' --data '{"status":"shipped"}'
# 404  (params failed the schema)
```

A unit test asserts the extra field is dropped and the write is scoped:

```ts file="e2e/input-validation.spec.ts"
import { expect, test } from '@playwright/test';

test('an unknown field is rejected, not written', async ({ request }) => {
  const response = await request.patch('/api/orders/ord_00000000', {
    headers: { Cookie: 'session=member', 'Content-Type': 'application/json' },
    data: { status: 'shipped', role: 'admin' },
  });
  expect(response.status()).toBe(400);
});
```

Because the schema modules are plain functions, the fastest check is a
`safeParse` test: assert `ProfileUpdate.safeParse({ displayName: 'x', bio: '', role: 'admin' }).success === false`.

## Common patterns

- **One schema module per feature.** Co-locate schemas with the actions and
  handlers that use them, and infer the TypeScript type from the schema
  (`z.infer`) so they cannot drift.
- **Parse at the boundary, pass typed data inward.** After `safeParse`, the rest
  of the code works with `parsed.data`, which matches the type.
- **Return field errors to `useActionState`.** The `{ errors }` shape renders
  next to inputs. See [Forms](../nextjs-mutations/forms.md).

## Common mistakes

**Trusting the TypeScript type at runtime.** The type is gone. A parameter typed
`Order` is `unknown` until you parse it.

**Spreading client input into a write.** `data: { ...input }` is mass
assignment. Destructure the fields you mean to write.

**Using `z.object` when you need `z.strictObject`.** `z.object` silently drops
unknown keys, which is fine for many reads but hides mass-assignment attempts.
Use `strictObject` (or `.strict()`) where extra keys should be an error.

**Validating the body but not `params` or `searchParams`.** All of them are
user input. A route param feeds a query too.

**Treating validation as authorization.** A valid `invoiceId` is still someone's
invoice. Check ownership as well; see [IDOR](./idor.md).

**Skipping the signature check on webhooks.** Shape validation does not prove the
sender. Verify the signature first.

## Related topics

- [Forms](../nextjs-mutations/forms.md) — surfacing field errors with
  `useActionState`.
- [Route Handlers](../nextjs-backend/route-handlers.md) — reading and validating
  bodies, params and query.
- [Server Actions authorization](./server-actions-authorization.md) — the
  authentication and authorization that validation does not cover.
- [IDOR](./idor.md) — why a valid ID still needs an ownership check.
- [useActionState](../hooks/use-action-state.md) — the React hook that holds the
  returned errors.
