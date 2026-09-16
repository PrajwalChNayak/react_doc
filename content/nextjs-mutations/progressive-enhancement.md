---
title: Progressive enhancement
description: Which Next.js forms work before hydration and without JavaScript, what stops working, and how to test it.
group: nextjs-mutations
order: 60
status: current
related: [nextjs-mutations/forms, nextjs-mutations/optimistic-updates, server-react/ssr-and-hydration, hooks/use-form-status]
---

## Overview

A form whose `action` is a Server Action is rendered as a real HTML form. The
browser can submit it before the page hydrates, on a slow connection where the
JavaScript bundle is still downloading, or with JavaScript turned off entirely.

Next.js handles both paths with the same action:

| | JavaScript loaded | JavaScript not loaded yet | JavaScript disabled |
|---|---|---|---|
| `<form action={serverAction}>` in a **Server Component** | Action call, no page reload | Browser posts the form | Browser posts the form |
| `<form action={serverAction}>` in a **Client Component** | Action call, no page reload | Submission is queued and the form is prioritized for hydration | Browser posts the form |
| `useActionState(serverAction, …)` | Return value becomes state | Queued, as above | Full-page response renders with the returned state |
| `<form action={clientFunction}>` (a wrapper, `useOptimistic`) | Works | Waits for hydration | **Does nothing** |
| `onClick={() => serverAction()}` | Works | Nothing happens | **Does nothing** |
| `<Form action="/search">` from `next/form` | Client-side navigation | Native `GET` navigation | Native `GET` navigation |

The rule: **progressive enhancement holds when the thing passed to `action` or
`formAction` is a Server Action**, directly, bound with `.bind()`, or wrapped by
`useActionState`. Any client function in between needs JavaScript.

## Why it exists

Hydration is not instant. On a mid-range phone, a large page can be visible and
tappable for seconds before its JavaScript runs. A sign-in form that ignores taps
during that window fails exactly when users are most impatient.

JavaScript also fails for ordinary reasons: a blocked CDN, a browser extension, a
flaky network that drops one chunk. Forms that fall back to an HTML post keep the
core task working in all of these cases, with no separate code path to maintain.

## When to use it

- Sign in, sign out, sign up, checkout, contact and search: forms where failure
  costs you the user.
- Any form above the fold on a page that ships a lot of JavaScript.
- Admin and internal tools, where a plain round trip is an acceptable experience.

## When not to use it

- Interactions that only make sense with JavaScript: drag and drop, rich text
  editors, live previews. Do not contort them into forms.
- When optimistic UI is the whole point of the feature, such as a chat composer.
  Accept that it needs JavaScript, and say so with a `<noscript>` note.

## Basic example

This form keeps working without JavaScript, including its error message:

```tsx file="app/newsletter/signup-form.tsx"
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { subscribe, type SubscribeState } from './actions';

function SubmitButton() {
  // Only has an effect once hydrated. Before that, the browser's own loading
  // indicator is the feedback.
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Subscribing…' : 'Subscribe'}
    </button>
  );
}

const initialState: SubscribeState = { message: null, email: '' };

export function SignupForm() {
  // The action passed here is the Server Action itself, not a wrapper.
  const [state, formAction] = useActionState(subscribe, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required defaultValue={state.email} />
      <SubmitButton />
      {state.message ? <p role="status">{state.message}</p> : null}
    </form>
  );
}
```

```ts file="app/newsletter/actions.ts"
'use server';

import { z } from 'zod';
import { addSubscriber } from '@/lib/newsletter';

export type SubscribeState = { message: string | null; email: string };

const subscribeSchema = z.object({ email: z.email() });

export async function subscribe(
  _previousState: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const email = String(formData.get('email') ?? '');

  const parsed = subscribeSchema.safeParse({ email });
  if (!parsed.success) {
    return { message: 'Enter a valid email address.', email };
  }

  // A public form: no session to check, so limit abuse inside the helper
  // (rate limiting, double opt-in) rather than trusting the page.
  await addSubscriber(parsed.data.email);
  return { message: 'Check your inbox to confirm.', email: '' };
}
```

`required` and `type="email"` give instant feedback in the browser. The Zod check
is the one that counts, because a post without the page skips those attributes.

## How it works

### What React renders

When `action` is a Server Action, React's server renderer emits a `<form>` that
posts back to the page, plus hidden inputs that identify the action and any bound
arguments. When `action` is an ordinary client function, there is nothing a
browser could post, so the rendered form does nothing until JavaScript takes over.

### Before hydration

For a form in a Client Component, Next.js queues a submission that happens before
JavaScript has loaded and prioritizes that form for hydration. Once hydrated, it
runs the queued action the normal way, with no page reload. A form in a Server
Component has no hydration to wait for.

### Without JavaScript

The browser sends a normal form `POST`. Next.js decodes the action from the
submitted fields, runs it with the `FormData`, and responds with a full HTML page:

- **`redirect()`** in the action becomes a `303` response, so the browser follows
  it with a `GET`, and refreshing the result page does not repost the form.
- **Revalidation** is irrelevant to the browser, which receives a freshly rendered
  page anyway. Keep the calls: they are what makes the JavaScript path and other
  visitors see the change.
- **`useActionState`** gets the returned value as its state in that response, so
  validation messages render. React matches the response to the hook by the
  component's position in the tree, or by the `permalink` you pass as its third
  argument. See [useActionState](../hooks/use-action-state.md).

### What stops working

