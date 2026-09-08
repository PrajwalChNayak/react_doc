---
title: Composition
description: Passing elements as children and slots instead of piling configuration props onto one component.
group: patterns
order: 10
status: current
related: [core-concepts/components, state-management/context, hooks/custom-hooks, patterns/error-boundaries]
---

## Overview

Composition is React's answer to "how do I make this component reusable?" Instead
of adding a prop for every variation, you leave a hole in the component and let
the caller fill it with elements.

The hole is usually `children`:

```jsx
export function Panel({ children }) {
  return <section className="panel">{children}</section>;
}
```

`children` is an ordinary prop. React puts whatever sits between the opening and
closing tags into it. Because the caller renders those elements, the caller also
owns their props, their state and their data — `Panel` needs to know nothing.

When one hole is not enough, add named slots. A slot is a prop that holds an
element rather than a string:

```jsx
export function PageHeader({ title, actions, breadcrumbs }) {
  return (
    <header className="page-header">
      {breadcrumbs}
      <h1>{title}</h1>
      <div className="page-header-actions">{actions}</div>
    </header>
  );
}
```

```jsx
import { PageHeader } from './PageHeader.jsx';

export function InvoiceHeader() {
  return (
    <PageHeader
      title="Invoice 4182"
      breadcrumbs={<a href="/invoices">All invoices</a>}
      actions={<button type="button">Send reminder</button>}
    />
  );
}
```

## Why it exists

A component with fourteen boolean props is a component that has absorbed
fourteen decisions belonging to its callers. Every new requirement adds a
fifteenth, and the render body grows a matching branch.

Composition inverts that. The container decides layout, spacing and behavior;
the caller decides content. New requirements land in the caller, where the
context to satisfy them already exists, and the container stops changing.

There is a second, less obvious payoff: composition moves state ownership. When
a parent renders an element and passes it down, the element is created in the
parent's scope, so it reads the parent's variables directly. That deletes whole
chains of pass-through props.

> [!BEST-PRACTICE]
> Prefer composition over configuration. If you are about to add
> `showFooter`, `footerVariant` and `footerAlign`, add a `footer` slot instead.
> A component with fourteen booleans wants to be three components.

## When to use it

Reach for `children` or a slot when:

- The container is about **layout or behavior** and the caller is about
  **content** — cards, panels, modals, list shells, page frames.
- A prop would only ever be forwarded, unread, to something further down.
- Two variants differ by what they render, not by how they render it.
- You want the caller to keep ownership of state, data fetching, or event
  handlers for a region of the UI.

## When not to use it

Composition is not free. A slot the caller must fill correctly is an API
contract, and a component with six slots is as hard to use as one with six
booleans.

Skip it when:

- The variation really is a value, not UI. `size="sm"` should stay a prop.
- The container needs to inspect or transform what it was given. Reading into
  `children` with `Children.map` couples the container to the caller's shape and
  breaks the moment someone wraps a child in a fragment.
- The same element is needed by many distant components at once. That is what
  [context](../state-management/context.md) is for.

## Basic example

The most common use is a wrapper that adds structure without knowing what it
wraps.

```jsx live
function Card({ title, footer, children }) {
  return (
    <div style={{ border: '1px solid #d4d4d8', borderRadius: 8, maxWidth: 360 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e4e4e7' }}>
        <strong>{title}</strong>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
      {footer ? (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e4e4e7' }}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export default function BillingCard() {
  return (
    <Card
      title="Team plan"
      footer={<button type="button">Change plan</button>}
    >
      <p style={{ margin: 0 }}>12 seats, renews on 1 March.</p>
    </Card>
  );
}
```

`Card` has no idea a button exists. Adding a second action, or replacing the
button with a link, does not touch `Card`.

## How it works

`children` is the prop React fills from the JSX body. These two calls are
identical:

```jsx
export function Equivalent() {
  return (
    <>
      <p>Same element</p>
      {/* is the same as */}
      <p children="Same element" />
    </>
  );
}
```

The important consequence is **where the element is created**. JSX creates a
plain object describing what to render; it does not render anything. So when a
parent writes `<Layout sidebar={<UserMenu user={user} />} />`, the `UserMenu`
element is built in the parent, closing over the parent's `user`. `Layout`
receives an opaque object and places it. It never sees `user`.

