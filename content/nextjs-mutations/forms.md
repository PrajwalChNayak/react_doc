---
title: Forms
description: Wire forms to Server Actions in Next.js, return Zod validation errors to useActionState, and use next/form for search and navigation.
group: nextjs-mutations
order: 20
status: current
related: [nextjs-mutations/server-actions, nextjs-mutations/error-handling, patterns/forms-and-actions, hooks/use-action-state]
---

## Overview

React gives `<form>` an `action` prop that accepts a function, plus
`useActionState`, `useFormStatus` and `useOptimistic`. Those are explained in
[Forms and Actions](../patterns/forms-and-actions.md). This page covers what
changes when the function is a Next.js Server Action, and the one form component
Next.js adds.

| You want to | Use | Request |
|---|---|---|
| Change data | `<form action={serverAction}>` | `POST` to the current page, handled by the action |
| Show validation errors from the server | `useActionState(serverAction, initialState)` in a Client Component | Same `POST`. The return value becomes state |
| Navigate with the fields as search params (search, filters) | `<Form action="/search">` from `next/form` | Client-side navigation to `/search?query=…` |

## Why it exists

A form that calls a Server Action needs no API route, no `fetch`, and no
`onSubmit`. It also works before JavaScript loads, because React renders a real
HTML form that the server knows how to handle.

Search forms have the opposite problem. A plain `<form method="get">` works, but
it reloads the whole document and throws away client state. `next/form` keeps the
native behavior as a fallback and upgrades it to a prefetched, client-side
navigation.

## When to use it

- `<form action={serverAction}>` for every create, update and delete form.
- `useActionState` when the server's answer must be shown next to the form: field
  errors, "already taken", a success message.
- `<Form>` from `next/form` when submitting only changes the URL: search boxes,
  filter panels, pagination jumps.

## When not to use it

- **Instant feedback while typing.** Validate on the client with HTML attributes
  (`required`, `maxLength`, `type="email"`) or local state. The server check still
  has to run.
- **`<Form>` for mutations with a string `action`.** A string action is a `GET`
  navigation. Pass a Server Action instead, or use a plain `<form>`.
- **`<Form>` when you need `method`, `encType` or `target`.** They are not
  supported because they override its behavior. Use the HTML `<form>`.

## Basic example

A Server Action written for `useActionState` takes the previous state as its
**first** argument and the `FormData` second. It returns validation failures
instead of throwing them.

```ts file="app/posts/new/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export type CreatePostState = {
  message: string | null;
  fieldErrors: { title?: string[]; body?: string[] };
  values: { title: string; body: string };
};

const createPostSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { error: 'Titles need at least 3 characters.' })
    .max(120, { error: 'Keep the title under 120 characters.' }),
  body: z.string().trim().min(1, { error: 'Write something before publishing.' }),
});

export async function createPost(
  _previousState: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  const values = {
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
  };

  const session = await verifySession();
  if (!session) {
    return { message: 'Your session expired. Sign in again.', fieldErrors: {}, values };
  }

  const parsed = createPostSchema.safeParse(values);
  if (!parsed.success) {
    return {
      message: null,
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const post = await db.post.create({
    data: { ...parsed.data, authorId: session.userId },
  });

  updateTag('posts');
  redirect(`/posts/${post.id}`);
}
```

The form is a Client Component because it reads state:

```tsx file="app/posts/new/post-form.tsx"
'use client';

import { useActionState } from 'react';
import { createPost, type CreatePostState } from './actions';

const initialState: CreatePostState = {
  message: null,
  fieldErrors: {},
  values: { title: '', body: '' },
};

export function PostForm() {
  const [state, formAction, isPending] = useActionState(createPost, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="title">Title</label>
      <input
        id="title"
        name="title"
        defaultValue={state.values.title}
        aria-invalid={Boolean(state.fieldErrors.title)}
        aria-describedby="title-error"
      />
      <p id="title-error">{state.fieldErrors.title?.join(' ')}</p>

      <label htmlFor="body">Body</label>
      <textarea
        id="body"
        name="body"
        defaultValue={state.values.body}
        aria-invalid={Boolean(state.fieldErrors.body)}
        aria-describedby="body-error"
      />
      <p id="body-error">{state.fieldErrors.body?.join(' ')}</p>

      {state.message ? <p role="alert">{state.message}</p> : null}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Publishing…' : 'Publish'}
      </button>
    </form>
  );
}
```

