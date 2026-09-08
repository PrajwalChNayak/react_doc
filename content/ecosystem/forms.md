---
title: Forms
description: Why React 19 removed most of the reason to install a form library, and which one to use when you still need one.
group: ecosystem
order: 30
status: current
related: [patterns/forms-and-actions, patterns/controlled-inputs, accessibility/forms-accessibility]
---

## Overview

Form libraries exist because React used to make forms hard. React 19 changed
that. `<form action={fn}>`, `FormData`, `useActionState` and `useFormStatus`
cover submission, pending state, error display and optimistic UI without a
dependency — see [Forms and Actions](../patterns/forms-and-actions.md) for how
they work.

So the honest order is: **start with the platform, and add a library when you
can name the thing it does that you would otherwise write yourself.**

When you do need one, the candidates are React Hook Form, TanStack Form and
Formik, usually paired with a schema validator — Zod, Valibot or Yup. All six
are third-party projects with their own release cycles; none is part of React.

## Why it exists

Three problems survive React 19, and they are the reason form libraries still
have a job.

**Per-field state without per-keystroke re-renders.** A controlled form with
thirty inputs re-renders the whole form on every keystroke. React Hook Form's
entire design is an answer to this: keep values in uncontrolled DOM inputs,
subscribe components to individual fields, and re-render only what changed.

**Validation that spans fields and time.** "Confirm password matches password",
"end date is after start date", "at least one contact method", validated on
blur for one field and on change for another, with errors clearing correctly.
That is a state machine, and hand-rolling it is where forms go wrong.

**Arrays of fields.** Add a line item, remove the third one, reorder, and keep
every row's validation and touched state attached to the right row through all
of it.

## When to use it

Install a form library when at least one of these is true:

- **Cross-field validation.** Rules that read more than one field, or that
  change based on another field's value.
- **Field arrays.** Repeatable groups the user adds and removes.
- **A multi-step wizard.** State that must survive navigation between steps and
  validate per step before advancing.
- **Large forms with a measured input-lag problem.** Not a suspected one — see
  [Profiling](../performance/profiling.md) first.
- **A schema you already have.** If the server validates with Zod, reusing that
  schema on the client is worth the resolver package on its own.

## When not to use it

You do not need a form library for a login form, a search box, a contact form, a
settings panel, or anything else where the rules are "these fields are required
and this one is an email".

```jsx live
import { useActionState } from 'react';

const TAKEN = ['admin', 'support', 'root'];

export default function ClaimUsername() {
  const [state, formAction, isPending] = useActionState(
    async (previous, formData) => {
      const username = String(formData.get('username') ?? '').trim();

      // Validation is a function of FormData. No library, no field state.
      if (!/^[a-z0-9_]{3,}$/.test(username)) {
        return {
          status: 'error',
          message: 'At least 3 lowercase letters, numbers or underscores.',
        };
      }
      if (TAKEN.includes(username)) {
        return { status: 'error', message: `"${username}" is taken.` };
      }
      return { status: 'success', message: `"${username}" is yours.` };
    },
    { status: 'idle', message: '' },
  );

  return (
    <form action={formAction}>
      <label htmlFor="username">Username</label>{' '}
      <input
        id="username"
        name="username"
        aria-describedby="username-status"
        aria-invalid={state.status === 'error'}
      />{' '}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Checking…' : 'Claim'}
      </button>
      <p id="username-status" role="status">
        {state.message}
      </p>
    </form>
  );
}
```

Count what is missing: no `useState` per field, no `onChange` handlers, no
`isSubmitting` boolean, no manual reset. React resets an uncontrolled form after
a successful action, and `useActionState` gives you the result and the pending
flag. The same action function runs unchanged as a Server Function.

> [!BEST-PRACTICE]
> Reach for a library when the form has a *shape* problem — arrays, steps,
> cross-field rules — not when it merely has a lot of fields. Twenty independent
> required fields are still twenty independent required fields.

## Basic example

### React Hook Form

The most widely used option, and the one most codebases will meet. Its model is
uncontrolled inputs plus a subscription: `register` attaches a ref and native
event handlers to a DOM input, so typing does not go through React state at all.

