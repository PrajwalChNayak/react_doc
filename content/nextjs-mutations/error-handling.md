---
title: Error handling in Server Actions
description: Return expected errors as state, let unexpected ones reach error.tsx, and use redirect, notFound and forbidden inside actions without swallowing them.
group: nextjs-mutations
order: 50
status: current
related: [nextjs-errors/error-boundaries, nextjs-errors/not-found-and-redirect, nextjs-mutations/forms, patterns/error-boundaries]
---

## Overview

A Server Action can end in four ways, and each one reaches the user through a
different path:

| Outcome | How the action signals it | Where the user sees it |
|---|---|---|
| Success | Returns a value, usually after revalidating | The re-rendered page, plus the return value in `useActionState` |
| **Expected** failure: invalid input, not signed in, not allowed, conflict | **Returns** an error value | Next to the form, through `useActionState` |
| **Unexpected** failure: a bug, a database outage | **Throws** | The nearest `error.tsx` (or `catchError` boundary) |
| Control flow: go elsewhere, show a 404 or 403 | Calls `redirect`, `notFound`, `forbidden`, `unauthorized` | Navigation, or the matching `not-found.tsx` / `forbidden.tsx` / `unauthorized.tsx` |

The React rule underneath is the same as in
[Forms and Actions](../patterns/forms-and-actions.md): return what you expect,
throw what you do not. This page covers what Next.js adds: error boundaries per
route segment, production message redaction, framework errors that must not be
caught, and where to log.

## Why it exists

Server Actions run on another machine. A thrown error has to cross the network,
so Next.js has to decide what the browser may learn about it, and which boundary
shows it. A validation message has to reach one input, not replace the page.

Treating those two cases differently keeps the form on screen for problems the
user can fix, and keeps stack traces and database messages off the screen for
problems they cannot.

## When to use it

- **Return** an error for anything the user can act on: fix a field, sign in,
  pick another name, reload a record someone else changed.
- **Throw** when the action's assumptions are broken and retrying the same input
  will not help the user: a missing environment variable, a failed invariant, an
  unreachable service.
- **`redirect()`** after success, or to send a signed-out user to sign in.
- **`notFound()` / `forbidden()` / `unauthorized()`** when the whole page is no
  longer valid for this user, not only the submission.

## When not to use it

- Do not throw for validation. The form is replaced by the error UI and the user's
  input is lost.
- Do not return raw `error.message` from a caught database error. It can include
  table names, queries or connection details.
- Do not use `notFound()` for "this comment was already deleted" in a list. A
  returned message keeps the page. Reserve it for the page's main resource.

## Basic example

```ts file="app/invoices/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export type PayInvoiceState =
  | { status: 'idle' }
  | { status: 'paid' }
  | { status: 'error'; message: string };

const payInvoiceSchema = z.object({ invoiceId: z.uuid() });

export async function payInvoice(
  _previousState: PayInvoiceState,
  formData: FormData,
): Promise<PayInvoiceState> {
  // Expected: the session may have expired.
  const session = await verifySession();
  if (!session) return { status: 'error', message: 'Your session expired. Sign in again.' };

  // Expected: the request may be malformed.
  const parsed = payInvoiceSchema.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return { status: 'error', message: 'That invoice is not valid.' };

  // Expected: the invoice may not belong to this user, or may already be paid.
  const invoice = await db.invoice.findFirst({
    where: { id: parsed.data.invoiceId, customerId: session.userId },
  });
  if (!invoice) return { status: 'error', message: 'Invoice not found.' };
  if (invoice.paidAt) return { status: 'error', message: 'This invoice is already paid.' };

  // Unexpected: if the database is down, this throws, and error.tsx handles it.
  await db.invoice.update({ where: { id: invoice.id }, data: { paidAt: new Date() } });

  updateTag(`invoice-${invoice.id}`);
  return { status: 'paid' };
}
```

```tsx file="app/invoices/[invoiceId]/pay-form.tsx"
'use client';

import { useActionState } from 'react';
import { payInvoice, type PayInvoiceState } from '../actions';

const initialState: PayInvoiceState = { status: 'idle' };

export function PayForm({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, isPending] = useActionState(payInvoice, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" disabled={isPending || state.status === 'paid'}>
        {isPending ? 'Paying…' : 'Pay invoice'}
      </button>
      {state.status === 'error' ? <p role="alert">{state.message}</p> : null}
      {state.status === 'paid' ? <p role="status">Payment received.</p> : null}
    </form>
  );
}
```

```tsx file="app/invoices/[invoiceId]/error.tsx"
'use client';

export default function InvoiceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div role="alert">
      <h2>We could not complete that.</h2>
      <p>Try again, or contact support with code {error.digest ?? 'unknown'}.</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
```

The discriminated union makes the client handle every outcome, and TypeScript
narrows `state.message` to the `'error'` branch.

## How it works

### Where a thrown error goes

When an action is called through a form `action`, `useActionState`, or
`startTransition`, a thrown error rejects the Action. React rethrows it during
rendering, so it reaches the **nearest error boundary above the component that
started the Action**. In Next.js that is usually the closest `error.tsx` in the
route tree. Its `retry()` re-fetches and re-renders the segment.

A thrown error also cancels any queued `useActionState` submissions and drops any
optimistic values from that Action.

If you `await` an action directly in an event handler **without** a transition,
nothing catches the rejection for you. Wrap the call in `startTransition` so it
reaches a boundary, or catch it and set state yourself.

### Production redaction

In development, the browser receives the original error message, which helps
debugging. In production, errors that originate on the server reach the client
with the specific message omitted and a `digest` that identifies the error in the
server logs.

