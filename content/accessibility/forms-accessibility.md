---
title: Form accessibility
description: Labels, grouping, error wiring and validation timing that hold up under React 19 Actions.
group: accessibility
order: 40
status: current
since: "19.2"
related: [accessibility/semantics, accessibility/announcements, patterns/forms-and-actions, hooks/use-id]
---

## Overview

Forms are where accessibility failures cost the most. A missing label on a
marketing page is an annoyance; on a checkout field it means the user cannot
complete the purchase.

Almost all of it comes down to four relationships: control to label, control to
description, control to error, and error to the user's attention. Each one is an
ID reference, and React gives you `useId` to generate them.

## Why it exists

A screen reader reads a form control by its accessible name, its state and its
description, all computed from the DOM rather than from what the layout looks
like. Text next to an input is not a label; it is text that happens to be
nearby. Voice control has the same dependency: the user says the words on the
label, and the software matches them against accessible names.

## When to use it

Every form. There is no size below which this stops mattering — a single-field
search box has a label, a name and an error state like everything else.

## When not to use it

There is no opt-out, but there is a wrong tool. Do not reach for ARIA when HTML
covers it: `required` beats `aria-required`, `<fieldset>` beats `role="group"`,
and a real `<label>` beats `aria-label`. See
[Semantics](./semantics.md#when-aria-is-right).

## Basic example

Label, description and error, all wired to one input with IDs from `useId`.

```jsx live
import { useId, useState } from 'react';

export default function WorkEmailField() {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const error = touched && !email.includes('@') ? 'Enter a valid email address.' : null;

  return (
    <form onSubmit={event => event.preventDefault()} style={{ fontFamily: 'system-ui' }}>
      <label htmlFor={fieldId} style={{ display: 'block', fontWeight: 600 }}>
        Work email <span aria-hidden="true">*</span>
        <span className="visually-hidden"> (required)</span>
      </label>
      <input
        id={fieldId}
        name="email"
        type="email"
        required
        value={email}
        onChange={event => setEmail(event.currentTarget.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={Boolean(error)}
        // Both IDs. The hint is always there; the error slot is always there too.
        aria-describedby={`${hintId} ${errorId}`}
        style={{ display: 'block', border: error ? '2px solid #b00020' : '1px solid #999' }}
      />
      <small id={hintId} style={{ display: 'block', color: '#555' }}>
        We use this for billing receipts only.
      </small>
      {/* Rendered from the first paint so the live region can announce into it. */}
      <p id={errorId} role="alert" style={{ color: '#b00020', minHeight: '1.4em' }}>{error}</p>
      <button type="submit">Continue</button>
    </form>
  );
}
```

Notice that `aria-describedby` lists both IDs and never changes, the error
paragraph is always mounted so `role="alert"` can announce into it, and the
asterisk is hidden because the words "(required)" carry the meaning instead.

## How it works

### Every control needs a real label

Three associations, in order of preference:

```jsx
function LabelStyles() {
  return (
    <>
      {/* Best: explicit association. Clicking the label focuses the input. */}
      <label htmlFor="street-address">Street address</label>
      <input id="street-address" name="street" />
      {/* Also valid: implicit, by wrapping. No IDs needed. */}
      <label>City <input name="city" /></label>
      {/* Last resort: no visible label anywhere on the page. */}
      <input type="search" name="query" aria-label="Search invoices" />
    </>
  );
}
```

Prefer the explicit form: wrapping breaks when a design system needs the label
and control in different grid cells. Use `aria-label` only when there is no
visible text at all — a search field whose only affordance is a magnifier icon.
When visible text *does* exist, `aria-labelledby` pointing at it beats
`aria-label`, because the accessible name then matches what a voice control user
says out loud.

> [!WARNING]
> `placeholder` is not a label. It disappears the moment the user types, so
> anyone who is interrupted loses the only clue about what the field wanted; its
> default contrast is below the WCAG minimum in every browser; and screen
> readers treat it inconsistently. Use it for an example of the format
> ("MM/YY"), never for the name of the field.

### Grouping radios and checkboxes

A radio group has two levels of label: one per option, and one for the group.
`<fieldset>` with `<legend>` is the only markup that expresses this natively —
screen readers read the legend along with each option.

```jsx
import { useId, useState } from 'react';

const plans = ['Starter — $0', 'Team — $18/user', 'Enterprise — custom'];

export default function PlanPicker() {
  const groupId = useId();
  const [plan, setPlan] = useState(plans[1]);

  return (
    <fieldset>
      <legend>Billing plan</legend>
      {plans.map(option => (
        <p key={option}>
          <input
            type="radio" id={`${groupId}-${option}`} name="plan" value={option}
            checked={plan === option}
            onChange={event => setPlan(event.currentTarget.value)}
          />
          <label htmlFor={`${groupId}-${option}`}>{option}</label>
        </p>
      ))}
    </fieldset>
  );
}
```

Every radio shares one `name`. That is what makes them a group to the browser,
gives them arrow-key navigation, and makes the whole group a single tab stop.

Use a fieldset for any set of controls that only makes sense together: a
day/month/year trio, an address block, a list of consent checkboxes. Do not wrap
a whole long form in one — a legend that says "Sign up" is read before every
single field.

### Required fields

Use the HTML `required` attribute: it sets the required state in the
accessibility tree *and* gives you native submission blocking and the
`:required` pseudo-class. `aria-required="true"` sets the state only and changes
no behavior — it exists for controls built out of non-semantic elements.

A lone `*` is not enough: one character with no accessible meaning, usually in a
low-contrast accent color, and its convention is learned rather than obvious.
Pair the visible symbol with real words, as the [Basic example](#basic-example)
does — `<span aria-hidden="true">*</span>` for sighted users and a visually
hidden `(required)` for everyone else. Or write it into the visible label and
drop the symbol: `Company (optional)`.

If most fields are required, marking the few optional ones is less noise. Either
way, state the convention above the first field.

### Wiring an error to its field

Two attributes do the work. `aria-invalid={true}` puts the control into the
invalid state, so it is announced as invalid when the user reaches it, and
`aria-describedby` points at the element holding the message, so the message is
read as the field's description.

Keep the described-by element in the DOM at all times and change its text.
Removing and re-adding it means the ID reference dangles between renders, and —
if it is also a live region — nothing announces; the same rule as in
[Announcements](./announcements.md#the-region-must-already-exist-the-bug-everyone-hits).
It accepts a space-separated list, so a field can carry a persistent hint and an
error. Keep the order stable, hint first, so the error is heard last.

> [!WARNING]
> Do not set `aria-invalid={true}` before the user has had a chance to fill the
> field. An empty required input announced as "invalid" on first arrival is
> wrong and discouraging.

### Validation timing

Validating on every keystroke tells a user their email is invalid while they are
still typing the domain — the most common way to make a form feel hostile.

| Moment | Validate | Why |
|---|---|---|
| On change, before first blur | No | The user is mid-thought |
| On blur | Yes | They finished the field |
| On change, *after* the field has already errored | Yes | Now feedback is a reward — the error clears as they fix it |
| On submit | Yes, everything | The last checkpoint |

The `touched` flag in the [Basic example](#basic-example) implements the first
two rows.

## Common patterns

### `useId` for the ID pairs

Every relationship on this page is an ID reference, and a reusable field renders
more than once. Hardcoded IDs collide, and every copy's `htmlFor` then resolves
to the first instance — so a click on the third field's label focuses the first
field's input.

Call `useId` **once** per component and derive the rest by suffixing, the way
both examples on this page do:

```text
const id      = useId();          // the control
const hintId  = `${id}-hint`;     // aria-describedby, persistent
const errorId = `${id}-error`;    // aria-describedby, changes
```

Calling the hook three times works too, but the suffix form keeps the
relationship visible.

> [!NOTE]
> React **19.2** changed the `useId` prefix from `:r:` to `_r_`, so generated IDs
> are valid CSS selectors and no longer need escaping in `document.querySelector`.
> That matters here: focusing the first invalid field is often done by selector.

### After a failed submit: focus or summary

Something has to happen when submission fails, or the user is left with an
apparently unchanged page. Two answers, for different forms.

| | Focus the first invalid field | Focus an error summary |
|---|---|---|
| Best for | Short forms, 1–5 fields | Long forms, multi-column layouts, several errors |
| The user hears | The field's label, state and error | How many errors there are, and a link to each |
| Cost | Nothing extra to render | A summary component that stays mounted |
| Risk | With eight errors the user has no idea how many remain | An extra hop before reaching the field |

For a login form, focus the field. For a checkout with three sections, render a
summary at the top, give it `tabIndex={-1}`, focus it, and make each entry a
link to the field's ID. Both share one rule: move focus, and do not *also* fire
an assertive live region for the same event — two things speaking at once means
one is lost.

### Pending state during a submit

`useFormStatus` reads the parent `<form>`'s submission state from a child.
Disabling the button is the visible half; the audible half is a live region.

```jsx
import { useFormStatus } from 'react-dom';

export default function SubmitButton({ label = 'Place order' }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" disabled={pending}>{pending ? 'Placing order…' : label}</button>
      <span role="status" className="visually-hidden">{pending ? 'Placing your order.' : ''}</span>
    </>
  );
}
```

It has to be called from a component rendered *inside* the form — it does not
see a `<form>` rendered by the same component.

### An error shape that can be wired up

`useActionState` returns whatever your action returns, so choose a shape that
maps onto the attributes you have to set: keyed by field name, one slot for
errors belonging to no field, and the submitted values echoed back.

```tsx
export type SignUpField = 'email' | 'password' | 'plan';

export type SignUpState = {
  status: 'idle' | 'success' | 'error';
  // Keyed by field name, so a field component can look up its own message.
  fieldErrors: Partial<Record<SignUpField, string>>;
  // Errors with no field: a declined card, a rate limit, a network failure.
  formError: string | null;
  values: Partial<Record<SignUpField, string>>;
};

export const initialSignUpState: SignUpState = {
  status: 'idle', fieldErrors: {}, formError: null, values: {},
};
```

Echoing `values` matters: an uncontrolled form submitted to a Server Function
re-renders empty otherwise, and re-typing a long form is where people give up.

## Advanced example

A form with an error summary, per-field wiring, and focus moved on failure.
Submit it empty.

```jsx live
import { useActionState, useEffect, useId, useRef } from 'react';

/** @type {import('react').CSSProperties} */
const hidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };

async function createAccount(previousState, formData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fieldErrors = {};

  if (!email.includes('@')) fieldErrors.email = 'Enter a valid email address.';
  if (password.length < 8) fieldErrors.password = 'Use at least 8 characters.';

  if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors, values: { email } };
  return { status: 'success', fieldErrors: {}, values: {} };
}

function Field({ id, name, label, type, error, autoComplete, defaultValue = '' }) {
  const errorId = `${id}-error`;
  return (
    <p>
      <label htmlFor={id} style={{ display: 'block', fontWeight: 600 }}>
        {label} <span aria-hidden="true">*</span><span style={hidden}> (required)</span>
      </label>
      <input
        id={id} name={name} type={type} required
        autoComplete={autoComplete} defaultValue={defaultValue}
        aria-invalid={Boolean(error)} aria-describedby={errorId}
        style={{ border: error ? '2px solid #b00020' : '1px solid #999' }}
      />
      <span id={errorId} style={{ display: 'block', color: '#b00020', minHeight: '1.3em' }}>{error}</span>
    </p>
  );
}

export default function SignUpForm() {
  const baseId = useId();
  const ids = { email: `${baseId}-email`, password: `${baseId}-password` };
  const summaryRef = useRef(null);

  const initial = { status: 'idle', fieldErrors: {}, values: {} };
  const [state, formAction, isPending] = useActionState(createAccount, initial);
  const errors = Object.entries(state.fieldErrors);

  useEffect(() => {
    // Move focus once per failed submit, not on every render.
    if (state.status === 'error') summaryRef.current.focus();
  }, [state]);

  return (
    <form action={formAction} style={{ fontFamily: 'system-ui', lineHeight: 1.6 }}>
      <p>All fields are required.</p>

      {/* Always mounted. Empty when there is nothing wrong. */}
      <div ref={summaryRef} tabIndex={-1} role={errors.length > 0 ? 'alert' : undefined}>
        {errors.length > 0 && (
          <ul style={{ border: '2px solid #b00020', color: '#b00020' }}>
            {errors.map(([field, message]) => (
              <li key={field}><a href={`#${ids[field]}`}>{message}</a></li>
            ))}
          </ul>
        )}
      </div>

      <Field
        id={ids.email} name="email" label="Email" type="email" autoComplete="email"
        defaultValue={state.values.email} error={state.fieldErrors.email}
      />
      <Field
        id={ids.password} name="password" label="Password" type="password"
        autoComplete="new-password" error={state.fieldErrors.password}
      />

      <button type="submit" disabled={isPending}>{isPending ? 'Creating…' : 'Create account'}</button>
      <p role="status" style={{ minHeight: '1.4em' }}>
        {state.status === 'success' ? 'Account created.' : ''}
      </p>
    </form>
  );
}
```

The summary is mounted from the first render and carries `role="alert"` only
when it holds something, so a failure both moves focus and reads. Each entry
links to the field's `id` — which is what makes the `useId` hygiene load
bearing.

> [!BEST-PRACTICE]
> Add `autoComplete` to every field that maps to a known token — `email`,
> `name`, `tel`, `street-address`, `new-password`. For users with motor or
> cognitive disabilities it is the difference between a two-minute form and a
> twenty-minute one.

## Common mistakes

**A placeholder used as the label.** It vanishes on input, fails contrast, and
is announced inconsistently. Add a real `<label>` — and spell the attribute
`htmlFor`, because `for` is a reserved word in JavaScript and the wrong spelling
fails silently.

**Hardcoded `id` values in a reusable field.** The second instance duplicates
every ID, and every `htmlFor` resolves to the first. Use `useId`.

**Conditionally rendering the error element.** The `aria-describedby` reference
dangles, and a live region that mounts with its message already inside does not
announce. Render it always and change its text.

**`aria-invalid={true}` on an untouched empty field.** It announces failure
before the user has done anything. Same for validating on every keystroke:
validate on blur, then on change once the field has errored, then on submit.

**A bare `*` as the only required marker.** One unlabeled character. Add the
word, visually hidden if the design demands it.

**Radios in `<div>`s instead of a `<fieldset>`.** Each option is announced with
no idea which question it answers.

**A spinner as the only pending signal.** Disable the control *and* announce it
— see [Announcements](./announcements.md).

**Moving focus and firing an assertive live region for the same failure.** Two
things speak at once and one is lost. Pick one.

## Related topics

- [Forms and Actions](../patterns/forms-and-actions.md) — the React 19 Action model these examples build on.
- [Controlled inputs](../patterns/controlled-inputs.md) — when to hold input value in state, and when not to.
- [Announcements](./announcements.md) — live regions, in depth.
- [Focus management](./focus-management.md) — moving focus to the first invalid field or the summary.
- [useId](../hooks/use-id.md) — the hook behind every ID pair here.