| Feature | Without JavaScript |
|---|---|
| `useOptimistic` | No optimistic item. The setter runs in a client function |
| `useFormStatus`, `isPending` | No pending UI. The browser shows its loading indicator |
| Client wrappers around an action | The form does nothing |
| `onChange` / `onBlur` validation | Only HTML attributes (`required`, `pattern`, `maxLength`) run |
| Controlled inputs | The server re-render resets them to their initial values |
| Uncontrolled inputs after an error | Keep values only if the action returns them for `defaultValue` |
| `<Form>` prefetching | None. Submission is a normal `GET` |

## Server and client implications

- Moving a form into a Client Component does **not** cost progressive enhancement,
  as long as `action` still receives a Server Action.
- A client wrapper does. The moment you write
  `action={async (formData) => { … await serverAction(formData) }}`, that form needs
  JavaScript.
- Everything the no-JavaScript response needs must be rendered on the server. Do
  not hide error messages behind client-only state.

## Common patterns

### Pending feedback that does not break the fallback

To show the submitted item while the action runs without writing a client wrapper,
read `useFormStatus().data` in a child of the form. The form's `action` stays a
Server Action, so it still works without JavaScript. With JavaScript, the pending
text appears immediately:

```tsx file="app/guestbook/entry-form.tsx"
'use client';

import { useFormStatus } from 'react-dom';
import { signGuestbook } from './actions';

function PendingEntry() {
  const { pending, data } = useFormStatus();
  if (!pending || !data) return null;

  const message = data.get('message');
  return (
    <p aria-live="polite" style={{ opacity: 0.5 }}>
      {typeof message === 'string' ? message : ''} (sending…)
    </p>
  );
}

export function EntryForm() {
  return (
    <form action={signGuestbook}>
      <label htmlFor="message">Message</label>
      <input id="message" name="message" required maxLength={280} />
      <button type="submit">Sign</button>
      <PendingEntry />
    </form>
  );
}
```

```ts file="app/guestbook/actions.ts"
'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';

const entrySchema = z.object({ message: z.string().trim().min(1).max(280) });

export async function signGuestbook(formData: FormData): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const parsed = entrySchema.safeParse({ message: formData.get('message') });
  if (!parsed.success) return;

  await db.guestbookEntry.create({
    data: { authorId: session.userId, message: parsed.data.message },
  });
  refresh();
}
```

This is not `useOptimistic`: the pending entry renders inside the form rather than
in the list. When the list must show the prediction in place, use
[Optimistic updates](./optimistic-updates.md) and accept the JavaScript
requirement.

### Say when JavaScript is required

If a form genuinely needs JavaScript, say so rather than rendering a button that
silently does nothing:

```tsx file="app/chat/composer-notice.tsx"
export function ComposerNotice() {
  return (
    <noscript>
      <p>Sending messages needs JavaScript. Enable it and reload the page.</p>
    </noscript>
  );
}
```

The [server-actions example app](../../examples/nextjs/server-actions/README.md)
does both: its sign-in and delete forms work without JavaScript, and its optimistic
add form shows a `<noscript>` note.

## Testing with JavaScript disabled

**In the browser.** In Chrome DevTools, open the Command Menu, run "Disable
JavaScript", and reload. Submit each form with valid and invalid input. Confirm
that errors render, that successful submissions land on the right page, and that
reloading the result page does not resubmit.

**On a slow connection.** Throttle the network in DevTools and submit a form while
the page is still loading. The submission should complete after hydration, not be
lost.

**In an end-to-end test.** Playwright can turn JavaScript off for a whole file:

```ts file="e2e/newsletter-no-js.spec.ts"
import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('newsletter signup works without JavaScript', async ({ page }) => {
  await page.goto('/newsletter');

  await page.getByLabel('Email').fill('reader@example.com');
  await page.getByRole('button', { name: 'Subscribe' }).click();

  await expect(page.getByRole('status')).toHaveText('Check your inbox to confirm.');
});

test('validation errors render without JavaScript', async ({ page }) => {
  await page.goto('/newsletter');

  // The browser's type="email" check accepts a dotless domain. Zod's z.email()
  // does not, so this reaches the server-side error path.
  await page.getByLabel('Email').fill('reader@localhost');
  await page.getByRole('button', { name: 'Subscribe' }).click();

  await expect(page.getByRole('status')).toHaveText('Enter a valid email address.');
});
```

Run it against a production build (`next build`, then `next start`) so the test
exercises what users get. The full setup is in [Playwright](../nextjs-testing/playwright.md).

## Common mistakes

**Wrapping the action in a client function "to add one line".** Logging, resetting
a ref or calling `useOptimistic` in a wrapper turns off the fallback for the whole
form.

**Invoking actions from `onClick` on a `type="button"`.** Use a submit button in a
form, or `formAction` on the button.

**Keeping errors only in client state.** Without JavaScript, only what the server
renders reaches the user. Return errors through `useActionState`.

**Relying on `required` and `maxLength` as validation.** They do not run for a
post that skips the page. Validate in the action.

**Controlled inputs in a form that must work without JavaScript.** The server's
response resets them. Use uncontrolled inputs with `defaultValue`.

**Testing only with a fast machine and JavaScript on.** The before-hydration and
no-JavaScript paths are never exercised. Add one no-JavaScript test per critical
form.

## Related topics

- [SSR and hydration](../server-react/ssr-and-hydration.md): why there is a window
  where HTML is visible and JavaScript is not running.
- [useFormStatus](../hooks/use-form-status.md): reading `pending` and `data` from
  the parent form.
- [useActionState](../hooks/use-action-state.md): the `permalink` argument for
  forms that post before hydration.
- [Forms](./forms.md): Server Actions on forms, and `next/form` for search.
- [Optimistic updates](./optimistic-updates.md): the feature this page trades
  against.
