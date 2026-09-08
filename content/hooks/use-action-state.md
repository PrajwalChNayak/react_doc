---
title: useActionState
description: Hold the result of a form action in state and track whether it is pending.
group: hooks
order: 180
status: current
since: "19.0"
related: [hooks/use-form-status, hooks/use-optimistic, patterns/forms-and-actions, hooks/use-transition]
---

## Overview

`useActionState` wraps an action function so that its return value becomes
state, and gives you a pending flag for free.

```text
const [state, formAction, isPending] = useActionState(action, initialState, permalink?);
```

| Position | Name | What it is |
|---|---|---|
| 1 | `state` | `initialState` until the action returns; then the action's return value. |
| 2 | `formAction` | The wrapped action. Pass it to `<form action>`, `<button formAction>`, or call it directly. |
| 3 | `isPending` | `true` while a dispatched action is in flight. |

The action you pass receives **two** arguments:

```text
async function action(previousState, payload) { ... }
```

When `formAction` is used as a form's `action`, `payload` is the `FormData`.
When you call `formAction(value)` yourself, `payload` is whatever you passed.

> [!DEPRECATED]
> In the React 19 Canary releases this Hook was `ReactDOM.useFormState`. It was
> renamed to `React.useActionState` for **19.0** and `useFormState` was
> deprecated. Change the import from `react-dom` to `react` and note that the
> new Hook returns a **third** element, `isPending`, which the old one did not.
>
> The codemod `npx codemod@latest react/19/migration-recipe` handles the rename.

## Why it exists

Every form has the same four pieces of state: the values, whether a submit is in
flight, the error the server returned, and the success result. Before React 19
you assembled those by hand — a `useState` per field, an `isSubmitting` boolean,
a `try`/`catch`/`finally` in an `onSubmit` handler, and a race condition if the
user submitted twice.

`useActionState` collapses that. React runs the action inside a transition, so
`isPending` is maintained for you, queued submissions run **sequentially** with
each action receiving the previous action's result, and the return value lands
in state without a `setState` call.

The second benefit only matters with Server Functions: because the wiring lives
on the `<form>` element rather than in an `onSubmit` handler, the form can
submit before JavaScript loads. That is what `permalink` is for.

## When to use it

- Any form whose submission produces a result you need to render — a validation
  error, a confirmation, a created record's id.
- Server Function submissions, where you want progressive enhancement.
- Sequential operations where each attempt should see the previous result,
  such as a retry counter or an accumulating error list.

## When not to use it

- **Pure client state.** A search box that filters a local array wants
  `useState`, not an action.
- **When you only need the pending flag inside a child component.** A submit
  button rendered inside the form should read
  [`useFormStatus`](./use-form-status.md) instead of receiving `isPending` as a
  prop.
- **Non-form async work.** A "load more" button is
  [`useTransition`](./use-transition.md) territory.
- Inside loops or conditions. `useActionState` is a real Hook and obeys the
  [rules of Hooks](./rules-of-hooks.md) — only `use` is exempt.

## Basic example

Validation error returned as state, pending flag driving the button:

```jsx live
import { useActionState } from 'react';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Stands in for a server call so the example stays self-contained.
async function subscribe(previousState, formData) {
  const email = String(formData.get('email') ?? '').trim();
  await delay(700);

  if (!email.includes('@')) {
    return { message: 'Enter a valid email address.', email, ok: false };
  }
  return { message: `Subscribed ${email}.`, email: '', ok: true };
}

export default function SubscribeForm() {
  const [state, formAction, isPending] = useActionState(subscribe, {
    message: '',
    email: '',
    ok: false,
  });

  return (
    <form action={formAction}>
      <label>
        Email{' '}
        <input name="email" type="text" defaultValue={state.email} />
      </label>{' '}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Subscribing…' : 'Subscribe'}
      </button>
      {state.message ? (
        <p style={{ color: state.ok ? '#15803d' : '#b91c1c' }}>{state.message}</p>
      ) : null}
    </form>
  );
}
```

Two details worth copying. The action returns the submitted `email` on failure
so the field can be repopulated with `defaultValue` — an uncontrolled form that
still survives a round trip. And the action never throws for a validation
failure; it *returns* the failure. Throwing would send you to the error
boundary.

## How it works

React registers the wrapped action with the form. On submit:

1. React collects the `FormData`.
2. It starts a transition and sets `isPending` to `true`.
3. It calls `action(currentState, formData)`.
4. When the returned promise settles, the resolved value becomes the new
   `state` and `isPending` returns to `false`.

Because step 2 is a transition, the update is non-urgent: React keeps the
current UI interactive while the action runs.

**Queueing.** Multiple dispatches are queued and executed in order, and each
call receives the result of the previous one. You do not have to guard against
double submits for correctness — though disabling the button is still better UX.

**Throwing.** If the action throws, React cancels all queued actions and shows
the nearest [error boundary](../patterns/error-boundaries.md). Reserve throwing
for genuine faults; return expected failures as state.

**StrictMode.** The action runs once per dispatch, not twice — it is an event
response, not a render. StrictMode's double-invocation affects render and
Effects, not actions.

**Serializability.** With a Server Function, `initialState` has to be
serializable, because it may be sent across the boundary.

## Common patterns

### Progressive enhancement with `permalink`

`permalink` is a URL string. If the action is a Server Function and the form is
submitted before the JavaScript bundle has loaded, the browser navigates to that
URL instead of the current one, and React reconnects the state on the
destination page.