```bash
npm install react-hook-form @hookform/resolvers zod
```

Define the schema once. Put it in a file both the client and the server import.

```ts
// schemas/signup.ts — imported by the form and by the API route.
import { z } from 'zod';

export const signupSchema = z
  .object({
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(12, 'Use at least 12 characters.'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

// One source of truth for the type as well as the rules.
export type SignupValues = z.infer<typeof signupSchema>;
```

```tsx static="Needs a bundler and a real endpoint to submit to."
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema } from './schemas/signup';

// Exported by the schema file as z.infer<typeof signupSchema>;
// spelled out here so this block reads on its own.
type SignupValues = {
  email: string;
  password: string;
  confirmPassword: string;
};

export default function SignupForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    // Validate on blur, then re-validate on change once a field has errored.
    mode: 'onBlur',
  });

  async function onSubmit(values: SignupValues) {
    await fetch('/api/signup', {
      method: 'POST',
      body: JSON.stringify(values),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        aria-invalid={Boolean(errors.email)}
        aria-describedby={errors.email ? 'email-error' : undefined}
        {...register('email')}
      />
      {errors.email && (
        <p id="email-error" role="alert">
          {errors.email.message}
        </p>
      )}

      <label htmlFor="password">Password</label>
      <input id="password" type="password" {...register('password')} />
      {errors.password && <p role="alert">{errors.password.message}</p>}

      <label htmlFor="confirmPassword">Confirm password</label>
      <input id="confirmPassword" type="password" {...register('confirmPassword')} />
      {errors.confirmPassword && (
        <p role="alert">{errors.confirmPassword.message}</p>
      )}

      <button type="submit" disabled={isSubmitting}>
        Create account
      </button>
    </form>
  );
}
```

`noValidate` turns off the browser's own bubbles so your messages are the only
ones shown. Keep `type="email"` anyway — it changes the mobile keyboard.

> [!TIP]
> The type argument on `useForm<SignupValues>` is what makes `register('emial')`
> a compile error rather than a field that silently never validates. The same
> type flows into `errors`, so a typo there is caught too. Without it every field
> name is an unchecked string.

> [!NOTE]
> React Hook Form declares React 19 in its peer range, and works with function
> components as written above. The resolver lives in a separate package,
> `@hookform/resolvers`, with one entry point per validator:
> `@hookform/resolvers/zod`, `/valibot`, `/yup`, and `/standard-schema` for any
> library implementing that spec.

## How it works

### Uncontrolled by default is the whole trick

A controlled input stores its value in React state, so every keystroke is a
`setState` and a render of whatever owns that state. React Hook Form instead
registers a ref on the DOM node and reads `input.value` when it needs it. Typing
touches no React state.

The cost is that anything wanting to *react* to a value as it changes must
subscribe explicitly — `watch('country')` or `useWatch` — reintroducing
re-renders for that field only. Opt-in reactivity instead of default
reactivity. Fields you must control anyway — a date picker, a rich text editor,
any third-party component that owns its own value — go through `<Controller>`.

> [!WARNING]
> Do not mix `register` and `value` on the same input. Passing both makes the
> input controlled by React and registered as uncontrolled at once; the library
> reads a stale DOM value and validation runs against the wrong thing.

### Validation belongs in a schema, not in props

You can write rules inline — `register('email', { required: 'Required' })` —
and for two fields that is fine. A schema is better for anything larger, because
it is a value you can move:

- The **server** validates with the same schema, so client rules cannot drift
  from server rules.
- The **type** is derived from the schema, so adding a field to the rules adds
  it to the type.
- The **tests** validate data without rendering a form.

| Validator | Package | Notes |
|---|---|---|
| Zod | `zod` | The default. Largest ecosystem, best error messages, biggest bundle |
| Valibot | `valibot` | Same idea, modular API designed to tree-shake to a fraction of the size |
| Yup | `yup` | Older, chainable API. Common in Formik codebases |

All three have a `@hookform/resolvers` entry point, so switching is a one-line
change at the form and a rewrite of the schema file.

### The React 19 question

