---
title: Lists and keys
description: Rendering arrays with map, and why keys are about identity rather than performance.
group: core-concepts
order: 70
status: current
related: [core-concepts/rendering, core-concepts/conditional-rendering, performance/lists-and-virtualization]
---

## Overview

To render a list, turn an array of data into an array of elements. React renders
arrays by rendering each item in order.

```jsx
export function TagList({ tags }) {
  return (
    <ul>
      {tags.map((tag) => (
        <li key={tag.id}>{tag.label}</li>
      ))}
    </ul>
  );
}
```

`map` is the whole API. There is no list component and no loop syntax, because
JSX is JavaScript and JavaScript already has `map`.

The interesting part is `key`.

## Why it exists

A key tells React **which item this is** across renders.

When a list re-renders, React has an old array of elements and a new one. Without
keys it can only match them by position: first to first, second to second. That
is fine when the list never changes shape, and wrong as soon as items move.

With keys, React matches by identity. An item that moved from index 0 to index 3
is recognized as the same item, so its component instance, its state and its DOM
node move with it instead of being reused by whatever landed in index 0.

The common summary — "keys help React be fast" — is misleading. Keys exist for
**correctness**. The speed is a side effect of not rebuilding the DOM for items
that only moved.

## When to use it

Always, when rendering an array. React warns when a key is missing, and the
warning is worth fixing rather than silencing.

Use a stable identifier that comes from your data: a database id, a slug, a UUID
that was generated when the record was created.

## When not to use it

There is no case where a list of elements should have no key. But there are keys
you should not use:

- **The array index**, whenever the list can reorder, gain or lose items in the
  middle (see below).
- **`Math.random()` or `crypto.randomUUID()` called during render.** A new key
  every render means React unmounts and remounts every item every time. All state
  is lost, all DOM is rebuilt, and inputs lose focus mid-typing.
- **A non-unique field** such as a name that repeats. Duplicate keys among
  siblings produce a warning and undefined matching.

## Basic example

```jsx live
export default function Roster() {
  const people = [
    { id: 'a1', name: 'Ana Ruiz', role: 'Editor' },
    { id: 'b2', name: 'Tom Beck', role: 'Legal' },
    { id: 'c3', name: 'Mei Chen', role: 'Design' },
  ];

  return (
    <table>
      <tbody>
        {people.map((person) => (
          <tr key={person.id}>
            <td>{person.name}</td>
            <td>{person.role}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

The key goes on the element returned directly by `map` — here the `<tr>`, not the
`<td>` inside it, and not a wrapper outside the callback.

## How it works

### Keys are scoped to siblings

A key only has to be unique among the elements in the same array. Two different
lists on the same page can both use the key `"1"` without any conflict. React
compares children within one parent, not across the whole tree.

### Index keys, and exactly when they break

`key={index}` means "the item at position 2". That is a description of a slot, not
of an item. When the data at that slot changes, React thinks the item stayed and
only its props changed — so it keeps the old component instance, with its state,
and hands it the new data.

If your rows have no state and no DOM state (no inputs, no focus, no animation,
no uncontrolled fields), you will not notice. That is why index keys are
acceptable for a static list that is rendered once and never reordered.

Here is the same list rendered twice, once keyed by index and once by id.
Type a note into the top row of each, then press "Add to the top":

```jsx live
import { useState } from 'react';

function TicketRow({ title }) {
  const [note, setNote] = useState('');
  return (
    <li style={{ marginBottom: 4 }}>
      <strong>{title}</strong>{' '}
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="note"
        size={10}
      />
    </li>
  );
}

export default function KeyComparison() {
  const [tickets, setTickets] = useState([
    { id: 1, title: 'Fix login' },
    { id: 2, title: 'Update docs' },
  ]);
  const [nextId, setNextId] = useState(3);

  function addToTop() {
    setTickets([{ id: nextId, title: `New ticket ${nextId}` }, ...tickets]);
    setNextId(nextId + 1);
  }

  return (
    <div>
      <button type="button" onClick={addToTop}>
        Add to the top
      </button>

      <h4>Keyed by index — notes stay with the position</h4>
      <ul>
        {tickets.map((ticket, index) => (
          <TicketRow key={index} title={ticket.title} />
        ))}
      </ul>

      <h4>Keyed by id — notes stay with the ticket</h4>
      <ul>
        {tickets.map((ticket) => (
          <TicketRow key={ticket.id} title={ticket.title} />
        ))}
      </ul>
    </div>
  );
}
```

In the first list the note you typed is now attached to the new ticket, because
"row 0" kept its state and got a new title. In the second list the note travels
with its ticket, which is what the user expects.

The same bug hits deletion. Delete the second of three items keyed by index and
the third item's state moves up into the second slot.

> [!WARNING]
> Index keys are not a style issue. They produce wrong data on screen — a note
> against the wrong ticket, a checked checkbox against the wrong row — and the
> bug only appears after a reorder, so it survives review and reaches
> production.

### Keys must be stable

The key for a given item must be the same on every render, for as long as that
item exists. Two rules follow:

**Never generate a key during render.** `key={crypto.randomUUID()}` produces a
new identity every time, so React discards and rebuilds every row. If your data
has no id, generate one when the item is *created* and store it with the item.

```jsx
import { useState } from 'react';

let nextId = 1;

