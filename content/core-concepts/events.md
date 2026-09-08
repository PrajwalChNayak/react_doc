---
title: Events
description: Attaching handlers in JSX, how React's synthetic events work, and how propagation and batching behave.
group: core-concepts
order: 80
status: current
related: [core-concepts/state, patterns/forms-and-actions, typescript/typing-events]
---

## Overview

You respond to user interaction by passing a function to an event prop:

```jsx
export function DeleteButton({ onConfirm }) {
  function handleClick() {
    onConfirm();
  }

  return (
    <button type="button" onClick={handleClick}>
      Delete
    </button>
  );
}
```

Event props are camelCased (`onClick`, `onChange`, `onPointerDown`), and they
take a function, not a string. There is no `addEventListener` to call and no
listener to remove — React attaches and detaches everything as the tree changes.

## Why it exists

Handlers live in JSX for the same reason markup lives in JavaScript: the code
that runs on click belongs next to the thing that gets clicked.

React also normalizes events. The object your handler receives is a
**SyntheticEvent** — a wrapper with the same interface as the native event
(`target`, `currentTarget`, `preventDefault`, `stopPropagation`) that behaves
identically across browsers. The native event is still available on
`event.nativeEvent` when you need it.

Under the hood React does not attach a listener to every node. It attaches a
small number of listeners to the **root container** and dispatches from there.

> [!NOTE]
> Since **React 17**, those listeners are attached to the root DOM container
> rather than to `document`. This is what makes it safe to run two React versions
> on one page, and it changes how React events interleave with non-React
> listeners you attach yourself. React 17 also removed event pooling entirely —
> the event object stays valid after the handler returns, so `event.persist()` is
> no longer needed and no longer exists.

## When to use it

Event handlers are for things that happen because the user did something: clicks,
typing, submitting, focusing, dragging.

They are also the correct home for side effects. Code in an event handler runs
once, in response to a real interaction, outside the render phase. Sending an
analytics event, writing to storage, or starting a request belongs here — not in
an [Effect](../hooks/use-effect.md) that tries to detect the interaction after
the fact.

## When not to use it

Do not use an event handler to synchronize with something outside React that
changes on its own — a WebSocket, a media element, a browser API that pushes
updates. That is what Effects are for.

Do not attach listeners manually with `addEventListener` on nodes React renders.
You will have to remove them, and you lose React's batching and propagation
model. The exception is listening on `window` or `document`, which React does not
render — do that in an Effect with a cleanup function.

## Basic example

```jsx live
import { useState } from 'react';

export default function ColorPicker() {
  const [color, setColor] = useState('slate');
  const colors = ['slate', 'crimson', 'teal'];

  function handleSelect(next) {
    setColor(next);
  }

  return (
    <div>
      {colors.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => handleSelect(option)}
          style={{
            marginRight: 6,
            fontWeight: option === color ? 700 : 400,
          }}
        >
          {option}
        </button>
      ))}
      <p>Selected: {color}</p>
    </div>
  );
}
```

## How it works

### Pass the function, do not call it

This is the most common beginner error in React:

```jsx
export function Wrong({ onDelete }) {
  // Calls onDelete during render and passes its return value to onClick.
  return <button type="button" onClick={onDelete()}>Delete</button>;
}

export function Right({ onDelete }) {
  return <button type="button" onClick={onDelete}>Delete</button>;
}
```

`onClick={handleClick}` hands React the function. `onClick={handleClick()}` runs
it immediately, during render, and gives React whatever it returned — usually
`undefined`. If the handler sets state, you get an infinite render loop.

To pass an argument, wrap it in an arrow function so the call happens later:

```jsx
export function RowActions({ rowId, onDelete }) {
  return (
    <button type="button" onClick={() => onDelete(rowId)}>
      Delete row
    </button>
  );
}
```

### Naming

Two conventions, and they are worth following because they make the direction of
data obvious:

- A **prop** that takes a handler starts with `on`: `onSelect`, `onDismiss`,
  `onValueChange`.
- The **function** that implements it starts with `handle`: `handleSelect`,
  `handleDismiss`.

Name the prop after what happened in your domain, not after the DOM event.
`onDelete` tells the parent what it is responding to; `onClick` on a custom
component only says something was clicked.

