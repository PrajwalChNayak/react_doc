---
title: JSX
description: The syntax React uses to describe UI, and what the compiler turns it into.
group: core-concepts
order: 10
status: current
related: [core-concepts/components, core-concepts/conditional-rendering, core-concepts/lists-and-keys]
---

## Overview

JSX is a syntax extension for JavaScript. It looks like HTML, but it is compiled
away before it ever reaches the browser. Every JSX tag becomes a plain function
call that returns a plain object describing what you want on screen.

That object is a React element. It is a description, not a DOM node. React reads
the description and decides what to do with the real DOM.

```jsx
const greeting = <h1 className="title">Hello</h1>;
```

Because JSX is JavaScript, everything you already know applies: variables,
function calls, `map`, ternaries, template literals. There is no separate
template language to learn and no separate set of control-flow keywords.

## Why it exists

Rendering logic and markup are not separable in practice. The condition that
decides whether a button is disabled lives next to the button. JSX lets you keep
them in the same file, in the same expression, without inventing a template
dialect.

The alternative is writing element calls by hand:

```js
// What JSX saves you from writing.
import { createElement } from 'react';

const greeting = createElement('h1', { className: 'title' }, 'Hello');
```

That is legal and still works, but it becomes unreadable three levels deep.

## When not to use it

You can skip JSX entirely if you cannot add a build step. React ships
`createElement` for exactly that case, and libraries such as `htm` offer a
tagged-template alternative. Both are niche. Every mainstream React toolchain
compiles JSX for you, so the default answer is to use it.

Do not use JSX to build strings. If you need HTML as text, produce the string
directly. JSX produces objects, not markup.

## Basic example

```jsx live
export default function OrderSummary() {
  const customer = 'Priya';
  const items = ['Keyboard', 'USB-C cable', 'Laptop stand'];
  const total = 42.5;

  return (
    <section className="order">
      <h2>Order for {customer}</h2>
      <p>
        {items.length} items &middot; ${total.toFixed(2)}
      </p>
      <button type="button" disabled={items.length === 0}>
        Checkout
      </button>
    </section>
  );
}
```

Three things are happening: `{customer}` embeds a JavaScript expression,
`disabled={items === 0}` passes a real boolean rather than a string, and the
whole thing returns a single root element.

## How it works

### The modern automatic runtime

Since React 17, the compiler emits imports from `react/jsx-runtime` instead of
calls to `React.createElement`. This source:

```jsx
export function Badge() {
  return <span className="badge">New</span>;
}
```

compiles to roughly this:

```js
import { jsx as _jsx } from 'react/jsx-runtime';

export function Badge() {
  return _jsx('span', { className: 'badge', children: 'New' });
}
```

Elements with more than one child use `jsxs`. A `key` is passed as a separate
third argument, which is why `key` never appears in the component's props.

> [!NOTE]
> Because the runtime is imported for you, `import React from 'react'` is no
> longer needed in files that only use JSX. That has been true since **React 17**
> and the modern transform is **required** in React 19 — `ref` as a prop and the
> JSX speed improvements depend on it. If you see a warning about an outdated
> JSX transform, update your build tooling.

You still import the hooks and components you use by name:

```jsx
import { useState } from 'react';

export function Toggle() {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen((value) => !value)}>
      {open ? 'Hide' : 'Show'}
    </button>
  );
}
```

### One root element, or a Fragment

A component returns one element. Wrap siblings in a `<div>` when you want the
wrapper in the DOM, or in a Fragment when you do not.

```jsx
import { Fragment } from 'react';

export function ProductRow() {
  return (
    <Fragment>
      <dt>Weight</dt>
      <dd>340 g</dd>
    </Fragment>
  );
}
```

`<>...</>` is shorthand for `<Fragment>`. Use the long form when you need a
`key`, which the shorthand cannot take.

### Attributes are props, and they are camelCase

JSX attribute names are JavaScript property names, so they follow JavaScript
conventions rather than HTML ones.

| HTML | JSX |
|---|---|
| `class` | `className` |
| `for` | `htmlFor` |
| `tabindex` | `tabIndex` |
| `onclick="..."` | `onClick={handler}` |
| `stroke-width` | `strokeWidth` |
| `maxlength` | `maxLength` |

`class` and `for` are reserved words in JavaScript, which is where those two
renames come from. `data-*` and `aria-*` keep their dashes and stay lowercase.

### Curly braces open a JavaScript expression

`{}` accepts any expression — not a statement. `{if (x) ...}` is a syntax error;
use a ternary or move the branch above the `return`.

Double braces are not special syntax. `style={{ color: 'red' }}` is an object
literal inside an expression slot, and inline style keys are camelCased:
`backgroundColor`, not `background-color`.

### Every tag closes

`<img>` and `<br>` must be written `<img />` and `<br />`. JSX has no void
elements; an unclosed tag is a parse error.

### Comments

Inside JSX, a comment is a JavaScript comment in an expression slot:

```jsx
export function Panel() {
  return (
    <div>
      {/* Rendered on the server too. */}
      <p>Details</p>
    </div>
  );
}
```

