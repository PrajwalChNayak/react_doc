---
title: Typing props
description: Type component props with type aliases, discriminated unions and derived native element props.
group: typescript
order: 20
status: current
since: "19.0"
related: [typescript/typing-children, typescript/typing-events, typescript/generic-components, core-concepts/props]
---

## Overview

A React component is a function whose parameter is an object. Typing props means
typing that parameter — nothing more exotic than that. Everything on this page
follows from treating the component as an ordinary function.

React 19 removed the two runtime prop APIs that used to compete with types:
prop-shape declarations and prop defaulting on function components. The type
annotation and the default parameter value are now the only way to express
either.

## Why it exists

Props are the contract between two components written by two people at two
different times. TypeScript makes that contract checkable at the call site,
which is where the mistake actually happens — a caller passing `count` as a
string, or forgetting `onSelect` entirely.

The higher-value part is the part types do that runtime checks never could:
expressing that two props are mutually exclusive, or that one prop is required
*only* when another has a particular value.

## When to use it

Always type the props parameter explicitly. Inference from usage does not exist
for a component's own parameter — an untyped props object is implicitly `any`,
and `strict` will reject it.

## When not to use it

Do not type internal implementation details as props. If a value is derived
inside the component, it is not a prop. If a prop exists purely so a parent can
reach through and configure something two levels down, the fix is composition,
not a broader type — see [Composition](../patterns/composition.md).

## Basic example

```tsx
type InvoiceRowProps = {
  invoiceNumber: string;
  amountCents: number;
  currency?: string;
  onOpen: (invoiceNumber: string) => void;
};

export function InvoiceRow({
  invoiceNumber,
  amountCents,
  currency = 'USD',
  onOpen,
}: InvoiceRowProps) {
  const amount = (amountCents / 100).toFixed(2);
  return (
    <tr onClick={() => onOpen(invoiceNumber)}>
      <td>{invoiceNumber}</td>
      <td>{currency} {amount}</td>
    </tr>
  );
}
```

Three things are doing real work: `currency` is optional in the type and gets a
default parameter value, the callback's parameter type is stated so the parent's
handler is checked, and the return type is inferred rather than annotated.

### `type` or `interface`

Prefer `type` for props.

| | `type` | `interface` |
|---|---|---|
| Union of prop shapes | Yes | No |
| Intersection with `&` | Yes | Only by `extends` |
| Extending a native element's props | `& ComponentProps<'button'>` | `extends ComponentProps<'button'>` |
| Reopened by declaration merging | No | Yes |
| Mapped and conditional types | Yes | No |

The deciding factor is the first row. Discriminated unions are the highest-value
prop pattern in React and they require a `type`. Declaration merging — the one
thing `interface` can do that `type` cannot — is a feature you want for
augmenting a library's types and actively do not want for your own props, where
it lets any file in the program silently widen your component's contract.

## How it works

### Optional props and defaults

An optional prop is `?` in the type plus a default in the destructuring
parameter. The default runs on every render where the prop is `undefined`.

```tsx
type BadgeProps = {
  label: string;
  tone?: 'neutral' | 'success' | 'danger';
  dismissible?: boolean;
};

export function Badge({ label, tone = 'neutral', dismissible = false }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`}>
      {label}
      {dismissible && <button type="button" aria-label={`Dismiss ${label}`}>×</button>}
    </span>
  );
}
```

> [!DEPRECATED]
> React 19 removed `defaultProps` on function components and removed
> `propTypes` entirely. Default parameter values replace the first; the props
> type replaces the second. Class components still read `defaultProps`, but you
> should not be writing new class components.
>
> There is a real behavioral difference: `defaultProps` was applied by React
> before your function ran, so it also affected `element.props`. A default
> parameter value only exists inside the function body.

### Deriving props from a DOM element

`ComponentProps<'button'>` is every prop `<button>` accepts, including all
`aria-*` attributes and every event handler. Use it instead of hand-listing
`className`, `disabled`, `type` and the fifteen others you will forget.

```tsx
import type { ComponentProps } from 'react';

type IconButtonProps = ComponentProps<'button'> & {
  icon: string;
  label: string;
};

