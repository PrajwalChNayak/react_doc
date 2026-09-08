---
title: Components
description: The function that takes props and returns UI, and the purity rule that makes it work.
group: core-concepts
order: 20
status: current
related: [core-concepts/props, core-concepts/rendering, core-concepts/strict-mode]
---

## Overview

A component is a JavaScript function that takes an object of props and returns
what should appear on screen. That is the entire contract.

```jsx
export function StatusPill({ status }) {
  return <span className={`pill pill-${status}`}>{status}</span>;
}
```

Two conventions turn a function into a component: its name starts with a capital
letter, and it returns React elements (or `null`). Nothing else is required — no
base class, no registration, no decorator.

Components compose. A page is a component that renders layout components, which
render feature components, which render form controls. The same mechanism works
at every level, which is why React has no concept of "widget" versus "page".

## Why it exists

Splitting a UI into components buys three things.

**Reuse.** A `<Button>` written once looks the same everywhere and changes in one
place.

**Isolation.** State declared inside a component belongs to that component
instance. Two `<SearchBox />` elements have independent state without any extra
work.

**A rendering boundary.** React tracks components individually, so when state
changes it re-renders that component's subtree rather than the whole app. The
boundaries you draw are the boundaries React optimizes along.

## When to use it

Extract a component when a piece of markup has its own name, its own state, or
its own reason to change. "This block is 40 lines long" is a weaker signal than
"this block has a job I can name."

Extract when the same markup appears twice with different data. Do not extract
before the second use — a premature abstraction with six configuration props is
harder to read than the duplication it replaced.

## When not to use it

Do not create a component whose only job is to hold a variable. If you find
yourself passing eight props down through a component that uses none of them,
you want [composition](../patterns/composition.md) — pass the rendered element as
`children` instead.

Do not define a component inside another component's body:

```jsx
import { useState } from 'react';

export function ProfilePage() {
  const [name, setName] = useState('');

  // Wrong: a brand-new function identity on every render.
  function NameField() {
    return <input value={name} onChange={(e) => setName(e.target.value)} />;
  }

  return <NameField />;
}
```

Every render creates a different `NameField` function. React compares element
types by identity, sees a different type, and unmounts and remounts the subtree —
destroying its DOM state, including focus and cursor position. Define components
at the top level of a module and pass data through props.

## Basic example

```jsx live
function Avatar({ name, color }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: color,
        color: 'white',
        fontWeight: 600,
      }}
    >
      {initials}
    </span>
  );
}

function ReviewerRow({ name, color, role }) {
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 6 }}>
      <Avatar name={name} color={color} />
      <span>
        <strong>{name}</strong> — {role}
      </span>
    </li>
  );
}

export default function ReviewerList() {
  const reviewers = [
    { id: 1, name: 'Ana Ruiz', color: '#2b6cb0', role: 'Editor' },
    { id: 2, name: 'Tom Beck', color: '#2f855a', role: 'Legal' },
  ];

  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {reviewers.map((reviewer) => (
        <ReviewerRow
          key={reviewer.id}
          name={reviewer.name}
          color={reviewer.color}
          role={reviewer.role}
        />
      ))}
    </ul>
  );
}
```

`Avatar` knows nothing about reviewers. `ReviewerRow` knows nothing about the
list. Each layer only knows its own props.

## How it works

### Composition and `children`

Anything you nest inside a component's tags arrives as the `children` prop.

```jsx live
function Card({ title, children }) {
  return (
    <section
      style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </section>
  );
}

export default function BillingPage() {
  return (
    <Card title="Current plan">
      <p>Team — $49 / month</p>
      <button type="button">Change plan</button>
    </Card>
  );
}
```

`Card` never mentions buttons or paragraphs. It owns the frame; the caller owns
the contents. This is the single most useful pattern in React, and it is how you
avoid deep prop chains. [Composition](../patterns/composition.md) covers slots,
layout components and the "pass an element, not a flag" rule in depth.

### Naming and file conventions

- Component names are `PascalCase`. Lowercase tags compile to DOM elements, so
  `<userCard />` renders a literal `<userCard>` tag.
- One primary component per file, named after the file. `ReviewerRow.jsx`
  exports `ReviewerRow`.
- File names in this documentation's own source are kebab-case; component files
  in an app are conventionally `PascalCase.jsx` or `PascalCase.tsx`. Pick one
  convention per repo and enforce it with a lint rule.
- Small helper components used only by one parent can live in the same file,
  below the component that uses them.
- Prefer named exports. They keep the name stable across the codebase and make
  auto-import reliable; a `default` export can be imported under any name, which
  is how `Card` becomes `Panel` in one file and `Box` in another.

### Purity: the rule that everything else depends on

A component must be a pure function of its props and state **during render**.
Given the same props and state, it returns the same output and changes nothing
outside itself.

Concretely, during render you must not:

- mutate variables that existed before the render, including props, state, and
  module-level objects
- write to the DOM, `document.title`, `localStorage`, or a cache
- call a state setter of another component
- read a value that changes on its own, such as `Date.now()` or `Math.random()`,
  if the output must be stable

```jsx
let renderCount = 0;

export function BadCounter() {
  renderCount += 1; // Impure: mutates a module variable during render.
  return <p>Rendered {renderCount} times</p>;
}
```

Side effects belong in event handlers (which run in response to a user action,
not during render) or, for synchronization with an external system, in
[`useEffect`](../hooks/use-effect.md).

### Why purity matters

React does not promise to render your component exactly once per update.

**Concurrent rendering.** React may start rendering, pause to handle a more
urgent update, throw the partial work away, and start again. Anything your
component did on the abandoned attempt still happened. If that was "increment a
counter" or "push to an array", the state is now wrong in a way that only shows
up under load.