### The event object

Every handler receives the event as its first argument:

```jsx
export function EmailField({ value, onChange }) {
  function handleChange(event) {
    onChange(event.target.value);
  }

  return <input type="email" value={value} onChange={handleChange} />;
}
```

The properties you will use most:

| Property | What it is |
|---|---|
| `event.target` | The element that originated the event — for an input, the input |
| `event.currentTarget` | The element whose handler is running — where you put `onClick` |
| `event.preventDefault()` | Cancels the browser's default behavior |
| `event.stopPropagation()` | Stops the event from reaching ancestor handlers |
| `event.nativeEvent` | The underlying browser event |
| `event.key` | On keyboard events, the key that was pressed |

`target` and `currentTarget` differ whenever the event bubbled: click a `<span>`
inside a `<button>` and `target` is the span, `currentTarget` is the button.

For typing these in TypeScript, see
[typing events](../typescript/typing-events.md).

### `preventDefault`

Browsers do things on their own: forms navigate, links follow their `href`,
right-click opens a menu. `preventDefault` stops that.

```jsx
import { useState } from 'react';

export function SubscribeForm() {
  const [email, setEmail] = useState('');

  function handleSubmit(event) {
    event.preventDefault(); // Without this, the page reloads.
    console.log('Subscribing', email);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button type="submit">Subscribe</button>
    </form>
  );
}
```

Put `onSubmit` on the `<form>`, not `onClick` on the button. The form event fires
for the Enter key too, which the button click does not.

### Propagation and `stopPropagation`

React events bubble: a click on a child runs the child's handler, then each
ancestor's, up to the root. `stopPropagation` ends that walk.

```jsx live
import { useState } from 'react';

export default function PropagationDemo() {
  const [log, setLog] = useState(['(nothing clicked yet)']);

  function record(entry) {
    setLog((entries) => [...entries, entry]);
  }

  return (
    <div>
      <div
        onClickCapture={() => record('outer: capture')}
        onClick={() => record('outer: bubble')}
        style={{ border: '2px solid #2b6cb0', padding: 16 }}
      >
        outer
        <div
          onClick={() => record('inner: bubble')}
          style={{ border: '2px solid #2f855a', padding: 16, marginTop: 8 }}
        >
          inner (bubbles to outer)
        </div>
        <div
          onClick={(event) => {
            event.stopPropagation();
            record('stopped: bubble');
          }}
          style={{ border: '2px solid #b7791f', padding: 16, marginTop: 8 }}
        >
          stopped (calls stopPropagation)
        </div>
      </div>
      <button type="button" onClick={() => setLog([])}>
        Clear log
      </button>
      <ul>
        {log.map((entry, index) => (
          <li key={index}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
```

Click "inner" and the outer handler runs too. Click "stopped" and it does not.
Notice the capture handler runs **first**, before the click reaches the child at
all.

Every event prop has a `Capture` variant — `onClickCapture`, `onFocusCapture`,
`onKeyDownCapture` — which runs on the way down the tree instead of on the way
up. Use it when a container must see an event even if a child stops propagation,
for example a modal that closes on any outside interaction or an analytics
wrapper.

> [!TIP]
> Reach for `stopPropagation` sparingly. It works by preventing other code from
> running, so it breaks handlers written by people who never saw your component —
> including a parent added six months later. Prefer checking
> `event.target === event.currentTarget`, or restructuring so the two handlers do
> not overlap.

### Events and state batching

State updates made in one handler are batched into a single re-render. That is
also why the state variable you read inside a handler does not change while the
handler runs:

```jsx
import { useState } from 'react';

export function DoubleStep() {
  const [step, setStep] = useState(0);

  function handleClick() {
    setStep(step + 1);
    setStep(step + 1); // Same snapshot — the result is +1, not +2.
    setStep((current) => current + 1); // Reads the queued value: +1 more.
  }

  return <button type="button" onClick={handleClick}>{step}</button>;
}
```

