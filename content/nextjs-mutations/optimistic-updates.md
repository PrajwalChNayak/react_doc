---
title: Optimistic updates
description: Use useOptimistic with Server Actions in Next.js, and reconcile the prediction with the page the action re-renders.
group: nextjs-mutations
order: 40
status: current
related: [hooks/use-optimistic, nextjs-mutations/revalidating-after-mutations, nextjs-mutations/error-handling, nextjs-mutations/progressive-enhancement]
---

## Overview

[`useOptimistic`](../hooks/use-optimistic.md) is a React hook: it shows a predicted
value while an Action is pending and drops it when the Action ends. The React page
explains the hook. This page explains the part Next.js decides: **what the "real"
value is when the prediction disappears.**

In an App Router app, the real value is usually a prop rendered by a Server
Component. It only changes when the Server Action's response carries a re-rendered
page. So an optimistic update in Next.js has two halves that must match:

1. The Client Component calls the optimistic setter, then the Server Action.
2. The Server Action writes, then calls `updateTag`, `revalidatePath` or
   `refresh()`, so the same response delivers the new prop.

When both halves are there, the optimistic item is replaced by the real one in a
single commit. When the second half is missing, the item appears, vanishes, and
only returns on the next navigation.

## Why it exists

A Server Action round trip includes the network, the write, and a server render.
That is often several hundred milliseconds, long enough for a "Send" button to
feel broken. `useOptimistic` shows the expected result on the current frame.

Next.js makes the reconciliation cheap. There is no client cache to patch and no
list to splice. The server re-renders the truth, and the optimistic overlay is
discarded when that render commits.

## When to use it

- Appending to a list the user is looking at: comments, messages, todos.
- Toggles whose result the client can predict: like, star, follow, done.
- Moving items between columns, where waiting for the server makes dragging feel
  sluggish.

## When not to use it

- **The server decides the visible result.** An order number, a price after
  discounts, or a moderation decision cannot be predicted. Show a pending state.
- **Failure is common or costly.** Payments, bookings, anything a user acts on
  after seeing "done".
- **The form must work without JavaScript.** The optimistic setter runs in a
  client function. See [Progressive enhancement](./progressive-enhancement.md).
- **The action uses `revalidateTag(tag, 'max')`.** That does not re-render in the
  action response, so the prediction disappears before the data catches up.

## Basic example

The server renders the saved comments and passes them down:

```tsx file="app/articles/[slug]/page.tsx"
import { notFound } from 'next/navigation';
import { getArticle, getComments } from '@/lib/articles';
import { CommentThread } from './comment-thread';

export default async function ArticlePage({ params }: PageProps<'/articles/[slug]'>) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const comments = await getComments(article.id);

  return (
    <article>
      <h1>{article.title}</h1>
      <CommentThread articleId={article.id} comments={comments} />
    </article>
  );
}
```

The Client Component predicts the new comment and calls the action:

```tsx file="app/articles/[slug]/comment-thread.tsx"
'use client';

import { useActionState, useOptimistic } from 'react';
import { addComment, type AddCommentState } from './actions';

type Comment = { id: string; author: string; body: string };
type ShownComment = Comment & { pending: boolean };

const initialState: AddCommentState = { error: null };

export function CommentThread({
  articleId,
  comments,
}: {
  articleId: string;
  comments: Comment[];
}) {
  const [shownComments, addOptimisticComment] = useOptimistic<ShownComment[], ShownComment>(
    comments.map((comment) => ({ ...comment, pending: false })),
    (current, pendingComment) => [...current, pendingComment],
  );

  const [state, formAction, isPending] = useActionState(
    async (previousState: AddCommentState, formData: FormData) => {
      const body = String(formData.get('body') ?? '').trim();
      // Only predict what the server's schema will accept.
      if (body.length >= 1 && body.length <= 2000) {
        addOptimisticComment({ id: crypto.randomUUID(), author: 'You', body, pending: true });
      }
      return addComment(articleId, previousState, formData);
    },
    initialState,
  );

  return (
    <section>
      <ul>
        {shownComments.map((comment) => (
          <li key={comment.id} style={{ opacity: comment.pending ? 0.5 : 1 }}>
            <strong>{comment.author}</strong> {comment.body}
          </li>
        ))}
      </ul>

      <form action={formAction}>
        <label htmlFor="comment-body">Add a comment</label>
        <textarea id="comment-body" name="body" required maxLength={2000} />
        <button type="submit" disabled={isPending}>
          Post
        </button>
        {state.error ? <p role="alert">{state.error}</p> : null}
      </form>
    </section>
  );
}
```

The action does its checks and, on success, expires the tag the page reads:

```ts file="app/articles/[slug]/actions.ts"
'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

export type AddCommentState = { error: string | null };

const commentSchema = z.object({
  articleId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function addComment(
  articleId: string,
  _previousState: AddCommentState,
  formData: FormData,
): Promise<AddCommentState> {
  const session = await verifySession();
  if (!session) return { error: 'Sign in to comment.' };

  const parsed = commentSchema.safeParse({ articleId, body: formData.get('body') });
  if (!parsed.success) return { error: 'Comments must be 1 to 2000 characters.' };

  const article = await db.article.findUnique({ where: { id: parsed.data.articleId } });
  if (!article || article.commentsLocked) return { error: 'Comments are closed.' };

  await db.comment.create({
    data: { articleId: article.id, authorId: session.userId, body: parsed.data.body },
  });

  // getComments() is cached with cacheTag(`comments-${articleId}`).
  updateTag(`comments-${article.id}`);
  return { error: null };
}
```

