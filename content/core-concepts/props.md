---
title: Props
description: How data flows into a component, why it is read-only, and what changed in React 19.
group: core-concepts
order: 30
status: current
since: "19.0"
related: [core-concepts/components, core-concepts/state, patterns/composition]
---

## Overview

Props are the arguments you pass to a component. The parent writes them as JSX
attributes; the component receives them as one object.

```jsx
function PriceTag({ amount, currency }) {
  return (
    <span>
      {currency}
      {amount.toFixed(2)}
    </span>
  );
}

export function Listing() {
  return <PriceTag amount={19.99} currency="$" />;
}
```

Props flow one way: down. A child cannot reach up and change what its parent
passed. To let a child affect the parent, the parent passes a function down and
the child calls it.

## Why it exists

Props are what make a component reusable. Without them, `<PriceTag />` could only
ever show one price.

The one-way flow is the more important half. When data only moves down, there is
exactly one place that owns each value, and you can answer "why did this change?"
by walking up the tree. Two-way binding gives you the opposite: any component can
write anywhere, and a wrong value has no obvious origin.

## When to use it

Pass a prop when a parent knows something the child needs: data to display, a
callback to invoke, an element to render in a slot.

Pass a callback prop (`onSelect`, `onDismiss`) rather than passing a state setter
directly. `onSelect={(id) => setSelectedId(id)}` keeps the child ignorant of how
the parent stores its state, so the parent can switch to a reducer later without
touching the child.

## When not to use it

Do not thread a prop through five components that do not use it. That is prop
drilling, and it has two better answers: pass the rendered element down as
`children` ([composition](../patterns/composition.md)), or put the value in
[context](../state-management/context.md) if it is genuinely ambient, like a
theme or the current user.

