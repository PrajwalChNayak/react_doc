---
title: Portals
description: Rendering children into a different DOM node while keeping their place in the React tree.
group: patterns
order: 30
status: current
related: [patterns/composition, accessibility/focus-management, patterns/error-boundaries, core-concepts/events]
---

## Overview

`createPortal` renders children into a DOM node somewhere else in the document,
without moving them in the React tree.

```jsx
import { createPortal } from 'react-dom';

export function Toast({ message }) {
  return createPortal(
    <div className="toast">{message}</div>,
    document.body,
  );
}
```

The signature is `createPortal(children, domNode, key?)`, imported from
`react-dom` (not `react-dom/client`). It returns a node you render like any
other: return it, or put it inside JSX alongside siblings.

The `key` argument matters only when you render a list of portals into the same
parent, exactly like keys on list elements.

## Why it exists

CSS can trap a child inside its parent. Three properties do it routinely:

- `overflow: hidden` or `overflow: auto` clips anything that extends past the
  box — the classic dropdown-cut-in-half bug.
- A parent that creates a **stacking context** (`transform`, `filter`,
  `opacity` less than 1, `will-change`, `position: fixed`) caps the effective
  `z-index` of everything inside it. A modal at `z-index: 9999` still renders
  behind a header if its ancestor's stacking context sits lower.
- `position: relative` on an ancestor changes what `position: absolute` resolves
  against.

None of these are fixable from the child. The portal moves the child's DOM node
out from under the offending ancestor while leaving your component structure
alone.

## When to use it

- Modals and drawers that must cover the whole viewport.
- Tooltips and popovers anchored to something inside a scrolling container.
- Toasts and notification stacks owned by a provider far from where they are
  triggered.
- Rendering React UI into a DOM node you do not own — a map library's marker
  element, a third-party widget's slot.

## When not to use it

Do not portal to escape a layout problem you can fix with CSS. A portal
separates an element's markup from its context, which costs you inherited
styles, easy positioning, and a chunk of accessibility work.

Since 2026 the platform covers most of the classic cases directly:

| Need | Reach for | Why |
|---|---|---|
| Blocking modal dialog | Native `<dialog>` + `showModal()` | Renders in the browser's top layer, so no clipping and no `z-index` fight. Gets focus trapping, Escape to close, and the `::backdrop` pseudo-element for free |
| Light-dismiss menu or popover | The `popover` attribute | Top layer, Escape and outside-click dismissal built in, no JavaScript to open |
| Positioning next to an anchor | CSS anchor positioning | Follows the anchor without measuring in JavaScript |
| React UI inside a foreign DOM node | `createPortal` | Nothing else does this |
| A dialog whose DOM must live somewhere specific | `createPortal` | You control the destination node |

`<dialog>` and popovers do not remove the need for portals — they remove the
need for most *modal* portals. A portal is still the only tool when React must
render into a node it did not create.

> [!BEST-PRACTICE]
> For a new modal, start with `<dialog>` and `showModal()`. Reach for a portal
> when you need the content in a specific container, when you are wrapping a
> non-React widget, or when your design system's overlay already lives in a
> portal root.

## Basic example

The behavior that surprises people: a portal changes the DOM position, and
**only** the DOM position. Events still bubble to the React parent, because
React propagates events along the React tree.

```jsx live
import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function BubblingDemo() {
  const [clicks, setClicks] = useState(0);

  return (
    <div
      onClick={() => setClicks((count) => count + 1)}
      style={{ border: '1px dashed #a1a1aa', padding: 16, borderRadius: 8 }}
    >
      <p style={{ marginTop: 0 }}>
        This box counts clicks: <strong>{clicks}</strong>
      </p>
      <button type="button">A normal child</button>

      {createPortal(
        <button
          type="button"
          style={{ position: 'fixed', bottom: 16, right: 16 }}
        >
          Portaled into document.body — still counted
        </button>,
        document.body,
      )}
    </div>
  );
}
```

Both buttons increment the counter. The second one is a direct child of
`<body>` in the DOM inspector, yet its click reaches the `onClick` on a `<div>`
that is not its DOM ancestor.

The same is true of everything else that follows the React tree:

- **Context** provided above the portal is visible inside it.
- **Error boundaries** above the portal catch errors thrown inside it.
- **Suspense boundaries** above the portal suspend when its content suspends.
- The portal unmounts when the component that renders it unmounts.

> [!WARNING]
> Because events bubble through the React parent, a portal inside a component
> with an outside-click handler will trigger that handler. If clicking your
> dropdown closes it, this is why. Stop propagation inside the portal, or move
> the portal higher in the React tree.

## How it works

React keeps two structures: the tree of components it renders, and the DOM it
commits that tree into. A portal splits them for one subtree. The fiber stays
where you wrote it; the host nodes are inserted into the DOM node you passed.

Everything React does — context lookup, boundary search, event delegation, state
preservation — walks the fiber tree, so all of it ignores the portal.

Two consequences worth internalizing:

