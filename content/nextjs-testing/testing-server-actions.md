---
title: Testing Server Actions
description: Unit test Server Actions as async functions with mocked cookies(), updateTag() and redirect(), then test the real form end to end.
group: nextjs-testing
order: 40
status: current
related: [nextjs-mutations/server-actions, nextjs-security/server-actions-authorization, server-react/server-functions, nextjs-testing/playwright]
---

## Overview

A Server Action is an exported `async` function in a `"use server"` module. Outside
Next.js, the directive is a string and the export is an ordinary function. That
makes actions easier to unit test than Server Components: import the function,
call it with a `FormData`, and assert on what it returns and what it called.

What you replace are the Next.js APIs the action calls: `cookies()` and
`headers()` from `next/headers`, `updateTag()`, `revalidateTag()` and `refresh()`
from `next/cache`, and `redirect()` from `next/navigation`. You then test the
real form through the real server with Playwright.

Server Functions as a React concept are covered in
[Server Functions](../server-react/server-functions.md), and the Next.js side in
[Server Actions](../nextjs-mutations/server-actions.md).

## Why it exists

Server Actions are where untrusted input meets your database. Every action is
reachable with a direct POST request, whether or not the form that normally calls
it is visible to the user. So the branches that matter most are the ones a browser
test rarely reaches: no session, a session without permission, malformed input.

Those branches are cheap to cover in a unit test and slow to cover end to end.
The happy path, where a real form submits, the page redirects and fresh data
appears, is the opposite. Only a running server proves it, because it depends on
the cache, the router and the request.

## When to use it

- **Unit test** authentication and authorization failures, validation errors,
  the tag an action invalidates, and the URL it redirects to.
- **End-to-end test** the form: progressive enhancement, pending UI, the
  redirect, and that updated data is visible afterward.

## When not to use it

- Do not unit test that `updateTag()` refreshes the page. Assert that you called it
  with the right tag, and check the visible result in Playwright.
- Do not call the real `next/headers` or `next/cache` from a unit test. There is no
  request, and `updateTag()` and `refresh()` throw unless they run inside a Server
  Action that Next.js is executing.
- Do not rely on a hidden button, or on `proxy.ts`, to keep unauthorized users out
  of an action. Test the check inside the action itself.

## Basic example

An action that creates a post. It authorizes first, validates second, then
writes, invalidates and redirects:

```ts file="app/posts/actions.ts"
'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/session';

const CreatePostSchema = z.object({
  title: z.string().trim().min(1, { error: 'Title is required.' }).max(120, { error: 'Keep the title under 120 characters.' }),
  body: z.string().trim().min(1, { error: 'Write something before publishing.' }),
});

export type CreatePostState = {
  message?: string;
  fieldErrors?: { title?: string[]; body?: string[] };
};

export async function createPost(_prev: CreatePostState, formData: FormData): Promise<CreatePostState> {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get('session')?.value);

  if (!session) {
    return { message: 'Sign in to publish a post.' };
  }
  if (!session.permissions.includes('posts:write')) {
    return { message: 'You do not have permission to publish posts.' };
  }

  const parsed = CreatePostSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const post = await db.post.create({
    data: { ...parsed.data, authorId: session.userId },
  });

  updateTag('posts');
  redirect(`/posts/${post.id}`);
}
```

The unit test mocks each Next.js module the action imports:

```ts file="app/posts/actions.test.ts"
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/session';
import { createPost } from './actions';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock('@/lib/session', () => ({ verifySessionToken: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { post: { create: vi.fn() } } }));

function postForm(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const editor = { userId: 'user_7', permissions: ['posts:write'] };

beforeEach(() => {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'session' ? { name, value: 'signed-token' } : undefined),
  });
  vi.mocked(verifySessionToken).mockResolvedValue(editor);
  vi.mocked(db.post.create).mockResolvedValue({ id: 'post_123' });
});

describe('createPost', () => {
  it('rejects a request without a session', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);

    const state = await createPost({}, postForm({ title: 'Hello', body: 'World' }));

    expect(state).toEqual({ message: 'Sign in to publish a post.' });
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it('rejects a signed-in user without the write permission', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({ userId: 'user_8', permissions: [] });

    const state = await createPost({}, postForm({ title: 'Hello', body: 'World' }));

    expect(state.message).toBe('You do not have permission to publish posts.');
    expect(db.post.create).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it('returns field errors for invalid input', async () => {
    const state = await createPost({}, postForm({ title: '   ', body: '' }));

    expect(state.fieldErrors?.title).toEqual(['Title is required.']);
    expect(state.fieldErrors?.body).toEqual(['Write something before publishing.']);
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it('creates the post, invalidates the list and redirects', async () => {
    await expect(
      createPost({}, postForm({ title: 'Testing actions', body: 'Mock the framework, not the logic.' })),
    ).rejects.toThrow('redirect:/posts/post_123');

    expect(db.post.create).toHaveBeenCalledWith({
      data: { title: 'Testing actions', body: 'Mock the framework, not the logic.', authorId: 'user_7' },
    });
    expect(updateTag).toHaveBeenCalledWith('posts');
    expect(redirect).toHaveBeenCalledWith('/posts/post_123');
  });
});
```

## How it works

### Why the `redirect` mock throws

The real `redirect()` never returns. It throws, and Next.js catches that throw to
perform the redirect. Code after it does not run. A mock that returns `undefined`
changes the control flow of the function under test, so the mock above throws too,
and the test asserts the rejection.