export function IconButton({ icon, label, ...buttonProps }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} {...buttonProps}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
```

There are three variants, and the difference is only about `ref`:

| Type | Includes `ref`? | Use when |
|---|---|---|
| `ComponentProps<T>` | For an intrinsic element, yes | Quick derivation from a tag name |
| `ComponentPropsWithRef<T>` | Yes, explicitly | You forward the rest of the props to a real DOM node |
| `ComponentPropsWithoutRef<T>` | No | Your wrapper handles `ref` itself, or does not render a matching DOM node |

Be explicit. `ComponentPropsWithRef<'button'>` and
`ComponentPropsWithoutRef<'button'>` say what you mean; `ComponentProps<'button'>`
makes the reader work out which one it resolved to.

### Deriving props from another component

`typeof` turns a component value into a type, and `ComponentProps` reads its
parameter:

```tsx
import type { ComponentProps } from 'react';

export function Button(props: ComponentProps<'button'>) {
  return <button {...props} />;
}

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, 'type'>;

export function SubmitButton(props: SubmitButtonProps) {
  return <Button type="submit" {...props} />;
}
```

This keeps the wrapper honest: widen `Button`'s props and `SubmitButton` follows
automatically. It also means a breaking change to `Button` shows up as an error
in every wrapper, which is the point.

### `ref` is an ordinary prop

Since React 19, `ref` is passed through props like anything else. Declare it in
the props type and use it:

```tsx
import type { ComponentPropsWithRef } from 'react';

type TextFieldProps = ComponentPropsWithRef<'input'> & {
  label: string;
};

export function TextField({ label, id, ...inputProps }: TextFieldProps) {
  return (
    <p>
      <label htmlFor={id}>{label}</label>
      <input id={id} {...inputProps} />
    </p>
  );
}
```

If you want to name the ref explicitly rather than absorbing it from
`ComponentPropsWithRef`, its type is `Ref<HTMLInputElement>`:

```tsx
import type { Ref } from 'react';

type SearchInputProps = {
  ref?: Ref<HTMLInputElement>;
  placeholder?: string;
};

export function SearchInput({ ref, placeholder }: SearchInputProps) {
  return <input ref={ref} type="search" placeholder={placeholder} />;
}
```

`Ref<T>` is the *incoming* type — a callback, a ref object, or `null` — because
a parent may pass any of the three. `RefObject<T>` is what `useRef` returns.
Accepting `RefObject<T>` would reject a caller's ref callback.

> [!NOTE]
> Before React 19 this component needed a wrapper to receive a ref at all.
> Since **19.0**, declaring `ref` in the props type is the whole story.

## Common patterns

### Discriminated unions for mutually exclusive props

This is the pattern worth learning properly. When a prop is only meaningful in
one mode, a union of shapes keyed on a literal discriminant makes the
impossible combinations unrepresentable.

```tsx
type NoticeProps =
  | { severity: 'info'; message: string }
  | { severity: 'warning'; message: string; expiresAt: string }
  | { severity: 'error'; message: string; onRetry: () => void };

export function Notice(props: NoticeProps) {
  return (
    <div role={props.severity === 'error' ? 'alert' : 'status'}>
      <p>{props.message}</p>
      {props.severity === 'warning' && <small>Expires {props.expiresAt}</small>}
      {props.severity === 'error' && (
        <button type="button" onClick={props.onRetry}>Try again</button>
      )}
    </div>
  );
}
```

`<Notice severity="info" onRetry={...} />` is now a compile error, and
`<Notice severity="error" message="Upload failed" />` is an error too, because
`onRetry` is required in that arm. Neither is expressible with one flat type and
optional properties.

> [!WARNING]
> Destructuring in the parameter list destroys the narrowing. Once you write
> `function Notice({ severity, message, onRetry }: NoticeProps)`, TypeScript has
> lost the link between `severity` and the other two, and `onRetry` becomes
> possibly-undefined everywhere. Keep `props` whole, narrow on
> `props.severity`, and destructure *inside* the narrowed branch if you want to.

When the two arms share no discriminant, use `never` on the excluded key:

```tsx
type AvatarProps = { name: string } & (
  | { imageUrl: string; initials?: never }
  | { imageUrl?: never; initials: string }
);

