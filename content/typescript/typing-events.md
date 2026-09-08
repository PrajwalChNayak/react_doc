---
title: Typing events
description: Type React's synthetic events, get the element generic right, and know why currentTarget is the one to trust.
group: typescript
order: 50
status: current
since: "19.0"
related: [typescript/typing-props, core-concepts/events, patterns/controlled-inputs, patterns/forms-and-actions]
---

## Overview

React does not hand your handler a DOM event. It hands you a `SyntheticEvent` —
a normalized wrapper with the same shape across browsers — and every specific
event type in `@types/react` extends it.

Each of those types takes a type parameter for the element the handler is
attached to. Getting that parameter right is what turns `event.currentTarget`
into something you can read `.value` from.

## Why it exists

Inline handlers infer everything from the JSX attribute, and most of the time
you write no annotations at all. The types matter the moment a handler moves out
of the JSX — into a named function, a `useCallback`, or a prop — because there
is nothing left to infer from.

## When to use it

Annotate a handler when it is declared apart from the element it is attached to.
Leave inline arrow functions alone; annotating them repeats what TypeScript
already knows and gets stale.

## When not to use it

Do not annotate with the *global* DOM event types. `MouseEvent` from `lib.dom`
and `MouseEvent` from `react` are different types, and importing the React one
shadows the global inside that file. If you need both in one file, alias:
`import type { MouseEvent as ReactMouseEvent } from 'react'`.

## Basic example

```tsx
import { useState } from 'react';
import type { ChangeEvent } from 'react';

export function EmailField() {
  const [email, setEmail] = useState('');

  // Extracted: needs an annotation.
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.currentTarget.value);
  }

  return (
    <>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" value={email} onChange={handleChange} />
      {/* Inline: inferred, no annotation needed. */}
      <button type="button" onClick={event => event.currentTarget.blur()}>
        Clear focus
      </button>
    </>
  );
}
```

## How it works

### The hierarchy

Everything descends from `SyntheticEvent<Target, NativeEvent>`, which itself
carries `preventDefault()`, `stopPropagation()`, `currentTarget`, `target`,
`type`, `timeStamp` and `nativeEvent`.

| Type | Fires on | Adds |
|---|---|---|
| `SyntheticEvent<T>` | anything | the base members |
| `MouseEvent<T>` | `onClick`, `onMouseDown`, `onContextMenu` | `clientX/Y`, `button`, `altKey`, `getModifierState` |
| `ChangeEvent<T>` | `onChange` | `target` narrowed to the same element type |
| `FormEvent<T>` | `onSubmit`, `onReset`, `onInvalid` | nothing; it is the base with a name |
| `KeyboardEvent<T>` | `onKeyDown`, `onKeyUp` | `key`, `code`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey`, `repeat` |
| `FocusEvent<T, R>` | `onFocus`, `onBlur` | `relatedTarget`, and `target` narrowed |
| `ClipboardEvent<T>` | `onCopy`, `onPaste`, `onCut` | `clipboardData` |
| `PointerEvent<T>` | `onPointerDown` and friends | `pointerId`, `pressure`, `pointerType` |
| `DragEvent<T>` | `onDragStart`, `onDrop` | `dataTransfer` |
| `WheelEvent<T>` | `onWheel` | `deltaX/Y/Z`, `deltaMode` |

The type parameter is the element type: `HTMLInputElement`,
`HTMLButtonElement`, `HTMLFormElement`, `HTMLTextAreaElement`,
`HTMLSelectElement`, `HTMLDivElement`. It defaults to `Element`, which has none
of the members you want, so always supply it.

> [!NOTE]
> Recent `@types/react` 19.2 releases add a dedicated `SubmitEvent<T>` and type
> `<form onSubmit>` with it, marking `FormEvent` as deprecated in favor of the
> more specific types. `FormEvent<HTMLFormElement>` still compiles and is what
> you will find in every existing codebase, so it is used throughout this page.

### `currentTarget` versus `target`

This is the distinction that costs people the most time.

- **`currentTarget`** is the element the handler is attached to. React types it
  as `EventTarget & T` — the type argument you supplied. It is correct by
  construction.
- **`target`** is the element the event originated on, which may be any
  descendant. On `SyntheticEvent` it is typed `EventTarget`, which has no
  `value`, no `dataset`, no `className`.

```tsx
import type { MouseEvent } from 'react';

