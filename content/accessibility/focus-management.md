---
title: Focus management
description: Focus lives in the DOM, not in React state, so moving it after a change is your job.
group: accessibility
order: 20
status: current
since: "19.0"
related: [accessibility/semantics, accessibility/announcements, hooks/use-ref, patterns/refs-and-dom]
---

## Overview

Exactly one element in a document has focus. It decides where keystrokes go,
what a screen reader reads next, and what the user perceives as "here".

React renders elements. It does not decide which one is focused. When you
replace the contents of a page, open a panel, or unmount the element that had
focus, focus falls back to `<body>` — the top of the document, with no context.

## Why it exists

Focus is state that lives in the DOM and can only ever have one value across the
whole page. React state is local and holds many values at once. The two models
do not compose, which is why React owns one and leaves the other to you. Any
change that removes or replaces the focused element is a change you have to
finish by hand.

## When to use it

Move focus deliberately when the user's context changes and they did not move it
themselves:

- A dialog, drawer or popover opens — and again when it closes.
- A client-side route change swaps the main content.
- A step in a wizard replaces the previous step.
- An element that had focus is deleted (a removed row, a dismissed toast).
- A submit fails and there is an error the user has to act on.

## When not to use it

Do not move focus for something the user did not initiate. Taking focus while
someone is typing loses keystrokes and disorients screen reader users.

Do not use focus to announce something: if nothing needs to be operated, use a
live region — see [Announcements](./announcements.md). And do not put
`autoFocus` on the first field of every page; on a page that also has a heading
and navigation, it drops the user past all of it.

## Basic example

The browser already knows how to run a modal. `showModal()` puts the dialog in
the top layer, moves focus into it, makes everything behind it inert, traps Tab,
closes on Escape, and returns focus to the element that opened it. Open the
dialog below, then press Tab repeatedly, or press Escape.

```jsx live
import { useRef, useState } from 'react';

export default function DeleteInvoiceDialog() {
  const dialogRef = useRef(null);
  const [outcome, setOutcome] = useState('No action yet.');

  return (
    <div style={{ fontFamily: 'system-ui', lineHeight: 1.6 }}>
      <button type="button" onClick={() => dialogRef.current.showModal()}>
        Delete invoice 4021
      </button>
      <p aria-live="polite">{outcome}</p>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-invoice-heading"
        onClose={event => {
          const value = event.currentTarget.returnValue;
          setOutcome(value === 'delete' ? 'Invoice deleted.' : 'Canceled.');
        }}
        style={{ border: '1px solid #999', borderRadius: 8, padding: '1rem' }}
      >
        <h2 id="delete-invoice-heading" style={{ marginTop: 0, fontSize: '1.1rem' }}>
          Delete invoice 4021?
        </h2>
        <p>This cannot be undone.</p>
        {/* method="dialog" closes the dialog and records the button's value. */}
        <form method="dialog" style={{ display: 'flex', gap: '0.5rem' }}>
          <button value="cancel">Cancel</button>
          <button value="delete">Delete</button>
        </form>
      </dialog>
    </div>
  );
}
```

React's DOM types expose the dialog's `close` event as `onClose` and Escape as
`onCancel`.

> [!BEST-PRACTICE]
> In 2026 the native `<dialog>` with `showModal()` is the right default for
> modals. Reach for a hand-built trap only when you need something `<dialog>`
> cannot do.

## How it works

### Moving focus with a ref

Get a DOM node, call `focus()` on it. The node has to exist first, so the call
belongs in an Effect or an event handler — never during render.

```jsx
import { useEffect, useRef, useState } from 'react';

const titles = ['Shipping address', 'Payment', 'Review order'];

// Programmatic focus on a non-interactive element needs tabIndex={-1}:
// focusable by script, still out of the tab order.
function StepHeading({ title, ref }) {
  return <h2 ref={ref} tabIndex={-1}>{title}</h2>;
}

export default function Checkout() {
  const [step, setStep] = useState(0);
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current.focus();
  }, [step]);

  return (
    <section>
      <StepHeading title={titles[step]} ref={headingRef} />
      <button type="button" onClick={() => setStep(s => Math.min(s + 1, 2))}>
        Continue
      </button>
    </section>
  );
}
```

Focusing the heading rather than the first input is deliberate: the user hears
the name of the step they landed on, then tabs into the fields.

> [!NOTE]
> Before React 19 you needed `forwardRef` to pass a ref into `StepHeading`.
> Since **19.0**, `ref` is an ordinary prop on function components.

### Focus on mount with a ref callback

A ref callback runs when the node attaches. Since **19.0** it may return a
cleanup function that React calls when the node detaches, replacing the old
"called again with `null`" convention.

