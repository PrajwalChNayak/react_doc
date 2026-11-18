---
title: IDOR
description: Insecure direct object references in Route Handlers and Server Actions — reading another user's record by changing an ID, and the ownership check that stops it.
group: nextjs-security
order: 50
status: current
related: [nextjs-auth/data-access-layer, nextjs-backend/route-handlers, nextjs-routing/dynamic-segments, server-react/server-functions]
---

## Overview

An **insecure direct object reference** (IDOR) is an endpoint that takes an ID
from the request and returns or changes that object after checking only that
the caller is signed in. Authentication answers "who are you?". An IDOR is a
missing answer to "is this *yours*?".

Next.js makes the ID easy to accept: a folder named `[id]` is a dynamic segment,
and `RouteContext<'/api/invoices/[id]'>` hands it to you typed as `string`. The
Next.js data security guide flags exactly this in its audit list: folders with
brackets are user input. The pair on this page runs in the
[security-pairs example app](../../examples/nextjs/security-pairs/README.md).

## The threat

Invoice IDs appear in URLs, emails, exports and browser history. They are often
sequential (`inv_1001`, `inv_1002`) or otherwise guessable, and even random IDs
leak through shared links and logs. An endpoint that trusts the ID lets any
signed-in user:

- read other customers' invoices, including internal fields the UI never shows;
- enumerate every invoice by incrementing the ID;
- in the write variant, modify or delete other users' records.

A random UUID makes guessing harder. It does not fix the endpoint, because the
first leaked ID is still readable by everyone.

## Exploit

```ts file="app/api/invoices/[id]/route.ts" vulnerable
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/invoices/[id]'>) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  // Signed in? Then here is any invoice, with every column.
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json(invoice);
}
```

Alice, a legitimate customer, reads her own invoice, then changes one character:

```bash
curl -s https://app.example.com/api/invoices/inv_1001 -H 'Cookie: session=<alice-session>'
curl -s https://app.example.com/api/invoices/inv_1002 -H 'Cookie: session=<alice-session>'
# {"id":"inv_1002","ownerId":"bob","customer":"Contoso Ltd","amountCents":98000,"internalNotes":"Disputed, legal hold"}
```

Then she walks the whole table:

```bash
for n in $(seq 1000 1999); do
  curl -s -o "inv_$n.json" -w "inv_$n %{http_code}\n" \
    "https://app.example.com/api/invoices/inv_$n" -H 'Cookie: session=<alice-session>'
done
```

The response also leaks `ownerId` and `internalNotes`, because the handler
returns the raw row.

## Fix

Move the lookup into the [Data Access Layer](../nextjs-auth/data-access-layer.md)
and make ownership part of the query. The function returns a DTO, or `null` when
the invoice is missing **or** not the caller's:

```ts file="lib/dal/invoices.ts"
import 'server-only';

import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export type InvoiceDTO = {
  id: string;
  customer: string;
  amountCents: number;
};

export async function getInvoiceForCurrentUser(
  invoiceId: string,
): Promise<{ status: 401 } | { status: 404 } | { status: 200; invoice: InvoiceDTO }> {
  const session = await verifySession();
  if (!session) return { status: 401 };

  // Ownership is in the WHERE clause, so someone else's invoice is simply not found.
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, ownerId: session.userId },
    select: { id: true, customer: true, amountCents: true },
  });
  if (!invoice) return { status: 404 };

  return { status: 200, invoice };
}
```

```ts file="app/api/invoices/[id]/route.ts"
import type { NextRequest } from 'next/server';
import { getInvoiceForCurrentUser } from '@/lib/dal/invoices';

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/invoices/[id]'>) {
  const { id } = await ctx.params;
  const result = await getInvoiceForCurrentUser(id);

  if (result.status === 401) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (result.status === 404) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(result.invoice);
}
```

Why this works:

- **The object is looked up *through* the user.** `where: { id, ownerId }`
  cannot return a row the caller does not own, so there is no second step to
  forget.
- **Not yours looks exactly like does-not-exist.** Both return `404` with the
  same body, so enumeration learns nothing about which IDs exist.
- **The DTO names its fields.** `select` returns three columns. A new sensitive
  column added next quarter does not start leaking.