**Focus, scrolling and CSS follow the DOM.** Inherited styles come from the
portal target, not from your component's parent. If your design system relies on
inherited font or color variables, set them on the portal root.

**Reparenting still remounts.** Changing the `domNode` argument tears down the
old DOM and mounts new nodes. State inside the portal survives (the fiber does
not move), but DOM state such as an uncontrolled input's value, scroll position,
or a playing `<video>` does not.

### Server rendering

`document` does not exist during SSR, so a portal cannot be created on the
server. Render it only after mount:

```jsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function ClientPortal({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(children, document.body);
}
```

Returning `null` on the server and on the first client render keeps hydration
consistent. Skipping this is the most common source of "document is not defined"
in a framework app.

## Common patterns

### A modal, with the accessibility a portal does not give you

`createPortal` solves exactly one problem — where the DOM node lands. Every
accessibility duty is still yours:

- `role="dialog"` and `aria-modal="true"`, plus `aria-labelledby` pointing at
  the title.
- Move focus into the dialog when it opens.
- Restore focus to the element that opened it when it closes.
- Close on Escape.
- Trap Tab inside the dialog while it is open.
- Prevent the page behind from scrolling, and hide it from assistive technology.

```jsx live
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function Modal({ title, onClose, children }) {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{ background: '#fff', padding: 20, borderRadius: 10, minWidth: 280 }}
      >
        <h2 id={titleId} style={{ marginTop: 0 }}>{title}</h2>
        {children}
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body,
  );
}

export default function DeleteProject() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Delete project</button>
      {open ? (
        <Modal title="Delete this project?" onClose={() => setOpen(false)}>
          <p>This removes 42 documents. It cannot be undone.</p>
        </Modal>
      ) : null}
    </div>
  );
}
```

This handles focus entry, focus restore and Escape. It does **not** trap Tab —
see [focus management](../accessibility/focus-management.md) for the full
treatment, including inert backgrounds and focus sentinels.

Note the `stopPropagation` on the inner box. Without it, the overlay's `onClick`
fires for clicks inside the dialog and closes it immediately.

### The same dialog with the platform doing the work

```jsx live
import { useEffect, useRef, useState } from 'react';

export default function DeleteProjectNative() {
  const dialogRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Delete project</button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        style={{ padding: 20, borderRadius: 10, border: 'none' }}
      >
        <h2 style={{ marginTop: 0 }}>Delete this project?</h2>
        <p>This removes 42 documents. It cannot be undone.</p>
        <button type="button" onClick={() => setOpen(false)}>Close</button>
      </dialog>
    </div>
  );
}
```

No portal, no `z-index`, no overlay element, no Escape handler, and the browser
traps focus for you. `showModal()` puts the dialog in the top layer, which is
above every stacking context on the page. `onClose` keeps React state in sync
when the user dismisses it with Escape.

The trade-off is styling and animation control, and that `<dialog>` still sits
inside your DOM structure — so if an ancestor is removed, the dialog goes with
it.

### A dedicated portal root

Portaling to `document.body` is fine for a single overlay. Once you have modals,
toasts and tooltips at once, give each a container so ordering is explicit
rather than accidental:

```html
<body>
  <div id="root"></div>
  <div id="overlay-root"></div>
  <div id="toast-root"></div>
</body>
```

```jsx
import { createPortal } from 'react-dom';

export function Overlay({ children }) {
  const container = document.getElementById('overlay-root');
  if (container === null) {
    return null;
  }
  return createPortal(children, container);
}
```

Later elements in `<body>` paint above earlier ones at the same stacking level,
so the source order of these roots is your layering policy.

## Common mistakes

**Assuming events do not bubble.** They do — through the React tree. Outside
click handlers, form submission, and keyboard shortcuts on ancestors all still
fire for portal content.

**Assuming context does not reach the portal.** It does. Providers above the
portal in the React tree apply normally.

**Creating the portal during render on the server.** `document` is undefined.
Gate on a mounted flag.

**Portaling and calling it accessible.** No focus management, no `aria-modal`,
no Escape, no focus restore comes with `createPortal`. It is a DOM placement
tool and nothing more.

**Leaving the page behind interactive.** Screen reader users can still reach the
content behind an overlay unless you mark it `inert` or `aria-hidden`.

**Fighting `z-index` inside a portal.** If your portal target is nested in a
transformed ancestor you have not escaped the stacking context. Portal to a
top-level element, or use `<dialog>`/popover and the top layer.

**Reparenting to preserve DOM state.** Changing the target node remounts the
DOM. A playing video restarts and an uncontrolled input loses its value.

## Related topics

- [Focus management](../accessibility/focus-management.md) — the focus trap,
  restore and inert-background work a portal does not do for you.
- [Composition](./composition.md) — portals are composition where the DOM and
  React positions diverge.
- [Events](../core-concepts/events.md) — why bubbling follows the React tree.
- [Error boundaries](./error-boundaries.md) — a portal's errors are caught by
  the boundary above it in the React tree.
- [Refs and the DOM](./refs-and-dom.md) — for driving `<dialog>` and other
  imperative DOM APIs.