```jsx
function RenameField({ name, onChange }) {
  return (
    <input
      value={name}
      onChange={event => onChange(event.currentTarget.value)}
      ref={node => {
        node.focus();
        node.select();
        // Runs when the input is removed. Undo whatever the setup did.
        return () => node.blur();
      }}
    />
  );
}
```

If you return nothing, React still calls the callback again with `null` on
detach. That fallback is documented as going away in a future version, so return
a cleanup in new code.

> [!WARNING]
> An inline arrow is a new ref callback on every render, so React detaches and
> re-attaches the ref each time — re-running `focus()` and `select()`. If that
> matters, hoist the callback with `useCallback`, or focus from an Effect keyed
> on what should trigger it.

### `useEffect` or `useLayoutEffect`

Both run after the DOM is committed, so both can focus. `useEffect` runs after
the browser paints; `useLayoutEffect` runs before it and blocks the paint.
Prefer `useEffect`, and reach for `useLayoutEffect` only when focusing after
paint produces a visible jump — a panel that scrolls into view as it takes focus.

| | `useEffect` | `useLayoutEffect` |
|---|---|---|
| Runs | After paint | Before paint |
| Blocks paint | No | Yes |
| Use for focus when | Almost always | A focus-driven scroll would otherwise flash |

### What a focus trap actually requires

If you build one yourself, this is the complete list. Miss an item and keyboard
users get stuck:

1. **Initial focus** moves into the dialog on open — the heading, the first
   control, or the safest button when the action is destructive.
2. **Tab wraps** from the last tabbable element to the first.
3. **Shift+Tab wraps** from the first tabbable element to the last.
4. **Escape closes** it. If several are open, only the topmost closes.
5. **The background is inert.** `inert` removes it from the accessibility tree
   *and* the tab order. `aria-hidden="true"` only does the first, so focus can
   still land somewhere the user cannot perceive.
6. **Focus returns** to the element that opened the dialog, and to a sensible
   fallback if that element no longer exists.
7. `role="dialog"` (or the `<dialog>` element), `aria-modal="true"`, and
   `aria-labelledby` pointing at the visible title.

The hard part is items 2 and 3. "Tabbable" is not a selector you write once: it
depends on `tabindex`, `disabled`, `hidden`, `inert`, `display: none` on an
ancestor, `visibility: hidden`, whether a radio is the checked member of its
group, and browser quirks around `<summary>` and iframes. That is the argument
for `<dialog>` — the browser already owns the definition.

> [!TIP]
> If `<dialog>` will not do — an animated drawer, a design that must render in
> place — use a maintained library rather than writing the trap yourself.

### Roving tabindex

A composite widget — toolbar, tab list, menu, listbox — is **one** stop in the
tab sequence, not one per item. Twelve toolbar buttons at twelve tab stops means
twelve Tab presses to get past a strip the user did not want.

- The active item has `tabIndex={0}`. Every other item has `tabIndex={-1}`.
- Tab enters the widget onto the active item; Tab again leaves it.
- Arrow keys move: set the new item's `tabIndex` to `0`, the old one's to `-1`,
  and call `focus()` on the new one. Home and End jump to the ends.

The alternative is `aria-activedescendant`: DOM focus stays on the container,
which carries `tabIndex={0}` and points at the active child's `id`. Use it when
focus must stay in a text input while a list below is navigated — a combobox.
Use roving tabindex everywhere else, because real focus means the browser
scrolls the active item into view for you.

### Skip links

Render `<a href="#main-content">Skip to main content</a>` as the first focusable
element in the app shell, ahead of the navigation, with
`<main id="main-content" tabIndex={-1}>` as its target. Without it a keyboard
user tabs through the whole navigation on every page.

The link may be visually hidden until it receives focus, but it must become
visible then. `tabIndex={-1}` on the target makes browsers move focus there
rather than only scrolling to it.

### Never remove the focus outline

`outline: none` with no replacement makes the page unusable by keyboard. If the
default ring clashes with your design, replace it:

```css
/* Matches when the browser judges a focus ring is warranted: keyboard
   navigation and script-moved focus, but not a mouse click. */
:focus-visible {
  outline: 2px solid #0b5fff;
  outline-offset: 2px;
}
```

`:focus-visible` is why the old "the outline looks bad on click" argument no
longer applies. Keep the indicator at 3:1 contrast or better.

## Common patterns

### Route changes in a single-page app

A client-side navigation replaces the content with no document load, so the
browser does nothing: focus stays on the link the user activated, which is often
now unmounted.

```jsx
import { useEffect, useRef } from 'react';

export default function RouteHeading({ pathname = '/orders', title = 'Your orders' }) {
  const headingRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Do not take focus on the initial load — the user has not navigated yet.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current.focus();
  }, [pathname]);

  return <h1 ref={headingRef} tabIndex={-1}>{title}</h1>;
}
```