That is why user-facing text belongs in **returned** values. A thrown
`new Error('Card declined')` reads fine in `next dev` and turns into a generic
message after `next build`. Show `error.digest` so a support request can be
matched to a log line. Details are in
[Error boundaries](../nextjs-errors/error-boundaries.md).

### Framework errors: `redirect`, `notFound`, `forbidden`, `unauthorized`

These functions work by throwing a special error that Next.js recognizes. They are
allowed in Server Actions:

- `redirect(path)` navigates. It pushes a history entry by default in actions.
- `notFound()` renders the nearest `not-found.tsx`.
- `forbidden()` and `unauthorized()` render `forbidden.tsx` and `unauthorized.tsx`.

> [!WARNING]
> **Experimental.** `forbidden()` and `unauthorized()` require
> `experimental.authInterrupts: true` in `next.config.ts`. Without the flag,
> return an error value or redirect to your sign-in page instead.

Because they throw, a `try`/`catch` around them catches the framework error and
the redirect or 404 silently never happens. Two fixes, in order of preference:

1. Call them **after** the `try` block.
2. When that is not possible, call `unstable_rethrow(error)` as the first line of
   the `catch`. It rethrows Next.js framework errors and ignores everything else.

`error.tsx` and `catchError` boundaries let these errors through, so they are only
a problem in your own `catch` blocks.

## Common patterns

### Catch, log, return, then redirect

Catch only the call that can fail for reasons the user should hear about. Log the
full error on the server, return a safe message, and redirect after the `try`:

```ts file="app/projects/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { createProjectForUser, ProjectNameTakenError } from '@/lib/projects';

export type CreateProjectState = { error: string | null };

const projectSchema = z.object({ name: z.string().trim().min(2).max(60) });

export async function createProject(
  _previousState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await verifySession();
  if (!session) redirect('/login');

  const parsed = projectSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) return { error: 'Project names need 2 to 60 characters.' };

  let projectId: string;
  try {
    // This helper may call notFound() or redirect() internally.
    const project: { id: string } = await createProjectForUser(session.userId, parsed.data.name);
    projectId = project.id;
  } catch (error) {
    // Let framework errors through before handling anything else.
    unstable_rethrow(error);

    if (error instanceof ProjectNameTakenError) {
      return { error: 'You already have a project with that name.' };
    }

    // Anything else is a bug or an outage: log it with context and rethrow so
    // error.tsx shows a generic message with a digest.
    console.error('createProject failed', { userId: session.userId, error });
    throw error;
  }

  updateTag(`projects-${session.userId}`);
  redirect(`/projects/${projectId}`);
}
```

> [!NOTE]
> `unstable_rethrow` keeps its `unstable_` prefix in Next.js 16.3.5. Prefer
> structuring the code so framework errors are thrown outside `try`, and reach for
> it when a helper you call may throw them.

### Authorization failures

Return a message when the user can do something about it. For a page the user
should not be on at all, `forbidden()` (with `authInterrupts`) or a redirect makes
the answer unambiguous. Either way, the check happens inside the action. See
[Role-based access](../nextjs-auth/role-based-access.md).

### Logging

- `console.error` in an action writes to the server log, next to the request. In
  development, the terminal also shows each Server Function call with its
  arguments and duration.
- Log the user ID and the action name, not the submitted `FormData`. It may hold
  passwords or personal data.
- Use `instrumentation.ts` and its `onRequestError` hook to send server errors to a
  reporting service in one place. See
  [Debugging production](../nextjs-deployment/debugging-production.md).

### "Failed to find Server Action"

After a deployment, a browser tab running the old build may call an action ID that
no longer exists. The action then fails with this error. Deploy gradually where you
can, and make the error UI offer a reload, which fetches the new build.

## Security considerations

- Returned messages go to whoever sent the request. Keep them generic about other
  users' data: "Invoice not found" for both "does not exist" and "not yours", so
  the action does not confirm which IDs exist.
- Do not rely on production redaction to hide secrets. Never put credentials or
  queries into error messages in the first place.
- An action that throws on bad input still ran up to the throw. Validate and
  authorize before doing any work.

## Common mistakes

**Throwing validation errors.** The form disappears into `error.tsx`, the input is
lost, and in production the message is redacted anyway.

**Showing `error.message` from a server error in the UI.** It is generic in
production. Return user-facing text instead, and show `error.digest` in the
boundary.

**Wrapping `redirect()` in `try`/`catch`.** The catch swallows it. Move it after
the block, or call `unstable_rethrow` first in the catch.

**`catch (error) { return { error: String(error) } }`.** This forwards internal
details, and also swallows `redirect` and `notFound`.

**Awaiting an action in `onClick` without a transition and without a catch.** The
rejection is unhandled and no boundary shows it.

**Calling `forbidden()` without `experimental.authInterrupts`.** Enable the flag, or
return an error value.

**Treating "not signed in" as unexpected.** Sessions expire during normal use.
Return a message or redirect to sign in.

## Related topics

- [Error boundaries (React)](../patterns/error-boundaries.md): what a boundary
  catches and what it does not.
- [Error boundaries in Next.js](../nextjs-errors/error-boundaries.md): `error.tsx`,
  `global-error.tsx`, `retry()` and the production `digest`.
- [not-found and redirect](../nextjs-errors/not-found-and-redirect.md): why these
  functions throw, and `unstable_rethrow` in Server Components.
- [catchError](../nextjs-errors/catch-error.md): component-level boundaries that
  are not tied to a route segment.
- [Forms](./forms.md): returning Zod field errors through `useActionState`.
- [useActionState](../hooks/use-action-state.md): how returned state and thrown
  errors behave in the hook.
