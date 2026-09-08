---
title: Generic components
description: Write components whose props depend on the data, and build a polymorphic as prop without losing type safety.
group: typescript
order: 60
status: current
since: "19.0"
related: [typescript/typing-props, typescript/typing-children, patterns/composition, performance/memoization]
---

## Overview

A generic component is a component function with a type parameter. It exists so
that a value the caller passes in — an array of items, a selected value, a
render callback — keeps its real type all the way through the component and back
out again.

The React-specific parts are two: a syntax quirk in `.tsx` files, and the fact
that some React helpers erase your type parameter on the way through.

## Why it exists

Consider a list component. Without a type parameter, `items` has to be typed as
`unknown[]` or `any[]`, and the `renderItem` callback receives that. The caller
knows the items are `Invoice`s; the component throws that knowledge away and the
callback has to cast it back.

A type parameter carries the caller's knowledge through the component. Nothing
is cast, nothing is asserted, and renaming a field on `Invoice` produces an
error inside every render callback that reads it.

## When to use it

Reach for a type parameter when a prop's type must *relate* to another prop's
type — a list and its item renderer, a value and its options, a form field name
and the shape it indexes into.

## When not to use it

If no two props are related, you do not need a generic. A component with one
`<T>` used in exactly one place is a component whose prop should have been
`unknown`.

Polymorphic `as` props in particular have a real cost: worse error messages,
slower type-checking, and a signature few people on the team can read. A union
of three concrete components usually wins.

## Basic example

A list that preserves the item type:

```tsx
import type { ReactNode } from 'react';

type ListProps<Item> = {
  items: readonly Item[];
  getKey: (item: Item) => string;
  renderItem: (item: Item) => ReactNode;
  emptyMessage?: string;
};

export function List<Item>({ items, getKey, renderItem, emptyMessage }: ListProps<Item>) {
  if (items.length === 0) {
    return <p>{emptyMessage ?? 'Nothing here yet.'}</p>;
  }
  return (
    <ul>
      {items.map(item => (
        <li key={getKey(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

type Invoice = { id: string; number: string; amountCents: number };

export function InvoiceList({ invoices }: { invoices: readonly Invoice[] }) {
  return (
    <List
      items={invoices}
      getKey={invoice => invoice.id}
      renderItem={invoice => (
        <span>{invoice.number} — {(invoice.amountCents / 100).toFixed(2)}</span>
      )}
    />
  );
}
```

`Item` is inferred as `Invoice` from `items`, so both callbacks get a typed
parameter with no annotation at the call site. That inference is the entire
payoff.

## How it works

### The `.tsx` arrow-function ambiguity

In a `.tsx` file, `<T>` at the start of an arrow function parses as JSX. The
parser sees an opening tag, not a type parameter list.

```text
// Error in .tsx: JSX element 'T' has no corresponding closing tag.
const identity = <T>(value: T) => value;
```

Three ways out, in order of preference:

```tsx
// 1. Use a function declaration. No ambiguity, and it hoists.
export function first<Item>(items: readonly Item[]): Item | undefined {
  return items[0];
}

// 2. Add a trailing comma to force the type-parameter parse.
export const last = <Item,>(items: readonly Item[]): Item | undefined =>
  items[items.length - 1];

// 3. Add a constraint, which also disambiguates.
export const count = <Item extends unknown>(items: readonly Item[]): number =>
  items.length;
```

Write components as function declarations and the problem never comes up. The
`<Item,>` form is worth recognizing because you will read it in other people's
code.

### Constraining the parameter

`extends` narrows what the caller may pass and gives you members to use inside:

```tsx
import type { ReactNode } from 'react';

type Identifiable = { id: string };

type SelectableListProps<Item extends Identifiable> = {
  items: readonly Item[];
  selectedId: string | null;
  onSelect: (item: Item) => void;
  renderItem: (item: Item) => ReactNode;
};

export function SelectableList<Item extends Identifiable>({
  items,
  selectedId,
  onSelect,
  renderItem,
}: SelectableListProps<Item>) {
  return (
    <ul role="listbox">
      {items.map(item => (
        <li
          key={item.id}
          role="option"
          aria-selected={item.id === selectedId}
          onClick={() => onSelect(item)}
        >
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
```