export function DraftList() {
  const [drafts, setDrafts] = useState([{ id: 0, text: 'First idea' }]);

  function addDraft() {
    // The id is created once, with the item — not during render.
    setDrafts([...drafts, { id: nextId++, text: '' }]);
  }

  return (
    <>
      <button type="button" onClick={addDraft}>
        Add draft
      </button>
      <ul>
        {drafts.map((draft) => (
          <li key={draft.id}>{draft.text || 'Untitled'}</li>
        ))}
      </ul>
    </>
  );
}
```

**Do not key by something the user can change.** A name or an email address makes
a fine key right up until someone edits it, at which point the row remounts and
loses its state.

### Keys are not props

`key` is consumed by React when the element is created; it never appears in the
component's props. `function Row({ key })` is always `undefined`. If the
component needs the id, pass it again under another name:

```jsx
export function Rows({ items }) {
  return (
    <ul>
      {items.map((item) => (
        <ItemRow key={item.id} itemId={item.id} label={item.label} />
      ))}
    </ul>
  );
}

function ItemRow({ itemId, label }) {
  return <li data-item-id={itemId}>{label}</li>;
}
```

### Keys on a Fragment

When each item renders several sibling elements with no wrapper — table cells,
definition-list pairs — you need a Fragment that can hold a key. The `<>...</>`
shorthand cannot take one, so use the long form:

```jsx
import { Fragment } from 'react';

export function SpecList({ specs }) {
  return (
    <dl>
      {specs.map((spec) => (
        <Fragment key={spec.id}>
          <dt>{spec.name}</dt>
          <dd>{spec.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
```

## Common patterns

### Filtering and sorting before mapping

Chain array methods and map at the end. Copy before sorting — `sort` mutates:

```jsx
export function ActiveMembers({ members, query }) {
  const visible = [...members]
    .filter((member) => member.active)
    .filter((member) => member.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ul>
      {visible.map((member) => (
        <li key={member.id}>{member.name}</li>
      ))}
    </ul>
  );
}
```

The keys still come from the data, so reordering the list moves the rows rather
than rebuilding them.

### Extracting the row component

Once a row grows past a few lines, give it a name. The `map` callback becomes one
line and the row can be tested on its own:

```jsx
function InvoiceRow({ invoice }) {
  return (
    <tr>
      <td>{invoice.number}</td>
      <td>{invoice.total}</td>
      <td>{invoice.dueDate}</td>
    </tr>
  );
}

export function InvoiceTable({ invoices }) {
  return (
    <tbody>
      {invoices.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} />
      ))}
    </tbody>
  );
}
```

The key stays on `<InvoiceRow>` in the `map`, not inside the component.

### Empty lists

An empty array renders nothing at all. Handle the empty case explicitly rather
than showing a blank region — see
[conditional rendering](./conditional-rendering.md#advanced-example).

## Advanced example

A reorderable list is where keys earn their keep. Each row keeps local state; the
rows move; the state moves with them because the keys are ids.

```jsx live
import { useState } from 'react';

function TaskRow({ task, onMoveUp, canMoveUp }) {
  const [done, setDone] = useState(false);

  return (
    <li style={{ marginBottom: 4 }}>
      <input
        type="checkbox"
        checked={done}
        onChange={() => setDone(!done)}
      />{' '}
      <span style={{ textDecoration: done ? 'line-through' : 'none' }}>
        {task.title}
      </span>{' '}
      <button type="button" onClick={onMoveUp} disabled={!canMoveUp}>
        Move up
      </button>
    </li>
  );
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState([
    { id: 't1', title: 'Draft the changelog' },
    { id: 't2', title: 'Review the migration guide' },
    { id: 't3', title: 'Publish the release' },
  ]);

  function moveUp(index) {
    const next = [...tasks];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setTasks(next);
  }

  return (
    <ol>
      {tasks.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          canMoveUp={index > 0}
          onMoveUp={() => moveUp(index)}
        />
      ))}
    </ol>
  );
}
```

Check a box, then move that row up. The checkmark follows the task. Swap
`key={task.id}` for `key={index}` and it stops doing so — the checkmark stays at
the position while the text moves.

Note that the array is copied before the swap. Mutating `tasks` in place would
leave React comparing an array against itself.

## Common mistakes

**Using the index as a key in a list that changes.** State and DOM stay with the
position instead of the item.

**Generating a key during render.** Every row remounts on every render. Inputs
lose focus and state resets constantly.

**Putting the key on the wrong element.** It belongs on the outermost element
returned by the `map` callback. A key inside the row component does nothing.

**Reading `props.key`.** It is not a prop. Pass the id separately.

**Duplicate keys among siblings.** React warns, and matching becomes
unpredictable. `key={item.name}` breaks the day two items share a name.

**Forgetting that `<>` cannot take a key.** Use `<Fragment key={...}>`.

**Mutating the array before setting it.** `tasks.sort(...)` sorts the state array
in place; React sees the same reference and may not re-render at all. Copy first.

**Rendering thousands of rows and blaming keys for the slowness.** At that scale
the problem is the row count, not the diff. See
[lists and virtualization](../performance/lists-and-virtualization.md).

## Related topics

- [Rendering](./rendering.md) — how position, type and key decide whether a
  component instance survives.
- [Conditional rendering](./conditional-rendering.md) — handling empty lists and
  loading states.
- [State](./state.md) — why immutable array updates matter for lists.
- [Lists and virtualization](../performance/lists-and-virtualization.md) —
  rendering very large lists.
- [JSX](./jsx.md) — how arrays of elements are rendered in the first place.
