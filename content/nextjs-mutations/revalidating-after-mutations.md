---
title: Revalidating after mutations
description: Finish a Server Action so the user sees the change, with updateTag, revalidateTag, revalidatePath, refresh, cookies and redirect in the right order.
group: nextjs-mutations
order: 30
status: current
since: "16.0"
related: [nextjs-data-caching/revalidation, nextjs-mutations/server-actions, nextjs-mutations/optimistic-updates, hooks/use-transition]
---

## Overview

A Server Action that writes data is only half done. The other half is telling
Next.js what changed, so the page the user is looking at shows the result. The
cache model behind these functions is explained in
[Revalidation](../nextjs-data-caching/revalidation.md). This page is about the
**end of a mutation**: which call to make, in what order, and what the user sees.

| After the write, you want | Call (in the action) | Re-rendered page in the same response? |
|---|---|---|
| The user to see their own change immediately, and the data is cached with a tag | `updateTag('posts')` | Yes, and it waits for fresh data |
| Everyone to get fresh data soon, and a short delay is acceptable | `revalidateTag('posts', 'max')` | **No** |
| The current page to re-render, and the data it shows is not cached | `refresh()` | Yes |
| One route, with no tags, to get fresh data | `revalidatePath('/posts')` | Yes |
| The user to land on another page | Any of the above, **then** `redirect('/posts/123')` | The destination is streamed |
| The UI to reflect a new cookie | `(await cookies()).set(…)` | Yes, automatically |

`updateTag` and `refresh` exist only in Server Actions. `revalidateTag` and
`revalidatePath` also work in Route Handlers.

## Why it exists

Without a signal, Next.js has no way to know an action changed anything. The
action's response would carry its return value and nothing else, so the page keeps
rendering the list it had before the write.

A separate "refetch" request would be slow and race with the write. Instead, when
an action calls `updateTag`, `revalidatePath` or `refresh`, or changes a cookie,
Next.js re-renders the current route on the server **inside the same request** and
sends the new RSC Payload back with the return value. One round trip covers the
write, the cache update and the new UI.

## When to use it

- At the end of every Server Action that changes data a page displays.
- `updateTag` when the person who made the change is looking at the result:
  creating a post, editing a profile, adding to a cart.
- `revalidateTag(tag, 'max')` when the change is for other visitors and the action
  itself does not need to show it, for example an admin tool that republishes a
  catalog.
- `refresh()` when the page reads data at request time without caching it.

## When not to use it

- **During render.** Calling these while a Server Component renders is not
  allowed. They belong in actions and Route Handlers.
- **In a Client Component.** They are server functions from `next/cache`. The
  client calls an action, and the action calls them.
- **`updateTag` or `refresh` in a Route Handler or webhook.** They throw there. Use
  `revalidateTag(tag, 'max')`, or `revalidateTag(tag, { expire: 0 })` when the
  data must be gone immediately.
- **`revalidatePath('/', 'layout')` as a habit.** It invalidates everything and
  purges the client cache. Tag the data you change instead.

## Basic example

Cached reads tag their data:

```ts file="lib/posts.ts"
import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

export type PostSummary = { id: string; title: string };

export async function getRecentPosts(): Promise<PostSummary[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');

  const rows: PostSummary[] = await db.post.findMany({
    select: { id: true, title: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows;
}

export async function getPost(id: string): Promise<{ id: string; title: string; body: string } | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(`post-${id}`);

  return db.post.findUnique({ where: { id }, select: { id: true, title: true, body: true } });
}
```

The action writes, expires exactly those tags, and navigates:

```ts file="app/posts/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

const editPostSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(10_000),
});

export async function editPost(formData: FormData): Promise<void> {
  const session = await verifySession();
  if (!session) redirect('/login');

  const parsed = editPostSchema.safeParse({
    id: formData.get('id'),
    title: formData.get('title'),
    body: formData.get('body'),
  });
  if (!parsed.success) throw new Error('Invalid post');

  const { id, title, body } = parsed.data;
  const result = await db.post.updateMany({
    where: { id, authorId: session.userId },
    data: { title, body },
  });
  if (result.count === 0) throw new Error('Forbidden');

  // The list and the detail page both show the title.
  updateTag('posts');
  updateTag(`post-${id}`);

  // Last: redirect() throws, so nothing after it runs.
  redirect(`/posts/${id}`);
}
```

