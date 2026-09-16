---
title: Server Actions
description: How Next.js turns a "use server" function into a POST endpoint, what one response carries back, and the limits and configuration around it.
group: nextjs-mutations
order: 10
status: current
related: [nextjs-mutations/forms, nextjs-mutations/revalidating-after-mutations, nextjs-security/server-actions-authorization, server-react/server-functions]
---

## Overview

React defines [Server Functions](../server-react/server-functions.md): async
functions marked `"use server"` that client code can call. React specifies the
model. **Next.js is the part that makes it run.** Its compiler gives each function
an ID, its server exposes the function as a `POST` endpoint on the page that uses
it, and its router applies the response, including a freshly rendered page, in one
round trip.

A Server Function used through `<form action>`, `<button formAction>`, or inside a
transition is called a **Server Action**. That is the common case in Next.js, and
it is the name this section uses.

> [!WARNING]
> **Every Server Action is a public HTTP endpoint.** Anyone who can send the same
> `POST` can call it with any arguments, whether or not your UI renders the form.
> Authenticate, authorize, and validate input **inside every action**. The
> walkthrough of the attack and the fix is in
> [Server Actions authorization](../nextjs-security/server-actions-authorization.md).

This group covers the framework side of mutations:

| Page | What it covers |
|---|---|
| Server Actions (this page) | Endpoints, action IDs, closures, the single-response model, config, logging |
| [Forms](./forms.md) | `<form action>`, `next/form`, `useActionState` and Zod errors in Next.js |
| [Revalidating after mutations](./revalidating-after-mutations.md) | `updateTag`, `revalidateTag`, `revalidatePath`, `refresh`, `redirect`, cookies |
| [Optimistic updates](./optimistic-updates.md) | `useOptimistic` reconciled with the server re-render |
| [Error handling](./error-handling.md) | Returned errors, thrown errors, `redirect` and `notFound` inside actions |
| [Progressive enhancement](./progressive-enhancement.md) | What works before hydration and without JavaScript |

The runnable [server-actions example app](../../examples/nextjs/server-actions/README.md)
implements every page in this group.

## Why it exists

Without Server Actions, a mutation in an App Router app needs a Route Handler, a
`fetch` call, a request and response type kept in sync by hand, and a second
request to refresh the page afterward.

Next.js collapses that into one function and one request. The action runs, the
cache is updated, and the re-rendered route comes back in the same response. The
framework also adds protections React cannot provide on its own: an `Origin`
check against CSRF, a request body limit, encrypted action IDs, and removal of
unused actions from the client bundle.

## When to use it

- Any write triggered by the UI: create, update, delete, toggle, sign in, sign out.
- Setting or deleting cookies in response to a user action.
- Invalidating cached data after a change, so the user sees it immediately.
- Forms that must keep working before JavaScript loads.

## When not to use it

- **Reading data to render a page.** Read it in a Server Component. An action
  called after hydration is an extra round trip, and Next.js runs actions one at a
  time, so using them for reads creates a queue.
- **Endpoints for other clients.** Webhooks, mobile apps, and third parties need a
  stable URL and method. Use a [Route Handler](../nextjs-backend/route-handlers.md).
  Action IDs change between builds.
- **Parallel work from the client.** `Promise.all` over three actions still runs
  them one after another. Do the parallel work inside one action.
- **Mutations during render.** Setting cookies or revalidating while a Server
  Component renders is not allowed. Mutations happen in response to a request that
  asks for them.

## Basic example

A `"use server"` module. Each export becomes an endpoint, so each one checks who is
calling and what they sent before doing anything.

```ts file="app/posts/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

const createPostSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10_000),
});

export async function createPost(formData: FormData): Promise<void> {
  // 1. Authenticate: this function can be called without the form.
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  // 2. Validate: FormData is untrusted input.
  const parsed = createPostSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
  });
  if (!parsed.success) {
    // The Forms page shows how to return field errors instead.
    return;
  }

  // 3. Authorize and mutate: the author comes from the session, not the form.
  const post = await db.post.create({
    data: { ...parsed.data, authorId: session.userId },
  });

  // 4. Expire cached post lists, then navigate. redirect() throws, so it goes last.
  updateTag('posts');
  redirect(`/posts/${post.id}`);
}
```

A Server Component passes the action straight to a form:

