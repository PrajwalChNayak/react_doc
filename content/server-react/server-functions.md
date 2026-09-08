---
title: Server Functions
description: Async server code a Client Component can call directly — and the public endpoint it creates.
group: server-react
order: 40
status: current
since: "19.0"
related: [server-react/directives, hooks/use-action-state, patterns/forms-and-actions, server-react/server-components]
---

## Overview

A Server Function is an `async` function marked with `"use server"` that client
code can call as if it were local. React serializes the arguments, sends a
request, runs the function on the server, and returns the serialized result.

> [!WARNING]
> **A Server Function is a public HTTP endpoint.** The moment you write
> `"use server"`, anyone on the internet can invoke that function with any
> arguments they like. Your UI is not a gatekeeper — it is one possible client.
>
> Every Server Function must authenticate and authorize **on its own**.
> React's own guidance is unambiguous: "Arguments to Server Functions are fully
> client-controlled. For security, always treat them as untrusted input, and
> make sure to validate and escape arguments as appropriate," and "In any Server
> Function, make sure to validate that the logged-in user is allowed to perform
> that action."
>
> Also confirm you are on a patched React: the RSC advisories through
> CVE-2026-23864 are only fully fixed in **19.0.4 / 19.1.5 / 19.2.4**. See
> [the overview](./overview.md).

## Why it exists

Writing a mutation used to mean four artifacts: a route handler, a request
schema, a `fetch` wrapper, and a response type shared by hand between two
codebases. Three of those exist only because the network is in the way.

Server Functions collapse that to one function and one call site. The framework
generates the transport. What it does not generate — and cannot — is your
authorization logic.

They also unlock progressive enhancement. A `<form action={serverFunction}>`
submits and works before any JavaScript has loaded, because the fallback is an
ordinary form POST.

## When to use it

Use one for any write: creating a record, updating a profile, deleting a
comment, toggling a subscription.

Use one when a Client Component needs data that only the server can reach and a
loader is not available at that point in the tree.

Use one behind a `<form>` when you want the interaction to survive a slow
network, a failed bundle or a user with JavaScript disabled.

## When not to use it

Do not use one as a general-purpose read API for a public client. If a third
party needs your data, write a real API with versioning, rate limiting and
documented auth. Server Functions are an internal calling convention that
happens to travel over HTTP.

Do not use one where a Server Component would do. If the data is needed to
render the page, read it in the Server Component; a round trip after hydration
is strictly slower.

Do not use one for anything that must be transactional across many calls. Each
invocation is its own request.

## Basic example

Define the function in a module marked `"use server"`:

```tsx static="Runs on the server — this module is never sent to the browser."
'use server';

import { db } from '../lib/db';
import { requireSession } from '../lib/auth';

export async function updateDisplayName(
  previousState: { error: string | null },
  formData: FormData,
) {
  const session = await requireSession();
  if (!session) {
    return { error: 'You must be signed in.' };
  }

  const displayName = String(formData.get('displayName') ?? '').trim();
  if (displayName.length < 2 || displayName.length > 50) {
    return { error: 'Display name must be between 2 and 50 characters.' };
  }

  await db.users.updateDisplayName({ userId: session.userId, displayName });
  return { error: null };
}
```

Call it from a Client Component through a form:

```tsx
'use client';

import { useActionState } from 'react';
import { updateDisplayName } from './actions';

type FormState = { error: string | null };

export default function DisplayNameForm() {
  const [state, submitAction, isPending] = useActionState<FormState, FormData>(
    updateDisplayName,
    { error: null },
  );

  return (
    <form action={submitAction}>
      <label htmlFor="displayName">Display name</label>
      <input id="displayName" name="displayName" disabled={isPending} />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

Note where the authorization lives: in the server module, at the top of the
function. Not in the component, not in a wrapper, not in a middleware you hope
runs.

## How it works

### Two ways to mark one

`"use server"` at the **top of a module** makes every export in that file a
Server Function, importable from client code.

`"use server"` at the **top of an async function body** marks that single
function. This form is used inside Server Components, where the function can
close over values from the render:

```tsx static="Runs on the server."
import { db } from '../lib/db';
import { requireSession } from '../lib/auth';