export function Avatar(props: AvatarProps) {
  if (props.imageUrl !== undefined) {
    return <img src={props.imageUrl} alt={props.name} />;
  }
  return <span aria-label={props.name}>{props.initials}</span>;
}
```

This is less pleasant than a real discriminant and produces worse error
messages. Add an explicit `variant` prop if you can — the ugliness of the
`never` trick is a signal that the component is doing two jobs.

### Read-only arrays and object props

Props are not yours to mutate. Typing array props as `readonly` documents that
and prevents an accidental in-place `sort` — a classic source of "the list
reorders but does not re-render".

```tsx
type Tag = { readonly id: string; readonly name: string };

type TagListProps = {
  tags: readonly Tag[];
};

export function TagList({ tags }: TagListProps) {
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <ul>
      {sorted.map(tag => <li key={tag.id}>{tag.name}</li>)}
    </ul>
  );
}
```

## Advanced example

Combining the pieces: a component derived from a native element, narrowed by a
discriminant, with a required accessible name in the icon-only case.

```tsx
import type { ComponentPropsWithRef, ReactNode } from 'react';

type BaseProps = Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  tone?: 'primary' | 'danger';
};

type ActionButtonProps = BaseProps & (
  | { appearance: 'text'; children: ReactNode }
  | { appearance: 'icon'; icon: ReactNode; label: string }
);

export function ActionButton(props: ActionButtonProps) {
  const { tone = 'primary' } = props;

  if (props.appearance === 'icon') {
    const { appearance, icon, label, tone: _tone, ...rest } = props;
    return (
      <button type="button" className={`btn btn--${tone}`} aria-label={label} {...rest}>
        <span aria-hidden="true">{icon}</span>
      </button>
    );
  }

  const { appearance, children, tone: _tone, ...rest } = props;
  return (
    <button type="button" className={`btn btn--${tone}`} {...rest}>
      {children}
    </button>
  );
}
```

An icon-only button without a `label` no longer compiles, which turns an
accessibility rule into a type error. That is the best use of the type system in
a component library.

> [!DEPRECATED]
> `React.FC<Props>` is not removed, but do not reach for it. Before
> `@types/react` 18 it silently added `children` to every component, which is
> why it acquired its reputation. That is fixed, and what remains is a type that
> annotates the wrong thing: it types the *variable* rather than the parameter,
> so it fixes the return type, blocks generic components, and gives worse
> inference for default parameter values. Annotate the props parameter instead —
> `function Badge(props: BadgeProps)` — and let the return type infer.

## Common mistakes

**Destructuring a discriminated union in the parameter list.** Narrowing is lost
before the body starts. Take `props` whole.

**Reaching for `interface` out of habit.** It cannot express the union, and the
moment you need one you rewrite the type anyway.

**Hand-listing native attributes.** `{ className?: string; disabled?: boolean }`
on a button wrapper means every consumer eventually asks you to add one more.
Derive from `ComponentPropsWithRef<'button'>` once.

**Typing a callback prop as `Function` or `() => void` when it takes
arguments.** `() => void` is assignable *from* a handler that ignores its
arguments, which is convenient, but declaring it that way when you actually call
`onChange(nextValue)` hides the value from the caller.

**Using `object` or `Record<string, unknown>` for a config prop.** It accepts
everything and tells the caller nothing. Write the shape.

**Optional props with no default.** `tone?: 'primary' | 'danger'` without
`= 'primary'` pushes `undefined` into every branch that reads it. Either give it
a default or make it required.

## Related topics

- [Typing children](./typing-children.md) — `ReactNode`, `ReactElement` and why
  writing `children` yourself beats a helper type.
- [Typing events](./typing-events.md) — typing the handler props this page
  declares.
- [Generic components](./generic-components.md) — when the props type needs to
  depend on the data, and the polymorphic `as` prop.
- [Props](../core-concepts/props.md) — how props behave at runtime.
- [TypeScript setup](./setup.md) — the compiler options these examples assume.