The page stays a Server Component and renders the form:

```tsx file="app/posts/new/page.tsx"
import { PostForm } from './post-form';

export default function NewPostPage() {
  return (
    <main>
      <h1>New post</h1>
      <PostForm />
    </main>
  );
}
```

> [!NOTE]
> `export type` from a `"use server"` file is erased at compile time, so importing
> the state type into the Client Component is fine. Every **runtime** export of
> that file must be an async function.

## How it works

### What the action receives

A form submission arrives as `FormData`. With `useActionState`, Next.js calls the
action as `(previousState, formData)`. With a bare `<form action={action}>`, it is
`(formData)` alone. Bound arguments from `.bind()` come first in both cases.

The submitted `FormData` can also contain framework fields whose names start with
`$ACTION_`. If you write `Object.fromEntries(formData)`, those keys end up in the
object. Pick the fields
you need, or parse with a `z.object` schema, which drops unknown keys by default.
Never spread the raw object into a database call.

### Where the state lives

`initialState` and every return value cross the network, so they must be
serializable: plain objects, arrays, strings, numbers, `null`. Return only what
the form renders. Echoing `values` back, as the example does, lets the inputs keep
what the user typed after a failed submission.

On success, the example calls `redirect()`, so it never returns. If you stay on
the page instead, return a fresh state and let the revalidation call re-render the
data around the form.

### Why `z.flattenError`

Zod 4 moved error flattening to a top-level function. `z.flattenError(error)`
returns `{ formErrors, fieldErrors }`, where `fieldErrors` maps each field to an
array of messages. That shape serializes cleanly and maps one-to-one onto inputs.

### Passing extra arguments

Use `.bind()` to pass values that are not form fields, such as the ID of the
record being edited:

```tsx file="app/posts/[id]/edit/edit-title-form.tsx"
'use client';

import { useActionState } from 'react';
import { renamePost } from './actions';

export function EditTitleForm({ postId, title }: { postId: string; title: string }) {
  const [state, formAction, isPending] = useActionState(renamePost.bind(null, postId), {
    error: null,
  });

  return (
    <form action={formAction}>
      <input name="title" defaultValue={title} aria-label="Post title" />
      <button type="submit" disabled={isPending}>
        Save
      </button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```

```ts file="app/posts/[id]/edit/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

type RenameState = { error: string | null };

const renameSchema = z.object({
  postId: z.uuid(),
  title: z.string().trim().min(3).max(120),
});

export async function renamePost(
  postId: string,
  _previousState: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const session = await verifySession();
  if (!session) return { error: 'Sign in to edit posts.' };

  const parsed = renameSchema.safeParse({ postId, title: formData.get('title') });
  if (!parsed.success) return { error: 'Titles need 3 to 120 characters.' };

  // The bound postId came from the browser. Scope the lookup to the caller.
  const post = await db.post.findFirst({
    where: { id: parsed.data.postId, authorId: session.userId },
  });
  if (!post) return { error: 'Post not found.' };

  await db.post.update({ where: { id: post.id }, data: { title: parsed.data.title } });
  updateTag(`post-${post.id}`);
  return { error: null };
}
```

`.bind()` keeps a Server Action a Server Action, so the form still works without
JavaScript. A bound value is still chosen by the browser, which is why the action
validates it and scopes the lookup to the session user. A hidden input is the
other option. Its value is visible in the HTML and equally editable.

### Pending state

`isPending` from `useActionState` covers the component that owns the form. For a
reusable submit button, `useFormStatus` reads the parent form's status. See
[useFormStatus](../hooks/use-form-status.md). Both require JavaScript: before
hydration, the browser's own loading indicator is the only feedback.

## Server and client implications

- A form that only calls an action and shows no result can stay in a **Server
  Component**. Reading `useActionState`, `useFormStatus` or `useOptimistic` needs a
  **Client Component**.
- Keep the page a Server Component and move only the form into a Client Component,
  as the basic example does. The page can still read data and pass it to the form.
- A Client Component cannot define an action. It imports one from a `"use server"`
  file or receives one as a prop.

## Common patterns

### Search with `next/form`