**Strict Mode.** In development, React deliberately calls your component body
twice so impure code becomes obvious immediately instead of in production. See
[Strict Mode](./strict-mode.md).

**Memoization.** React — and the [React Compiler](../performance/react-compiler.md) —
may skip re-rendering a component whose inputs did not change. That is only safe
if the output depended on nothing but those inputs.

**`<Activity>` and Suspense.** Both can render a subtree that is not currently
visible, or unmount and later restore one. Pure components tolerate this;
impure ones leak.

Purity is not a style preference. It is the precondition for every performance
feature React has.

### Rendering nothing

Returning `null` renders nothing and is a normal, supported result. The
component still mounts, still holds state, and still runs its Effects.

```jsx
export function Banner({ message }) {
  if (!message) {
    return null;
  }
  return <div role="status">{message}</div>;
}
```

## Common patterns

### Props with defaults

Use ordinary JavaScript default parameters:

```jsx
export function Button({ variant = 'secondary', children }) {
  return (
    <button type="button" className={`btn btn-${variant}`}>
      {children}
    </button>
  );
}
```

> [!LEGACY]
> React 19 removed `defaultProps` for function components. Default parameters
> are the replacement and have been the recommended approach for years — they
> are plain JavaScript, so type inference and editors understand them.
> `propTypes` was removed at the same time and is now silently ignored; use
> TypeScript for prop validation instead. See
> [removed APIs](../migration/removed-apis.md).

### Typing a component

TypeScript replaces the runtime prop checks React used to provide, and catches
mistakes before the code runs:

```tsx
type StatusPillProps = {
  status: 'draft' | 'review' | 'published';
  compact?: boolean;
};

export function StatusPill({ status, compact = false }: StatusPillProps) {
  return (
    <span className={compact ? 'pill pill-sm' : 'pill'}>{status}</span>
  );
}
```

[Typing props](../typescript/typing-props.md) goes further, including `children`
and generic components.

## Advanced example

A component whose only job is layout, with two element-shaped props and no
knowledge of what goes in them:

```jsx live
function SplitPane({ label, primary, secondary }) {
  return (
    <div>
      <h4 style={{ margin: '0 0 8px' }}>{label}</h4>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 2, border: '1px solid #ddd', padding: 10 }}>
          {primary}
        </div>
        <aside style={{ flex: 1, border: '1px solid #ddd', padding: 10 }}>
          {secondary}
        </aside>
      </div>
    </div>
  );
}

function ArticleBody() {
  return <p>React components are functions that return elements.</p>;
}

function TableOfContents() {
  return (
    <ul style={{ paddingLeft: 18, margin: 0 }}>
      <li>Overview</li>
      <li>Purity</li>
    </ul>
  );
}

export default function DocsPage() {
  return (
    <SplitPane
      label="Docs"
      primary={<ArticleBody />}
      secondary={<TableOfContents />}
    />
  );
}
```

`SplitPane` can be reused for a settings page or a dashboard without changing a
line, because it never learned what an article is.

### Class components

> [!LEGACY]
> Class components still render in React 19 and will keep working, but they are
> not the way to write new code. They cannot use hooks, they carry the
> `this`-binding and lifecycle-method complexity that hooks were designed to
> remove, and several React 19 features — `ref` as a prop, Actions, `use()` — are
> function-component features. The one place a class is still required is an
> [error boundary](../patterns/error-boundaries.md), because `componentDidCatch`
> has no hook equivalent.

```tsx legacy
// Pre-hooks style. Do not write new components this way.
import { Component } from 'react';

type ClockProps = { label: string };
type ClockState = { now: Date };

class Clock extends Component<ClockProps, ClockState> {
  intervalId: number | undefined;
  state: ClockState = { now: new Date() };

  componentDidMount() {
    this.intervalId = window.setInterval(
      () => this.setState({ now: new Date() }),
      1000
    );
  }

  componentWillUnmount() {
    window.clearInterval(this.intervalId);
  }

  render() {
    return (
      <time>
        {this.props.label}: {this.state.now.toLocaleTimeString()}
      </time>
    );
  }
}
```

The function equivalent uses [`useState`](../hooks/use-state.md) and
[`useEffect`](../hooks/use-effect.md), with the cleanup function replacing
`componentWillUnmount`. [Legacy codebases](../migration/legacy-codebases.md)
walks through converting classes incrementally.

## Common mistakes

**Defining a component inside another component.** The child's type identity
changes every render, so React remounts it and its state is lost. Move it to the
module top level.

**Lowercase component names.** `<card />` becomes the DOM tag `"card"`, renders
nothing useful, and produces no error you would recognize.

**Doing work during render that should be in an event handler.** Sending
analytics, writing to storage, or mutating a cache during render runs on every
render attempt, including the ones React throws away.

**Storing derived data in state.** If a value can be computed from props or other
state, compute it during render. See [state](./state.md#common-mistakes).

**Mutating props.** Props are the parent's data. Copy before changing:
`const next = { ...user, name };`.

**Splitting components by file size rather than by responsibility.** A 300-line
component with one job is easier to work with than five components that only
make sense together.

**Assuming the component runs once.** It runs whenever React needs its output —
which, in development under Strict Mode, is at least twice per update.

## Related topics

- [Props](./props.md) — how data reaches a component and why it is read-only.
- [State](./state.md) — the memory a component keeps between renders.
- [Rendering](./rendering.md) — when React calls your component and what it does
  with the result.
- [Strict Mode](./strict-mode.md) — the development check that finds impure
  components.
- [Composition](../patterns/composition.md) — `children`, slots, and avoiding
  prop drilling.
- [Your first component](../getting-started/your-first-component.md) — a guided
  walkthrough if this is your first one.