Because the tags were expired, not marked stale, rendering `/posts/[id]` after
the redirect waits for the new title instead of showing the old one.

## How it works

### `updateTag`: read your own writes

`updateTag(tag)` expires cached entries with that tag immediately. The next read,
including the re-render that ships in the action response, waits for fresh data
rather than serving the cached value. That is what makes a user's own edit appear
on the first render after they submit.

It takes one argument and only runs inside a Server Action.

### `revalidateTag(tag, profile)`: stale while revalidate

`revalidateTag` marks tagged entries stale. The next request that reads them gets
the stale value and triggers a background refresh. The second argument is
**required**: a `cacheLife` profile name (`'max'` is the recommended one) or
`{ expire: seconds }`.

In a Server Action, `revalidateTag(tag, 'max')` deliberately does not re-render
the current page. The user who clicked may still see old data until a later
request. If that is a problem, you wanted `updateTag`.

> [!DEPRECATED]
> The one-argument form of `revalidateTag` is deprecated since 16.0 and is a type
> error against `next@16.3.5`. In a Server Action, replace it with `updateTag(tag)`.
> Elsewhere, pass a profile: `revalidateTag(tag, 'max')`.

### `refresh()`: uncached data

`refresh()` re-renders the current route and sends it back with the action result.
It does not touch any cache. Use it when the page reads data at request time, for
example from `cookies()` or an uncached database query, and the action changed
that data. Calling `refresh()` after a write to **cached** data shows the old
cached value again, because nothing was invalidated.

### `revalidatePath(path, type?)`

`revalidatePath` invalidates by route. The path follows the **file structure**:

- A literal URL, `revalidatePath('/posts/123')`, targets one page.
- A pattern needs a type: `revalidatePath('/posts/[id]', 'page')` targets every
  post page, and `'layout'` also covers everything nested under that layout.
- With rewrites, pass the destination route, not the URL in the address bar.

Called from a Server Action, it updates the current UI immediately. Currently it
also makes previously visited pages refresh when you navigate back to them. The
16.3 docs describe that as temporary. Prefer tags when several routes show the
same data, since a path only covers its own route.

### `redirect` goes last

`redirect()` throws a control-flow error that Next.js handles, so code after it
never runs. Put `updateTag`, `revalidatePath` or cookie writes **before** it, or the
destination may render stale data.

- In a Server Action, `redirect` pushes a history entry by default. Pass
  `RedirectType.replace` for a wizard step the user should not return to.
- With JavaScript, it is a client-side navigation and the destination's RSC
  Payload is streamed in the action response. For a form posted without
  JavaScript, Next.js answers with a `303`, so the browser follows with a `GET`.
- Do not call it inside `try`. The `catch` swallows the redirect. See
  [not-found and redirect](../nextjs-errors/not-found-and-redirect.md).

### Cookies re-render the page

Setting or deleting a cookie in a Server Action re-renders the current page and
its layouts in the same response, so a "Signed in as" header or a theme switch
updates without any revalidation call. Client state in components that stay
mounted is kept.

A cookie change does not invalidate cached data. If signing out must also hide
cached, user-specific content, that content should not have been cached across
users in the first place. See [Sessions](../nextjs-auth/sessions.md).

## Caching implications

- **Tags only work if reads are tagged.** `updateTag('posts')` does nothing for a
  `"use cache"` function that never called `cacheTag('posts')`. Tag names are
  case-sensitive and at most 256 characters.
- **Tag at the granularity you mutate.** A list tag (`posts`) plus a per-record
  tag (`post-${id}`) lets an edit expire one detail page and the lists, rather than
  every post page.
- **`refresh()` is for uncached data.** Mixing it with cached reads is the most
  common "my change does not show" bug.
- **The client router cache** is updated by the re-render that comes back with the
  action. Other routes the user visited before refresh when revisited, according
  to their own cache rules.

## Common patterns

### Stay on the page and return state