## How it works

### The timeline of one submission

1. The user submits. React starts a transition and runs the `useActionState`
   function.
2. `addOptimisticComment` renders the faded comment on the current frame.
3. The Server Action runs on the server: session, validation, write,
   `updateTag`.
4. Next.js re-renders the article page on the server, waiting for fresh comments
   because the tag was expired, and sends that render back with
   `{ error: null }`.
5. The transition ends. React commits the new `comments` prop and drops the
   optimistic overlay **in the same render**. The faded comment is replaced by the
   saved one with no flicker.

### Choosing the revalidation call

| Action ends with | What the user sees |
|---|---|
| `updateTag(tag)` for data the page reads | Prediction replaced by the saved item. Correct for cached reads. |
| `refresh()` | The same, for pages that read data without caching it. |
| `revalidatePath('/articles/[slug]', 'page')` | The same, scoped by route. |
| `revalidateTag(tag, 'max')` | Prediction disappears. The old list shows until a later request. |
| Nothing | Prediction disappears. The old list shows until the next navigation. |

### Rollback

There is no rollback code to write. The overlay only exists while the Action is
pending, so whenever the Action ends without new data, the page shows the
unchanged server list again.

- **Expected failure:** the action **returns** `{ error }` without revalidating.
  The comment disappears and the message appears next to the form. The
  [example app](../../examples/nextjs/server-actions/README.md) shows this when you
  add the same todo twice.
- **Unexpected failure:** the action **throws**. The optimistic comment is dropped
  and the error goes to the nearest `error.tsx`. See
  [Error handling](./error-handling.md).

Tell the user which case happened. A comment that silently vanishes looks like a
bug even when the server was right to refuse it.

### Keys

Give each optimistic item a unique key, such as `crypto.randomUUID()`. A shared
placeholder key like `'pending'` breaks when a user submits twice before the first
action finishes. Next.js runs actions one at a time, so a second submission waits
for the first.

## Server and client implications

- `useOptimistic` runs only in Client Components, and only inside an Action: a
  form `action`, the function given to `useActionState`, or `startTransition`.
- The Server Component stays the source of truth. Do not copy `comments` into
  `useState` on the client: the re-render from the action would update the prop
  but not your copy.
- The action's return value and the re-rendered page arrive in the same response,
  so an error message and an unchanged list commit together.

## Common patterns

### A toggle outside a form

Call the action inside `startTransition` so the optimistic value lives until the
action finishes:

```tsx file="app/articles/[slug]/like-button.tsx"
'use client';

import { startTransition, useOptimistic } from 'react';
import { setLiked } from './like-actions';

export function LikeButton({ articleId, liked }: { articleId: string; liked: boolean }) {
  const [optimisticLiked, setOptimisticLiked] = useOptimistic(liked);

  return (
    <button
      type="button"
      aria-pressed={optimisticLiked}
      onClick={() => {
        const next = !optimisticLiked;
        startTransition(async () => {
          setOptimisticLiked(next);
          await setLiked(articleId, next);
        });
      }}
    >
      {optimisticLiked ? 'Liked' : 'Like'}
    </button>
  );
}
```

```ts file="app/articles/[slug]/like-actions.ts"
'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

const likeSchema = z.object({ articleId: z.uuid(), liked: z.boolean() });

export async function setLiked(articleId: string, liked: boolean): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const { articleId: id, liked: value } = likeSchema.parse({ articleId, liked });

  if (value) {
    await db.like.upsert({
      where: { articleId_userId: { articleId: id, userId: session.userId } },
      create: { articleId: id, userId: session.userId },
      update: {},
    });
  } else {
    await db.like.deleteMany({ where: { articleId: id, userId: session.userId } });
  }

  // The like state is read per request, not cached.
  refresh();
}
```

The action is idempotent (set, not toggle), so a retried or queued call cannot
flip the state twice. A thrown error from `startTransition` reaches the nearest
error boundary.

### Pending items in a separate list

When the saved list is rendered by a Server Component you do not want to turn into
a Client Component, keep only the **pending** items on the client with
`useOptimistic([])`, and render them next to the server list. When the action's
re-render arrives, the pending list empties and the saved items appear in the
server-rendered list.

## Common mistakes

**Forgetting to revalidate in the action.** The optimistic item disappears when
the action ends and nothing replaces it.

**Using `revalidateTag(tag, 'max')` behind an optimistic update.** Stale-while-
revalidate skips the re-render. Use `updateTag` in the action.

**Predicting input the server will reject.** Mirror the cheap checks (empty,
too long) on the client before calling the setter, so clearly invalid input
never flashes on screen.

**Copying server props into `useState`.** The optimistic overlay settles onto
your stale copy instead of the fresh prop.

**Calling the setter outside an Action.** In an `onClick` without
`startTransition`, React warns and the optimistic value reverts almost
immediately.

**Silent rollback.** Return an error and show it. Users otherwise assume the app
lost their input.

## Related topics

- [useOptimistic](../hooks/use-optimistic.md): the hook's reference, reducer form,
  and behavior under concurrent rendering.
- [useActionState](../hooks/use-action-state.md): the state that carries the
  server's error message back.
- [Revalidating after mutations](./revalidating-after-mutations.md): the calls that
  make the server re-render in the action response.
- [Error handling](./error-handling.md): returned versus thrown failures, and
  where each one shows up.
- [Progressive enhancement](./progressive-enhancement.md): why optimistic forms
  need JavaScript, and a pattern that does not.