export default function DeleteCommentButton({ commentId }: { commentId: string }) {
  async function deleteComment() {
    'use server';
    const session = await requireSession();
    await db.comments.deleteOwnedBy({ id: commentId, userId: session.userId });
  }

  return (
    <form action={deleteComment}>
      <button type="submit">Delete</button>
    </form>
  );
}
```

`commentId` is captured at render time and sent along with the call. That does
**not** make it trustworthy — see below.

### What can cross the wire

Arguments and return values must be serializable.

**Supported:** string, number, `bigint`, boolean, `undefined`, `null`, symbols
registered with `Symbol.for`, String, Array, `Map`, `Set`, `TypedArray`,
`ArrayBuffer`, `Date`, `FormData`, plain objects of serializable values,
promises, and other Server Functions.

**Not supported:** React elements or JSX, ordinary functions, classes, instances
of your own classes, objects with a null prototype, non-global symbols, and
events from event handlers.

The last one catches people: `onClick={saveDraft}` passes a click event as the
first argument, which will not serialize. Write `onClick={() => saveDraft(id)}`.

### Forms and progressive enhancement

Pass a Server Function straight to `action` and React wires up the submission.
React resets the form on a successful submission.

`useActionState` adds pending state, keeps the returned value, and replays
submissions that happened before hydration finished. Its optional third
argument, `permalink`, is the progressive-enhancement escape hatch: if the form
is submitted before the JavaScript bundle loads, the browser navigates to that
URL rather than the current one.

```tsx
'use client';

import { useActionState } from 'react';
import { subscribeToNewsletter } from './actions';

type SubscribeState = { message: string | null };

export default function SubscribeForm() {
  const [state, submitAction] = useActionState<SubscribeState, FormData>(
    subscribeToNewsletter,
    { message: null },
    '/newsletter/subscribe',
  );

  return (
    <form action={submitAction}>
      <input type="email" name="email" required />
      <button type="submit">Subscribe</button>
      {state.message && <p>{state.message}</p>}
    </form>
  );
}
```

See [useActionState](../hooks/use-action-state.md) for the full signature and
[forms and actions](../patterns/forms-and-actions.md) for the surrounding
patterns.

> [!NOTE]
> Until September 2024 the React docs called all of these "Server Actions". The
> current terminology is **Server Function**; a Server Function is a *Server
> Action* only when it is passed to an `action` prop or called from inside an
> Action. Older articles and libraries still use the old name for both.

## Advanced example

Everything a real Server Function needs, in order: authenticate, validate,
authorize the specific resource, then act.

```tsx static="Runs on the server."
'use server';

import { db } from '../lib/db';
import { requireSession } from '../lib/auth';

type TransferResult = { ok: boolean; message: string };

export async function transferNotebook(
  notebookId: unknown,
  targetUserId: unknown,
): Promise<TransferResult> {
  // 1. Authenticate. Never assume a session exists.
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: 'Not signed in.' };
  }

  // 2. Validate shapes before they touch the data layer.
  if (typeof notebookId !== 'string' || typeof targetUserId !== 'string') {
    return { ok: false, message: 'Invalid request.' };
  }

  // 3. Authorize this user against this specific record.
  const notebook = await db.notebooks.findById(notebookId);
  if (!notebook || notebook.ownerId !== session.userId) {
    return { ok: false, message: 'Not found.' };
  }

  // 4. Only now perform the write.
  await db.notebooks.transfer({ id: notebookId, toUserId: targetUserId });
  return { ok: true, message: 'Notebook transferred.' };
}
```

Three details are deliberate. The arguments are typed `unknown`, because the
type annotation you write is erased and the caller sends whatever they want. The
ownership check queries the record rather than trusting a `notebook` object sent
from the client. And the failure message for "not yours" is the same as for "not
found", so the endpoint does not confirm which notebook IDs exist.

> [!BEST-PRACTICE]
> Put the authorization check as the first statement, before any parsing. It is
> then obvious in review when it is missing, and no code path can run ahead of
> it. A validation library at the top of every Server Function is worth the
> dependency.

## Common mistakes

**Trusting a closed-over value.** In the `deleteComment` example, `commentId`
was captured on the server — but it is serialized, sent to the browser, and sent
back on invocation. An attacker can substitute any ID. Re-check ownership on
every call, which is why the example scopes the delete by `userId`.

**Trusting a hidden field.** `<input type="hidden" name="userId">` is a
suggestion from the client, not a fact. Read the user from the session.

**Checking permissions in the component that renders the button.** Hiding a
button hides nothing. The endpoint is reachable regardless of what you rendered.

**Marking a whole utilities file `"use server"`.** Every export becomes a public
endpoint, including the internal helper you never intended anyone to call.

**Returning a class instance or a React element.** Neither serializes. Return
plain objects.

**Passing the event handler directly.** `onClick={deleteItem}` sends a DOM
event, which cannot be serialized. Wrap it in an arrow function.

**Letting errors leak internals.** A thrown database error can carry a query or
a connection string. Catch, log server-side, and return a message you are happy
for a stranger to read.

## Related topics

- [Directives](./directives.md) — the exact placement rules for `"use server"`.
- [useActionState](../hooks/use-action-state.md) — pending state, returned
  values and the `permalink` argument.
- [Forms and actions](../patterns/forms-and-actions.md) — the wider form story
  in React 19.
- [useFormStatus](../hooks/use-form-status.md) — pending state for nested submit
  buttons.
- [useOptimistic](../hooks/use-optimistic.md) — showing the result before the
  server confirms it.
- [Server Components](./server-components.md) — where inline Server Functions
  are defined.
