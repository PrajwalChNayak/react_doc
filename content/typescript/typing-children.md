---
title: Typing children
description: Choose between ReactNode, ReactElement, ComponentType and friends, and know what each one actually accepts.
group: typescript
order: 40
status: current
since: "19.0"
related: [typescript/typing-props, typescript/generic-components, patterns/composition, core-concepts/components]
---

## Overview

`children` is a prop with an unusually wide domain: elements, strings, numbers,
arrays, `null`, `false`, promises. `@types/react` has a type for each level of
that domain, and picking the widest one you can live with is almost always
correct.

The type you want is `ReactNode`, most of the time, written out by hand.

## Why it exists

React renders more than elements. `{condition && <Row />}` produces `false`,
`{items.map(...)}` produces an array, `{count}` produces a number. A `children`
type that only accepted elements would reject the majority of real JSX.

The narrower types exist for the rare component that genuinely needs to inspect
or clone what it was given — a layout that reads `props.children`, a router that
needs constructors rather than elements.

## When to use it

Type `children` explicitly whenever a component accepts it. It is not implicit:
since `@types/react` 18, no component type adds `children` for you, so a
component that renders `props.children` without declaring it will not compile.

## When not to use it

If a component always renders one specific thing in one specific slot, a named
prop beats `children`. `<Card header={...} body={...} />` says more than
`<Card>` with a convention about ordering, and it types better.

## Basic example

```tsx
import type { ReactNode } from 'react';

type PanelProps = {
  title: string;
  children: ReactNode;
};

export function Panel({ title, children }: PanelProps) {
  return (
    <section aria-labelledby="panel-title">
      <h2 id="panel-title">{title}</h2>
      <div className="panel__body">{children}</div>
    </section>
  );
}
```

Two lines of type for a component that accepts anything React can render. That
is the default and you rarely need more.

## How it works

### The four types people confuse

| Type | Accepts | Use it for |
|---|---|---|
| `ReactNode` | Elements, strings, numbers, bigints, booleans, `null`, `undefined`, portals, and iterables of all of those | `children`, and any prop that renders. The default answer. |
| `ReactElement` | A single element object: `{ type, props, key }`. Not a string, not an array, not `null` | A prop you will pass to `cloneElement` or read `.type` from |
| `React.JSX.Element` | Structurally the same as `ReactElement<any, any>` | The inferred return type of a component. Almost never worth writing yourself |
| `ComponentType<P>` | A component *function or class*, not an element | A prop that takes a component to render later: `<Route component={Profile} />` |

The distinction between the last two matters at the call site:

```text
render={<Icon />}      // an element   -> ReactElement
render={Icon}          // a component  -> ComponentType
```

Passing `Icon` where `ReactElement` is expected fails, and passing `<Icon />`
where `ComponentType` is expected fails. The error messages are unhelpful, so
name the prop for what it holds: `icon` versus `iconComponent`.

### `ReactNode` includes `undefined`

`ReactNode` is a union that already contains `null` and `undefined`. That means
`children: ReactNode` is technically satisfiable by omitting `children`
entirely — but only under `exactOptionalPropertyTypes: false`, which is the
default. If you genuinely need children, and want the compiler to say so, ask
for something narrower:

```tsx
import type { ReactNode } from 'react';

type RequiredChildren = Exclude<ReactNode, null | undefined | boolean>;

export function Callout({ children }: { children: RequiredChildren }) {
  return <aside className="callout">{children}</aside>;
}

export function UsageOfCallout() {
  return <Callout>Deploys run on merge to main.</Callout>;
}
```

This is worth doing for a component whose entire purpose is to wrap content. It
is not worth doing everywhere.

### Optional children

Mark it optional when the component is useful without it:

```tsx
import type { ReactNode } from 'react';

type EmptyStateProps = {
  heading: string;
  children?: ReactNode;
};

export function EmptyState({ heading, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p>{heading}</p>
      {children ? <div className="empty-state__actions">{children}</div> : null}
    </div>
  );
}
```

The `children ? ... : null` guard is not just cosmetic — without it the wrapper
`<div>` renders empty and picks up its padding and border for no content.

### `PropsWithChildren`

`PropsWithChildren<P>` is `P & { children?: ReactNode | undefined }`. It saves
one line and costs clarity:

```tsx
import type { PropsWithChildren } from 'react';

type DialogOwnProps = { title: string };

export function Dialog({ title, children }: PropsWithChildren<DialogOwnProps>) {
  return (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
```

It always makes `children` optional, which is usually wrong for a component
called `Dialog`, and a reader has to know the helper to know whether `children`
is required. Writing `children: ReactNode` in the props type is one more line
and says exactly what is true.

> [!BEST-PRACTICE]
> Declare `children` in your props type like any other prop. Reach for
> `PropsWithChildren` only when you are wrapping a generic props type you do not
> control and cannot spell out.

## Common patterns

### `ReactElement` props now default to `unknown`

In `@types/react` 19, `ReactElement` is declared with `P = unknown` rather than
`P = any`. Code that reached into an unknown element's props stops compiling:

```tsx
import type { ReactElement } from 'react';

// Explicit props argument: the access is checked and safe.
type IconElement = ReactElement<{ name: string; size?: number }>;

export function IconSlot({ icon }: { icon: IconElement }) {
  return <span title={icon.props.name}>{icon}</span>;
}
```

Without the type argument, `icon.props` is `unknown`, and `icon.props.name` is
an error. That error is correct — nothing guaranteed the element had a `name`
prop. The fix is to state the props type, as above, or to narrow before reading.

The `react-element-default-any-props` codemod inserts casts at every affected
site so a large codebase can compile again immediately; treat those casts as a
to-do list, not a fix.

