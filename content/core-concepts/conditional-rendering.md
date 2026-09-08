---
title: Conditional rendering
description: Choosing what to render with if, ternaries and logical AND, and what happens to state when a branch disappears.
group: core-concepts
order: 60
status: current
related: [core-concepts/jsx, core-concepts/rendering, performance/activity]
---

## Overview

React has no template directives — no `v-if`, no `*ngIf`, no `{{#if}}`. JSX is
JavaScript, so you branch with the language: `if`, the ternary operator, `&&`,
and early returns.

```jsx
export function DeliveryStatus({ delivered }) {
  if (delivered) {
    return <p>Delivered</p>;
  }
  return <p>In transit</p>;
}
```

Whatever your branch produces gets rendered. `null`, `undefined`, `true` and
`false` render nothing, which is what makes the shorter forms work.

## Why it exists

There is nothing to invent. A component returns a value; conditionals choose the
value. The consequence is that everything you know about JavaScript conditions
applies, including the type coercion rules that cause the one real trap on this
page.

The second thing worth understanding is what conditionals do to the tree.
Rendering `null` instead of a component **unmounts** it: its state is destroyed
and its Effects are cleaned up. Conditional rendering is not a visibility switch.

## When to use it

Use conditional rendering when the branches are genuinely different UI, or when
the hidden branch should be forgotten: a modal that starts fresh each time, an
error message, a route that is not active.

## When not to use it

Do not use it as a way to hide something you want to keep. Tabs that should
remember their scroll position and form drafts, a details panel the user toggles
constantly, a route you expect them to come back to — those want
[`<Activity mode="hidden">`](../performance/activity.md), which preserves state
and DOM.

Do not use CSS `display: none` for this either. The DOM stays, but the Effects
keep running: timers keep firing, subscriptions stay open, and an off-screen
component keeps doing work.

## Basic example

```jsx live
import { useState } from 'react';

export default function InboxHeader() {
  const [unread, setUnread] = useState(0);

  return (
    <div>
      <button type="button" onClick={() => setUnread((n) => n + 1)}>
        Receive a message
      </button>
      <button type="button" onClick={() => setUnread(0)}>
        Mark all read
      </button>

      {/* Correct: an explicit boolean. */}
      {unread > 0 && <p>You have {unread} unread messages.</p>}

      {/* Wrong: renders a bare 0 when the count is zero. */}
      <p>Buggy version: [{unread && <b>{unread} unread</b>}]</p>
    </div>
  );
}
```

Press "Mark all read" and the second line shows a stray `0`.

## How it works

### `if` and early returns

The clearest form when the branches are whole components:

```jsx
export function OrderPanel({ order, error }) {
  if (error) {
    return <p role="alert">{error.message}</p>;
  }

  if (!order) {
    return <p>Loading…</p>;
  }

  return (
    <article>
      <h2>Order {order.id}</h2>
      <p>{order.itemCount} items</p>
    </article>
  );
}
```

Early returns keep the happy path unindented. Note that hooks must still be
called before any early return — see
[rules of hooks](../hooks/rules-of-hooks.md).

### Returning `null`

`return null` renders nothing. The component still mounts and keeps its state, so
this is different from the parent not rendering it at all.

```jsx
export function Banner({ message }) {
  if (!message) {
    return null;
  }
  return <div role="status">{message}</div>;
}
```

Prefer letting the parent decide (`{message && <Banner message={message} />}`)
when the component should not exist, and `return null` when the component owns
the decision and may need to keep state across the empty period.

### The ternary operator

Inside JSX you need an expression, so `if` is unavailable and the ternary takes
over:

```jsx
export function SaveButton({ saving }) {
  return (
    <button type="button" disabled={saving}>
      {saving ? 'Saving…' : 'Save'}
    </button>
  );
}
```

Ternaries are excellent for one small difference and terrible when nested. Two
levels of nesting is the point to extract a variable or a component.

### Logical AND, and the `0` trap

`a && b` evaluates to `b` when `a` is truthy, and to **`a`** when it is not.
React renders `false` as nothing — but `0` is falsy *and* renders as the text
`0`.

```jsx
export function CartSummary({ items }) {
  return (
    <div>
      {/* Renders "0" when the cart is empty. */}
      {items.length && <p>{items.length} items</p>}

      {/* Correct. */}
      {items.length > 0 && <p>{items.length} items</p>}
    </div>
  );
}
```

The same applies to empty strings, which render as nothing but still make the
expression fall through unhelpfully. Always put a real boolean on the left:
`count > 0`, `Boolean(value)`, `list.length !== 0`.

> [!WARNING]
> This is the most reported "React rendered a random zero" bug. If a stray `0`
> appears in your UI, search for `&&` with a number on its left.

### Extracting a variable

When a branch grows past a line or two, pull it out above the `return`. The JSX
stays readable and the logic reads top to bottom:

```jsx
export function ExportRow({ status, fileName, onRetry }) {
  let statusNode;

  if (status === 'running') {
    statusNode = <progress aria-label={`Exporting ${fileName}`} />;
  } else if (status === 'failed') {
    statusNode = (
      <button type="button" onClick={onRetry}>
        Retry export
      </button>
    );
  } else {
    statusNode = <a href={`/exports/${fileName}`}>Download</a>;
  }

  return (
    <li>
      <span>{fileName}</span>
      {statusNode}
    </li>
  );
}
```

Elements are values. Assigning them to variables, putting them in arrays, and
passing them as props are all normal.

### Conditional rendering unmounts state

When a condition flips to false, the component under it is removed from the tree.
Everything React was keeping for it goes away.