export function Toolbar() {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    // currentTarget: the div. Fully typed.
    event.currentTarget.classList.add('toolbar--used');

    // target: could be the div, a button, or the <span> inside a button.
    // Narrow before using it.
    if (event.target instanceof HTMLButtonElement) {
      console.log('pressed', event.target.name);
    }
  }

  return (
    <div className="toolbar" onClick={handleClick}>
      <button type="button" name="bold">B</button>
      <button type="button" name="italic"><span>I</span></button>
    </div>
  );
}
```

`ChangeEvent` and `FocusEvent` are the exceptions: they narrow `target`
themselves, because a change or focus event on an input really does originate on
that input. That is why `event.target.value` works in a `ChangeEvent` handler
and nowhere else.

> [!BEST-PRACTICE]
> Read `event.currentTarget.value` even in a `ChangeEvent` handler. It is
> correct in every event type, so you never have to remember which ones narrow
> `target` and which do not.

### Handler prop types

When a handler is a prop, use the `*EventHandler<T>` aliases rather than writing
the function signature yourself:

```tsx
import type { MouseEventHandler, KeyboardEventHandler } from 'react';

type MenuItemProps = {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
};

export function MenuItem({ label, onClick, onKeyDown }: MenuItemProps) {
  return (
    <button type="button" role="menuitem" onClick={onClick} onKeyDown={onKeyDown}>
      {label}
    </button>
  );
}
```

Every one exists: `MouseEventHandler`, `ChangeEventHandler`,
`KeyboardEventHandler`, `FocusEventHandler`, `FormEventHandler`,
`ClipboardEventHandler`, `PointerEventHandler`, `DragEventHandler`,
`WheelEventHandler`, and `ReactEventHandler<T>` for the generic case.

`MouseEventHandler<HTMLButtonElement>` and
`(event: MouseEvent<HTMLButtonElement>) => void` are near-equivalent, but the
alias is declared with a bivariance escape hatch, so a caller may pass a handler
that accepts a *narrower* event. Writing the signature by hand under `strict`
gives you contravariant parameter checking and occasional surprising rejections.

> [!TIP]
> If a callback prop does not need the event at all, do not type it as an event
> handler. `onDismiss: () => void` is a better contract than
> `onDismiss: MouseEventHandler<HTMLButtonElement>`, because it does not commit
> the parent to being triggered by a mouse.

## Common patterns

### Keyboard handlers

`event.key` is a `string`, not a union — the set of possible values is open, so
the types cannot enumerate it. Compare against the standard names:

```tsx
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

export function TagInput({ onAdd }: { onAdd: (tag: string) => void }) {
  const [draft, setDraft] = useState('');

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const tag = draft.trim();
      if (tag) {
        onAdd(tag);
        setDraft('');
      }
    } else if (event.key === 'Escape') {
      setDraft('');
    }
  }

  return (
    <input
      value={draft}
      onChange={event => setDraft(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
      aria-label="Add a tag"
    />
  );
}
```

`event.key` uses the printed key name (`'Enter'`, `'Escape'`, `'ArrowDown'`);
`event.code` uses the physical key (`'Enter'`, `'Escape'`, `'KeyW'`). Use `key`
for text and command semantics, `code` for game-style position bindings.

### Select and textarea

The element generic changes, and so does what `value` means:

```tsx
import { useState } from 'react';
import type { ChangeEvent } from 'react';

type Priority = 'low' | 'normal' | 'high';

function isPriority(value: string): value is Priority {
  return value === 'low' || value === 'normal' || value === 'high';
}

export function TicketFields() {
  const [priority, setPriority] = useState<Priority>('normal');
  const [notes, setNotes] = useState('');

  function handlePriorityChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.currentTarget.value;
    if (isPriority(next)) setPriority(next);
  }

  function handleNotesChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNotes(event.currentTarget.value);
  }

  return (
    <>
      <label htmlFor="priority">Priority</label>
      <select id="priority" value={priority} onChange={handlePriorityChange}>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
      </select>

      <label htmlFor="notes">Notes</label>
      <textarea id="notes" value={notes} onChange={handleNotesChange} />
    </>
  );
}
```

A `<select>`'s `value` is always `string`. The type guard is not ceremony — it
is the only thing standing between the DOM's `string` and your `Priority` union.
Casting with `as Priority` would compile and then silently accept an option
someone adds to the markup later.

### Checkboxes

`checked` lives on the element, not the event, so you need the same
`currentTarget`:

```tsx
import { useState } from 'react';
import type { ChangeEvent } from 'react';

export function ConsentBox() {
  const [accepted, setAccepted] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setAccepted(event.currentTarget.checked);
  }

  return (
    <p>
      <input id="terms" type="checkbox" checked={accepted} onChange={handleChange} />
      <label htmlFor="terms">I accept the terms of service</label>
    </p>
  );
}
```

### Form submit and `FormData`

`FormData.get()` returns `FormDataEntryValue | null`, which is
`string | File | null`. Every field read needs a check, and that check is where
your validation belongs anyway:

```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';

