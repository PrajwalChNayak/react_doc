---
title: Semantics
description: Use the HTML element that already means the thing, and know what it costs to rebuild one.
group: accessibility
order: 10
status: current
since: "19.2"
related: [accessibility/focus-management, accessibility/forms-accessibility, hooks/use-id, core-concepts/jsx]
---

## Overview

Assistive technology reads a tree of roles, names, states and properties that
the browser builds from your HTML. A `<button>` arrives in that tree as a
button, focusable and operable, because the browser knows what a button is.

A `<div>` arrives as nothing. Everything a real element gave you for free is now
yours to write, test and maintain.

## Why it exists

Almost all React accessibility work is deciding which element to render. The
element you pick determines the role, the keyboard behavior, the focus behavior,
the form participation and the default styling hooks — all at once, in one
decision, with no JavaScript.

Getting this right removes the need for most of the ARIA people reach for. It is
also the cheapest accessibility work there is: nothing at runtime, nothing in
bundle size.

## When to use it

Every time you render markup. Before adding a `role` or an `aria-*` attribute,
check whether an element already carries that role.

## When not to use it

There is no case for choosing a `<div>` over a semantic element to get different
styling. Every default can be removed in CSS — `appearance: none`, `all: unset`
and `list-style: none` exist precisely so you can keep the semantics and drop
the look.

The genuine exception is a widget HTML has no element for: a tab set, a tree, a
combobox, a toolbar. Those need ARIA, and they need the full keyboard behavior
that goes with it.

## Basic example

```jsx
function SaveControls({ onSave = () => {} }) {
  return (
    <>
      {/* Renders as a button in the accessibility tree. */}
      <button type="button" onClick={onSave}>Save</button>

      {/* Renders as nothing: not focusable, not keyboard-operable, no role. */}
      <div className="button" onClick={onSave}>Save</div>
    </>
  );
}
```

The second one works with a mouse and is invisible to everything else. Keyboard
users cannot reach it, screen reader users are not told it is interactive, and
voice control users cannot say "click Save".

## How it works

### What a real element gives you

| Behavior | `<button>` | `<div onClick>` |
|---|---|---|
| Announced as a button | Yes | No |
| In the tab order | Yes | No |
| Activates on Enter | Yes | No |
| Activates on Space | Yes | No |
| Fires a `click` from the keyboard | Yes | No |
| `disabled` removes it from the tab order and blocks activation | Yes | No |
| Submits or resets a form | Yes | No |
| Targeted by voice control by its label | Yes | No |
| Gets a default focus ring | Yes | No |

### The full cost of rebuilding one

If you insist, this is the honest minimum:

```jsx
function FakeButton({ onActivate = () => {}, label = 'Save' }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={event => {
        // Enter activates on keydown. Space must be prevented on keydown,
        // or the page scrolls, and then activated on keyup.
        if (event.key === 'Enter') {
          event.preventDefault();
          onActivate();
        } else if (event.key === ' ') {
          event.preventDefault();
        }
      }}
      onKeyUp={event => {
        if (event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
    >
      {label}
    </div>
  );
}
```

Twenty-five lines, and it still does not handle `disabled`, does not participate
in forms, and gets no default focus ring. Compare:

```jsx
function RealButton({ onActivate = () => {}, label = 'Save' }) {
  return <button type="button" onClick={onActivate}>{label}</button>;
}
```

> [!WARNING]
> Always set `type` on a `<button>` inside a form. The HTML default is
> `type="submit"`, so a "Show password" toggle with no `type` submits the form
> the first time someone presses it.

### The elements that carry the most weight

- `<button>` for anything that does something. `<a href>` for anything that goes
  somewhere. If it changes the URL it is a link; if it changes state it is a
  button.
- Headings in order: one `<h1>` per page, then `<h2>`, `<h3>` with no gaps.
  Screen reader users navigate by heading far more than they read top to bottom.
  A skipped level reads as a missing section.
- `<nav>`, `<main>`, `<aside>`, `<header>`, `<footer>` create landmarks that can
  be jumped to directly. Exactly one `<main>` per page. Give each `<nav>` an
  `aria-label` when there is more than one.
- `<ul>` and `<ol>` announce "list, 6 items" and let a user skip the whole
  thing. A stack of `<div>`s announces nothing.
- `<table>` with `<th scope="col">` gives cell-by-cell header association. A CSS
  grid of `<div>`s gives a wall of unlabeled text.

### JSX-specific gotchas

**`htmlFor`, not `for`.** `for` is a reserved word in JavaScript, so JSX spells
it `htmlFor`. A label with no association is the most common accessibility bug
in React code.

