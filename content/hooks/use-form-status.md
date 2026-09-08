---
title: useFormStatus
description: Read the submission status of the parent form from a component rendered inside it.
group: hooks
order: 190
status: current
since: "19.0"
related: [hooks/use-action-state, patterns/forms-and-actions, hooks/use-optimistic, accessibility/forms-accessibility]
---

## Overview

`useFormStatus` reports whether the **nearest parent `<form>`** is currently
submitting, and what it is submitting.

```text
import { useFormStatus } from 'react-dom';

const { pending, data, method, action } = useFormStatus();
```

| Field | Type | Meaning |
|---|---|---|
| `pending` | boolean | `true` while the parent `<form>` is submitting. |
| `data` | `FormData` or `null` | The data being submitted. `null` when there is no active submission or no parent form. |
| `method` | `'get'` \| `'post'` \| `null` | The HTTP method the parent form is submitting with. A `<form>` uses `GET` by default. |
| `action` | function or `null` | The function passed to the parent form's `action` prop. `null` if `action` is a URI string or absent. |

Note the import: `react-dom`, not `react`. It is a DOM-specific Hook.

> [!WARNING]
> `useFormStatus` returns status for a **parent** `<form>` only. Calling it in
> the same component that renders the `<form>` returns the idle state forever.
> This is the single most common mistake with this Hook.

## Why it exists

A design system needs a `<SubmitButton>` that disables itself and shows a
spinner during submission. The button does not own the submission — the form
does. Without `useFormStatus` you have three bad options: drill an `isPending`
prop through every layer, build a context provider per form, or give up and let
users double-submit.

`useFormStatus` makes the form's status ambient to its subtree, in the same way
that the browser makes a form's `<fieldset disabled>` ambient. Your button
component becomes genuinely reusable — it works in any form, with no props.

## When to use it

- Shared submit buttons, spinners and progress indicators in a design system.
- Disabling a group of inputs while a submission is in flight.
- Rendering a summary of what is being submitted, from `data`.
- Any descendant that needs to react to submission but should not know how the
  form is wired.

## When not to use it

- **In the component that renders the `<form>`.** Use the `isPending` value from
  [`useActionState`](./use-action-state.md), or `useTransition`, there.
- **For non-form async work.** A button that starts a background job has no
  parent form; use [`useTransition`](./use-transition.md).
- **To read form values as the user types.** `data` is only populated during a
  submission. For live values use controlled inputs or the `onChange` event.
- **With a form that submits through `onSubmit` and `preventDefault`.** The
  status is tied to the `action` prop. A hand-rolled `onSubmit` handler does not
  produce a pending state.

## Basic example

The canonical `SubmitButton`. It takes no props about the form, yet it knows.

```jsx live
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';

function SubmitButton({ children }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Saving…' : children}
    </button>
  );
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function RenameForm() {
  const [savedName, saveName] = useActionState(async (previousName, formData) => {
    await delay(900);
    return String(formData.get('projectName') ?? previousName);
  }, 'Untitled project');

  return (
    <form action={saveName}>
      <label>
        Project name{' '}
        <input name="projectName" defaultValue={savedName} />
      </label>{' '}
      <SubmitButton>Rename</SubmitButton>
      <p>Saved as: {savedName}</p>
    </form>
  );
}
```

`SubmitButton` is rendered *inside* `<form>`, so its `useFormStatus` call finds
the form above it. Move that same component up next to the `<form>` element and
`pending` stays `false`.

## How it works

React tracks the submission that is in flight for each `<form>` whose `action`
prop is a function. `useFormStatus` subscribes the calling component to the
closest form ancestor in the React tree and re-renders it when that status
changes.

The lookup is **strictly upward**. React does not look at forms rendered by the
calling component or by its children. That is not an implementation accident —
a component that renders a form could not meaningfully "have" a status, since it
might render several.

**Lifecycle of `pending`.** It flips to `true` when the action starts and back
to `false` when the action's promise settles, success or failure. Submissions
run inside a transition, so the rest of the UI stays responsive.

**StrictMode.** Nothing special. `useFormStatus` reads external status rather
than owning state, so double-invoked renders read the same value twice.

**`data` is a snapshot.** During submission it holds the `FormData` React
collected. Read it with `data.get('field')`, and guard for `null` — outside a
submission it is `null`.

## Common patterns

