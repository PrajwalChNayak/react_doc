---
title: Revalidation
description: Choose between revalidateTag, updateTag, refresh and revalidatePath to update cached and rendered data after it changes.
group: nextjs-data-caching
order: 40
status: current
since: "16.0"
related: [nextjs-data-caching/cache-life-and-tags, nextjs-mutations/revalidating-after-mutations, server-react/server-functions]
---

## Overview

Revalidation updates content that Next.js has cached or rendered. There are two
triggers:

- **Time-based**: the `revalidate` and `expire` values of a
  [`cacheLife`](./cache-life-and-tags.md) profile. Nothing to call.
- **On demand**: one of four functions from `next/cache`, called after the data
  changes.

| | `revalidateTag(tag, profile)` | `updateTag(tag)` | `refresh()` | `revalidatePath(path, type?)` |
|---|---|---|---|---|
| Targets | Entries tagged `tag` | Entries tagged `tag` | The current route's rendered output | Everything rendered for a route path |
| Cache effect | Marks stale. The next read gets the old value and refreshes in the background | Expires now. The next read waits for fresh data | None. Cached data is not touched | Invalidates the path's cached data |
| Re-renders the current page in the action response | No (with a stale-while-revalidate profile) | Yes | Yes | Yes |
| Callable from | Server Actions and Route Handlers | **Server Actions only** | **Server Actions only** | Server Actions and Route Handlers |
| Typical use | CMS webhooks, catalog updates, "a slight delay is fine" | A user must see their own change | The page shows uncached data the action changed | One route changed and it has no tags |

This page covers the four APIs and how to choose. How to structure a mutation
end to end, including validation, redirects and returning state, is in
[Revalidating after mutations](../nextjs-mutations/revalidating-after-mutations.md).

## Why it exists

A cache is only useful if you can correct it. Time-based revalidation bounds how
old data can get, but a user who edits their profile does not want to wait 15
minutes to see it, and a CMS publish should not wait for a timer either.

The four functions exist because "correct the cache" means different things.
Sometimes a slightly stale page for the next visitor is fine and fast. Sometimes
the person who made the change must see it in the very next render. And
sometimes the data was never cached, and the page only needs to render again.

## When to use it

- **`revalidateTag(tag, 'max')`**: the default for content changes, especially
  from outside the app (webhooks, admin tools, scheduled jobs).
- **`updateTag(tag)`**: in a Server Action, when the user who triggered it must
  immediately see the result (read-your-own-writes).
- **`refresh()`**: in a Server Action that changed data the page reads without
  `"use cache"`.
- **`revalidatePath(path)`**: when a single route is affected and its data is not
  tagged.

## When not to use it

- **`updateTag` in a Route Handler or webhook.** It throws. Use
  `revalidateTag(tag, { expire: 0 })` when the data must be gone immediately.
- **`refresh()` to update cached data.** It does not revalidate tagged data.
- **`revalidatePath('/', 'layout')` as a habit.** It invalidates everything.
  Prefer tags, which invalidate only what changed.
- **Revalidating after every read.** Revalidation belongs after writes, not
  renders.

## Basic example

```ts file="app/catalog/actions.ts"
'use server';

import { revalidateTag, updateTag } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// The editor sees the new product in the response to this action.
export async function createProduct(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Name is required.' };

  await db.product.create({ data: { name } });
  updateTag('products');
  return { error: null };
}

// Shoppers may see the old price for one more request while it refreshes.
export async function bulkUpdatePrices(formData: FormData) {
  await requireAdmin();
  const percent = Number(formData.get('percent'));
  if (!Number.isFinite(percent) || Math.abs(percent) > 50) return { error: 'Invalid percentage.' };

  await db.product.adjustAllPrices(percent);
  revalidateTag('products', 'max');
  return { error: null };
}
```

Both functions invalidate the same tag. The difference is who pays for fresh
data: with `updateTag`, the editor's own request waits for it; with
`revalidateTag(tag, 'max')`, nobody waits, and one visitor may see the old price.

The [caching example app](../../examples/nextjs/caching/README.md) has one
action of each kind and a timestamp that shows the difference.

## How it works

### `revalidateTag(tag, profile)`

`revalidateTag` marks tagged entries as stale. **The call does not refresh
anything by itself.** The next request that reads the data is served the stale
value and starts a background revalidation. Pages using the tag therefore
revalidate as they are visited, not all at once.

The second argument sets how long stale content may still be served:

| `profile` | Behavior |
|---|---|
| `'max'` (recommended) | A one-year window. Requests are served stale content while the revalidation runs. |
| Another built-in or custom profile name | Only the profile's `expire` is read. Past it, a request blocks until fresh data is ready. |
| `{ expire: seconds }` | The same, with an explicit window. |
| `{ expire: 0 }` | Stale content is never served. The next request is a blocking cache miss. |

> [!DEPRECATED]
> The single-argument form, `revalidateTag(tag)`, is deprecated. It behaves like
> `{ expire: 0 }`, and against Next.js 16.3.5 it is a type error. Use
> `updateTag(tag)` in Server Actions, or pass `'max'` everywhere else.

### `updateTag(tag)`

`updateTag` expires tagged entries immediately. The next read, including the
re-render of the current route that ships in the action's response, waits for
fresh data. That is what makes read-your-own-writes work: the user who submitted
the form never sees the old value.

It works only inside a Server Action. Calling it anywhere else throws.

### `refresh()`

`refresh()` re-renders the current route and sends the new RSC payload in the
Server Action's response. It does not invalidate any cache entry. Use it when
the page shows **uncached** data, streamed behind `<Suspense>`, that the action
changed. For cached data, use `updateTag` or `revalidateTag`. It works only
inside a Server Action.

