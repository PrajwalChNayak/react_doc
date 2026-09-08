---
title: User events
description: Drive tests with realistic interaction using user-event v14, and know the few cases where fireEvent is still right.
group: testing
order: 40
status: current
since: "19.0"
related: [testing/testing-library, testing/act-and-async, accessibility/focus-management, patterns/forms-and-actions]
---

## Overview

`@testing-library/user-event` simulates what a person does, not what the DOM
receives. One `user.click()` dispatches the whole sequence a real click produces
— pointer events, focus changes, mouse events — and checks along the way that the
element is actually visible and interactive.

Version 14 changed the API in one way that breaks every older example:

```tsx
import { it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('submits the form', async () => {
  const user = userEvent.setup();     // 1. set up BEFORE render
  render(<form><button>Save</button></form>);

  await user.click(screen.getByRole('button'));   // 2. await EVERY interaction
});
```

**`userEvent.setup()` returns an instance, and every method on it returns a
promise you must await.** Forgetting the `await` is the most common migration
bug from v13, and it produces "not wrapped in act" warnings and assertions that
run too early.

## Why it exists

`fireEvent.click(button)` dispatches exactly one `click` event. A real click does
much more: `pointerover`, `pointerenter`, `pointerdown`, `mousedown`, a focus
change, `pointerup`, `mouseup`, then `click`.

That difference is not academic. A component with an `onPointerDown` handler, a
menu that closes on `blur`, a button that reads `document.activeElement`, or a
library like Radix or Headless UI built on pointer events will behave differently
under `fireEvent` than in a browser. Tests pass; the feature is broken.

`user-event` also refuses to interact with elements a user could not interact
with — hidden elements, elements with `pointer-events: none`, disabled controls.
That turns a silently passing test into a failing one, which is what you want.

## When to use it

Use `user-event` for every interaction in a component test: clicking, typing,
selecting, tabbing, hovering, uploading, pasting. It should be your default, and
`fireEvent` the exception.

Use it especially when testing anything keyboard-driven. Tab order, focus traps
and keyboard shortcuts are only testable with something that models real key
sequences.

## When not to use it

`fireEvent` remains correct in a few narrow cases:

- **Dispatching one specific low-level event** with no user gesture behind it: a
  `scroll`, a `resize`, a synthetic `animationend`, a custom event.
- **Setting an uncontrolled input's value in one shot** when the typing itself is
  not what you are testing and the field is long.
- **Events a user cannot produce**, such as `error` on an `<img>`.

```tsx
import { it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

function ImageWithFallback({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="status">Image unavailable</p>;
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

it('falls back when the image fails to load', () => {
  render(<ImageWithFallback src="/broken.png" alt="Product photo" />);

  // No user gesture can produce this — fireEvent is the right tool.
  fireEvent.error(screen.getByAltText('Product photo'));

  expect(screen.getByRole('status')).toHaveTextContent('Image unavailable');
});
```

> [!WARNING]
> Do not mix `fireEvent.change` with `user.type` on the same controlled input in
> one test. `fireEvent.change` sets the value in a single event and skips the key
> sequence, so any `onKeyDown` logic — a search-as-you-type debounce, an input
> mask, a character limit — never runs, and the two produce different final
> states.

## Basic example

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

function LoginForm({ onSubmit }: { onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email);
      }}
    >
      <label htmlFor="email">Email address</label>
      <input
        id="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button type="submit" disabled={email.length === 0}>
        Log in
      </button>
    </form>
  );
}

