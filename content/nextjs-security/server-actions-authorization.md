---
title: Server Actions authorization
description: Server Actions are public POST endpoints, so hiding the button is not a permission check — authenticate, authorize and validate inside every action.
group: nextjs-security
order: 20
status: current
related: [nextjs-auth/data-access-layer, nextjs-mutations/server-actions, server-react/server-functions, nextjs-security/input-validation]
---

## Overview

A Server Action is a function marked `"use server"`. Next.js compiles it into
an endpoint: the client bundle gets an **action ID** plus a dispatcher that
POSTs to the page, and the implementation stays on the server. The bundled
Next.js guide puts it plainly: the route is reachable to anyone who can send the
same POST, so treat every action as an untrusted entry point.

This page shows the most common mistake, an admin-only action that relies on the
page to hide its button, then exploits it with `curl`. The pair runs in the
[security-pairs example app](../../examples/nextjs/security-pairs/README.md).

## The threat

A page renders a **Delete** button only for admins. The action behind the button
performs the delete without asking who called it. The developer reasons that
non-admins never see the button, so they can never call the action.

That reasoning fails because the button is not the endpoint:

- **The action ID is not a secret.** It is the same for every user of a build.
  Anyone who has ever seen the button (a former admin, a support engineer with a
  screenshot of DevTools) can reuse it until the next build rotates it.
- **Client bundles carry IDs.** If any Client Component imports the action, its
  ID sits in a JavaScript file under `/_next/static`, which is public.
- **IDs have leaked through framework bugs.** CVE-2026-64643, fixed in the
  [July 2026 security release](./security-advisories.md), disclosed Server
  Function endpoint IDs to unauthenticated attackers.

Next.js does add hardening: encrypted, rotating action IDs, dead-code
elimination of unused actions, an `Origin`/`Host` comparison against CSRF, and a
1 MB body limit. The docs say the ID hardening "reduces the risk in cases where
an authentication layer is missing" and that you must still verify
authentication and authorization inside each action. None of it answers "is
this user an admin?"

## Exploit

The vulnerable page and action:

```tsx file="app/admin/invoices/page.tsx" vulnerable
import { getCurrentUser } from '@/lib/session';
import { listInvoices } from '@/lib/invoices';
import { deleteInvoice } from './actions';

export default async function InvoicesPage() {
  const user = await getCurrentUser();
  const invoices = await listInvoices();

  return (
    <ul>
      {invoices.map((invoice: { id: string; customer: string }) => (
        <li key={invoice.id}>
          {invoice.customer}
          {/* The only "permission check" in the app. */}
          {user?.role === 'admin' && (
            <form action={deleteInvoice}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button type="submit">Delete</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
```

```ts file="app/admin/invoices/actions.ts" vulnerable
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

export async function deleteInvoice(formData: FormData): Promise<void> {
  // No session check, no role check, no validation.
  const invoiceId = formData.get('invoiceId') as string;
  await db.invoice.delete({ where: { id: invoiceId } });
  revalidatePath('/admin/invoices');
}
```

**Step 1: obtain the action ID.** A `<form action={serverAction}>` works before
JavaScript loads, so React renders a hidden field whose *name* carries the ID:
`<input type="hidden" name="$ACTION_ID_…">`. Anyone who has loaded the admin
view has it:

```bash
curl -s https://app.example.com/admin/invoices -H 'Cookie: session=<an-admin-session>' \
  | grep -o 'ACTION_ID_[0-9a-f]*' | head -1
```

When the page calls the action from JavaScript instead, the client sends the
same ID in a `Next-Action` request header, visible in the browser's Network tab
on every call.

**Step 2: replay the POST as a non-admin.** A progressive-enhancement form
submission is `multipart/form-data` with the `$ACTION_ID_<id>` field plus the
form's own fields. The attacker sends it with their own, low-privilege session:

```bash
curl -i https://app.example.com/admin/invoices \
  -H 'Cookie: session=<a-member-session>' \
  -F '$ACTION_ID_<id-from-step-1>=' \
  -F 'invoiceId=inv_1002'
```

The invoice is deleted. Changing `invoiceId` deletes any other invoice. A
hand-crafted request like this has no `Origin` header, and the `serverActions`
reference documents that such a request "is allowed through with a warning
rather than rejected". The CSRF check stops a *browser* on another site from
doing this. It does not stop a user sending requests from their own terminal.

## Fix

Put the check where the data is. The action stays thin and calls the
[Data Access Layer](../nextjs-auth/data-access-layer.md), which authenticates,
authorizes and validates before it deletes:

```ts file="lib/dal/invoices.ts"
import 'server-only';

import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export class AccessError extends Error {
  constructor(
    readonly status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

const InvoiceId = z.string().regex(/^inv_\d{4}$/);

export async function deleteInvoiceAsAdmin(rawInvoiceId: unknown): Promise<void> {
  // 1. Authenticate: from the session cookie, never from the request body.
  const session = await verifySession();
  if (!session) throw new AccessError(401, 'Sign in required');

  // 2. Authorize: this user, this action.
  if (session.role !== 'admin') throw new AccessError(403, 'Admins only');

  // 3. Validate: the argument is fully client-controlled.
  const invoiceId = InvoiceId.safeParse(rawInvoiceId);
  if (!invoiceId.success) throw new AccessError(404, 'Invoice not found');

  await db.invoice.delete({ where: { id: invoiceId.data } });
}
```

