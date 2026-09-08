---
title: Controlled and uncontrolled inputs
description: Choosing between React state and the DOM as the source of truth for form fields.
group: patterns
order: 40
status: current
related: [patterns/forms-and-actions, hooks/use-state, hooks/use-deferred-value, accessibility/forms-accessibility]
---

## Overview

Every form field in a React app has one of two owners.

A **controlled** input takes its value from React state and reports every change
back:

```jsx
import { useState } from 'react';

export function SearchField() {
  const [query, setQuery] = useState('');
  return (
    <input
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  );
}
```

An **uncontrolled** input keeps its value in the DOM, exactly as plain HTML
does. You give it a starting value and read it when you need it:

```jsx
export function SearchForm() {
  function handleSubmit(formData) {
    console.log(formData.get('query'));
  }

  return (
    <form action={handleSubmit}>
      <input name="query" defaultValue="" />
      <button type="submit">Search</button>
    </form>
  );
}
```

Both are correct React. The choice is about who needs to know the value, and
when.

## Why it exists

React renders from state. If state does not contain the field's value, React
cannot render anything derived from it — a live character count, a filtered
list, a disabled button, a formatted phone number.

Controlled inputs exist to close that loop: state renders the input, the input
updates state, and the two can never disagree.

Uncontrolled inputs exist because that loop is not free. Every keystroke becomes
a state update and a re-render. For a 30-field settings page where nothing is
derived from the values until submit, all of that work produces the same pixels
the browser would have painted for free.

## When to use it

Reach for **controlled** when something renders from the value on every change:

- Live search, filtering, or previews.
- A character counter or a strength meter.
- Validation feedback shown while typing.
- Formatting or masking as the user types.
- A field whose value depends on another field.
- A value that must be set programmatically — "reset filters", "use my billing
  address".

Reach for **uncontrolled** when the value is only needed at submit time:

- Long forms whose fields are independent.
- Anything you already submit through `<form action>` and `FormData`.
- File inputs, which cannot be controlled.
- Wrapping a non-React widget that manages its own field.

## When not to use it

Do not control a field so you can read its value in the submit handler. That is
what `FormData` is for, and it costs zero renders.

Do not control a field because you might need the value later. Adding `value`
and `onChange` to a 30-field form to support one derived label is how forms
become slow. Control the one field that needs it.

Do not use uncontrolled inputs when the value must be reset or synchronized from
outside the form. Setting a DOM value behind React's back means reaching for a
ref and imperative writes, and you will fight the framework.

## Basic example

The comparison, side by side:

| | Controlled | Uncontrolled |
|---|---|---|
| Source of truth | React state | The DOM node |
| Written as | `value` + `onChange` | `defaultValue` / `defaultChecked` |
| Re-render cost | One render per keystroke, per field | None until submit |
| Read the value | Any time, from state | On submit via `FormData`, or via a ref |
| Validation timing | Any keystroke, trivially | On submit, or on `blur` with a ref |
| Resetting | Set state | `form.reset()`, or automatic after a successful action |
| Setting from outside | Set state | Imperative write through a ref |
| Form libraries | React Hook Form supports it, but favors uncontrolled | React Hook Form's default and fastest mode |
| File inputs | Not possible — always read-only | The only option |
| Server rendering | Value must be in state on both sides | Works with plain HTML semantics |

```jsx live
import { useState } from 'react';

const MAX = 140;

export default function StatusComposer() {
  const [status, setStatus] = useState('');
  const remaining = MAX - status.length;

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
      <label htmlFor="status">What are you working on?</label>
      <textarea
        id="status"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        rows={3}
      />
      <p style={{ margin: 0, color: remaining < 0 ? '#b91c1c' : '#52525b' }}>
        {remaining} characters left
      </p>
      <button type="button" disabled={status.trim() === '' || remaining < 0}>
        Post
      </button>
    </div>
  );
}
```

The counter and the disabled button are the justification. Remove them and this
field has no reason to be controlled.

## How it works

`onChange` in React is not the DOM `change` event. React maps it onto `input`,
so it fires on every keystroke rather than on blur. That is why controlled
inputs feel immediate, and why they re-render so often.

Passing `value` tells React the DOM must match state after every render. If a
keystroke does not produce a state update, React puts the old value back, and
the field appears frozen.

### The warnings React gives you