Actions and a form library are not alternatives; they compose. A useful split:

- `<form action={fn}>` and `useActionState` own **submission** — pending state,
  the result, the reset, and progressive enhancement.
- The library owns **field state** — per-field validation, arrays, steps.

React Hook Form's `handleSubmit` wraps your own `onSubmit`, which means it takes
over the submit event and a plain `action` prop is not what fires. If you need
Server Functions and progressive enhancement, prefer the platform form and let
the server-side schema be the validator; if you need field arrays and
fine-grained control, prefer the library and post with `fetch`. Choosing one per
form is much simpler than blending them in one.

## Common patterns

### Field arrays

The pattern nothing on the platform gives you. `useFieldArray` keeps a stable
`id` per row so React's [keys](../core-concepts/lists-and-keys.md) stay correct
through inserts, removals and reordering — using the array index as a key here
is the classic bug.

```jsx static="Requires react-hook-form and a bundler."
import { useForm, useFieldArray } from 'react-hook-form';

const EMPTY_LINE = { description: '', amount: 0 };

export default function InvoiceEditor() {
  const { register, control, handleSubmit } = useForm({
    defaultValues: { lineItems: [EMPTY_LINE] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });

  return (
    <form onSubmit={handleSubmit((values) => console.log(values))}>
      {fields.map((field, index) => (
        // field.id is generated by the library and is stable across reorders.
        <fieldset key={field.id}>
          <legend>Line {index + 1}</legend>
          <input
            aria-label="Description"
            {...register(`lineItems.${index}.description`)}
          />
          <input
            type="number"
            aria-label="Amount"
            {...register(`lineItems.${index}.amount`, { valueAsNumber: true })}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            disabled={fields.length === 1}
          >
            Remove line {index + 1}
          </button>
        </fieldset>
      ))}
      <button type="button" onClick={() => append(EMPTY_LINE)}>
        Add line
      </button>
      <button type="submit">Save invoice</button>
    </form>
  );
}
```

`valueAsNumber` matters. Every DOM input value is a string, including
`type="number"`, so without it your schema receives `"42"` and rejects it.

### Multi-step wizards

Keep **one** form instance across all steps and render a subset of fields per
step. Unmounting a step does not have to lose its values — that is what
`shouldUnregister: false` (the default) is for. Validate only the current step
before advancing by calling `trigger` with that step's field names.

Put the step number in the URL, not in component state, so Back works and a
reload does not restart the wizard. See [Routing](./routing.md).

### Which library

| | Platform (`action` + `FormData`) | React Hook Form | TanStack Form | Formik |
|---|---|---|---|---|
| Package | none | `react-hook-form` | `@tanstack/react-form` | `formik` |
| Field model | Uncontrolled DOM | Uncontrolled + subscriptions | Controlled, per-field subscriptions | Controlled, form-level state |
| Re-render on keystroke | None | Only subscribed fields | Only the field | The whole form |
| TypeScript | `FormData` gives you strings | Good — generic over a values type | Strongest — inference down to field paths | Weakest of the three |
| Validation | Yours, or a schema you call | Schema via `@hookform/resolvers` | Standard Schema built in | Schema via `validationSchema` |
| Field arrays | Manual | `useFieldArray` | Built in | `FieldArray` |
| Server Functions and progressive enhancement | Yes, by design | No — it owns the submit event | No | No |
| Bundle cost | Zero | Small | Small | Larger |
| Best for | Most forms | Large or repeated forms in an existing app | New TypeScript-first codebases | Codebases already on it |

**Formik** popularized schema-driven forms in React and its `useFormik` /
`<Field>` API is still perfectly usable. Version 2.4.9 is the current release,
published in November 2025, and the repository is not archived. It re-renders
the whole form on each keystroke by design, which is the main reason large forms
migrated away from it. For a new project, React Hook Form or TanStack Form is
the better starting point; for an existing Formik codebase, there is no urgency.

**TanStack Form** is the type-safety argument: field names, values and errors
are inferred end to end, so renaming a field is a compile error rather than a
runtime `undefined`. It reads validators through the Standard Schema interface,
so Zod, Valibot and ArkType all work without a separate resolver package.