When the form stays on screen, skip `redirect` and return a value. The expired
data and the return value arrive together:

```ts file="app/settings/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export type ProfileState = { saved: boolean; error: string | null };

const profileSchema = z.object({ displayName: z.string().trim().min(2).max(50) });

export async function saveProfile(
  _previousState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await verifySession();
  if (!session) return { saved: false, error: 'Sign in again to save.' };

  const parsed = profileSchema.safeParse({ displayName: formData.get('displayName') });
  if (!parsed.success) return { saved: false, error: 'Use 2 to 50 characters.' };

  await db.user.update({
    where: { id: session.userId },
    data: { displayName: parsed.data.displayName },
  });

  updateTag(`user-${session.userId}`);
  return { saved: true, error: null };
}
```

### Sign out: delete the cookie, then leave

```ts file="app/auth/actions.ts"
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('session');
  redirect('/');
}
```

Signing out needs no authorization check: the worst an attacker can do is sign
themselves out. Every action that reads or changes data still does.

### Uncached, request-time data

The [server-actions example app](../../examples/nextjs/server-actions/README.md)
reads todos from an in-memory store on every request. Its actions call `refresh()`
after each write, and the updated list comes back in the action response. An
action in the same style:

```ts file="app/todos/actions.ts"
'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/session';
import { markTodoDone } from '@/lib/todos';

const todoIdSchema = z.uuid();

export async function completeTodo(todoId: string): Promise<{ error: string | null }> {
  const user = await getSessionUser();
  if (!user) return { error: 'Sign in first.' };

  const id = todoIdSchema.safeParse(todoId);
  if (!id.success) return { error: 'Unknown todo.' };

  // markTodoDone scopes the update to todos owned by this user.
  const updated = await markTodoDone({ id: id.data, ownerId: user.id });
  if (!updated) return { error: 'Unknown todo.' };

  refresh();
  return { error: null };
}
```

### A webhook elsewhere, an action here

A CMS webhook in a Route Handler cannot call `updateTag`. It calls
`revalidateTag('posts', 'max')`. An editor's own action in the admin UI calls
`updateTag('posts')`. Both target the same tag. The difference is who waits for
fresh data. Webhook handlers are covered in
[Webhooks](../nextjs-backend/webhooks.md).

## Security considerations

- Revalidation calls run **after** authentication, validation and authorization.
  An unauthenticated caller must not be able to trigger even a cache expiry, since
  expensive re-renders are a denial-of-service lever.
- Never build a tag or path from unchecked input (`updateTag(formData.get('tag'))`).
  Derive it from the validated record ID.
- Redirect targets taken from input (`?next=/somewhere`) must be checked against
  an allowlist of internal paths. See
  [Open redirects](../nextjs-security/open-redirects.md).

## Common mistakes

**Writing data and calling nothing.** The action response has no re-render, so the
page keeps the old list until the next navigation.

**`revalidateTag('posts', 'max')` for the user's own change.** The action does not
re-render, and the next read serves stale data. Use `updateTag` in actions.

**`refresh()` after changing cached data.** The page re-renders from the same cache
entry. Expire the tag.

**`redirect()` before `updateTag()`.** The revalidation line never runs.

**`redirect()` inside `try`.** The `catch` catches it and the navigation never
happens. Move it after the `try` block.

**`revalidatePath('/posts/[id]')` without a type.** A dynamic pattern needs
`'page'` or `'layout'`. A literal path such as `/posts/123` does not.

**Revalidating the rewrite source.** `revalidatePath` matches the route file, so
use the rewrite's destination.

## Related topics

- [Revalidation](../nextjs-data-caching/revalidation.md): the four APIs from the
  cache's point of view, including time-based revalidation.
- [Cache life and tags](../nextjs-data-caching/cache-life-and-tags.md): how to tag
  cached reads so there is something to expire.
- [Server Actions](./server-actions.md): why one action response can carry both
  data and a re-rendered page.
- [Optimistic updates](./optimistic-updates.md): what the user sees while the
  action and its revalidation are in flight.
- [useTransition](../hooks/use-transition.md): the React transition every action
  runs in, which is why the re-render and the return value commit together.