Now `getKey` is unnecessary — the constraint guarantees `item.id`. Constraints
buy you API simplicity, not just safety.

### Relating two props to each other

The pattern that justifies generics most clearly: a field name constrained to
the keys of a record, with the value typed by that key.

```tsx
type FieldProps<Values extends Record<string, string>, Name extends keyof Values & string> = {
  name: Name;
  values: Values;
  onChange: (name: Name, value: Values[Name]) => void;
  label: string;
};

export function Field<Values extends Record<string, string>, Name extends keyof Values & string>({
  name,
  values,
  onChange,
  label,
}: FieldProps<Values, Name>) {
  return (
    <p>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        value={values[name]}
        onChange={event => onChange(name, event.currentTarget.value as Values[Name])}
      />
    </p>
  );
}

type ProfileValues = { displayName: string; location: string };

export function ProfileForm({
  values,
  onChange,
}: {
  values: ProfileValues;
  onChange: (name: keyof ProfileValues & string, value: string) => void;
}) {
  return (
    <>
      <Field values={values} name="displayName" label="Display name" onChange={onChange} />
      <Field values={values} name="location" label="Location" onChange={onChange} />
    </>
  );
}
```

`<Field values={values} name="emial" ... />` is a compile error, and autocomplete
offers the real field names. No runtime check could do that.

## Common patterns

### Generics through `memo`

`memo` erases type parameters. Its signature returns a
`MemoExoticComponent<T>`, whose props are computed once from the component type
— there is nowhere for a caller's `Item` to be inferred.

```tsx
import { memo } from 'react';
import type { ReactNode } from 'react';

type RowProps<Item> = {
  item: Item;
  render: (item: Item) => ReactNode;
};

function RowInner<Item>({ item, render }: RowProps<Item>) {
  return <li>{render(item)}</li>;
}

// Without the cast, Item is fixed to unknown and every caller must annotate.
export const Row = memo(RowInner) as typeof RowInner;
```

The cast is still required in `@types/react` 19 — the memo overloads have not
changed to preserve type parameters. It is a genuine assertion, not a
formality: you are telling TypeScript to keep the original callable signature
and forget that the value is now a memo object. That is safe for calling it as a
component and wrong if you then read `.type` or `displayName` off it.

> [!TIP]
> Before adding the cast, ask whether the `memo` is earning anything. The React
> Compiler memoizes component output automatically, and a hand-written `memo`
> around a small row component usually costs more in complexity than it saves.
> See [Memoization](../performance/memoization.md).

### Generic components with a `ref`

Since React 19, `ref` is a plain prop, so a generic component can accept one
without any wrapper — and the type parameter survives:

```tsx
import type { Ref, ReactNode } from 'react';

type ComboBoxProps<Option> = {
  options: readonly Option[];
  getLabel: (option: Option) => string;
  onSelect: (option: Option) => void;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
};

export function ComboBox<Option>({
  options,
  getLabel,
  onSelect,
  children,
  ref,
}: ComboBoxProps<Option>) {
  return (
    <div ref={ref} role="combobox" aria-expanded="true">
      {children}
      <ul role="listbox">
        {options.map(option => (
          <li key={getLabel(option)} role="option" aria-selected={false}>
            <button type="button" onClick={() => onSelect(option)}>
              {getLabel(option)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> [!NOTE]
> Before React 19 this needed a ref-forwarding wrapper, and that wrapper erased
> the type parameter exactly the way `memo` still does. Since **19.0** the
> problem is gone for refs.

## Advanced example

The polymorphic `as` prop, built in three stages. Read all three before using
any of them.

### Stage 1: accept a tag name

```tsx
import type { ElementType, ReactNode } from 'react';

type TextProps = {
  as?: ElementType;
  tone?: 'default' | 'muted';
  children: ReactNode;
};

export function Text({ as, tone = 'default', children }: TextProps) {
  const Component = as ?? 'span';
  return <Component className={`text text--${tone}`}>{children}</Component>;
}
```

This renders correctly and type-checks, but it is barely typed:
`<Text as="a">` compiles and `href` is rejected, because `TextProps` knows
nothing about anchors.

### Stage 2: make the element a type parameter

```tsx
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

type TextOwnProps = {
  tone?: 'default' | 'muted';
  children: ReactNode;
};

