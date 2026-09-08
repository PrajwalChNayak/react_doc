---
title: useId
description: Generate a unique ID that matches between server and client.
group: hooks
order: 140
status: current
since: "19.2"
related: [accessibility/forms-accessibility, accessibility/semantics, server-react/ssr-and-hydration, core-concepts/lists-and-keys]
---

## Overview

`useId` returns a stable, unique string you can use in HTML `id` attributes and
the ARIA attributes that point at them.

```text
const id = useId()
```

It takes no parameters and returns a string that is:

- unique per `useId` call, per component instance;
- identical on the server and on the client, so hydration matches;
- stable for the lifetime of that component instance.

```jsx live
import { useId } from 'react';

export default function EmailField() {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>Email address</label>
      <input id={id} type="email" />
      <p>Generated id: <code>{id}</code></p>
    </div>
  );
}
```

## Why it exists

HTML `id`s must be globally unique on a page, but React components are designed
to be rendered many times. A component that hard-codes `id="email"` breaks the
moment it appears twice — the second `<label htmlFor="email">` silently points at
the first input.

The obvious workaround, a module-level counter, fails under server rendering.
The server increments its counter in one order and the client increments its own
in another, hydration finds `id="input-3"` where it expected `id="input-7"`, and
React reports a mismatch.

`useId` derives the id from the component's **position in the tree**, not from a
counter. The same position produces the same id on both sides, whatever order
things render in.

## When to use it

- Pairing a `<label htmlFor>` with an `<input id>`.
- Any ARIA relationship attribute: `aria-describedby`, `aria-labelledby`,
  `aria-controls`, `aria-activedescendant`, `aria-errormessage`.
- `<input list>` pointing at a `<datalist id>`, or a `form` attribute pointing at
  a `<form id>`.
- Any reusable component that needs an `id` and might be rendered more than once.

## When not to use it

- **List keys.** This is the headline anti-pattern. Keys must come from your
  data so React can match an item across renders and reorders. A `useId` key
  would be regenerated per component instance and defeat reconciliation
  entirely. See [Lists and keys](../core-concepts/lists-and-keys.md).
- **Cache keys for [`use()`](./use.md).** Ids are stable once mounted, but they
  are not a property of your data. Derive cache keys from the data.
- **Database or record identifiers.** It is an id for the DOM, nothing more.
- **A CSS hook.** Use a class name. The generated value is opaque and may change
  between React versions.
- **Async Server Components.** `useId` cannot currently be used there.

## Basic example

Several related ids from a **single** `useId` call. This is the recommended
shape: call the hook once, then suffix.

```jsx live
import { useId, useState } from 'react';

export default function PasswordField() {
  const id = useId();
  const [password, setPassword] = useState('');
  const tooShort = password.length > 0 && password.length < 12;

  return (
    <div>
      <label htmlFor={`${id}-input`}>Password</label>
      <input
        id={`${id}-input`}
        type="password"
        value={password}
        onChange={event => setPassword(event.target.value)}
        aria-describedby={`${id}-hint`}
        aria-invalid={tooShort}
        aria-errormessage={tooShort ? `${id}-error` : undefined}
      />
      <p id={`${id}-hint`}>Use at least 12 characters.</p>
      {tooShort && (
        <p id={`${id}-error`} role="alert">
          That password is too short.
        </p>
      )}
    </div>
  );
}
```

One call, three ids. Calling `useId` three times would work too, but it is more
hook calls for no benefit, and it makes the relationship between the ids less
obvious in the code.

## How it works

### The generated format

React builds the id from the "parent path" — where in the component tree the
call happened. Because the path does not depend on render order, the server and
client agree.

> [!NOTE]
> **In React 19.2 the default prefix changed from `:r:` to `_r_`.** Colons are
> not valid in a CSS identifier, so the old ids could not be used with
> `document.querySelector('#' + id)` without escaping, and they were incompatible
> with View Transitions, which key on element names. The new format is a valid
> CSS selector as-is.

Never parse, slice, or assume anything about the string. Treat it as opaque:
concatenate a suffix, and nothing else.

### Across re-renders

The same component instance gets the same id on every render. Re-render a
hundred times and `useId` returns the same string.

Unmount and remount the component and you may get a different id — it is tied to
the instance, not to identity in your data. That is another reason it makes a
poor key.

Because the value is stable, it never needs to appear in a dependency array, and
including it costs nothing.

### StrictMode

StrictMode's double render calls `useId` twice, and both calls return the same
value — the id comes from the tree position, which is unchanged. The
mount/unmount/remount cycle may produce a different id after the remount, which
is expected and harmless as long as nothing outside React stored the old one.

### Concurrent rendering

Concurrent React can render components in any order, interleave them, and
discard partial work. A counter-based scheme would produce different ids
depending on which renders happened to complete; the parent-path scheme is
immune, because the path is a property of the tree rather than of the execution.