`<Form>` with a **string** `action` behaves like a `GET` form: the fields become
search params. Next.js adds prefetching of the destination's shared UI (layouts
and `loading.tsx`) when the form scrolls into view, and a client-side navigation
on submit instead of a document reload.

```tsx file="app/ui/search-form.tsx"
import Form from 'next/form';

export function SearchForm({ defaultQuery }: { defaultQuery?: string }) {
  return (
    <Form action="/search" role="search">
      <label htmlFor="query">Search posts</label>
      <input id="query" name="query" type="search" defaultValue={defaultQuery} />
      <button type="submit">Search</button>
    </Form>
  );
}
```

```tsx file="app/search/page.tsx"
import { SearchForm } from '@/app/ui/search-form';
import { searchPosts } from '@/lib/posts';

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const { query } = await searchParams;
  const term = typeof query === 'string' ? query.trim() : '';
  const results = term ? await searchPosts(term) : [];

  return (
    <main>
      <SearchForm defaultQuery={term} />
      <ul>
        {results.map((post: { id: string; title: string }) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </main>
  );
}
```

With a string `action`, `<Form>` also accepts `replace` (replace the history entry
instead of pushing), `scroll` (default `true`) and `prefetch` (default `true`). An
empty string `action=""` navigates to the current route with the new search params.
Without JavaScript, it is an ordinary `GET` form.

When you pass a **function** to `<Form action>`, it behaves exactly like a React
`<form>` with a Server Action, and `replace` and `scroll` are ignored.

### Several actions in one form

Give each button its own `formAction`, for example "Save draft" and "Publish". The
fields are shared. The mechanism is React's; see
[Forms and Actions](../patterns/forms-and-actions.md).

### Redirect after creating

Call `redirect()` at the end of the action, after `updateTag` or
`revalidatePath`. With JavaScript it is a client-side navigation. Without it,
Next.js answers the form `POST` with a `303` redirect, so the browser follows with
a `GET` and a reload does not resubmit the form. See
[Revalidating after mutations](./revalidating-after-mutations.md).

### Submitting with a keyboard shortcut

Call `form.requestSubmit()`, not `form.submit()`. `requestSubmit` goes through
React's form handling and runs the action. `submit()` bypasses it.

## Security considerations

- **Validate on the server even if the input has `required` or `maxLength`.**
  Anyone can post to the action without the form.
- **Authenticate first, then validate, then authorize the record.** The examples
  return a message rather than throwing, so a signed-out user sees why nothing
  happened.
- **Do not trust `$ACTION_` fields, hidden inputs or bound values** as identity.
  Read the user from the session.
- **Mind the body limit.** Server Action requests are capped at 1MB by default
  (`experimental.serverActions.bodySizeLimit`). File uploads are covered in
  [File uploads](../nextjs-security/file-uploads.md).

## Common mistakes

**Keeping the one-argument signature with `useActionState`.** The hook passes
`previousState` first, so `formData.get` is called on your state object and throws.
Add the `previousState` parameter.

**Throwing on invalid input.** A thrown error goes to `error.tsx` and replaces the
form. Return field errors as state. See [Error handling](./error-handling.md).

**Returning a Zod error object directly.** `ZodError` is a class instance and does
not serialize. Return `z.flattenError(error).fieldErrors`.

**Using `error.flatten()` from Zod 3 tutorials.** Zod 4 uses `z.flattenError()`.

**`<Form action="/search" method="post">`.** `method` is not supported on
`<Form>`. For a `POST`, use a Server Action.

**Putting `useFormStatus` in the component that renders the `<form>`.** It reads
the parent form, so it must be in a child. This is React behavior; see
[useFormStatus](../hooks/use-form-status.md).

**Uncontrolled inputs losing their text after an error.** Return the submitted
values in state and use them as `defaultValue`.

## Related topics

- [Forms and Actions](../patterns/forms-and-actions.md): the React model for
  actions on forms, reset behavior, and multiple submit buttons.
- [useActionState](../hooks/use-action-state.md): the full hook reference,
  including `permalink`.
- [Server Actions](./server-actions.md): how the action behind the form becomes an
  endpoint.
- [Error handling](./error-handling.md): which errors to return and which to throw.
- [Progressive enhancement](./progressive-enhancement.md): what these forms do
  before JavaScript loads.
- [Input validation](../nextjs-security/input-validation.md): schemas at every
  server entry point.