type TextProps<T extends ElementType> = TextOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof TextOwnProps | 'as'>;

export function Text<T extends ElementType = 'span'>({
  as,
  tone = 'default',
  children,
  ...rest
}: TextProps<T>) {
  const Component: ElementType = as ?? 'span';
  return (
    <Component className={`text text--${tone}`} {...rest}>
      {children}
    </Component>
  );
}

export function Usage() {
  return (
    <>
      <Text>Plain text</Text>
      <Text as="a" href="/pricing" tone="muted">Pricing</Text>
      <Text as="h2" id="section-title">Section title</Text>
    </>
  );
}
```

Now `href` is accepted on `as="a"` and rejected on `as="h2"`. The `Omit` is what
stops your own prop names from colliding with the element's.

Two details about the local variable. It must be capitalized, or JSX treats
`<component>` as an unknown intrinsic tag. And its type must not include
`undefined` — `<Component />` where `Component` is `T | undefined` fails with
"cannot be used as a JSX component", which is what the `?? 'span'` fallback
prevents. Annotating the local as `ElementType` is a common belt-and-braces
habit; a deferred `T extends ElementType` is a valid JSX element type on its
own, so the annotation is not strictly required here.

### Stage 3: add the ref

`ComponentPropsWithRef<T>` includes the `ref` for whichever element `T` resolves
to, so a caller passing `as="a"` gets `Ref<HTMLAnchorElement>` and one passing
`as="button"` gets `Ref<HTMLButtonElement>`:

```tsx
import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react';

type BoxOwnProps = {
  padding?: 'none' | 'small' | 'large';
  children?: ReactNode;
};

type BoxProps<T extends ElementType> = BoxOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithRef<T>, keyof BoxOwnProps | 'as'>;

export function Box<T extends ElementType = 'div'>({
  as,
  padding = 'none',
  children,
  ...rest
}: BoxProps<T>) {
  const Component: ElementType = as ?? 'div';
  return (
    <Component data-padding={padding} {...rest}>
      {children}
    </Component>
  );
}

export function BoxUsage() {
  return (
    <Box as="section" aria-label="Summary" padding="large">
      <Box as="p">Total due this month.</Box>
    </Box>
  );
}
```

> [!WARNING]
> Count the cost before shipping this. The signature is unreadable to most
> readers, error messages mention `Omit<ComponentPropsWithRef<T>, ...>` instead
> of the prop you got wrong, and every instantiation adds real type-checking
> time in a large app. It also cannot express "this element, but with these
> extra required props" without more conditional types on top.
>
> Three named components — `Text`, `Heading`, `Link` — cover most design systems
> with better errors and no type-level machinery at all. Use `as` when you are
> building a general-purpose layout primitive that genuinely must render as any
> element, and not before.

## Common mistakes

**Writing `const List = <Item>(props) => ...` in a `.tsx` file.** It parses as
JSX. Use a function declaration, or `<Item,>`.

**Wrapping a generic component in `memo` without the cast.** The type parameter
is silently fixed to `unknown`, and every call site starts failing on the render
callback's parameter.

**Rendering `<Component>` when the local can be `undefined`.** `as` is optional,
so `const Component = as` has type `T | undefined` and TypeScript rejects it as
a JSX element type. Supply the fallback: `const Component = as ?? 'div'`.

**Forgetting the `Omit`.** If your own prop and the element's prop share a name,
the intersection becomes `never` for that key and nothing you pass is
acceptable.

**Adding a type parameter that appears exactly once.** A parameter used in one
position is not relating anything. Use `unknown` and narrow.

**Reaching for a polymorphic `as` prop by default.** It is the most expensive
pattern in this document, in both compile time and reader time. It should be a
deliberate decision about two or three primitives, not a house style.

## Related topics

- [Typing props](./typing-props.md) — `ComponentProps` and the discriminated unions that often replace a generic.
- [Typing children](./typing-children.md) — render props, which are how a generic hands data back to the caller.
- [Composition](../patterns/composition.md) — the runtime patterns these types describe.
- [Memoization](../performance/memoization.md) — whether the `memo` in the cast example is worth having at all.
- [TypeScript setup](./setup.md) — the compiler options these examples depend on.