### Restricting children to a specific component

You cannot enforce this well, and you should know why before you try.

```tsx
import type { ReactElement } from 'react';

type TabProps = { label: string; children: ReactElement };

export function Tab({ label, children }: TabProps) {
  return <div role="tabpanel" aria-label={label}>{children}</div>;
}

type TabsProps = {
  children: ReactElement<TabProps> | ReactElement<TabProps>[];
};

export function Tabs({ children }: TabsProps) {
  return <div className="tabs">{children}</div>;
}
```

`ReactElement<TabProps>` only checks the *props shape*, not which component
produced the element. Any element whose props happen to include a `label` and
`children` satisfies it, and `<Tabs><div label="x">y</div></Tabs>` slips
through. Meanwhile a legitimate `{tabs.map(...)}` produces an array and a
conditional produces `false`, both of which the type now rejects. You have
bought a false guarantee and paid for it with false positives.

Two honest alternatives:

**Data instead of elements.** Take the tabs as a prop and render them yourself.
Now the shape is fully checked, and the component controls its own markup.

```tsx
import type { ReactNode } from 'react';

type TabDefinition = {
  id: string;
  label: string;
  content: ReactNode;
};

type TabsProps = {
  tabs: readonly TabDefinition[];
  activeId: string;
  onSelect: (id: string) => void;
};

export function Tabs({ tabs, activeId, onSelect }: TabsProps) {
  const active = tabs.find(tab => tab.id === activeId);
  return (
    <>
      <div role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === activeId}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active && (
        <div role="tabpanel" id={`panel-${active.id}`} aria-labelledby={`tab-${active.id}`}>
          {active.content}
        </div>
      )}
    </>
  );
}
```

**Slot props.** Give each region its own named prop typed as `ReactNode`. You
lose the nesting syntax and gain a contract the compiler can actually check.

### Render props: `children` as a function

`children` does not have to render. Typing it as a function is how you hand
state back to the caller:

```tsx
import { useState } from 'react';
import type { ReactNode } from 'react';

type DisclosureProps = {
  children: (state: { isOpen: boolean; toggle: () => void }) => ReactNode;
};

export function Disclosure({ children }: DisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);
  return <>{children({ isOpen, toggle: () => setIsOpen(open => !open) })}</>;
}

export function FaqItem() {
  return (
    <Disclosure>
      {({ isOpen, toggle }) => (
        <div>
          <button type="button" onClick={toggle} aria-expanded={isOpen}>
            Shipping times
          </button>
          {isOpen && <p>Orders ship within two business days.</p>}
        </div>
      )}
    </Disclosure>
  );
}
```

The callback's parameter is inferred at the call site, so consumers get full
autocomplete with no annotation. This is the pattern that replaces "restrict
children to a component" in most cases where you actually needed control.

### Components as props

When the prop holds a component rather than an element, `ComponentType<P>` is the
type, and you render it by giving the variable a capitalized name:

```tsx
import type { ComponentType } from 'react';

type IconProps = { size?: number };

type MenuItemProps = {
  label: string;
  Icon: ComponentType<IconProps>;
};

export function MenuItem({ label, Icon }: MenuItemProps) {
  return (
    <span className="menu-item">
      <Icon size={16} />
      {label}
    </span>
  );
}
```

Prefer passing an element (`icon: ReactNode`) unless you must control the props
yourself. An element is already configured; a component type forces you to know
its full props contract.

## Advanced example

A layout with three typed slots, a required body, and children forwarded as a
render prop for the one region that needs state:

```tsx
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

type SidebarState = { isCollapsed: boolean; toggle: () => void };

type AppShellProps = {
  header: ReactNode;
  sidebar: (state: SidebarState) => ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function AppShell({ header, sidebar, children, footer }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarId = useId();

  const state: SidebarState = {
    isCollapsed,
    toggle: () => setIsCollapsed(collapsed => !collapsed),
  };

  return (
    <div className="app-shell">
      <header>{header}</header>
      <nav id={sidebarId} aria-label="Primary" hidden={isCollapsed}>
        {sidebar(state)}
      </nav>
      <main>{children}</main>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}
```

`header` and `footer` are `ReactNode` because they are inert. `sidebar` is a
function because it needs the collapse state. `children` is `ReactNode` and
required, because a shell with no content is meaningless. Each slot's type
records a real decision.

## Common mistakes

**Expecting `children` to be implicit.** No React 19 type adds it. If your
component renders `props.children`, declare it.

**Using `React.JSX.Element` for `children`.** It accepts a single element and
rejects strings, arrays, `null` and conditionals — that is, most JSX. Use
`ReactNode`.

**Typing `children` as `ReactElement` to "make sure it is an element".** It
breaks `{items.map(...)}` and `{flag && <X />}` and still does not tell you
which component produced the element.

**Reading `element.props.somethingSpecific` on a plain `ReactElement`.** In
`@types/react` 19 that is `unknown`. Supply the props type argument or narrow.

**Reaching for `Children.map` and `cloneElement` to inject props into
children.** It breaks on fragments, arrays and conditionals, is invisible to
anyone reading the child, and is not type-safe. Use context or a render prop.

**`PropsWithChildren` on a component that requires children.** It makes
`children` optional and the compiler stops helping.

## Related topics

- [Typing props](./typing-props.md) — the props types these children types sit inside.
- [Composition](../patterns/composition.md) — the runtime patterns behind slots and render props.
- [Generic components](./generic-components.md) — render props whose parameter type depends on the data.
- [Components](../core-concepts/components.md) — what React actually accepts as renderable output.
- [TypeScript setup](./setup.md) — the `ReactElement` props default change and its codemod.