### Whitespace

JSX collapses whitespace the way you would expect from HTML in most cases, but
it removes newlines-with-indentation between elements entirely. If you need a
literal space between two elements, write `{' '}`:

```jsx
export function Byline() {
  return (
    <p>
      <strong>Ana Ruiz</strong>{' '}
      <span>Senior editor</span>
    </p>
  );
}
```

### What renders and what does not

Strings and numbers render. `null`, `undefined`, `true` and `false` render
nothing. This is what makes `{condition && <Thing />}` work — and it is also the
source of the most common JSX bug, because `0` is a number, so it renders.

```jsx live
export default function CartBadge() {
  const counts = [0, 3];

  return (
    <ul>
      {counts.map((count) => (
        <li key={count}>
          count = {count}, using &&: [{count && <b>{count} items</b>}]
        </li>
      ))}
    </ul>
  );
}
```

The first row prints a stray `0`. See
[conditional rendering](./conditional-rendering.md) for the fix.

Arrays render each item in order, which is why `map` works directly inside JSX.
Objects do not render and throw an error instead.

## Common patterns

### Passing an element as a prop

Elements are values, so they can be passed around like any other value:

```jsx live
function Dialog({ title, footer, children }) {
  return (
    <div style={{ border: '1px solid #999', padding: 12, borderRadius: 6 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div>{children}</div>
      <hr />
      <div>{footer}</div>
    </div>
  );
}

export default function DeleteAccount() {
  return (
    <Dialog
      title="Delete account"
      footer={<button type="button">Confirm</button>}
    >
      <p>This removes all of your saved reports.</p>
    </Dialog>
  );
}
```

### Choosing the component at runtime

A capitalized identifier in tag position is treated as a variable. A lowercase
name is treated as a literal DOM tag string. To pick a component dynamically,
put it in a capitalized variable first:

```jsx
function InfoCallout({ children }) {
  return <aside className="callout callout-info">{children}</aside>;
}

function WarningCallout({ children }) {
  return <aside className="callout callout-warning">{children}</aside>;
}

export function Callout({ tone = 'info', children }) {
  const Component = tone === 'warning' ? WarningCallout : InfoCallout;
  return <Component>{children}</Component>;
}
```

`const component = InfoCallout; return <component />` renders a literal
`<component>` DOM tag instead. The capital letter is the whole rule.

## Advanced example

### `dangerouslySetInnerHTML`

React escapes every string you interpolate, so `{userComment}` can never inject
markup. When you genuinely need to insert HTML, you must opt out by name:

```jsx
export function ReleaseNotes({ trustedHtml }) {
  return <div dangerouslySetInnerHTML={{ __html: trustedHtml }} />;
}
```

> [!WARNING]
> The prop is verbose on purpose. Passing unsanitized, user-controlled HTML here
> is a cross-site scripting vulnerability — an attacker can run JavaScript in
> your users' sessions. Only pass HTML you generated yourself or ran through a
> sanitizer such as DOMPurify, and never combine it with `children` on the same
> element.

### URLs in `src` and `href`

React 19 throws an error when a `javascript:` URL is passed to `src` or `href`,
where earlier versions only warned. This closes a common injection path where a
URL taken from a database or a query string ends up in an anchor.

```jsx
export function ProfileLink({ url, label }) {
  const safe = url.startsWith('https://') ? url : '#';
  return <a href={safe}>{label}</a>;
}
```

Validate the protocol before rendering. If you need behavior on click, use a
`<button>` with an `onClick` handler instead of a URL that executes code.

## Common mistakes

**Returning two elements without a wrapper.** `return <p>a</p><p>b</p>;` does not
parse. Wrap them in `<>...</>`.

**Writing `class` instead of `className`.** React 19 does not silently accept it
on components; on DOM elements it produces a warning and the class is not
applied as you expect. Use `className`.

**Rendering `0` by accident.** `{items.length && <List />}` renders `0` when the
list is empty. Write `{items.length > 0 && <List />}`.

**Calling a handler instead of passing it.** `onClick={handleDelete()}` runs
`handleDelete` during render and passes its return value. Write
`onClick={handleDelete}` or `onClick={() => handleDelete(id)}`. See
[events](./events.md).

**Using a lowercase component name.** `<myButton />` compiles to the literal DOM
tag `"myButton"`, not to your component. Component names must be capitalized.

**Putting a statement in braces.** `{for (...) {}}` and `{if (...) {}}` are
errors. Compute the value above the `return` and interpolate the result.

**Interpolating an object.** `{user}` where `user` is an object throws. You
probably meant `{user.name}`.

## Related topics

- [Components](./components.md) — the functions that JSX is written inside.
- [Conditional rendering](./conditional-rendering.md) — the `&&`, ternary and
  `null` patterns in full, including the `0` trap.
- [Lists and keys](./lists-and-keys.md) — how `map` and `key` behave in JSX.
- [Rendering](./rendering.md) — what React does with the elements JSX produces.
- [Typing props](../typescript/typing-props.md) — giving JSX attributes types.