That is why composition removes prop drilling: the props never travel, because
the element was already assembled at the top.

Slot elements also keep their position in the **React tree** at the place they
are rendered, not the place they were written. Context, error boundaries and
Suspense boundaries apply based on where the container renders the slot.

## Common patterns

### Prop drilling, composition, and context — the same UI three ways

A `<Toolbar>` deep inside a layout needs the current user. Here is the version
almost everyone writes first.

```jsx
function Avatar({ user }) {
  return <img src={user.avatarUrl} alt={user.name} width={24} height={24} />;
}

function Toolbar({ user }) {
  return <div className="toolbar"><Avatar user={user} /></div>;
}

function Page({ user }) {
  return <main><Toolbar user={user} /></main>;
}

export function Drilled() {
  const user = { name: 'Ada Okoye', avatarUrl: '/ada.png' };
  return <Page user={user} />;
}
```

`Page` does not use `user`. Neither does `Toolbar`, really — it hands it
straight to `Avatar`. Two components carry a prop for someone else.

Composition removes both hops by moving element creation up:

```jsx
function Avatar({ user }) {
  return <img src={user.avatarUrl} alt={user.name} width={24} height={24} />;
}

function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}

function Page({ toolbar }) {
  return <main>{toolbar}</main>;
}

export function Composed() {
  const user = { name: 'Ada Okoye', avatarUrl: '/ada.png' };
  return <Page toolbar={<Toolbar><Avatar user={user} /></Toolbar>} />;
}
```

`Page` and `Toolbar` now know nothing about users, so they are reusable in
places where no user exists.

Context is the third option, and it is the right one when the value is needed by
**many** components at unpredictable depths:

```jsx
import { createContext, useContext } from 'react';

const CurrentUserContext = createContext(null);

function Avatar() {
  const user = useContext(CurrentUserContext);
  return <img src={user.avatarUrl} alt={user.name} width={24} height={24} />;
}

export function WithContext() {
  const user = { name: 'Ada Okoye', avatarUrl: '/ada.png' };
  return (
    <CurrentUserContext value={user}>
      <main><div className="toolbar"><Avatar /></div></main>
    </CurrentUserContext>
  );
}
```

Choosing between them:

| Situation | Use |
|---|---|
| One or two hops, one consumer | Pass the prop |
| The middle components do not use the value | Composition |
| Many consumers, unknown depth, app-wide value | Context |
| The value changes on every keystroke | Prop or local state, not context |

> [!NOTE]
> Since **19.0** you render the context object itself as the provider:
> `<CurrentUserContext value={user}>`. `<Context.Provider>` still works but is
> deprecated.

Most prop drilling complaints are really composition problems. Try composition
before you add another context — it costs no extra re-render behavior and no
extra concept.

### Compound components

When several components must share state but the caller controls the markup
between them, pair composition with a private context. This is how `<Tabs>`,
`<Select>` and `<Accordion>` are usually built.

```jsx live
import { createContext, useContext, useState } from 'react';

const TabsContext = createContext(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tab components must be rendered inside <Tabs>.');
  }
  return context;
}

function Tabs({ defaultTab, children }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return (
    <TabsContext value={{ activeTab, setActiveTab }}>
      <div>{children}</div>
    </TabsContext>
  );
}

function TabList({ children }) {
  return <div role="tablist" style={{ display: 'flex', gap: 4 }}>{children}</div>;
}

function Tab({ id, children }) {
  const { activeTab, setActiveTab } = useTabs();
  const selected = activeTab === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => setActiveTab(id)}
      style={{
        padding: '6px 12px',
        border: 'none',
        borderBottom: selected ? '2px solid #4f46e5' : '2px solid transparent',
        background: 'none',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function TabPanel({ id, children }) {
  const { activeTab } = useTabs();
  if (activeTab !== id) return null;
  return <div role="tabpanel" style={{ padding: 12 }}>{children}</div>;
}

export default function AccountSettings() {
  return (
    <Tabs defaultTab="profile">
      <TabList>
        <Tab id="profile">Profile</Tab>
        <Tab id="billing">Billing</Tab>
      </TabList>
      <TabPanel id="profile">Name, email and time zone.</TabPanel>
      <TabPanel id="billing">Card on file ending 4242.</TabPanel>
    </Tabs>
  );
}
```