### `revalidatePath(path, type?)`

`revalidatePath` invalidates the cached data for a route path. Internally, every
rendered route carries implicit tags for its path and each parent layout, so
path revalidation uses the same tag system.

- A **literal path** (`/products/42`) targets one page. Omit `type`.
- A **route pattern** (`/products/[id]`) needs `type`: `'page'` targets every
  matching page, `'layout'` targets the layout and everything beneath it.
- With a rewrite, pass the **destination** path, the route file's location, not
  the URL in the address bar.
- In a Server Action it updates the UI immediately if the user is viewing the
  affected path. In a Route Handler the path is revalidated on its next visit.

`revalidatePath` only reaches the path you name. Another route that reads the
same tagged data keeps serving it until that tag is revalidated too.

### What happens in the browser

Calling any of the four from a Server Action clears the whole client-side cache,
whatever the `stale` times. Except for `revalidateTag` with a
stale-while-revalidate profile, the action's response also carries the freshly
rendered current route, so the page updates in the same round trip without a
second request.

## Server and client implications

- **None of these can run in a Client Component or in `proxy.ts`.** They need
  the server. Client Components trigger them by calling a Server Action.
- **None of them throw on success**, unlike `redirect()`. An action can call
  them and still return a value. Call them **before** `redirect()`, since code
  after a redirect does not run.
- **Revalidation is local to an instance by default.** With several servers,
  `revalidateTag` on one instance does not reach the others unless your
  [cache handler](./use-cache.md) coordinates tags through shared storage. See
  [Caching and CDNs](../nextjs-deployment/caching-and-cdn.md).

## Caching implications

- **Revalidation is lazy.** A tag invalidation costs nothing until someone
  requests the data. Invalidating a tag shared by thousands of pages does not
  trigger thousands of renders.
- **`'max'` trades freshness for speed.** One request after the change still sees
  old data. If that is not acceptable, use `updateTag` in actions or
  `{ expire: 0 }` in handlers.
- **A deploy invalidates everything anyway**, because cache keys include the
  build ID.

## Common patterns

### Revalidate from a CMS webhook

A Route Handler cannot use `updateTag`, so it uses `revalidateTag`. Authenticate
the caller first: an open revalidation endpoint lets anyone force your origin
to regenerate content on demand.

```ts file="app/api/revalidate/route.ts"
import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  const received = request.headers.get('x-revalidate-secret');
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ revalidated: false }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const slug =
    typeof body === 'object' && body !== null && 'slug' in body && typeof body.slug === 'string'
      ? body.slug
      : null;

  revalidateTag('articles', 'max');
  if (slug) revalidateTag(`article:${slug}`, 'max');

  return Response.json({ revalidated: true });
}
```

Webhook design, including retries and signature verification, is covered in
[Webhooks](../nextjs-backend/webhooks.md).

### Refresh a page that shows uncached data

```ts file="app/inbox/actions.ts"
'use server';

import { refresh } from 'next/cache';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function markAllRead() {
  const user = await getCurrentUser();
  if (!user) return;

  // The inbox reads messages without "use cache", so there is no tag to
  // invalidate. Re-render the page instead.
  await db.message.markAllRead({ userId: user.id });
  refresh();
}
```

### Combine a path and a tag

When a mutation affects one page directly and shared data elsewhere, call both.
`revalidatePath` refreshes the page the user is on, and the tag reaches every
other route that reads the data.

```ts file="app/posts/actions.ts"
'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { db } from '@/lib/db';
import { requireAuthor } from '@/lib/auth';

export async function publishPost(postId: string) {
  await requireAuthor(postId);
  await db.post.publish(postId);

  revalidatePath('/posts');
  updateTag('posts');
}
```

## Security considerations

- **A Server Action is a public endpoint.** Authenticate and authorize inside
  every action before mutating and revalidating. Rendering the form only for
  admins protects nothing. See
  [Server Actions authorization](../nextjs-security/server-actions-authorization.md).
- **Protect revalidation Route Handlers** with a secret compared in constant
  time, as above. Never accept the secret in a query string, where it ends up in
  logs.
- **Do not let callers choose arbitrary tags or paths** without validation.
  Restrict them to the shapes your app uses.

## Common mistakes

**Calling `revalidateTag` with one argument.** It is deprecated and a type error
in 16.3.5. Pass `'max'`, or use `updateTag` in a Server Action.

**Calling `updateTag` from a Route Handler.** It throws. Use
`revalidateTag(tag, { expire: 0 })`.

**Expecting `revalidateTag(tag, 'max')` to update the page the user is on.** It
does not re-render in the action response, and the next request still receives
the stale value. Use `updateTag` when the user must see the change.

**Using `refresh()` after changing cached data.** The re-render reads the same
cache entry. Invalidate the tag instead.

**Calling `revalidatePath('/products/[id]')` without `type`.** A pattern with a
dynamic segment requires `'page'` or `'layout'`.

**Passing the rewritten source path to `revalidatePath`.** It must be the
destination route.

**Calling revalidation after `redirect()`.** The redirect throws, so the
revalidation never runs.

## Related topics

- [cacheLife and cacheTag](./cache-life-and-tags.md): how entries get the tags and
  lifetimes these functions act on.
- [Revalidating after mutations](../nextjs-mutations/revalidating-after-mutations.md):
  the full mutation flow around these calls.
- [Server Actions](../nextjs-mutations/server-actions.md): the only place
  `updateTag` and `refresh` work.
- [Server Functions (React)](../server-react/server-functions.md): the React
  feature Server Actions are built on.
- [The caching model](./caching-model.md): the stores that revalidation updates.