```jsx static="Requires a Server Function and an RSC-capable framework."
'use client';

import { useActionState } from 'react';
import { updateProfile } from './actions.js';

export default function ProfileForm({ userId }) {
  const [state, formAction, isPending] = useActionState(
    updateProfile,
    { error: '' },
    `/users/${userId}/settings`
  );

  return (
    <form action={formAction}>
      <input name="displayName" defaultValue="" />
      <button disabled={isPending}>Save</button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```

Two requirements: render the same form component on the destination page, with
the same action and the same `permalink`, or React cannot hand the state
through. Once the page is interactive, the parameter has no effect.

### Field-level server validation

Return a map of field errors rather than a single string. It scales to real
forms and keeps the messages next to their inputs.

```tsx
import { useActionState } from 'react';

type FormState = {
  fieldErrors: Record<string, string>;
  submittedName: string;
};

const initialState: FormState = { fieldErrors: {}, submittedName: '' };

async function createWorkspace(
  previousState: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim();
  const fieldErrors: Record<string, string> = {};

  if (name.length < 3) {
    fieldErrors.name = 'Use at least 3 characters.';
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    fieldErrors.slug = 'Lowercase letters, numbers and dashes only.';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, submittedName: name };
  }

  return { fieldErrors: {}, submittedName: name };
}

export function WorkspaceForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createWorkspace,
    initialState
  );

  return (
    <form action={formAction}>
      <label htmlFor="workspace-name">Name</label>
      <input id="workspace-name" name="name" defaultValue={state.submittedName} />
      {state.fieldErrors.name ? (
        <p role="alert">{state.fieldErrors.name}</p>
      ) : null}

      <label htmlFor="workspace-slug">Slug</label>
      <input id="workspace-slug" name="slug" />
      {state.fieldErrors.slug ? (
        <p role="alert">{state.fieldErrors.slug}</p>
      ) : null}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
  );
}
```

Passing the type arguments explicitly (`<FormState, FormData>`) picks the
two-argument overload and keeps `formAction` typed as
`(payload: FormData) => void`.

### Calling the action without a form

`formAction` is an ordinary function. Dispatch it from a click handler when
there is no form to submit — the payload is then whatever you pass.

```jsx
import { useActionState } from 'react';

/**
 * @param {number} previousCount
 * @param {number} delta
 */
async function applyVote(previousCount, delta) {
  return previousCount + delta;
}

export default function VoteButtons() {
  const [count, vote, isPending] = useActionState(applyVote, 0);

  return (
    <p>
      <button onClick={() => vote(-1)} disabled={isPending}>
        Downvote
      </button>{' '}
      {count}{' '}
      <button onClick={() => vote(1)} disabled={isPending}>
        Upvote
      </button>
    </p>
  );
}
```

Each queued call receives the result of the one before it, so rapid clicks
accumulate correctly instead of racing.

## Advanced example

The full shape of a production form: action state for the result,
[`useFormStatus`](./use-form-status.md) for the button, and
[`useOptimistic`](./use-optimistic.md) for the list.

```jsx static="Submits to a real endpoint, so there is no browser preview."
import { useActionState, useOptimistic } from 'react';
import { useFormStatus } from 'react-dom';

function SubmitButton({ label }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Sending…' : label}
    </button>
  );
}

export default function CommentBox({ comments }) {
  const [optimisticComments, addOptimisticComment] = useOptimistic(
    comments,
    (current, text) => [...current, { id: 'pending', text, pending: true }]
  );

  const [error, submitComment] = useActionState(async (previousError, formData) => {
    const text = String(formData.get('text') ?? '').trim();
    if (!text) {
      return 'Write something first.';
    }

    addOptimisticComment(text);

    const response = await fetch('/api/comments', {
      method: 'POST',
      body: JSON.stringify({ text }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return 'Could not post your comment. Try again.';
    }
    return '';
  }, '');

  return (
    <>
      <ul>
        {optimisticComments.map(comment => (
          <li key={comment.id} style={{ opacity: comment.pending ? 0.5 : 1 }}>
            {comment.text}
          </li>
        ))}
      </ul>
      <form action={submitComment}>
        <input name="text" />
        <SubmitButton label="Post comment" />
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </>
  );
}
```

`addOptimisticComment` is called inside the action, which is a transition — that
is the requirement `useOptimistic` imposes.

## Common mistakes

**Getting the argument order backwards.** The action's first parameter is the
**previous state**, the second is the payload. Writing
`async (formData) => ...` silently reads the state object as if it were form
data.

**Forgetting `isPending` is the third element.** `const [state, formAction] =`
is valid and silently discards it. If you migrated from the Canary-era Hook
described in the callout above, the third slot is new.

**Throwing for validation.** A thrown error tears down to the error boundary and
loses the form. Return the message as state.

**Reading `isPending` in the wrong place.** `isPending` belongs to the component
that calls the Hook. A `<SubmitButton>` rendered inside the form should call
[`useFormStatus`](./use-form-status.md) rather than take a prop.

**Using controlled inputs and then wondering why they reset.** With
`useActionState` the natural shape is uncontrolled inputs plus `defaultValue`
seeded from the returned state. Mixing in `value`/`onChange` for every field
gives up most of the benefit.

**Expecting `initialState` to be reapplied.** React ignores `initialState` after
the first dispatch. To reset a form, return the empty state from the action.

## Related topics

- [useFormStatus](./use-form-status.md) — pending state for a child of the form,
  without prop drilling.
- [useOptimistic](./use-optimistic.md) — render the expected result while the
  action runs.
- [Forms and actions](../patterns/forms-and-actions.md) — the wider form story,
  including plain `<form action>` without this Hook.
- [useTransition](./use-transition.md) — the same pending mechanics for
  non-form work.
- [Server Functions](../server-react/server-functions.md) — what makes
  `permalink` and progressive enhancement possible.