**`value` without `onChange`.** React warns that you provided a `value` with no
handler. Either add `onChange`, or say you meant it with `readOnly`:

```jsx
export function ApiKeyField({ apiKey }) {
  return <input value={apiKey} readOnly />;
}
```

**Switching controlled to uncontrolled.** This is almost always `undefined`
leaking in from data that has not arrived:

```jsx
export function ProfileForm({ user }) {
  // user.nickname is undefined until the fetch resolves.
  return <input value={user.nickname} onChange={() => {}} />;
}
```

React sees `undefined` and treats the input as uncontrolled; when the data
arrives it becomes controlled and React warns that a component is changing an
uncontrolled input to be controlled.

> [!WARNING]
> `null` and `undefined` both make an input uncontrolled. Default to a string:
> `value={user.nickname ?? ''}`. Do the same for numbers — `value={count ?? 0}` —
> and remember an empty number input reads as `''`, not `0`.

**The reverse switch** happens when you set state back to `undefined`, usually
from a spread over a partial object. Initialize every controlled field in your
initial state, even to `''`.

### Defaults

`defaultValue` and `defaultChecked` set the initial DOM value and are then
ignored. Changing them later does nothing, because after mount the DOM owns the
value.

If you need an uncontrolled field to pick up a new default — say, after the user
switches which record they are editing — change the `key` on the field or the
form. A new key mounts a new DOM node, which reads the new default.

```jsx
export function AddressForm({ address }) {
  return (
    <form key={address.id}>
      <input name="street" defaultValue={address.street} />
      <input name="city" defaultValue={address.city} />
    </form>
  );
}
```

## Common patterns

### Each element type

React normalizes the awkward parts of HTML forms. All of these use `value` or
`checked` on the element itself.

```jsx
import { useState } from 'react';

export function ShippingOptions() {
  const [country, setCountry] = useState('NL');
  const [speed, setSpeed] = useState('standard');
  const [giftWrap, setGiftWrap] = useState(false);
  const [notes, setNotes] = useState('');

  return (
    <fieldset>
      {/* select: value on the select, never `selected` on an option */}
      <select value={country} onChange={(event) => setCountry(event.target.value)}>
        <option value="NL">Netherlands</option>
        <option value="DE">Germany</option>
      </select>

      {/* radio group: one state value, shared name, checked derived */}
      <label>
        <input
          type="radio"
          name="speed"
          value="standard"
          checked={speed === 'standard'}
          onChange={(event) => setSpeed(event.target.value)}
        />
        Standard
      </label>
      <label>
        <input
          type="radio"
          name="speed"
          value="express"
          checked={speed === 'express'}
          onChange={(event) => setSpeed(event.target.value)}
        />
        Express
      </label>

      {/* checkbox: `checked`, and read event.target.checked */}
      <label>
        <input
          type="checkbox"
          checked={giftWrap}
          onChange={(event) => setGiftWrap(event.target.checked)}
        />
        Gift wrap
      </label>

      {/* textarea: `value`, not children */}
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
    </fieldset>
  );
}
```

Three differences from plain HTML worth memorizing: `<select value>` replaces
`<option selected>`, `<textarea value>` replaces its children, and checkboxes
use `checked` with `event.target.checked`.

For a multi-select, `value` is an array and you read the selected options from
the event target.

### File inputs are always uncontrolled

The browser will not let JavaScript set a file input's value — that would let a
page upload arbitrary files from the user's disk. So `value` is off the table.

```jsx live
import { useState } from 'react';

export default function AttachmentPicker() {
  const [names, setNames] = useState([]);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input
        type="file"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          setNames(files.map((file) => file.name));
        }}
      />
      <ul>
        {names.map((name) => <li key={name}>{name}</li>)}
      </ul>
    </div>
  );
}
```

Read `event.target.files` for immediate feedback, and read the field from
`FormData` at submit time. To clear the field, reset the form or remount the
input with a new `key`.

### Uncontrolled plus FormData

This is the pattern that Actions push you toward, and it is underrated. Give
every field a `name`, read the whole form at once, and let the DOM hold the
values in between.