Do not copy a prop into state so you can "change it". That creates a second
source of truth that silently goes stale when the prop updates. See
[state](./state.md#common-mistakes).

## Basic example

```jsx live
function Field({ label, hint = '', children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontWeight: 600 }}>{label}</label>
      {children}
      {hint && (
        <small style={{ color: '#666' }}>{hint}</small>
      )}
    </div>
  );
}

function Chip({ label, tone = 'neutral' }) {
  return (
    <span
      style={{
        background: tone === 'danger' ? '#fed7d7' : '#e2e8f0',
        borderRadius: 999,
        padding: '2px 10px',
        marginRight: 6,
      }}
    >
      {label}
    </span>
  );
}

export default function AccountSettings() {
  return (
    <div>
      <Field label="Display name" hint="Shown on your public profile.">
        <input defaultValue="Ana Ruiz" />
      </Field>
      <Field label="Status">
        <Chip label="Active" />
        <Chip label="Payment overdue" tone="danger" />
      </Field>
    </div>
  );
}
```

`Chip` uses a default parameter for `tone`. `Field` takes `children`. Neither
component knows anything about accounts.

## How it works

### Destructuring in the parameter list

Both of these are the same function. The destructured form is the convention,
because the signature then documents exactly what the component reads.

```jsx
function ProgressBar(props) {
  return <progress value={props.value} max={props.max} />;
}

function BetterProgressBar({ value, max }) {
  return <progress value={value} max={max} />;
}
```

### Default values

Use ordinary JavaScript default parameters:

```jsx
function Alert({ tone = 'info', dismissible = false, children }) {
  return (
    <div role="alert" className={`alert alert-${tone}`}>
      {children}
      {dismissible && <button type="button">Dismiss</button>}
    </div>
  );
}
```

Defaults apply when the prop is missing or `undefined`. They do **not** apply
when you pass `null`, which is a real value.

> [!LEGACY]
> React 19 removed `defaultProps` for function components. Default parameters
> replace it. They are plain JavaScript rather than a React-specific mechanism,
> which means TypeScript, editors and the React Compiler all understand them
> without extra work. Class components keep `defaultProps`; function components
> do not have it at all. `propTypes` was removed in the same release and is now
> ignored at runtime — use TypeScript instead. Both are covered in
> [removed APIs](../migration/removed-apis.md).

### Props are read-only

A component must never mutate its props.

```jsx
function UserBadge({ user }) {
  user.name = user.name.toUpperCase(); // Never do this.
  return <span>{user.name}</span>;
}
```

Two reasons, both structural.

First, the object belongs to the parent. Mutating it changes what the parent
thinks it owns, and every other component that received the same object.

Second, mutation during render makes the component impure. React may render a
component more than once for a single update — twice under
[Strict Mode](./strict-mode.md) in development, and any number of times when a
concurrent render is interrupted and restarted. The code above uppercases the
name again on every attempt, so the output depends on how many times React
happened to call it. Copy instead:

```jsx
function UserBadge({ user }) {
  const displayName = user.name.toUpperCase();
  return <span>{displayName}</span>;
}
```

### `children`

`children` is an ordinary prop that React fills in from whatever you nest inside
the tags. These two are identical:

```jsx
function Panel({ children }) {
  return <div className="panel">{children}</div>;
}

export function Both() {
  return (
    <>
      <Panel>Nested content</Panel>
      <Panel children="Nested content" />
    </>
  );
}
```

Always use the nesting form. It reads as markup and it lets the caller pass
multiple children without building an array.

### Spreading props

`{...props}` forwards everything at once. It is the right tool for a wrapper
component that adds behavior to a DOM element:

```jsx
function IconButton({ icon, ...rest }) {
  return (
    <button type="button" className="icon-button" {...rest}>
      {icon}
    </button>
  );
}
```

Every native button attribute — `onClick`, `disabled`, `aria-label` — now works
without `IconButton` listing them.

> [!WARNING]
> Do not spread props through your own application components:
> `<UserCard {...props} />`. It hides which props are actually used, so removing
> a prop from the parent breaks a grandchild with no compile error and no clear
> stack trace. Reserve spreading for the last hop, where the props land on a DOM
> element, and pull out the ones you consume with rest syntax first.

Order matters: `<button {...rest} className="x" />` lets your value win, while
`<button className="x" {...rest} />` lets the caller override it. Decide
deliberately.

### `ref` is a prop

Since **React 19**, `ref` is passed to function components like any other prop.
The component can accept it, name it in its parameter list, and forward it to a
DOM element.

```tsx
import { useRef } from 'react';
import type { Ref } from 'react';

type TextFieldProps = {
  label: string;
  ref?: Ref<HTMLInputElement>;
};

function TextField({ label, ref }: TextFieldProps) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
}

export function SignupForm() {
  const emailRef = useRef<HTMLInputElement>(null);

  function focusEmail() {
    emailRef.current?.focus();
  }

  return (
    <form>
      <TextField label="Email" ref={emailRef} />
      <button type="button" onClick={focusEmail}>
        Fix your email
      </button>
    </form>
  );
}
```

> [!DEPRECATED]
> Before React 19, a function component could not receive `ref` as a prop and had
> to be wrapped in `forwardRef`. Since **19.0** the wrapper is unnecessary and
> React has stated it will be deprecated and removed in a future version. Do not
> write it in new code; `npx codemod@latest react/19/migration-recipe` rewrites
> existing usages.

```tsx legacy
// React 18 style — no longer needed.
import { forwardRef } from 'react';

export const LegacyTextField = forwardRef<HTMLInputElement, { label: string }>(
  function LegacyTextField({ label }, ref) {
    return (
      <label>
        {label}
        <input ref={ref} />
      </label>
    );
  }
);
```

### `key` is not a prop

`key` looks like an attribute but React consumes it during element creation and
never puts it in the props object. `function Row({ key })` is always `undefined`.
If a component needs the identifier, pass it twice:

```jsx
function OrderRow({ id, total }) {
  return (
    <tr>
      <td>{id}</td>
      <td>{total}</td>
    </tr>
  );
}

export function OrderTable({ orders }) {
  return (
    <tbody>
      {orders.map((order) => (
        <OrderRow key={order.id} id={order.id} total={order.total} />
      ))}
    </tbody>
  );
}
```

`ref` used to behave the same way. It no longer does — that is the change React
19 made. [Lists and keys](./lists-and-keys.md) explains what `key` is for.

## Common patterns

### Props versus state

| | Props | State |
|---|---|---|
| Owner | The parent | The component itself |
| Mutable by the component | No — read-only | Yes, through the setter |
| How it changes | Parent re-renders with new values | An event calls a setter |
| Survives a re-render | Recomputed by the parent each time | Preserved by React |
| Survives an unmount | Comes back with the parent | Destroyed |
| Available on first render | Yes | Yes, from the initializer |
| Triggers a re-render when changed | The parent's change does | Yes |
| Typical use | Configuration, data, callbacks | Memory of user interaction |

The short version: props are the input, state is the memory. If two components
need the same value, it belongs in state in their common parent and reaches both
as props — see [lifting state up](../state-management/lifting-state-up.md).

### Passing elements instead of flags

When a component grows `showIcon`, `iconName`, `iconColor` and `iconPosition`
props, stop adding props and take an element:

```jsx
function Toolbar({ leading, trailing, children }) {
  return (
    <div className="toolbar">
      {leading}
      <div className="toolbar-main">{children}</div>
      {trailing}
    </div>
  );
}
```

The caller can now put anything in either slot, and `Toolbar` never grows another
prop.

## Advanced example

A well-shaped wrapper: it consumes what it needs, forwards the rest, merges
`className` rather than replacing it, and accepts a `ref`.

```tsx
import type { ComponentPropsWithRef } from 'react';

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
};

export function Button({
  variant = 'secondary',
  loading = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`btn btn-${variant} ${className}`.trim()}
      disabled={disabled || loading}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}
```

`ComponentPropsWithRef<'button'>` gives the component every native button
attribute, including `ref`, without listing them. Because `ref` is a plain prop
in React 19, this type is all the wiring a forwarding wrapper needs.

## Common mistakes

**Mutating a prop.** `props.items.push(item)` changes the parent's array in
place. React compares references, so the parent may not re-render at all, and
other consumers of the same array are now inconsistent. Build a new value:
`[...items, item]`.

**Copying props into state.** `const [name, setName] = useState(props.name)`
only reads `props.name` on the first render. When the parent passes a new name,
the state keeps the old one.

**Passing `null` and expecting the default.** Default parameters trigger on
`undefined` only. `<Alert tone={null} />` sets `tone` to `null`.

**Spreading everything everywhere.** `<Child {...props} />` at every level makes
the data flow untraceable. Name the props you pass.

**Reading `props.key`.** It is always `undefined`. Pass the value as a second,
normally named prop.

**Reaching for a "props changed" callback.** There is no such lifecycle in
function components, and you almost never need one. Compute derived values during
render; use [`useEffect`](../hooks/use-effect.md) only to synchronize with
something outside React.

**Passing a new object or arrow function every render without thinking about it.**
That is fine by default — it only matters if the child is memoized, and the
[React Compiler](../performance/react-compiler.md) handles most of those cases
for you. Do not pre-optimize with `useCallback` everywhere.

## Related topics

- [Components](./components.md) — the functions props are passed to.
- [State](./state.md) — the other half of a component's data, and when to use it
  instead.
- [Composition](../patterns/composition.md) — `children`, slots, and escaping
  prop drilling.
- [Refs and the DOM](../patterns/refs-and-dom.md) — what to do with a `ref` once
  it reaches an element.
- [Typing props](../typescript/typing-props.md) — prop types, `children` types,
  and native-element prop helpers.
- [Lists and keys](./lists-and-keys.md) — why `key` is not an ordinary prop.