This is also why `useId` requires an **identical component tree on the server and
the client**. If the trees differ — a conditional that reads `window`, a
`typeof document !== 'undefined'` branch — the paths diverge and the ids will
not match.

## Common patterns

### Multiple React roots on one page: `identifierPrefix`

Two independent React apps on the same page can generate the same ids, because
each computes paths from its own root. The `identifierPrefix` root option
namespaces them.

```jsx static="Needs a real DOM and two mount points — no sandbox preview."
import { createRoot } from 'react-dom/client';

function App() {
  return <p>Widget</p>;
}

const checkout = createRoot(document.getElementById('checkout'), {
  identifierPrefix: 'checkout-',
});
checkout.render(<App />);

const sidebar = createRoot(document.getElementById('sidebar'), {
  identifierPrefix: 'sidebar-',
});
sidebar.render(<App />);
```

`identifierPrefix` is accepted by `createRoot`, `hydrateRoot`, and the server
rendering APIs such as `renderToPipeableStream`.

> [!WARNING]
> For a server-rendered app the client's `identifierPrefix` must **match** the
> one used on the server. Different prefixes produce different ids and a
> hydration mismatch on every element that uses one.

### A reusable field component

The point of `useId` is that the caller never has to think about ids.

```jsx live
import { useId } from 'react';

function LabeledInput({ label, hint = '', ...inputProps }) {
  const id = useId();
  return (
    <p>
      <label htmlFor={`${id}-control`}>{label}</label>{' '}
      <input
        id={`${id}-control`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...inputProps}
      />
      {hint && <span id={`${id}-hint`}> {hint}</span>}
    </p>
  );
}

export default function ShippingForm() {
  return (
    <form onSubmit={event => event.preventDefault()}>
      <LabeledInput label="Street" hint="Include the unit number." />
      <LabeledInput label="City" />
      <LabeledInput label="Postal code" hint="Six characters, no spaces." />
      <button type="submit">Continue</button>
    </form>
  );
}
```

Three instances, three distinct id namespaces, and no coordination between them.

## Advanced example

A disclosure widget wiring `aria-controls` and `aria-expanded` together, plus a
`<datalist>` reference — the kind of markup where getting the ids wrong is
invisible to sighted users and broken for everyone else.

```jsx live
import { useId, useState } from 'react';

const knownCurrencies = ['CAD', 'EUR', 'GBP', 'JPY', 'USD'];

export default function AdvancedFilters() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState('');

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>Filters</h3>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(value => !value)}
      >
        {open ? 'Hide' : 'Show'} advanced filters
      </button>

      <div id={`${id}-panel`} hidden={!open}>
        <label htmlFor={`${id}-currency`}>Currency</label>
        <input
          id={`${id}-currency`}
          list={`${id}-currencies`}
          value={currency}
          onChange={event => setCurrency(event.target.value)}
          aria-describedby={`${id}-currency-hint`}
        />
        <datalist id={`${id}-currencies`}>
          {knownCurrencies.map(code => (
            <option key={code} value={code} />
          ))}
        </datalist>
        <p id={`${id}-currency-hint`}>Three-letter ISO code.</p>
      </div>
    </section>
  );
}
```

Note the `<option>` elements use `key={code}` — real data, from the array. The
`useId` value is used only for the DOM relationships.

## Common mistakes

**Using it as a list key.** `<li key={useId()}>` is not even legal — hooks
cannot be called in a loop — and hoisting the call so every row shares one id is
worse. Keys come from your data.

**Calling it in a loop or a condition.** It is a hook. Top level of a component
or custom hook, every render, no exceptions. To give each row its own id,
extract a row component.

**Generating one call per id.** Four `useId` calls for four related attributes
works, but one call plus suffixes is clearer and cheaper.

**Hard-coding the prefix.** Writing `` `:r0:` `` or `` `_r_0` `` into a test, a
CSS file, or a selector couples you to an implementation detail that already
changed once — in **19.2**.

**Different `identifierPrefix` on server and client.** Guaranteed hydration
mismatch. Configure it in one place and pass it to both.

**Rendering a different tree on the server than on the client.** Any
`typeof window !== 'undefined'` branch that changes the *structure* shifts the
parent paths and breaks every id below it.

**Using it for anything outside the DOM.** Not a database id, not a request id,
not a React `key`. It exists to connect two HTML elements.

**Assuming it survives a remount.** Persisting the id somewhere and expecting it
back after the component unmounts and remounts will not work.

## Related topics

- [Forms and accessibility](../accessibility/forms-accessibility.md) — the
  label, hint, and error wiring `useId` makes safe.
- [Semantics](../accessibility/semantics.md) — the ARIA attributes that reference
  ids.
- [Lists and keys](../core-concepts/lists-and-keys.md) — why keys must come from
  your data instead.
- [SSR and hydration](../server-react/ssr-and-hydration.md) — the mismatch
  problem `useId` was designed to prevent.
- [use](./use.md) — and why `useId` must not be used to build its cache keys.