type SignInFields = { email: string; password: string };

function readSignInFields(form: HTMLFormElement): SignInFields | null {
  const data = new FormData(form);
  const email = data.get('email');
  const password = data.get('password');
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  if (!email.includes('@') || password.length < 8) return null;
  return { email, password };
}

export function SignInForm({ onSignIn }: { onSignIn: (fields: SignInFields) => void }) {
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = readSignInFields(event.currentTarget);
    if (!fields) {
      setError('Enter a valid email and a password of at least 8 characters.');
      return;
    }
    setError(null);
    onSignIn(fields);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="signin-email">Email</label>
      <input id="signin-email" name="email" type="email" />

      <label htmlFor="signin-password">Password</label>
      <input id="signin-password" name="password" type="password" />

      {error && <p role="alert">{error}</p>}
      <button type="submit">Sign in</button>
    </form>
  );
}
```

`event.currentTarget` is the form, correctly typed as `HTMLFormElement`, which
is exactly what `new FormData(...)` wants. Using `event.target` here would be an
`EventTarget` and would not compile.

> [!WARNING]
> Do not hold on to `event.currentTarget` across an `await`. React clears it
> after the handler returns, so it reads as `null` in the async continuation.
> Capture what you need — `const form = event.currentTarget` before the first
> `await`, or read `FormData` synchronously.

### Clipboard

```tsx
import type { ClipboardEvent } from 'react';

export function PlainTextArea({ onPaste }: { onPaste: (text: string) => void }) {
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    onPaste(event.clipboardData.getData('text/plain'));
  }

  return <textarea onPaste={handlePaste} aria-label="Notes" />;
}
```

## Advanced example

A generic event delegation helper, typed so the handler receives both the
container and the resolved item:

```tsx
import type { MouseEvent, ReactNode } from 'react';

type Row = { id: string; label: string };

type RowListProps = {
  rows: readonly Row[];
  onActivate: (row: Row) => void;
  renderRow?: (row: Row) => ReactNode;
};

export function RowList({ rows, onActivate, renderRow }: RowListProps) {
  function handleClick(event: MouseEvent<HTMLUListElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest<HTMLButtonElement>('button[data-row-id]');
    if (!button || !event.currentTarget.contains(button)) return;

    const row = rows.find(candidate => candidate.id === button.dataset.rowId);
    if (row) onActivate(row);
  }

  return (
    <ul onClick={handleClick}>
      {rows.map(row => (
        <li key={row.id}>
          <button type="button" data-row-id={row.id}>
            {renderRow ? renderRow(row) : row.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

Three type-level facts carry this. `event.currentTarget` is
`HTMLUListElement` because of the generic argument. `event.target` is
`EventTarget` and must be narrowed with `instanceof` before `closest` exists.
And `closest<HTMLButtonElement>(...)` takes an explicit type argument because a
CSS selector string tells TypeScript nothing.

## Common mistakes

**Reading `event.target.value` on a `MouseEvent` or `KeyboardEvent`.** `target`
is `EventTarget` there and has no `value`. Use `currentTarget`.

**Omitting the element type parameter.** `ChangeEvent` alone is
`ChangeEvent<Element>`, and `currentTarget.value` does not exist on `Element`.

**Importing React's `MouseEvent` and then using `instanceof MouseEvent`.** The
import shadows the global constructor, and the check compares against a type
with no runtime value. Alias one of them.

**Annotating inline handlers.** `onChange={(e: ChangeEvent<HTMLInputElement>) =>
...}` on an `<input>` is inferred already. The annotation only creates a place
for the two to disagree.

**Using `event.persist()`.** It was needed for React 16's event pooling. Event
pooling was removed in React 17 and the method no longer does anything.

**Awaiting inside a submit handler and then reading `event.currentTarget`.**
It is `null` by then. Read the form or its `FormData` before the first `await`.

**Casting `event.currentTarget.value` to a union.** The DOM gives you a
`string`. Write a type guard, or the union is a comfortable fiction.

## Related topics

- [Events](../core-concepts/events.md) — synthetic events, delegation and batching at runtime.
- [Controlled inputs](../patterns/controlled-inputs.md) — the state side of every `onChange` here.
- [Forms and Actions](../patterns/forms-and-actions.md) — React 19 form actions, where you get `FormData` without a submit handler.
- [Typing props](./typing-props.md) — declaring the handler props this page types.
- [Form accessibility](../accessibility/forms-accessibility.md) — wiring the error messages these handlers produce.