The caller can wrap a `<Tab>` in a tooltip, reorder the panels, or put the tab
list at the bottom. A `tabs={[{ id, label, content }]}` prop would forbid all
three.

The throwing `useTabs` hook matters: it turns "renders nothing, no idea why"
into a message naming the mistake.

### Render props

A render prop is a slot that the container **calls** with data, instead of an
element it merely places.

```jsx live
import { useState } from 'react';

function Hoverable({ children }) {
  const [hovering, setHovering] = useState(false);
  return (
    <div
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      style={{ display: 'inline-block' }}
    >
      {children(hovering)}
    </div>
  );
}

export default function PriceRow() {
  return (
    <Hoverable>
      {(hovering) => (
        <span style={{ padding: 8, background: hovering ? '#eef2ff' : '#fff' }}>
          $49.00 {hovering ? '— billed yearly' : ''}
        </span>
      )}
    </Hoverable>
  );
}
```

Custom hooks replaced most render props, and a hook is usually clearer. Render
props still win in three cases:

- The shared logic must also **render something** — a wrapper element, a portal,
  an error boundary, a Suspense boundary.
- The state must be scoped to a region of the tree rather than to a component
  instance. A hook lives in whichever component calls it; a render prop can wrap
  exactly one subtree.
- You need many instances of the behavior inside one component. Hooks cannot be
  called in a loop; render props can be rendered in one.

> [!LEGACY]
> Higher-order components — `withRouter(Component)`, `connect(Component)` — were
> the pre-hooks answer to sharing logic. They still work in React 19, but they
> obscure the component name in stack traces, collide over prop names, and are
> awkward to type. Write a custom hook instead; keep HOCs for maintaining
> existing code and for wrapping a component you do not control.

## Advanced example

Slots and compound components combine well. A dialog shell can own focus,
layout and the close button while the caller owns everything else.

```jsx
import { useId } from 'react';

export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel }) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>{title}</h2>
      <div id={descriptionId}>{description}</div>
      <footer>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={onConfirm}>{confirmLabel}</button>
      </footer>
    </div>
  );
}
```

`description` is a slot, so a caller can pass a paragraph, a list of affected
records, or a warning banner. `confirmLabel` is a value, so it stays a string.
That split — UI goes in slots, values stay props — is the whole design rule.

## Common mistakes

**Adding a prop instead of a slot.** The tell is a prop named after markup:
`icon`, `hasFooter`, `renderBadge`, `titleClassName`. Two of those in one
component means the caller wanted to render something and you gave them a knob.

**Reading into `children`.** `Children.map` and `Children.only` couple the
container to the caller's exact element shape. A caller wrapping children in a
fragment or a `.map()` breaks it silently. Use explicit slots or context.

**Cloning children to inject props.** `cloneElement` looks like composition but
is the opposite: the container is now deciding the child's props from a
distance. Context, as in the `<Tabs>` example, does the same job explicitly.

**Reaching for context first.** Context is a re-render mechanism with real
costs. If the only reason you want it is that two intermediate components are
carrying a prop, composition solves it with no new concepts.

**Creating one slot per corner.** `header`, `subheader`, `leading`, `trailing`,
`footer`, `footerLeft`, `footerRight` is configuration wearing a costume. At
that point publish the pieces as compound components and let callers arrange
them.

**Forgetting that a slot's context comes from where it renders.** An element
passed as a prop sits in the React tree at the container's render position, so
it sees the container's providers and error boundaries — not the caller's DOM
position.

## Related topics

- [Components](../core-concepts/components.md) — the props contract that
  composition builds on.
- [Context](../state-management/context.md) — for values many components need at
  unknown depths.
- [Custom hooks](../hooks/custom-hooks.md) — the modern replacement for most
  render props and every HOC.
- [Error boundaries](./error-boundaries.md) — a component that exists purely to
  wrap `children`.
- [Portals](./portals.md) — composition where the DOM position and the React
  tree position differ.