Focus the page's `<h1>`, not `<main>`. Focusing a landmark makes some screen
readers read the whole region.

> [!NOTE]
> In StrictMode, development builds mount, unmount and remount components, so
> this Effect runs an extra time. That is an artifact of the double-invoke, not
> a bug in the pattern.

### Restoring focus after a deletion

When the focused element is about to disappear, choose its successor *before*
the removal, while both nodes are still mounted. Store the row nodes in a `Map`
keyed by id — a ref callback with a cleanup is the tool — then focus the next
row, the previous one, or a summary line with `tabIndex={-1}` when the list
empties. Afterwards, the node you want is already unmounted.

## Advanced example

A toolbar with roving tabindex. Tab into it once, then use the arrow keys.

```jsx live
import { useRef, useState } from 'react';

const tools = [
  { id: 'bold', label: 'Bold' },
  { id: 'italic', label: 'Italic' },
  { id: 'code', label: 'Code' },
];

export default function FormattingToolbar() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pressed, setPressed] = useState({});
  const buttons = useRef(new Map());

  function moveTo(index) {
    const next = (index + tools.length) % tools.length;
    setActiveIndex(next);
    buttons.current.get(tools[next].id).focus();
  }

  function handleKeyDown(event) {
    const moves = {
      ArrowRight: () => moveTo(activeIndex + 1),
      ArrowLeft: () => moveTo(activeIndex - 1),
      Home: () => moveTo(0),
      End: () => moveTo(tools.length - 1),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      move();
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui', lineHeight: 1.6 }}>
      <p>
        Press <kbd>Tab</kbd> to enter the toolbar, then <kbd>←</kbd> and{' '}
        <kbd>→</kbd>. One Tab press moves past every button.
      </p>
      <div
        role="toolbar"
        aria-label="Text formatting"
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        style={{ display: 'flex', gap: '0.25rem' }}
      >
        {tools.map((tool, index) => (
          <button
            key={tool.id}
            type="button"
            tabIndex={index === activeIndex ? 0 : -1}
            aria-pressed={Boolean(pressed[tool.id])}
            onClick={() => setPressed(p => ({ ...p, [tool.id]: !p[tool.id] }))}
            onFocus={() => setActiveIndex(index)}
            ref={node => {
              const map = buttons.current;
              map.set(tool.id, node);
              return () => {
                map.delete(tool.id);
              };
            }}
            style={{ padding: '0.35rem 0.75rem', fontWeight: pressed[tool.id] ? 700 : 400 }}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <p>Active: {tools[activeIndex].label}</p>
    </div>
  );
}
```

`aria-pressed` carries the toggle state, which is why these are buttons and not
checkboxes. `onFocus` keeps `activeIndex` correct when someone clicks instead of
arrowing, and the ref cleanup keeps the `Map` free of detached nodes.

## Common mistakes

**Calling `focus()` during render.** The node does not exist yet, and render
must stay side-effect free. Focus in an Effect or an event handler — and give
that Effect a dependency array, or it re-runs on every render and pulls focus
back while the user is typing.

**`aria-hidden="true"` on the page behind a modal.** It hides the content but
leaves it in the tab order, so Tab walks focus somewhere the user cannot hear.
Use `inert`, which React's DOM types accept as a boolean prop.

**Not restoring focus on close.** Focus falls to `<body>` and the user restarts
from the top of the document. Save the trigger before opening, or use
`<dialog>`, which does it for you.

**Twelve tab stops in a toolbar.** Every item at `tabIndex={0}` turns a widget
into an obstacle. One tab stop plus arrow keys. And `tabIndex={1}` or higher
reorders the whole document's tab sequence, not only your component — the only
values you need are `0` and `-1`.

**Expecting `autoFocus` inside a closed dialog to work.** React focuses the
element on mount, and a dialog that mounts closed has passed that moment. Let
`showModal()` pick the first focusable element, or focus after opening.

**`outline: none` in a CSS reset.** Replace it with a `:focus-visible` rule in
the same commit, or keyboard users lose the page.

## Related topics

- [Semantics](./semantics.md) — which elements are focusable before you write any focus code.
- [Announcements](./announcements.md) — for changes that should be heard without moving focus.
- [useRef](../hooks/use-ref.md) — ref objects and ref callbacks in full.
- [useLayoutEffect](../hooks/use-layout-effect.md) — when running before paint is worth the cost.
- [Refs and the DOM](../patterns/refs-and-dom.md) — reaching for DOM nodes from React.
- [Routing](../ecosystem/routing.md) — where the route-change focus hook belongs.