**`aria-*` and `data-*` stay hyphenated.** JSX camelCases DOM properties —
`className`, `tabIndex`, `onClick` — but ARIA attributes are written exactly as
in HTML: `aria-label`, `aria-describedby`, `aria-live`. `ariaLabel` is not an
error and does nothing.

**Wrapper elements break semantics.** A component that returns a `<div>` around
two `<li>`s destroys the list. Return a fragment instead:

```jsx
import { Fragment } from 'react';

const steps = [
  { id: 'mix', instruction: 'Combine the dry ingredients.', note: 'Sift the flour first.' },
  { id: 'rest', instruction: 'Rest the dough for 30 minutes.', note: null },
  { id: 'bake', instruction: 'Bake at 200°C for 25 minutes.', note: null },
];

function RecipeSteps() {
  return (
    <ol>
      {steps.map(step => (
        <Fragment key={step.id}>
          <li>{step.instruction}</li>
          {step.note && <li className="step-note">{step.note}</li>}
        </Fragment>
      ))}
    </ol>
  );
}
```

The shorthand `<>...</>` cannot take a `key`, which is why the long form still
exists. The same rule applies inside `<table>`, `<select>` and `<dl>`, where
only specific child elements are valid.

### `useId` for connecting elements

Accessible relationships are expressed as ID references: `htmlFor`,
`aria-labelledby`, `aria-describedby`, `aria-controls`. Hardcoded IDs collide
the moment a component renders twice on one page.

```jsx live
import { useId, useState } from 'react';

function PasswordField({ label = 'Password' }) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const [value, setValue] = useState('');
  const tooShort = value.length > 0 && value.length < 8;

  return (
    <p style={{ marginBottom: '1rem' }}>
      <label htmlFor={fieldId} style={{ display: 'block' }}>{label}</label>
      <input
        id={fieldId}
        type="password"
        value={value}
        onChange={event => setValue(event.currentTarget.value)}
        aria-describedby={hintId}
        aria-invalid={tooShort}
      />
      <small id={hintId} style={{ display: 'block', color: tooShort ? '#b00020' : '#555' }}>
        {tooShort ? 'Too short: use at least 8 characters.' : 'Use at least 8 characters.'}
      </small>
    </p>
  );
}

export default function SignUpFields() {
  return (
    <form onSubmit={event => event.preventDefault()} style={{ fontFamily: 'system-ui' }}>
      <PasswordField label="Password" />
      <PasswordField label="Confirm password" />
      <button type="submit">Create account</button>
    </form>
  );
}
```

Both fields render the same component and each gets a distinct ID. Derive extra
IDs by suffixing the one `useId` value rather than calling the hook repeatedly.

> [!NOTE]
> React **19.2** changed the `useId` prefix from `:r:` to `_r_`. The old prefix
> produced IDs that were not valid CSS selectors, so `document.querySelector`
> and similar lookups needed escaping. They no longer do.

### When ARIA is right

The first rule of ARIA: no ARIA is better than bad ARIA. A wrong `role`
overrides the element's real one and actively misinforms.

Reach for ARIA when:

- The widget has no HTML element — `role="tablist"`, `role="tree"`,
  `role="toolbar"`. Implement the full keyboard model that comes with it; see
  [Focus management](./focus-management.md#roving-tabindex).
- You need to express state HTML cannot: `aria-expanded`, `aria-pressed`,
  `aria-current`, `aria-selected`, `aria-busy`.
- You need a name or description that is not visible text: `aria-label`,
  `aria-labelledby`, `aria-describedby`.
- You need to announce something that changed without moving focus: `aria-live`,
  covered in [Announcements](./announcements.md).

Do not use ARIA to restate what the element already says.
`<button role="button">` and `<nav role="navigation">` are noise.

## Common patterns

### Accessible names

Every interactive element needs a name. The browser computes it from, in order:
`aria-labelledby`, then `aria-label`, then the element's own content, then
`title`.

```jsx
function BillingPanel() {
  return (
    <>
      {/* Text content is the name. Nothing more is needed. */}
      <button type="button">Delete invoice</button>

      {/* Icon only: the icon is decorative, so the label carries the name. */}
      <button type="button" aria-label="Delete invoice">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16">
          <path d="M5 5h6v9H5z" fill="currentColor" />
        </svg>
      </button>

      {/* Named by visible text elsewhere. Preferred when that text exists. */}
      <h2 id="billing-heading">Billing</h2>
      <section aria-labelledby="billing-heading">
        <p>Your next invoice is due on the 1st.</p>
      </section>
    </>
  );
}
```

`aria-hidden="true"` on the icon matters. Without it, a screen reader may
announce the icon's own text content in addition to the label.

> [!BEST-PRACTICE]
> When an element has visible text, make that text the accessible name. An
> `aria-label` that differs from the visible label breaks voice control: the
> user says the words they can see, and nothing matches.

### Images

`alt` is required on every `<img>`. Its value is a decision about the image's
role on the page, not a description of the file:

```jsx
function ReportHeader() {
  return (
    <header>
      {/* Functional: describe the destination, not the glyph. */}
      <a href="../index.html">
        <img src="images/logo.svg" alt="Acme home" width="120" height="32" />
      </a>

      {/* Meaningful: describe the information, not the picture. */}
      <img
        src="images/revenue.png"
        alt="Revenue rose from $1.2M in Q1 to $1.9M in Q4."
        width="640"
        height="320"
      />

      {/* Decorative: an empty alt removes it from the accessibility tree. */}
      <img src="images/divider.svg" alt="" width="640" height="8" />
    </header>
  );
}
```

Omitting `alt` entirely is not the same as `alt=""`. With no `alt`, many screen
readers fall back to reading the filename.

### Inline SVG

Treat inline `<svg>` the same way. Decorative icons get `aria-hidden="true"` and
`focusable="false"`; meaningful ones get `role="img"` and a label.

```jsx
function StatusIcon({ label = 'Online', color = 'currentColor' }) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 16 16" width="16" height="16">
      <circle cx="8" cy="8" r="7" fill={color} />
    </svg>
  );
}
```

## Advanced example

The same control, wrong and right, side by side. Press Tab to move between them,
then Enter or Space.

```jsx live
import { useState } from 'react';

export default function SemanticsDemo() {
  const [counts, setCounts] = useState({ div: 0, button: 0 });

  return (
    <div style={{ fontFamily: 'system-ui', lineHeight: 1.6 }}>
      <p>
        Press <kbd>Tab</kbd> to move between the two controls, then <kbd>Enter</kbd>{' '}
        or <kbd>Space</kbd>. Only one of them responds.
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div
          onClick={() => setCounts(c => ({ ...c, div: c.div + 1 }))}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #b00020',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          div with onClick
        </div>

        <button
          type="button"
          onClick={() => setCounts(c => ({ ...c, button: c.button + 1 }))}
          style={{ padding: '0.5rem 1rem', border: '1px solid #006400', borderRadius: 4 }}
        >
          real button
        </button>
      </div>

      <h2 style={{ fontSize: '1rem', margin: '0 0 0.25rem' }}>Activations</h2>
      <ul style={{ margin: 0 }}>
        <li>div: {counts.div}</li>
        <li>button: {counts.button}</li>
      </ul>
    </div>
  );
}
```

Only the `<button>` receives focus, and only the `<button>` responds to the
keyboard. No amount of CSS changes that; only the element does.

## Common mistakes

**`<div onClick>` for anything clickable.** It is unreachable by keyboard and
unnamed in the accessibility tree. `<button type="button">` costs the same
number of characters.

**A `<button>` inside a form with no `type`.** It defaults to `submit`.

**`ariaLabel` instead of `aria-label`.** JSX camelCases DOM properties but not
ARIA attributes, and the wrong spelling fails silently.

**Choosing heading levels for their font size.** Levels are structure. Style
them with CSS and keep the order intact.

**A `<div>` wrapper inside `<ul>` or `<tbody>`.** It breaks the list or table
semantics. Use `<Fragment key={...}>`.

**Hardcoded `id` values in a reusable component.** The second instance
duplicates every ID, and every `htmlFor` points at the first one. Use `useId`.

**`role="button"` on an `<a href>`.** It now announces as a button, still
navigates on Enter, and still appears in the links list. Pick one.

**`aria-hidden="true"` on a container that holds something focusable.** The
element stays in the tab order with no accessible name, so focus lands somewhere
the user cannot perceive. Use `inert` on the container instead — React's DOM
types accept it as a boolean prop — which removes both.

## Related topics

- [Focus management](./focus-management.md) — where focus goes once the markup is right.
- [Announcements](./announcements.md) — telling users about changes that do not move focus.
- [Form accessibility](./forms-accessibility.md) — labels, grouping and error wiring in depth.
- [useId](../hooks/use-id.md) — the hook behind every `htmlFor` and `aria-describedby` here.
- [JSX](../core-concepts/jsx.md) — why `htmlFor` and `className` are spelled that way.