```ts file="app/admin/invoices/actions.ts"
'use server';

import { revalidatePath } from 'next/cache';
import { deleteInvoiceAsAdmin } from '@/lib/dal/invoices';

export async function deleteInvoice(formData: FormData): Promise<void> {
  await deleteInvoiceAsAdmin(formData.get('invoiceId'));
  revalidatePath('/admin/invoices');
}
```

Why this works:

- **The check runs on every invocation.** It lives in the function the request
  executes, so it does not matter whether the request came from the button, from
  `curl`, or from an ID that leaked.
- **It sits next to the data.** Any other action or Route Handler that deletes
  invoices calls `deleteInvoiceAsAdmin()` and gets the same rule. There is no
  delete path without it.
- **Identity comes from the session.** Nothing in `FormData` can claim a role.
- **`import 'server-only'`** makes importing the DAL from a Client Component a
  build error, so the check cannot be bundled or bypassed on the client.

Keep hiding the button for non-admins. That is good UX. It is not the control.

> [!TIP]
> The data security guide also suggests `import 'server-only'` in the
> `"use server"` file itself. It works even when a Client Component imports the
> action to pass it to `useActionState`, because `"use server"` modules resolve
> in a server-only layer.

## Verify the fix

The example app's Playwright test replays exactly the exploit above with the
`request` fixture (no browser), then checks the data, not the status code:

```ts file="e2e/server-action-authorization.spec.ts"
import { expect, test } from '@playwright/test';

async function readActionId(html: string): Promise<string> {
  const match = /name="\$ACTION_ID_([0-9a-f]+)"/.exec(html);
  if (!match) throw new Error('No Server Action ID on the page');
  return match[1];
}

test('a member cannot delete an invoice by POSTing to the action', async ({ request }) => {
  const path = '/fixed/invoices';
  const adminHtml = await (await request.get(path, { headers: { Cookie: 'demo_session=admin' } })).text();
  const actionId = await readActionId(adminHtml);

  await request.post(path, {
    headers: { Cookie: 'demo_session=alice' },
    multipart: { [`$ACTION_ID_${actionId}`]: '', invoiceId: 'inv_1002' },
  });

  const after = await (await request.get(path, { headers: { Cookie: 'demo_session=alice' } })).text();
  expect(after).toContain('data-invoice-id="inv_1002"');
});
```

The same test against `/vulnerable/invoices` finds the invoice gone. Run both:

```bash
cd examples/nextjs
npm install
npm run test --workspace @nextjs-examples/security-pairs
```

A unit test of the DAL function is a faster second check: call
`deleteInvoiceAsAdmin('inv_1002')` with a mocked member session and assert it
rejects with status `403`.

## Common patterns

### Ownership, not only role

Most actions are not admin-only. They act on one record the caller must own.
Scope the lookup by the session user so another user's ID finds nothing:

```ts file="app/posts/[id]/edit/actions.ts"
'use server';

import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

const RenamePost = z.object({
  postId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
});

export async function renamePost(formData: FormData): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Sign in required' };

  const input = RenamePost.safeParse({
    postId: formData.get('postId'),
    title: formData.get('title'),
  });
  if (!input.success) return { error: 'Invalid input' };

  // `where` includes the owner, so someone else's post matches zero rows.
  const { count } = await db.post.updateMany({
    where: { id: input.data.postId, authorId: session.userId },
    data: { title: input.data.title },
  });
  if (count === 0) return { error: 'Not found' };

  return {};
}
```

### Closed-over values are client-controlled too

An inline `"use server"` function can close over values from the render. Next.js
encrypts those values, but they still round-trip through the browser, and the
docs advise against relying on encryption alone. Re-check authorization against
the session on every call. [IDOR](./idor.md) covers the object-level check in
detail.

### Returned values are public

Whatever an action returns is serialized to the caller. Return what the UI
needs (`{ ok: true }`, field errors), never the raw database row.

## Common mistakes

**Checking the role in the page and not in the action.** A page-level check
controls which UI renders. The data security guide notes that it does not extend
to the Server Actions defined on that page.

**Marking a helper file `"use server"`.** Every export becomes an endpoint. Keep
internal helpers in a `server-only` module and export only real actions from
`"use server"` files.

**Trusting a hidden field for identity.** `<input type="hidden" name="userId">`
is a value the attacker edits. Read identity from the session.

**Relying on `serverActions.allowedOrigins` for access control.** That option
(under `experimental` in `next.config`) widens the CSRF `Origin` check for
proxies. It says nothing about who the user is.

**Returning `null` silently from a destructive action on failure.** A missing
check then looks like a no-op in logs. The Next.js docs suggest destructive
operations fail loudly when checks miss.

**Believing an old build's IDs are dead.** IDs rotate on new builds and at most
every 14 days, but any deployment still serving the old build still accepts them.

## Related topics

- [Data Access Layer](../nextjs-auth/data-access-layer.md) — where
  `verifySession()` and per-resource checks live.
- [Server Actions](../nextjs-mutations/server-actions.md) — how Next.js wires
  actions to forms, revalidation and redirects.
- [Server Functions](../server-react/server-functions.md) — React's rule that
  every Server Function authorizes on its own.
- [Input validation](./input-validation.md) — schemas and field errors for
  action arguments.
- [Role-based access](../nextjs-auth/role-based-access.md) — modelling the
  `admin` check as a permission.
- [Proxy is not authorization](./proxy-is-not-authorization.md) — why a matcher
  cannot replace this check.