```jsx live
import { useState } from 'react';

export default function InviteForm() {
  const [summary, setSummary] = useState(null);

  function handleSubmit(formData) {
    setSummary({
      email: String(formData.get('email')),
      role: String(formData.get('role')),
      notify: formData.get('notify') === 'on',
    });
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <form action={handleSubmit} style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />

        <label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue="editor">
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>

        <label>
          <input name="notify" type="checkbox" defaultChecked /> Send an email
        </label>

        <button type="submit">Send invite</button>
      </form>

      {summary ? (
        <pre style={{ background: '#f4f4f5', padding: 12, borderRadius: 8 }}>
          {JSON.stringify(summary, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
```

Not one keystroke re-renders. The form also clears itself after a successful
action — React resets uncontrolled fields when a `<form action>` function
completes without throwing. See
[forms and actions](./forms-and-actions.md) for the full behavior.

An unchecked checkbox is simply **absent** from `FormData`, which is why the
code above compares against `'on'` rather than reading a boolean.

### Keeping a controlled input fast

When something expensive renders from a controlled value, keep the input
responsive by deferring the expensive part rather than debouncing the input.

```jsx live
import { useDeferredValue, useMemo, useState } from 'react';

const CITIES = [
  'Amsterdam', 'Antwerp', 'Athens', 'Barcelona', 'Belgrade', 'Berlin',
  'Bratislava', 'Bristol', 'Brussels', 'Bucharest', 'Budapest', 'Copenhagen',
  'Dublin', 'Edinburgh', 'Florence', 'Frankfurt', 'Geneva', 'Hamburg',
  'Helsinki', 'Istanbul', 'Krakow', 'Lisbon', 'Ljubljana', 'London', 'Lyon',
  'Madrid', 'Malmo', 'Milan', 'Munich', 'Naples', 'Nice', 'Oslo', 'Paris',
  'Porto', 'Prague', 'Reykjavik', 'Riga', 'Rome', 'Rotterdam', 'Seville',
  'Sofia', 'Stockholm', 'Tallinn', 'Turin', 'Valencia', 'Vienna', 'Vilnius',
  'Warsaw', 'Zagreb', 'Zurich',
];

export default function CityFilter() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const matches = useMemo(
    () => CITIES.filter((city) => city.toLowerCase().includes(deferredQuery.toLowerCase())),
    [deferredQuery],
  );

  const stale = query !== deferredQuery;

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter cities"
      />
      <ul style={{ opacity: stale ? 0.6 : 1, transition: 'opacity 120ms' }}>
        {matches.map((city) => <li key={city}>{city}</li>)}
      </ul>
    </div>
  );
}
```

The input stays controlled and updates instantly; the list renders from the
deferred value at a lower priority. Unlike a debounce, nothing is delayed by a
fixed timer and no timeout leaks if the component unmounts mid-type.

Debouncing is still the right tool for **network requests** — deferring changes
priority, not how often you call an API.

## Common mistakes

**`value={user.name}` with no fallback.** One `undefined` and React silently
switches the input to uncontrolled, then warns when the data lands. Use `?? ''`.

**Controlling every field out of habit.** Thirty controlled fields means thirty
re-renders per keystroke of the parent that owns them. Control what you derive
from.

**`onChange={handleChange}` that reads `event.target.value` asynchronously.**
Read the value synchronously into a variable before any `await`.

**Using `selected` on `<option>` or children on `<textarea>`.** React warns and
ignores them. `value` on the parent is the only supported form.

**Trying to control a file input.** It is read-only by browser policy. Use a ref
or `FormData`, and remount with a `key` to clear.

**Changing `defaultValue` and expecting the field to update.** It is read once
at mount. Change the `key` instead.

**Debouncing state updates to make typing smooth.** That makes the input itself
lag. Update state immediately and defer the expensive consumer with
[`useDeferredValue`](../hooks/use-deferred-value.md).

**Storing derived values in state.** A `fullName` state kept in sync with
`firstName` and `lastName` will drift. Compute it during render.

## Related topics

- [Forms and actions](./forms-and-actions.md) — `<form action>`, `FormData`, and
  the React 19 hooks built on them.
- [useState](../hooks/use-state.md) — what backs every controlled input.
- [useDeferredValue](../hooks/use-deferred-value.md) — keeping typing responsive
  when rendering from the value is expensive.
- [Forms accessibility](../accessibility/forms-accessibility.md) — labels, error
  association, and required-field semantics.
- [Form libraries](../ecosystem/forms.md) — React Hook Form, and where schema
  validation fits.
