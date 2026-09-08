---
title: Forms and Actions
description: Passing a function to form action, and the React 19 hooks for pending state, results and optimistic UI.
group: patterns
order: 50
status: current
since: "19.0"
related: [hooks/use-action-state, hooks/use-form-status, hooks/use-optimistic, patterns/controlled-inputs]
---

## Overview

Since **19.0** you can pass a function to a form's `action` prop. React calls it
with the form's `FormData`:

```jsx live
import { useState } from 'react';

export default function SearchForm() {
  const [lastSearch, setLastSearch] = useState('');

  function search(formData) {
    setLastSearch(String(formData.get('query') ?? ''));
  }

  return (
    <div>
      <form action={search}>
        <input name="query" defaultValue="react 19" />
        <button type="submit">Search</button>
      </form>
      {lastSearch ? <p>You searched for “{lastSearch}”.</p> : null}
    </div>
  );
}
```

No `onSubmit`, no `event.preventDefault()`, no state for the field. A function
passed this way is called an **Action**, and React gives you four things for
free:

1. The submission is wrapped in a [transition](../hooks/use-transition.md), so
   the UI stays responsive while it runs.
2. Pending state is tracked and readable with `useFormStatus`.
3. Uncontrolled fields in the form are reset after the action succeeds.
4. Errors thrown inside the action reach the nearest
   [error boundary](./error-boundaries.md).

Three hooks build on that: `useActionState` for the result, `useFormStatus` for
the pending flag deep in the tree, and `useOptimistic` for the predicted UI.

## Why it exists

Every React form before 19 wrote the same twenty lines: `preventDefault`, a
`useState` per field, an `isSubmitting` flag, an `error` state, a `try/finally`,
and a manual reset. That is plumbing, and everyone reimplemented it slightly
differently.

Actions move the plumbing into React. What is left is the part that is actually
yours — the function that takes form data and does something with it.

The second reason is progressive enhancement. An `onSubmit` handler needs
JavaScript to have loaded before it does anything. A `<form action>` is a real
form; with Server Functions, a submission that happens before hydration is
handled by the server.

## When to use it

- Any form that submits something: create, update, delete, search, sign in.
- Anywhere you were about to write `const [isSubmitting, setIsSubmitting]`.
- Server Functions — an action can be a `"use server"` function, and `onSubmit`
  cannot.
- Multi-button forms, using `formAction` per button.

## When not to use it

- **You need the submit event.** Actions receive `FormData`, not the event.
  If you need `event.currentTarget`, `submitter`, or you must conditionally
  cancel the submit, keep `onSubmit`.
- **Nothing is submitted.** A filter panel that updates a list as you type is
  state, not a form action.
- **The form is fully controlled and never resets.** The automatic reset only
  touches uncontrolled fields, so you gain less.

## Basic example

`useActionState` gives you the value your action returned, plus a pending flag.
Its shape is reducer-like on purpose: the action receives the previous state and
the payload.

```text
const [state, formAction, isPending] = useActionState(action, initialState, permalink?);

async function action(previousState, formData) { ... }
```

- `action` — called with the previous state and the `FormData`. May be async.
- `initialState` — the value of `state` before the first submission.
- `permalink` — an optional URL, for progressive enhancement with Server
  Functions.
- `formAction` — pass this to `<form action>` or a `formAction` prop.
- `isPending` — true while an action dispatched by this hook is running.

Returning your errors as state, instead of throwing them, is what makes
validation feel ordinary:

```jsx live
import { useActionState } from 'react';

async function subscribe(previousState, formData) {
  const email = String(formData.get('email') ?? '').trim();

  if (!email.includes('@')) {
    return { status: 'error', message: 'Enter a valid email address.' };
  }

  await new Promise((resolve) => { setTimeout(resolve, 600); });

  if (email.endsWith('@example.com')) {
    return { status: 'error', message: 'That domain is already subscribed.' };
  }

  return { status: 'success', message: `Confirmation sent to ${email}.` };
}

export default function SubscribeForm() {
  const [state, formAction, isPending] =
    useActionState(subscribe, { status: 'idle', message: '' });

  return (
    <form action={formAction} style={{ display: 'grid', gap: 8 }}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Subscribing…' : 'Subscribe'}
      </button>
      {state.status !== 'idle' ? (
        <p role="status" style={{ color: state.status === 'error' ? '#b91c1c' : '#15803d' }}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
```

Submit an invalid address and the field keeps its value — React only resets the
form when the action completes successfully. Submit a valid one and the field
clears.