## Advanced example

A step in a wizard, wired the way a real one is: one form instance, validation
scoped to the visible step, the step number in the URL, and errors announced.

```tsx static="Needs a router, react-hook-form and a bundler."
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'react-router';
import { onboardingSchema } from './schemas/onboarding';

type OnboardingValues = { fullName: string; email: string; teamSize: number };

const STEP_FIELDS: Record<number, Array<keyof OnboardingValues>> = {
  1: ['fullName', 'email'],
  2: ['teamSize'],
};

export default function Onboarding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const step = Number(searchParams.get('step') ?? '1');

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onBlur',
  });

  async function goToStep(next: number) {
    // Validate only the fields on the step being left.
    const valid = await trigger(STEP_FIELDS[step]);
    if (valid) setSearchParams({ step: String(next) });
  }

  async function onSubmit(values: OnboardingValues) {
    await fetch('/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(values),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Both steps stay mounted in the form's value store even though
          only one is rendered, so going back never loses input. */}
      {step === 1 && (
        <fieldset>
          <legend>About you</legend>
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" {...register('fullName')} />
          {errors.fullName && <p role="alert">{errors.fullName.message}</p>}

          <label htmlFor="email">Work email</label>
          <input id="email" type="email" {...register('email')} />
          {errors.email && <p role="alert">{errors.email.message}</p>}

          <button type="button" onClick={() => goToStep(2)}>
            Continue
          </button>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend>About your company</legend>
          <label htmlFor="teamSize">Team size</label>
          {/* type="number" still yields a string without valueAsNumber. */}
          <input
            id="teamSize"
            type="number"
            {...register('teamSize', { valueAsNumber: true })}
          />
          {errors.teamSize && <p role="alert">{errors.teamSize.message}</p>}

          <button type="button" onClick={() => goToStep(1)}>
            Back
          </button>
          <button type="submit" disabled={isSubmitting}>
            Finish
          </button>
        </fieldset>
      )}
    </form>
  );
}
```

The same `onboardingSchema` runs in `/api/onboarding`. If the client is bypassed
— and it will be — the server rejects the request with identical rules and
identical messages.

## Common mistakes

**Installing a form library before trying the platform.** For most forms
`<form action>`, `FormData` and `useActionState` are the whole answer, and they
work without JavaScript.

**Making every input controlled out of habit.** A value React never reads does
not need to be in React state. See
[Controlled inputs](../patterns/controlled-inputs.md).

**Passing both `value` and `register` to the same input.** The library and React
each think they own it; validation reads stale values.

**Using the array index as a key in a field array.** Remove the second row and
every row below it gets the row above's error and touched state. Use the
library's generated `id`.

**Validating only on the client, or duplicating the rules on the server.**
Client validation is user experience; the server must run the *same* schema,
imported from one module. Two copies drift within a sprint.

**Forgetting `valueAsNumber`.** `type="number"` still produces a string, and
your schema will reject it with a message that makes no sense to the user.

**Showing errors on the first keystroke.** Validate on blur, then re-validate on
change once a field has already failed. Telling someone their email is invalid
after they typed one letter is noise.

**Rendering errors without associating them.** An error paragraph next to an
input is invisible to a screen reader unless `aria-describedby` points at it and
`aria-invalid` marks the field. See
[Forms accessibility](../accessibility/forms-accessibility.md).

**Keeping wizard step state in `useState`.** Back exits the whole flow and a
refresh restarts it. Put the step in the URL.

## Related topics

- [Forms and Actions](../patterns/forms-and-actions.md) — the React 19 built-ins
  that most forms should use instead of a library.
- [Controlled inputs](../patterns/controlled-inputs.md) — when React should own
  an input's value, and when it should not.
- [Forms accessibility](../accessibility/forms-accessibility.md) — labels, error
  association and announcing validation results.
- [useActionState](../hooks/use-action-state.md) — submission result and pending
  state in one hook.
- [Server Functions](../server-react/server-functions.md) — where a form action
  runs when the schema lives on the server.
- [Routing](./routing.md) — putting wizard steps and form modes in the URL.