it('enables the button and submits the typed address', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();

  render(<LoginForm onSubmit={onSubmit} />);

  const button = screen.getByRole('button', { name: 'Log in' });
  expect(button).toBeDisabled();

  await user.type(screen.getByLabelText('Email address'), 'ada@example.com');
  expect(button).toBeEnabled();

  await user.click(button);
  expect(onSubmit).toHaveBeenCalledWith('ada@example.com');
});
```

`user.type` dispatches a full keystroke sequence per character, so the
controlled input's `onChange` fires fifteen times, exactly as it would in a
browser.

## How it works

### setup() and why it comes first

`userEvent.setup()` creates an instance that holds interaction state: which
modifier keys are held, where the pointer is, what is on the clipboard. That
state has to exist before the component renders, so the pointer position and
document reference are correct.

```tsx
import { it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';

// Good — one instance per test, created before render.
it('does something', async () => {
  const user = userEvent.setup();
  render(<button>Save</button>);
  await user.click(document.querySelector('button')!);
});
```

Do not hoist a single instance to module scope and share it across tests. Its
accumulated state (a still-held Shift key, a stale pointer position) leaks
between tests.

> [!DEPRECATED]
> Calling the imported object's methods directly — `userEvent.click(el)` without
> `setup()` — still works for backwards compatibility, but it creates a throwaway
> instance per call, so modifier keys and clipboard contents never carry across
> interactions. Use `const user = userEvent.setup()` in every new test.

### Every API returns a promise

This is the v14 change that breaks old test suites.

```tsx
import { it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';

it('awaits interactions', async () => {
  const user = userEvent.setup();

  // WRONG (v13 style) — the assertion after this runs too early,
  // and React warns that an update was not wrapped in act.
  // user.click(screen.getByRole('button'));

  // RIGHT
  await user.click(screen.getByRole('button'));
  await user.type(screen.getByRole('textbox'), 'hello');
  await user.tab();
  await user.clear(screen.getByRole('textbox'));
});
```

The promise exists because `user-event` inserts small delays between the events
it dispatches, so the browser (and React's scheduler) gets a chance to react
between them — which is the whole point of simulating a real interaction.

An unawaited call is the number one cause of the act warning covered in
[act and async](./act-and-async.md#decoding-the-act-warning).

### The interaction APIs

| Method | What it does |
|---|---|
| `click(el)` | Full pointer + mouse + focus sequence, then `click` |
| `dblClick(el)` / `tripleClick(el)` | Two or three sequential clicks |
| `type(el, text)` | Clicks the element, then types character by character |
| `clear(el)` | Focuses, selects all, deletes |
| `keyboard(text)` | Key sequence with no implied element or click |
| `tab({ shift })` | Moves focus forward, or backward with `{ shift: true }` |
| `hover(el)` / `unhover(el)` | Pointer move onto and off the element |
| `selectOptions(el, values)` | Selects options in a `<select>` or listbox |
| `deselectOptions(el, values)` | Deselects them; needs `multiple` |
| `upload(el, files)` | Attaches `File` objects to a file input |
| `paste(text)` / `copy()` / `cut()` | Clipboard operations |
| `pointer(...)` | The low-level primitive the others are built from |

### fireEvent versus user-event

| | `fireEvent` | `user-event` |
|---|---|---|
| Events dispatched | Exactly one | The full realistic sequence |
| Focus handling | None | Moves focus as a browser would |
| Visibility checks | None | Refuses hidden or `pointer-events: none` elements |
| Disabled elements | Fires anyway | Does nothing, as in a browser |
| Return value | `boolean` | `Promise` |
| Right for | One specific low-level event | Everything a user does |

The disabled-element row is worth dwelling on. `fireEvent.click` on a disabled
button fires the handler, so a test can pass while the button is broken.
`user.click` correctly does nothing.

## Common patterns

### Typing, clearing and special keys

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('');
  return (
    <div>
      <label htmlFor="q">Search</label>
      <input
        id="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSearch(query);
          if (event.key === 'Escape') setQuery('');
        }}
      />
    </div>
  );
}

it('searches on Enter and clears on Escape', async () => {
  const user = userEvent.setup();
  const onSearch = vi.fn();
  render(<SearchBox onSearch={onSearch} />);

  const input = screen.getByLabelText('Search');

  await user.type(input, 'desk lamp{Enter}');
  expect(onSearch).toHaveBeenCalledWith('desk lamp');

  await user.type(input, '{Escape}');
  expect(input).toHaveValue('');

  // Replace rather than append.
  await user.clear(input);
  await user.type(input, 'chair');
  expect(input).toHaveValue('chair');
});
```

Special keys go in braces inside `type`: `{Enter}`, `{Escape}`, `{Backspace}`,
`{ArrowDown}`. Hold a modifier with `{Shift>}` and release it with `{/Shift}`:

```tsx
import { it } from 'vitest';
import userEvent from '@testing-library/user-event';

it('handles key combinations', async () => {
  const user = userEvent.setup();

  await user.keyboard('{Shift>}A{/Shift}');       // Shift down, A, Shift up
  await user.keyboard('{Control>}a{/Control}');   // Select all
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
});
```

`user.type` clicks the element first; `user.keyboard` does not, so use
`keyboard` when focus is already where you want it.

> [!TIP]
> `user.type(input, 'text')` **appends** to the existing value. To replace,
> `clear` first. This catches people out when a field has a default value.

### Selects and checkboxes

```tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

function ShippingOptions() {
  const [method, setMethod] = useState('standard');
  const [gift, setGift] = useState(false);

  return (
    <form>
      <label htmlFor="method">Shipping method</label>
      <select
        id="method"
        value={method}
        onChange={(event) => setMethod(event.target.value)}
      >
        <option value="standard">Standard</option>
        <option value="express">Express</option>
      </select>

      <label>
        <input
          type="checkbox"
          checked={gift}
          onChange={(event) => setGift(event.target.checked)}
        />
        Gift wrap
      </label>

      <p role="status">
        {method} {gift ? 'with gift wrap' : 'without gift wrap'}
      </p>
    </form>
  );
}

it('updates the summary as options change', async () => {
  const user = userEvent.setup();
  render(<ShippingOptions />);

  await user.selectOptions(screen.getByLabelText('Shipping method'), 'express');
  await user.click(screen.getByRole('checkbox', { name: 'Gift wrap' }));

  expect(screen.getByRole('status')).toHaveTextContent('express with gift wrap');
});
```

`selectOptions` accepts an option's value, its visible text, or the element
itself. Click a checkbox rather than setting `checked` — clicking is what fires
`onChange`.

### Keyboard accessibility as a first-class test

Keyboard support is a requirement, not a nice-to-have, and `user.tab()` makes it
directly testable. Treat this as a normal part of testing any interactive
component.

```tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function CheckoutActions() {
  return (
    <div>
      <button>Back</button>
      <a href="/help">Need help?</a>
      <button disabled>Unavailable</button>
      <button>Place order</button>
    </div>
  );
}

it('reaches every control in visual order and skips disabled ones', async () => {
  const user = userEvent.setup();
  render(<CheckoutActions />);

  await user.tab();
  expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();

  await user.tab();
  expect(screen.getByRole('link', { name: 'Need help?' })).toHaveFocus();

  // The disabled button is not in the tab order.
  await user.tab();
  expect(screen.getByRole('button', { name: 'Place order' })).toHaveFocus();

  await user.tab({ shift: true });
  expect(screen.getByRole('link', { name: 'Need help?' })).toHaveFocus();
});

it('activates a button with the keyboard', async () => {
  const user = userEvent.setup();
  render(<CheckoutActions />);

  await user.tab();
  await user.keyboard('{Enter}');
});
```

This test fails the moment someone replaces a `<button>` with a clickable
`<div>` — which is exactly the regression you want caught. See
[Focus management](../accessibility/focus-management.md).

### Hover, file upload and clipboard

```tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

function AvatarUpload() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  return (
    <div>
      <label htmlFor="avatar">Profile photo</label>
      <input
        id="avatar"
        type="file"
        accept="image/png"
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        onMouseEnter={() => setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
      />
      {showHint && <p role="tooltip">PNG images only, up to 2 MB.</p>}
      {fileName && <p role="status">Selected {fileName}</p>}
    </div>
  );
}

it('shows a hint on hover and accepts a PNG', async () => {
  const user = userEvent.setup();
  render(<AvatarUpload />);

  const input = screen.getByLabelText('Profile photo');

  await user.hover(input);
  expect(screen.getByRole('tooltip')).toBeVisible();

  await user.unhover(input);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  const file = new File(['binary'], 'ada.png', { type: 'image/png' });
  await user.upload(input, file);

  expect(screen.getByRole('status')).toHaveTextContent('Selected ada.png');
});
```

`upload` respects the input's `accept` attribute and silently discards
non-matching files — realistic, and occasionally surprising. Pass
`applyAccept: false` to `setup()` if you want to test the rejection path
yourself.

Clipboard works through the instance, so a copy in one step is available to a
paste in the next:

```tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('copies from one field and pastes into another', async () => {
  const user = userEvent.setup();
  render(
    <>
      <label htmlFor="from">Source</label>
      <input id="from" defaultValue="INV-4021" />
      <label htmlFor="to">Destination</label>
      <input id="to" />
    </>,
  );

  await user.tripleClick(screen.getByLabelText('Source'));
  await user.copy();

  await user.click(screen.getByLabelText('Destination'));
  await user.paste();

  expect(screen.getByLabelText('Destination')).toHaveValue('INV-4021');
});
```

## Advanced example

A React 19 form Action driven end to end through the keyboard only — no mouse
events at all. This is the shape of a test that proves both the feature and its
accessibility.

```tsx
import { it, expect, vi } from 'vitest';
import { useActionState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

interface TransferState {
  status: 'idle' | 'error' | 'sent';
  message: string;
}

function makeTransferAction(send: (to: string, amount: number) => Promise<void>) {
  return async function transferAction(
    _previous: TransferState,
    formData: FormData,
  ): Promise<TransferState> {
    const recipient = String(formData.get('recipient') ?? '');
    const amount = Number(formData.get('amount'));

    if (!recipient) {
      return { status: 'error', message: 'Choose a recipient.' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { status: 'error', message: 'Enter an amount greater than zero.' };
    }

    await send(recipient, amount);
    return { status: 'sent', message: `Sent ${amount} to ${recipient}.` };
  };
}

function TransferForm({ send }: { send: (to: string, amount: number) => Promise<void> }) {
  const [state, formAction, isPending] = useActionState<TransferState, FormData>(
    makeTransferAction(send),
    { status: 'idle', message: '' },
  );

  return (
    <form action={formAction}>
      <label htmlFor="recipient">Recipient</label>
      <select id="recipient" name="recipient" defaultValue="">
        <option value="">Choose…</option>
        <option value="ada">Ada Lovelace</option>
        <option value="grace">Grace Hopper</option>
      </select>

      <label htmlFor="amount">Amount</label>
      <input id="amount" name="amount" type="number" defaultValue="" />

      <button type="submit" disabled={isPending}>
        {isPending ? 'Sending…' : 'Send transfer'}
      </button>

      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'sent' && <p role="status">{state.message}</p>}
    </form>
  );
}

it('completes a transfer using only the keyboard', async () => {
  const user = userEvent.setup();
  const send = vi.fn().mockResolvedValue(undefined);

  render(<TransferForm send={send} />);

  // Tab to the select and choose with the keyboard.
  await user.tab();
  expect(screen.getByLabelText('Recipient')).toHaveFocus();
  await user.selectOptions(screen.getByLabelText('Recipient'), 'ada');

  await user.tab();
  expect(screen.getByLabelText('Amount')).toHaveFocus();
  await user.keyboard('250');

  await user.tab();
  expect(screen.getByRole('button', { name: 'Send transfer' })).toHaveFocus();
  await user.keyboard('{Enter}');

  expect(await screen.findByRole('status')).toHaveTextContent('Sent 250 to ada.');
  expect(send).toHaveBeenCalledWith('ada', 250);
});

it('reports a validation error without calling the service', async () => {
  const user = userEvent.setup();
  const send = vi.fn();

  render(<TransferForm send={send} />);

  await user.click(screen.getByRole('button', { name: 'Send transfer' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a recipient.');
  expect(send).not.toHaveBeenCalled();
});
```

Three things this test gets right:

- **`{Enter}` on the focused submit button** submits the form, exactly as a
  browser does. No `fireEvent.submit`, no calling the action directly.
- **`findByRole('status')`** waits for the async Action to settle. Nothing needs
  `act`; awaiting the interaction and the query is enough.
- **`role="alert"` for errors and `role="status"` for success** are queried
  distinctly, so the test also asserts that failures are announced urgently and
  successes politely.

## Common mistakes

- **Not awaiting an interaction.** `user.click(...)` without `await` is the
  single most common v13-to-v14 bug. It causes act warnings and assertions that
  run against a stale DOM.
- **Calling `userEvent.click(el)` without `setup()`.** You lose held modifiers
  and clipboard state between calls.
- **Sharing one `setup()` instance across tests.** Held keys and pointer position
  leak.
- **Expecting `user.type` to replace the value.** It appends. `clear` first.
- **Using `fireEvent.click` on something a user clicks.** It skips focus and
  pointer events, and it fires on disabled buttons.
- **Mixing `fireEvent.change` and `user.type`** on the same input, so keyboard
  handlers never run.
- **Fake timers without `advanceTimers`.** `userEvent.setup({ advanceTimers:
  vi.advanceTimersByTime })` — otherwise the interaction never resolves.
- **Setting `checked` or `value` directly** instead of clicking or typing. React
  never sees the change.
- **Testing only mouse paths.** If you never call `user.tab()`, nothing stops a
  `<div onClick>` from shipping.
- **Asserting on the pending label** of a fast Action. It may settle before you
  look; assert on the result.

## Related topics

- [Testing Library](./testing-library.md) — the queries these interactions target.
- [act and async](./act-and-async.md) — why unawaited interactions warn.
- [Testing setup](./setup.md) — installing `user-event` and configuring the runner.
- [Focus management](../accessibility/focus-management.md) — the behavior `user.tab()` verifies.
- [Forms and Actions](../patterns/forms-and-actions.md) — the `<form action>` pattern tested above.
- [useActionState](../hooks/use-action-state.md) — the hook driving the advanced example.