### Mocking `cookies()` with the right shape

`cookies()` is async in Next.js 16 and resolves to a cookie store. The mock
resolves to an object with only the `get` method the action uses. If the action
starts calling `has()` or `getAll()`, the test fails loudly, which is the signal
to extend the mock. `headers()` works the same way: resolve to a real `Headers`
instance, such as `new Headers({ 'x-forwarded-for': '203.0.113.7' })`.

### Mocks and Vitest 5

`vi.mock()` calls are hoisted above the imports and must be at the top level of
the file. Vitest 5 clears call history before each test by default
(`clearMocks`), but not implementations, so the `beforeEach` above resets the
happy-path defaults before every test. Individual tests then override one thing.

### What the unit test cannot tell you

It cannot tell you that the form posts to this action, that `updateTag('posts')`
makes the new post appear, or that the redirect lands on a page that renders. It
also runs the action as a function, so framework protections such as the Server
Actions origin check are not involved. Those need the end-to-end test below.

## Security considerations

Test authorization **inside the action**. A Server Action is an HTTP endpoint,
and a user can call it without the page that renders its form. A test suite that
only checks that the "Publish" button is hidden for viewers passes while the
action accepts their requests. See
[Server Actions authorization](../nextjs-security/server-actions-authorization.md).

Order matters for the same reason. The example authorizes before validating, so an
anonymous caller learns nothing about the schema from field errors. The first two
tests pin that order down.

The [security pairs example](../../examples/nextjs/security-pairs/README.md) has a
runnable version of this idea: a Playwright test that calls a Server Action whose
button is hidden, and shows it succeeding against the vulnerable action and
failing against the fixed one.

## Common patterns

### End to end through the form

The form uses `useActionState`, explained in
[useActionState](../hooks/use-action-state.md). The Playwright test drives it the
way a user does:

```ts file="e2e/create-post.spec.ts"
import { expect, test } from '@playwright/test';

test.describe('Publishing a post', () => {
  test('an editor publishes a post and sees it', async ({ page }) => {
    const title = `Release notes ${Date.now()}`;

    await page.goto('/posts/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Body').fill('Everything that shipped this week.');
    await page.getByRole('button', { name: 'Publish' }).click();

    await page.waitForURL(/\/posts\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

    await page.goto('/posts');
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  });

  test('shows validation errors from the action', async ({ page }) => {
    await page.goto('/posts/new');
    await page.getByRole('button', { name: 'Publish' }).click();

    await expect(page.getByText('Title is required.')).toBeVisible();
    await expect(page).toHaveURL(/\/posts\/new$/);
  });
});
```

Three details make this test reliable:

- **A unique title** per run, so a post left over from an earlier run, or data
  cached by the server, cannot make the assertion pass by accident.
- **`waitForURL` before asserting on the heading**, so the assertion runs against
  the new page and not the form.
- **Visiting `/posts` afterward** checks that `updateTag('posts')` did its job. The
  unit test only checked that it was called.

The signed-in editor comes from a Playwright setup project that saves storage
state, described in [Playwright](./playwright.md).

### Other invalidation calls

The same mocking pattern covers the rest of `next/cache`. Mock only what the
action imports:

```ts file="app/settings/actions.test.ts"
// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { refresh, revalidateTag } from 'next/cache';
import { updateNotificationSettings } from './actions';

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ name: 'session', value: 'signed-token' }) }),
}));
vi.mock('next/cache', () => ({ refresh: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/session', () => ({ verifySessionToken: vi.fn().mockResolvedValue({ userId: 'user_7' }) }));
vi.mock('@/lib/db', () => ({ db: { settings: { update: vi.fn() } } }));

it('refreshes the current page and expires the shared digest cache', async () => {
  const formData = new FormData();
  formData.set('digest', 'weekly');

  await updateNotificationSettings(formData);

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(revalidateTag).toHaveBeenCalledWith('digest-user_7', 'max');
});
```

`revalidateTag` takes a second argument, a `cacheLife` profile or
`{ expire: number }`. Asserting both arguments catches an action that forgot it.

## Common mistakes

- **Importing the real `next/headers` in a unit test.** There is no request to
  read. Mock the module.
- **A `redirect` mock that returns.** The code after `redirect()` runs in the test
  and never in production.
- **Only testing the happy path.** The unauthenticated and forbidden branches are
  the ones that protect data, and they are the cheapest to test.
- **Testing authorization only through the UI.** Hiding a button does not protect
  an action that anyone can POST to.
- **Asserting `updateTag` was called and stopping there.** Also check the visible
  result end to end, because a tag typo passes the unit test.
- **Reusing fixed test data in end-to-end tests.** Leftover rows and cached pages
  from a previous run make assertions pass for the wrong reason.
- **Calling `vi.mock()` inside `beforeEach`.** Vitest 5 throws. Set
  implementations in `beforeEach` instead.

## Related topics

- [Server Functions](../server-react/server-functions.md) — the React model behind `"use server"`.
- [Server Actions](../nextjs-mutations/server-actions.md) — how Next.js exposes and runs actions.
- [Server Actions authorization](../nextjs-security/server-actions-authorization.md) — why every action checks the session itself.
- [Revalidating after mutations](../nextjs-mutations/revalidating-after-mutations.md) — choosing between `updateTag`, `revalidateTag` and `refresh`.
- [Playwright](./playwright.md) — the setup project and production server the form test needs.