```tsx file="app/posts/new/page.tsx"
import { createPost } from '../actions';

export default function NewPostPage() {
  return (
    <form action={createPost}>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required maxLength={120} />

      <label htmlFor="body">Body</label>
      <textarea id="body" name="body" required />

      <button type="submit">Publish</button>
    </form>
  );
}
```

No Client Component and no JavaScript are needed for this form to work.

## How it works

### From function to endpoint

At build time, the `"use server"` directive tells the compiler to keep the
function's implementation on the server and replace it in client bundles with a
**reference**: an action ID plus a dispatcher that `POST`s to the page that
invokes it. Only `POST` can invoke an action.

- **Action IDs are encrypted and non-deterministic.** Next.js recalculates them
  between builds, and caches them for at most 14 days.
- **Unused actions get no endpoint.** An exported action that nothing in the app
  uses is removed during `next build`.
- **Neither is authorization.** An action your UI does use is reachable by anyone
  who copies the request from the browser's network tab.

Because IDs are tied to a build, a browser tab still running the previous
deployment can call an ID that no longer exists. That surfaces as a "Failed to
find Server Action" error. Prefer rolling deployments, and let the user recover by
reloading.

### One request, data and UI together

When an action finishes, the response carries its return value. If the action
also changed something the current page depends on, the same response carries a
newly rendered [RSC Payload](../nextjs-rendering/server-components.md) for the
current route, and the router commits it. That happens when the action:

- calls `updateTag`, `revalidatePath`, or `refresh`,
- sets or deletes a cookie with `cookies()`, or
- calls `redirect`, which streams the destination route instead.

`revalidateTag(tag, 'max')` is the exception. It marks data stale for later reads
and does **not** re-render in the action response. An action that does none of
these returns only its value, and the page stays as it was.
[Revalidating after mutations](./revalidating-after-mutations.md) covers which one
to choose.

### One action at a time

The Next.js client dispatches Server Actions **sequentially**. If a user triggers
three actions quickly, the second waits for the first. This keeps each re-rendered
page consistent with the action that produced it. On the server, each action runs
in its own request.

### Inline actions and closures

An action defined inside a Server Component can use values from the render:

```tsx file="app/posts/[id]/page.tsx"
import { notFound } from 'next/navigation';
import { refresh } from 'next/cache';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export default async function PostPage({ params }: PageProps<'/posts/[id]'>) {
  const { id } = await params;
  const post = await db.post.findUnique({ where: { id } });
  if (!post) notFound();

  async function archivePost() {
    'use server';
    // `id` was captured at render time. Re-check who is allowed to use it.
    const session = await verifySession();
    if (!session) throw new Error('Unauthorized');

    const owned = await db.post.findFirst({ where: { id, authorId: session.userId } });
    if (!owned) throw new Error('Forbidden');

    await db.post.update({ where: { id }, data: { archived: true } });
    refresh();
  }

  return (
    <article>
      <h1>{post.title}</h1>
      <form action={archivePost}>
        <button type="submit">Archive</button>
      </form>
    </article>
  );
}
```

To make this work, the captured `id` is sent to the browser and back with the
call. **Next.js encrypts closed-over variables** with a key generated for each
build, so the browser cannot read them. The official guidance is still not to rely
on encryption alone for sensitive values, and to authorize on every call, as the
example does.

If you run several server instances, they must share the key. Set
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to the same base64-encoded AES key (16, 24 or
32 bytes) everywhere:

```bash
openssl rand -base64 32
```

Values passed with `.bind()` from a **Client Component**, and hidden inputs, are
ordinary arguments chosen by the browser. Validate them like any form field.

### Configuration

`serverActions` lives under `experimental` in `next.config.ts`:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. Raise it only for routes that accept uploads, and leave
      // room for multipart overhead.
      bodySizeLimit: '2mb',
      // Extra hosts allowed to invoke actions, for proxies that do not forward
      // the public host in x-forwarded-host.
      allowedOrigins: ['shop.example.com', '*.shop.example.com'],
    },
  },
};