> [!NOTE]
> During the React 19 canaries this hook was `ReactDOM.useFormState`. It was
> renamed and moved before the stable release: import `useActionState` from
> `react`. The old name is gone — if you followed a canary-era tutorial, this is
> the rename you are looking for.

## How it works

### The transition

React calls your action inside a transition, which is what makes the pending
flags real: `isPending` and `useFormStatus().pending` both read it. Updates
inside the action are non-urgent, so the page stays interactive while it awaits
the network.

Thrown errors go to the nearest error boundary — they are not swallowed and not
returned. Throw for the unexpected (a 500, a bug); return for the expected (a
validation failure, a conflict).

### The automatic reset

After the action returns without throwing, React resets every **uncontrolled**
field, the same as `form.reset()`. Controlled inputs are untouched, because
their value comes from your state. A failed submit resets nothing, which is why
"keep the values on error" needs no code.

> [!WARNING]
> If you want values to survive a *successful* submit — a "log another entry"
> form — control those fields, or return their values in the action state and
> render them back.

Passing a **string** to `action` keeps native browser behavior. Passing a
function forces the HTTP method to POST regardless of the `method` prop.

### useFormStatus

`useFormStatus` reads the state of the **parent** `<form>`. It exists so a
submit button buried three components deep does not need the pending flag passed
down to it.

```text
const { pending, data, method, action } = useFormStatus();
```

| Field | Type | Meaning |
|---|---|---|
| `pending` | boolean | The parent form is submitting |
| `data` | `FormData` or `null` | The data being submitted |
| `method` | `'get'` or `'post'` | The parent form's method |
| `action` | function or `null` | The function passed to the form's `action` |

It is imported from `react-dom`, not `react`, because it is a DOM concern.

> [!WARNING]
> `useFormStatus` only sees a form **above** the component that calls it. A
> component that renders its own `<form>` and calls the hook gets
> `pending: false` forever. Put the hook in a child.

```jsx live
import { useFormStatus } from 'react-dom';

function SubmitButton({ children }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Saving…' : children}</button>;
}

function Fields() {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={pending} style={{ border: 'none', padding: 0 }}>
      <label htmlFor="name">Display name </label>
      <input id="name" name="name" defaultValue="Ada Okoye" />
    </fieldset>
  );
}

export default function ProfileForm() {
  async function saveProfile(formData) {
    await new Promise((resolve) => { setTimeout(resolve, 800); });
    console.log('Saved', formData.get('name'));
  }

  return (
    <form action={saveProfile} style={{ display: 'grid', gap: 8 }}>
      <Fields />
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}
```

Both children read the same status without a single prop. Disabling the whole
`<fieldset>` while pending prevents edits mid-flight and is announced correctly
by screen readers.

## Common patterns

### Two actions in one form

`formAction` on a `<button>`, `<input type="submit">` or `<input type="image">`
overrides the form's own `action` for that button. The rest of the form —
fields, validation, reset — is shared.

```jsx live
import { useState } from 'react';

export default function PostEditor() {
  const [log, setLog] = useState([]);
  const record = (label) => (formData) =>
    setLog((entries) => [...entries, `${label}: ${formData.get('content')}`]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <form action={record('Published')} style={{ display: 'grid', gap: 8 }}>
        <textarea name="content" rows={2} aria-label="Post" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit">Publish</button>
          <button type="submit" formAction={record('Draft saved')}>Save draft</button>
        </div>
      </form>
      <ul>{log.map((entry, index) => <li key={index}>{entry}</li>)}</ul>
    </div>
  );
}
```

The alternative — one action plus a hidden `intent` field read from `FormData` —
also works, and is better when the two paths share most of their logic.

### Calling an action outside a form

`formAction` from `useActionState` is a normal function. You can call it from an
`onClick`, as long as you are inside a transition — which React arranges when it
is passed to `action` or `formAction`, and which you arrange yourself otherwise
with [`startTransition`](../hooks/use-transition.md).

### Progressive enhancement and `permalink`

With Server Functions, a form works before the JavaScript bundle loads: the
browser posts natively, the server runs the action, and the page comes back
rendered. After hydration the same action runs client-side with no navigation.

The `permalink` argument covers the pre-hydration case. React sends the browser
to that URL instead of the current one, so render the same form component — same
action, same `permalink` — on the destination page and React passes the state
through. Once the page is interactive the argument has no effect.