### Rendering what is being submitted

```jsx live
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

function PendingSummary() {
  const { pending, data } = useFormStatus();
  if (!pending) {
    return <p>Idle.</p>;
  }
  return <p>Sending “{String(data?.get('message') ?? '')}”…</p>;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function BroadcastForm() {
  const [sentCount, send] = useActionState(async previousCount => {
    await delay(1200);
    return previousCount + 1;
  }, 0);

  return (
    <form action={send}>
      <input name="message" defaultValue="Deploy finished" />{' '}
      <button type="submit">Send</button>
      <PendingSummary />
      <p>Messages sent: {sentCount}</p>
    </form>
  );
}
```

`data` is typed as `FormData | null`, so the optional chain is not decoration —
TypeScript requires it, and it is correct at runtime.

### Disabling a whole group of inputs

`<fieldset disabled>` is one attribute and it covers every control inside.

```jsx
import { useFormStatus } from 'react-dom';

export default function FormFields({ children }) {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={pending} style={{ border: 0, padding: 0 }}>
      {children}
    </fieldset>
  );
}
```

### Typing the Hook

```tsx
import { useFormStatus } from 'react-dom';

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

export function SubmitButton({ idleLabel, pendingLabel }: SubmitButtonProps) {
  const status = useFormStatus();

  return (
    <button type="submit" disabled={status.pending} aria-busy={status.pending}>
      {status.pending ? pendingLabel : idleLabel}
    </button>
  );
}
```

`useFormStatus` returns a discriminated union: when `pending` is `false`, `data`,
`method` and `action` are all `null`. Narrow on `pending` before reading them
rather than reaching for `as`.

## Advanced example

A design-system form shell. The status is consumed at three different depths and
no `isPending` prop is passed anywhere.

```jsx static="Posts to a real endpoint, so there is no browser preview."
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

function ProgressBar() {
  const { pending } = useFormStatus();
  return (
    <div
      aria-hidden="true"
      style={{ height: 3, background: pending ? '#2563eb' : 'transparent' }}
    />
  );
}

function Fields() {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={pending}>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" />
      <label htmlFor="body">Body</label>
      <textarea id="body" name="body" />
    </fieldset>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Publishing…' : 'Publish'}
    </button>
  );
}

export default function ArticleEditor() {
  const [message, publish] = useActionState(async (previousMessage, formData) => {
    const response = await fetch('/api/articles', {
      method: 'POST',
      body: formData,
    });
    return response.ok ? 'Published.' : 'Publishing failed. Try again.';
  }, '');

  return (
    <form action={publish}>
      <ProgressBar />
      <Fields />
      <SubmitButton />
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
```

Because `ProgressBar`, `Fields` and `SubmitButton` know nothing about this
particular form, the same three components serve every form in the application.

## Common mistakes

**Calling it in the component that renders the form.**

```jsx
import { useFormStatus } from 'react-dom';

export default function BrokenForm({ saveSettings }) {
  // 🔴 `pending` is always false: the form below is not a parent.
  const { pending } = useFormStatus();

  return (
    <form action={saveSettings}>
      <input name="theme" />
      <button disabled={pending}>Save</button>
    </form>
  );
}
```

Extract the button into its own component, or read `isPending` from
[`useActionState`](./use-action-state.md) at this level.

**Importing from `react`.** It lives in `react-dom`. The import error is quiet
in some bundlers.

**Reading `data` without a null check.** Outside a submission it is `null`.
TypeScript catches this; JavaScript will not.

**Expecting it to work with `onSubmit`.** If you write
`<form onSubmit={e => { e.preventDefault(); ... }}>` there is no React-managed
submission, so `pending` never becomes `true`. Move the work into the `action`
prop.

**Assuming `action` is always a function.** If the form has a string `action`
(a URL) or none at all, `status.action` is `null`.

**Nesting forms to scope status.** HTML forbids nested `<form>` elements. To
scope status, scope components.

## Related topics

- [useActionState](./use-action-state.md) — the result and pending state at the
  level of the component that owns the form.
- [Forms and actions](../patterns/forms-and-actions.md) — how `<form action>`
  works in React 19.
- [useOptimistic](./use-optimistic.md) — show the expected outcome while
  `pending` is true.
- [Forms accessibility](../accessibility/forms-accessibility.md) — `aria-busy`,
  `role="status"` and announcing submission results.