export default nextConfig;
```

- **`bodySizeLimit`** caps the raw request body, including multipart boundaries
  and part headers. It accepts a number of bytes or a string such as `'500kb'`.
- **`allowedOrigins`** extends the CSRF check. Next.js compares the host in the
  request's `Origin` header with the app's host (`x-forwarded-host` or `host`) and
  rejects a mismatch. `*` matches one host label and `**` one or more. Ports must
  be written out. A request with no `Origin` header at all is allowed with a
  warning, so this check is not a substitute for authentication.

### Dev terminal logging

Since **16.2**, `next dev` logs every Server Function call under the request that
carried it, with the function name, its arguments, the duration and the file. The
official docs show the shape like this:

```text
POST /
  └─ ƒ myAction(arg1, arg2) in 5ms app/actions.ts
```

This logging is on by default during development. Turn it off with
`logging: { serverFunctions: false }` in `next.config.ts`. Arguments appear in
your terminal, so keep that in mind when you paste logs into an issue.

## Server and client implications

| Where | Define an action? | Call an action? |
|---|---|---|
| `"use server"` file | Yes: every export is an action | — |
| Server Component | Yes, inline with `'use server'` in the function body | Pass it to `action` / `formAction`, or as a prop |
| Client Component | **No** | Import it from a `"use server"` file, or receive it as a prop |

A Client Component that receives an action as a prop types it as a function:

```tsx file="app/posts/[id]/rename-form.tsx"
'use client';

import { useFormStatus } from 'react-dom';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Rename'}
    </button>
  );
}

export function RenameForm({
  currentTitle,
  renameAction,
}: {
  currentTitle: string;
  renameAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={renameAction}>
      <input name="title" defaultValue={currentTitle} aria-label="Title" />
      <SaveButton />
    </form>
  );
}
```

`import 'server-only'` belongs in the modules your actions call (a data access
layer, database client, session helpers). It makes the build fail if a Client
Component ever imports them directly. Importing a `"use server"` file from a
Client Component is fine: the client gets references, not code.

## Security considerations

Framework protections (Origin check, body limit, encrypted IDs, dead-code
elimination) reduce exposure. They do not decide who may do what. Inside every
action:

1. **Authenticate.** A page that redirects signed-out users does not protect the
   actions defined on it.
2. **Validate** every argument with a schema. Types are erased at runtime.
3. **Authorize the specific record.** Look it up scoped to the session user.
   Checking that a user is signed in does not stop them editing someone else's
   post.
4. **Return only what the UI renders.** Return values are serialized to the
   browser. Never return a raw database row.

Keep authorization in one `server-only` data access layer that actions call, so
the check is in one place. See
[Data access layer](../nextjs-auth/data-access-layer.md) and
[Server Actions authorization](../nextjs-security/server-actions-authorization.md).

## Common mistakes

**Checking the session in the page but not in the action.** The page's `redirect`
controls what is rendered. The action is a separate entry point and runs whatever
the page did.

**Using an action to fetch data for rendering.** Actions are queued and cannot be
cached like a Server Component read. Read in the Server Component, and pass the
result down.

**Trusting a bound or hidden `userId`.** Derive identity from the session. Take
only the ID of the record to change from the client, then check ownership.

**Marking a helpers file `"use server"`.** Every export becomes an endpoint,
including helpers you meant to keep internal. Put helpers in a `server-only`
module and export only the actions.

**Forgetting to revalidate.** An action that writes data but calls none of
`updateTag`, `revalidatePath` or `refresh` returns without re-rendering, so the
page keeps showing the old data.

**Raising `bodySizeLimit` globally for one upload form.** The limit applies to
every action. Consider a Route Handler for large uploads instead.

**Adding a broad `allowedOrigins` wildcard such as `'**.com'` to silence a proxy
error.** It lets pages on unrelated sites submit to your actions. Make the proxy
forward `x-forwarded-host`, or list the exact public host.

## Related topics

- [Server Functions](../server-react/server-functions.md): the React model,
  serializable arguments, and why every function is a public endpoint.
- [Directives](../server-react/directives.md): the placement rules for
  `"use server"`.
- [Forms](./forms.md): wiring actions to forms, with validation errors from Zod.
- [Revalidating after mutations](./revalidating-after-mutations.md): choosing
  between `updateTag`, `revalidateTag`, `revalidatePath` and `refresh`.
- [Server Actions authorization](../nextjs-security/server-actions-authorization.md):
  the exploit and the fix, step by step.
- [Route Handlers](../nextjs-backend/route-handlers.md): for endpoints other
  clients call.