```jsx live
import { useState } from 'react';

function NoteEditor() {
  const [text, setText] = useState('');
  return (
    <textarea
      rows={3}
      value={text}
      onChange={(event) => setText(event.target.value)}
      placeholder="Type something, then hide and show this editor."
    />
  );
}

export default function NotesPanel() {
  const [showEditor, setShowEditor] = useState(true);

  return (
    <div>
      <button type="button" onClick={() => setShowEditor((v) => !v)}>
        {showEditor ? 'Hide' : 'Show'} editor
      </button>
      {showEditor && <NoteEditor />}
    </div>
  );
}
```

Type into the box, hide it, show it again: the text is gone. That is correct
behavior, and often what you want — a closed dialog should not remember a
half-typed message. When it is not what you want, either lift the value into the
parent's state, or keep the component mounted with `<Activity>`.

### `key` and conditional branches

React matches elements by position and type. Two different components in the same
slot already reset state. Two *instances of the same component* in the same slot
do not — switching `contactId` on the form below keeps the previous contact's
draft, because from React's point of view it is the same form with a new prop.

Add a `key` when you want the switch to be a genuine reset:

```jsx
import { useState } from 'react';

function ContactForm({ contactId }) {
  const [draft, setDraft] = useState('');
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={`Message for ${contactId}`}
    />
  );
}

export function Messenger({ contactId }) {
  return <ContactForm key={contactId} contactId={contactId} />;
}
```

## Common patterns

### Conditional rendering versus `<Activity mode="hidden">`

| | Conditional rendering | `<Activity mode="hidden">` |
|---|---|---|
| DOM nodes | Removed | Kept, hidden with `display: none` |
| Component state | Destroyed | Preserved and restored |
| Effects | Cleaned up and gone | Cleaned up, re-created when visible again |
| Re-renders while hidden | Does not exist to re-render | Yes, at lower priority |
| Cost while hidden | None | Memory for the hidden tree |
| Available since | Always | **React 19.2** |
| Use for | Modals, routes, error states, anything that should start fresh | Tabs, back-navigation, prerendering the next screen |

The deciding question is whether the user would be annoyed to lose what is in
there. Read [`<Activity>`](../performance/activity.md) before reaching for it —
it is a newer tool and it has its own trade-offs.

### Conditional attributes

You do not always need to branch on elements. Often only a value changes:

```jsx
export function Row({ selected, label }) {
  return (
    <li
      className={selected ? 'row row-selected' : 'row'}
      aria-current={selected ? 'true' : undefined}
    >
      {label}
    </li>
  );
}
```

Passing `undefined` omits the attribute entirely, which is what you want for ARIA
attributes where `"false"` means something different from absent.

### A helper function instead of an inline chain

When you branch on one value with several cases, move the branch into a small
function. The JSX stays flat and the cases line up:

```jsx live
function PendingIcon() {
  return <span title="Pending">⏳</span>;
}

function SuccessIcon() {
  return <span title="Success">✅</span>;
}

function FailedIcon() {
  return <span title="Failed">❌</span>;
}

export default function JobList() {
  const jobs = [
    { id: 1, name: 'nightly-report', status: 'pending' },
    { id: 2, name: 'invoice-sync', status: 'success' },
    { id: 3, name: 'image-resize', status: 'failed' },
  ];

  function renderIcon(status) {
    if (status === 'pending') return <PendingIcon />;
    if (status === 'success') return <SuccessIcon />;
    return <FailedIcon />;
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {jobs.map((job) => (
        <li key={job.id}>
          {renderIcon(job.status)} {job.name}
        </li>
      ))}
    </ul>
  );
}
```

## Advanced example

Loading, empty, error and success are four states, and the order you check them
in is a design decision. Check the states that block rendering first, and give
the empty case its own branch rather than letting it fall through to an empty
list:

```jsx
export function ReportTable({ status, rows, error, onRetry }) {
  if (status === 'loading') {
    return <p role="status">Loading reports…</p>;
  }

  if (status === 'error') {
    return (
      <div role="alert">
        <p>Could not load reports: {error.message}</p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return <p>No reports yet. Reports appear here after your first export.</p>;
  }

  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
            <td>{row.createdAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

An empty state that says what will appear there is worth more than a blank area,
and it costs one branch.

## Common mistakes

**`{count && <Thing />}`.** Renders `0`. Use `count > 0 &&`.

**`{items.length ? <List /> : null}` when `&&` would do.** Harmless, but `&&`
says the same thing with less noise. Use the ternary when there is a real second
branch.

**Nesting ternaries three deep.** Extract a variable or a component. The
readability cliff is steep.

**Calling hooks after an early return.** Hooks must run in the same order every
render. Put every hook above the first `if`.

**Expecting a hidden component to keep its state.** Conditional rendering
unmounts. Lift the state up or use `<Activity>`.

**Using `display: none` to "unmount".** The component keeps rendering, its
timers keep firing and its subscriptions stay open.

**Changing the tree shape when only an attribute changes.** Wrapping the same
child in a different parent depending on a flag remounts it, losing focus and
cursor position. Change the attribute instead.

## Related topics

- [JSX](./jsx.md) — why `null`, `false` and `undefined` render nothing but `0`
  does not.
- [Rendering](./rendering.md) — how React decides to preserve or recreate a
  component when the tree changes.
- [`<Activity>`](../performance/activity.md) — hiding a subtree while keeping its
  state and DOM.
- [Lists and keys](./lists-and-keys.md) — the other place `key` decides identity.
- [Suspense](../data-fetching/suspense.md) — declarative loading states instead
  of a manual `status === 'loading'` branch.