[State](./state.md#how-it-works) covers snapshots and updater functions in full.

### Events not on React elements

For keyboard shortcuts, resize handling or clicks outside your tree, you are
listening on `window` or `document`, which React does not render. Use an Effect
with a cleanup function:

```jsx
import { useEffect, useState } from 'react';

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return open ? <div role="dialog">Command palette</div> : null;
}
```

The cleanup is not optional. Without it, [Strict Mode](./strict-mode.md) will
show you two listeners in development — which is the point of Strict Mode.

## Common patterns

### Handler props that report meaning, not mechanics

```jsx
function StarRating({ value, onRate }) {
  return (
    <div>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`Rate ${star} stars`}
          onClick={() => onRate(star)}
        >
          {star <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}

export function ReviewForm({ rating, setRating }) {
  return <StarRating value={rating} onRate={setRating} />;
}
```

`StarRating` reports "the user rated this 4", not "a button was clicked". The
parent never has to know there were buttons.

A wrapper component that spreads its remaining props onto a DOM element
(`<div className="card" {...rest} />`) accepts every native event without listing
any of them — see [spreading props](./props.md#how-it-works).

### Forms

For anything beyond a trivial submit, React 19's Actions handle pending state,
errors and optimistic updates for you — a `<form action={...}>` with
[`useActionState`](../hooks/use-action-state.md) and
[`useFormStatus`](../hooks/use-form-status.md) replaces a pile of manual
`onSubmit` plumbing. See
[forms and actions](../patterns/forms-and-actions.md).

## Advanced example

Keyboard interaction is where a handler earns its keep. This list supports arrow
navigation and Enter to select, and its handlers describe intent rather than
keys:

```jsx live
import { useState } from 'react';

export default function CommandList() {
  const commands = ['Open file', 'Save file', 'Close tab', 'Reopen tab'];
  const [activeIndex, setActiveIndex] = useState(0);
  const [chosen, setChosen] = useState('nothing yet');

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, commands.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      setChosen(commands[activeIndex]);
    }
  }

  return (
    <div>
      <p>Click the list, then use the arrow keys and Enter.</p>
      <ul
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ border: '1px solid #999', padding: 8, listStyle: 'none' }}
      >
        {commands.map((command, index) => (
          <li
            key={command}
            style={{
              background: index === activeIndex ? '#bee3f8' : 'transparent',
              padding: '2px 6px',
            }}
          >
            {command}
          </li>
        ))}
      </ul>
      <p>Chosen: {chosen}</p>
    </div>
  );
}
```

`preventDefault` on the arrow keys stops the page from scrolling. The updater
form of `setActiveIndex` means holding a key down cannot skip a step. A real
implementation would also manage focus — see
[focus management](../accessibility/focus-management.md).

## Common mistakes

**Calling the handler instead of passing it.** `onClick={save()}` runs during
render. Write `onClick={save}` or `onClick={() => save(id)}`.

**Lowercase or string handlers.** `onclick={...}` and `onClick="save()"` are HTML,
not JSX. Neither works.

**Expecting state to update inside the handler.** The variable holds this
render's snapshot. Use an updater or a local variable.

**Forgetting `preventDefault` on a form.** The page reloads and your handler's
work disappears with it.

**Putting the submit handler on the button.** `onSubmit` on the `<form>` catches
Enter as well as clicks.

**Using `stopPropagation` to fix a layout problem.** It silently disables
ancestors' handlers. Fix the structure or compare `target` with `currentTarget`.

**Adding listeners with `addEventListener` on rendered nodes.** React already
manages those. Use the event prop.

**Missing cleanup on a manual `window` listener.** Every mount adds another
listener. The Effect's return function must remove it.

**Assuming `onScroll` bubbles.** Since React 17 it does not, matching the native
behavior. Attach it to the scrolling element itself.

## Related topics

- [State](./state.md) — what a handler usually changes, and why it reads a
  snapshot.
- [Forms and actions](../patterns/forms-and-actions.md) — React 19 Actions,
  pending state and errors without manual `onSubmit` wiring.
- [Controlled inputs](../patterns/controlled-inputs.md) — `value` plus `onChange`
  in depth.
- [`useEffect`](../hooks/use-effect.md) — for events on `window`, `document` and
  external systems.
- [Typing events](../typescript/typing-events.md) — the TypeScript types for
  every handler.
- [Strict Mode](./strict-mode.md) — why a missing listener cleanup shows up twice
  in development.