- **Every entry point shares it.** The invoice page, a PDF export Route Handler
  and a Server Action all call `getInvoiceForCurrentUser()`.

### 404 or 403?

| Response | Use when | Trade-off |
|---|---|---|
| `404 Not Found` | The caller should not learn that the object exists: invoices, documents, private profiles. | Support cannot tell "wrong ID" from "no access" from the status alone. Log the real reason server-side. |
| `403 Forbidden` | Existence is not sensitive and the caller benefits from knowing why: a shared team resource they lost access to, an admin-only action on a public object. | Confirms the ID is valid, which helps enumeration. |

Default to `404` for objects owned by a single user or tenant.

## Verify the fix

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/invoices/inv_1002 -H 'Cookie: session=<alice-session>'
# 404
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/invoices/inv_9999 -H 'Cookie: session=<alice-session>'
# 404
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/invoices/inv_1002
# 401
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/invoices/inv_1002 -H 'Cookie: session=<bob-session>'
# 200
```

The example app pins this down in Playwright, including that the two 404
bodies are identical:

```ts file="e2e/idor.spec.ts"
import { expect, test } from '@playwright/test';

const asAlice = { headers: { Cookie: 'demo_session=alice' } };

test('another user\'s invoice is indistinguishable from a missing one', async ({ request }) => {
  const other = await request.get('/api/fixed/invoices/inv_1002', asAlice);
  const missing = await request.get('/api/fixed/invoices/inv_9999', asAlice);

  expect(other.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await other.json()).toEqual(await missing.json());
});
```

```bash
cd examples/nextjs
npm install
npm run test --workspace @nextjs-examples/security-pairs
```

The suite also shows the vulnerable route returning bob's `internalNotes` to
alice, so the test would catch a regression back to the old handler.

## Common patterns

### The write variant in a Server Action

Updates and deletes need the same scoping. Put the owner in the `where` of the
write itself, so there is no gap between "check" and "act":

```ts file="app/invoices/[invoiceId]/actions.ts"
'use server';

import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

const MarkPaid = z.object({ invoiceId: z.string().min(1) });

export async function markInvoicePaid(formData: FormData): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Sign in required' };

  const input = MarkPaid.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!input.success) return { error: 'Not found' };

  const { count } = await db.invoice.updateMany({
    where: { id: input.data.invoiceId, ownerId: session.userId },
    data: { status: 'paid' },
  });
  return count === 0 ? { error: 'Not found' } : {};
}
```

### Pages with dynamic segments

A page at `app/invoices/[invoiceId]/page.tsx` is the same endpoint in HTML
form. Call the DAL function and render `notFound()` for the `404` case.

### Multi-tenant apps

When ownership is a tenant or team rather than a user, scope by
`tenantId: session.tenantId` and derive it from the session, never from a header,
subdomain or body field the client can set without verification.

## Common mistakes

**Fetching, then checking.** `findUnique({ where: { id } })` followed by
`if (invoice.ownerId !== userId)` works until someone adds an early return, a
cache or a second caller that skips the `if`. Put the owner in the query.

**Checking ownership on read but not on write.** The `PATCH` or delete action
next to a correct `GET` is where IDORs usually live.

**Trusting an owner ID from the client.** `?userId=`, a hidden input or a JSON
field named `ownerId` is attacker-controlled. Use the session.

**Returning the database row.** Even with a correct check, raw rows leak columns
to their own owner that were meant to stay internal.

**Relying on unguessable IDs.** UUIDs slow enumeration. They do not authorize.

**Caching a per-user response under a shared key.** A cached handler or
`"use cache"` function that ignores the user returns one user's object to
everyone. Keep user-specific reads out of shared caches, or include the user in
the cache key.

## Related topics

- [Data Access Layer](../nextjs-auth/data-access-layer.md) — the module that
  owns every scoped lookup.
- [Route Handlers](../nextjs-backend/route-handlers.md) — `RouteContext`,
  status codes and JSON responses.
- [Dynamic segments](../nextjs-routing/dynamic-segments.md) — where `[id]`
  values come from.
- [Server Functions](../server-react/server-functions.md) — React's advice to
  authorize the specific record inside every Server Function.
- [Server Actions authorization](./server-actions-authorization.md) — the
  role-based sibling of this bug.