```jsx static="Uses a Server Function — needs a server and an RSC-capable bundler."
'use client';

import { useActionState } from 'react';
import { addToWaitlist } from './actions.js';

export function WaitlistForm({ productSlug }) {
  const [state, formAction] = useActionState(addToWaitlist, { message: '' },
    `/products/${productSlug}/waitlist`);

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <button type="submit">Join the waitlist</button>
      <p role="status">{state.message}</p>
    </form>
  );
}
```

`initialState` must be serializable when the action is a Server Function.

## Advanced example

All three hooks in one realistic form: the comment appears immediately, the
button reports pending, and a rejected comment comes back as a validation error
with the text preserved.

```jsx live
import { useActionState, useOptimistic } from 'react';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Posting…' : 'Post comment'}
    </button>
  );
}

const INITIAL = {
  comments: [{ id: 1, author: 'Ada', text: 'Does this handle nested replies?' }],
  error: null,
};

export default function CommentThread() {
  const [state, formAction] = useActionState(postComment, INITIAL);

  const [optimisticComments, addOptimisticComment] = useOptimistic(
    state.comments,
    (current, text) => [...current, { id: 'pending', author: 'You', text }],
  );

  async function postComment(previousState, formData) {
    const text = String(formData.get('text') ?? '').trim();

    if (text.length < 3) {
      return { comments: previousState.comments, error: 'Comments need at least 3 characters.' };
    }

    addOptimisticComment(text);
    await new Promise((resolve) => { setTimeout(resolve, 900); });

    if (text.toLowerCase().includes('http')) {
      return { comments: previousState.comments, error: 'Links are not allowed.' };
    }

    return {
      comments: [
        ...previousState.comments,
        { id: previousState.comments.length + 1, author: 'You', text },
      ],
      error: null,
    };
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
      <ul style={{ display: 'grid', gap: 6, padding: 0, listStyle: 'none' }}>
        {optimisticComments.map((comment) => (
          <li
            key={comment.id}
            style={{ padding: 8, background: '#f4f4f5', opacity: comment.id === 'pending' ? 0.55 : 1 }}
          >
            <strong>{comment.author}:</strong> {comment.text}
          </li>
        ))}
      </ul>

      <form action={formAction} style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="text">Add a comment</label>
        <textarea id="text" name="text" rows={2} />
        <SubmitButton />
        {state.error ? (
          <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{state.error}</p>
        ) : null}
      </form>
    </div>
  );
}
```

Three behaviors to notice:

**The optimistic comment appears instantly and needs no cleanup.**
`useOptimistic` renders its computed value only while an action is pending; when
the transition completes, the real and optimistic states converge in the same
render, so there is no flash.

**Order inside the action matters.** Cheap local checks run before
`addOptimisticComment`, so a too-short comment never shows a phantom entry.

**A rejected comment leaves the textarea filled**, because the action returned
an error object instead of throwing — no success, no reset. Returning
`previousState.comments` alongside the error is required: the action state is
the whole list, so every return value must carry it.

## Common mistakes

**Calling `event.preventDefault()`.** There is no event. If you find yourself
wanting one, you want `onSubmit`, not an action.

**Throwing for validation.** A thrown error unmounts the subtree into an error
boundary and cancels every queued action. Return the error as state.

**`useFormStatus` in the component that renders the form.** It reads the parent
form. Extract the button.

**Importing `useFormStatus` from `react`.** It lives in `react-dom`.

**Expecting controlled fields to clear.** The automatic reset only applies to
uncontrolled fields.

**Forgetting `name` on the inputs.** `FormData` is keyed by `name`. An input
with only an `id` submits nothing, and an unchecked checkbox is absent entirely.

**Losing part of the state on an error return.** The action returns the complete
next state, so an error branch returning `{ error }` alone wipes the data.

**Reaching for `useActionState` when you only need pending state.** If nothing
renders from the return value, `useFormStatus` on a child is enough.

**Using `useOptimistic` outside an action.** The optimistic value only applies
while a transition is pending.

## Related topics

- [useActionState](../hooks/use-action-state.md) — the full reference, including
  queuing and error semantics.
- [useFormStatus](../hooks/use-form-status.md) — every field it returns and its
  caveats.
- [useOptimistic](../hooks/use-optimistic.md) — how the optimistic value is
  computed and reverted.
- [Controlled and uncontrolled inputs](./controlled-inputs.md) — why
  uncontrolled fields pair naturally with `FormData`.
- [Server functions](../server-react/server-functions.md) — actions that run on
  the server, and progressive enhancement.
