---
title: Testing Library
description: Query the DOM the way a user finds things, and build a render helper your whole suite can share.
group: testing
order: 20
status: current
since: "19.0"
related: [testing/setup, testing/user-events, testing/act-and-async, accessibility/semantics]
---

## Overview

`@testing-library/react` is built on one idea:

> The more your tests resemble the way your software is used, the more
> confidence they can give you.

Everything else follows from that. The queries are named after how a person
finds a control — by its role and its label — not after how you built it. There
is no API for reading state, no API for inspecting props, and no shallow
renderer. That is deliberate.

The practical payoff is that your tests survive refactors. Rename a prop, split a
component in two, switch from `useState` to `useReducer` — a test written
against roles and labels does not notice.

## Why it exists

The previous generation of React test tools let you reach inside a component:
find a child by its class name, read its state, call an instance method. Those
tests broke constantly, because they asserted on structure rather than behavior,
and structure changes every sprint.

Testing Library removes those affordances on purpose. If the only way to assert
something is through the rendered DOM, then every test is automatically a test
of what the user gets.

There is a second payoff that people underrate: `getByRole` reads the
accessibility tree. A component with no accessible name is hard to query, which
means writing tests this way surfaces accessibility problems before your users
do.

## When to use it

Use it for essentially every component test. It is the tool the React team
points at, and it is what the ecosystem assumes.

It works for anything that renders to a DOM: components, custom hooks (through a
small host component), context providers, and whole feature slices.

## When not to use it

Skip it when there is no component involved. A pure function, a reducer, a
selector, a date formatter — test those directly. Wrapping a reducer in a
component to test it through the DOM adds ceremony and removes clarity.

Skip it too for anything needing real layout or real browser APIs, as covered in
[Testing setup](./setup.md#when-not-to-use-it).

## Basic example

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';

function SubscribeForm() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      <label htmlFor="email">Email address</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button type="submit" disabled={email.length === 0}>
        Subscribe
      </button>
      {submitted && <p role="status">Thanks for subscribing.</p>}
    </form>
  );
}

describe('SubscribeForm', () => {
  it('disables the submit button until an email is entered', () => {
    render(<SubscribeForm />);

    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
```

Read the queries out loud and they describe the page: a button named
"Subscribe", a field labeled "Email address", no status message yet. That is the
standard to hold your tests to.

## How it works

### The query priority

Testing Library documents an explicit priority order. Work down it and stop at
the first one that fits.

| Tier | Query | Use for |
|---|---|---|
| 1 | `getByRole` | Almost everything: buttons, links, headings, inputs, lists, dialogs |
| 1 | `getByLabelText` | Form fields, when the role query is awkward |
| 1 | `getByPlaceholderText` | Fields with no label — and treat that as a bug to fix |
| 1 | `getByText` | Non-interactive content: paragraphs, spans, `div`s |
| 1 | `getByDisplayValue` | Finding a filled-in field by its current value |
| 2 | `getByAltText` | `img`, `area`, `input[type=image]` |
| 2 | `getByTitle` | Rarely — `title` is inconsistently exposed to assistive tech |
| 3 | `getByTestId` | The escape hatch, when nothing user-visible identifies the element |

**`getByRole` is the default for a reason.** It queries the accessibility tree,
so it matches on the same information a screen reader uses. The `name` option
matches the element's accessible name, which is computed from its label, its
text content, `aria-label`, or `aria-labelledby`:

```tsx
import { screen } from '@testing-library/react';

const saveButton = screen.getByRole('button', { name: /save changes/i });
const heading = screen.getByRole('heading', { name: 'Invoices', level: 1 });
const emailField = screen.getByRole('textbox', { name: 'Email address' });
const activeTab = screen.getByRole('tab', { selected: true });
const checkbox = screen.getByRole('checkbox', { name: 'Remember me', checked: false });
```

If `getByRole` cannot find your button, the button probably has no accessible
name. That is a real defect, and the fix belongs in the component.

> [!BEST-PRACTICE]
> Reach for `getByTestId` only after the others genuinely do not work — a
> decorative wrapper you need to scope within, a chart canvas, a third-party
> widget you do not control. A suite full of test IDs is a suite that has stopped
> testing what the user sees.

### getBy vs queryBy vs findBy

This is the distinction that causes the most wasted time, and the rule is
mechanical.

| Prefix | No match | One match | Many matches | Async |
|---|---|---|---|---|
| `getBy` | **throws** | returns element | throws | no |
| `queryBy` | returns `null` | returns element | throws | no |
| `findBy` | **throws** after timeout | resolves to element | throws | yes |
| `getAllBy` | throws | returns array | returns array | no |
| `queryAllBy` | returns `[]` | returns array | returns array | no |
| `findAllBy` | throws after timeout | resolves to array | resolves to array | yes |

The rules that follow:

- **`getBy` is the default.** It throws a readable error with the printed DOM when
  the element is missing, which is exactly what you want from a failing test.
- **`queryBy` is for asserting absence, and nothing else.** It is the only query
  that returns `null` instead of throwing, so it is the only one that can express
  `expect(...).not.toBeInTheDocument()`.
- **`findBy` is for anything asynchronous.** It retries until the element appears
  or the default 1000 ms timeout expires. It is `getBy` wrapped in `waitFor`.

```tsx
import { expect } from 'vitest';
import { screen } from '@testing-library/react';

async function example() {
  // Present now — assert directly.
  const heading = screen.getByRole('heading', { name: 'Orders' });

  // Absent — the ONLY correct use of queryBy.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  // Will appear after a fetch resolves — must be findBy, and must be awaited.
  const row = await screen.findByRole('row', { name: /invoice 4021/i });

  return { heading, row };
}
```

> [!WARNING]
> **`expect(screen.queryByText('Saved')).toBeInTheDocument()` is the classic
> mistake.** It works, but when it fails you get "expected null to be in the
> document" instead of a printed DOM tree showing what was actually rendered.
> Use `getBy` when you expect presence. Reserve `queryBy` for absence.
>
> The mirror-image mistake is using `getBy` for something that has not arrived
> yet. It throws immediately rather than waiting. Use `findBy`.

### screen, not destructuring

`render` returns an object containing every query bound to the rendered
container. Ignore it and use `screen`.

```tsx
import { render, screen } from '@testing-library/react';

function Greeting() {
  return <h1>Welcome back</h1>;
}

function example() {
  render(<Greeting />);
  return screen.getByRole('heading', { name: 'Welcome back' });
}
```

`screen` queries `document.body`, so it also finds content rendered through a
portal — modals, tooltips, toasts — which the destructured queries, scoped to
the container, cannot. It also means adding a query to a test never means editing
the destructuring line above it.

### within

When the same accessible name appears more than once, scope the query instead of
resorting to test IDs.

```tsx
import { screen, within } from '@testing-library/react';

function example() {
  const row = screen.getByRole('row', { name: /acme corp/i });
  return within(row).getByRole('button', { name: 'Delete' });
}
```

This reads like the user's intent — "the Delete button in the Acme Corp row" —
and it fails loudly if the row structure changes in a way that matters.

### jest-dom matchers

`@testing-library/jest-dom` adds DOM-aware matchers. They exist so failures
explain themselves.

```tsx
import { expect } from 'vitest';
import { screen } from '@testing-library/react';

function example() {
  expect(screen.getByRole('button')).toBeDisabled();
  expect(screen.getByRole('textbox')).toHaveValue('ada@example.com');
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(screen.getByRole('alert')).toHaveTextContent('Card declined');
  expect(screen.getByRole('link')).toHaveAttribute('href', '/pricing');
  expect(screen.getByLabelText('Email')).toBeInvalid();
  expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  expect(screen.getByRole('dialog')).toBeVisible();
}
```

Compare `expect(button).toBeDisabled()` with
`expect(button.hasAttribute('disabled')).toBe(true)`. The first prints the
element when it fails; the second prints `expected false to be true`.

`toBeVisible` is worth singling out: it accounts for `display: none`,
`visibility: hidden`, `opacity: 0`, the `hidden` attribute, and `<details>` — a
check that is tedious to write by hand.

## Common patterns

### A custom render with providers

Real components live inside providers. Rewriting the provider stack in every test
file is the single biggest source of noise in a React suite, so build the helper
once.

```tsx static="Test-only module — needs a runner and the app's own providers."
// src/test/render.tsx
import { createContext, type ReactElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

// In a real project this is imported from your theme module.
export const ThemeContext = createContext<'light' | 'dark'>('light');

export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string; theme?: 'light' | 'dark' } = {},
) {
  const { route = '/', theme = 'light' } = options;

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeContext value={theme}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </ThemeContext>
      </QueryClientProvider>
    );
  }

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(ui, { wrapper: Providers }),
  };
}

// Re-export everything so tests import from one place.
export * from '@testing-library/react';
```

Then every test imports from `../test/render` instead of
`@testing-library/react`:

```tsx nocheck="Imports the project's own test-render module and component by relative path."
import { it, expect } from 'vitest';
import { renderWithProviders, screen } from '../test/render';
import { InvoiceList } from './InvoiceList';

it('shows invoices for the current account', async () => {
  const { user } = renderWithProviders(<InvoiceList />, { route: '/invoices' });

  await user.click(screen.getByRole('button', { name: 'Show paid' }));

  expect(await screen.findByRole('row', { name: /invoice 4021/i })).toBeVisible();
});
```

Four things make this helper worth the effort:

- **A fresh `QueryClient` per test.** Sharing one leaks cached data between tests
  and produces failures that depend on file order.
- **`retry: false`.** Otherwise a deliberately failing request retries three
  times and your test times out instead of asserting on the error state.
- **`user` returned from the helper**, so `userEvent.setup()` always runs before
  render.
- **`route` as an option**, so a test can start on any URL.

Note `<ThemeContext value={theme}>` — since React 19 a context object is its own
provider, so there is no `.Provider` to render.

### Testing a component that reads context

Do not mock the context. Render the real provider with the value the test needs —
that exercises the actual wiring.

```tsx
import { it, expect } from 'vitest';
import { createContext, useContext } from 'react';
import { render, screen } from '@testing-library/react';

interface Account {
  name: string;
  plan: 'free' | 'pro';
}

const AccountContext = createContext<Account | null>(null);

function useAccount() {
  const account = useContext(AccountContext);
  if (!account) {
    throw new Error('useAccount must be used inside an AccountContext provider');
  }
  return account;
}

function UpgradeBanner() {
  const account = useAccount();
  if (account.plan === 'pro') return null;
  return <p role="status">Upgrade to Pro, {account.name}.</p>;
}

it('prompts free accounts to upgrade', () => {
  render(
    <AccountContext value={{ name: 'Ada', plan: 'free' }}>
      <UpgradeBanner />
    </AccountContext>,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Upgrade to Pro, Ada.');
});

it('renders nothing for pro accounts', () => {
  render(
    <AccountContext value={{ name: 'Ada', plan: 'pro' }}>
      <UpgradeBanner />
    </AccountContext>,
  );

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
```

The second test is the one that earns its place, and it is the correct use of
`queryBy`.

### Testing a custom hook

A hook has no DOM of its own, so give it a tiny host component and assert on what
that component renders. This tests the hook the way your app will use it.

```tsx
import { it, expect } from 'vitest';
import { useState, useCallback } from 'react';
import { render, screen } from '@testing-library/react';

export function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount((n) => n + 1), []);
  const reset = useCallback(() => setCount(initial), [initial]);
  return { count, increment, reset };
}

function CounterHarness({ initial }: { initial: number }) {
  const { count, increment, reset } = useCounter(initial);
  return (
    <div>
      <output>{count}</output>
      <button onClick={increment}>Increment</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}

it('starts at the initial value', () => {
  render(<CounterHarness initial={5} />);
  expect(screen.getByRole('status')).toHaveTextContent('5');
});
```

`@testing-library/react` also exports `renderHook`, which is convenient for hooks
with no natural UI:

```tsx
import { it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, useCallback } from 'react';

function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((value) => !value), []);
  return { on, toggle };
}

it('toggles', () => {
  const { result } = renderHook(() => useToggle());

  expect(result.current.on).toBe(false);

  act(() => {
    result.current.toggle();
  });

  expect(result.current.on).toBe(true);
});
```

Prefer the host-component approach when the hook exists to drive UI. `renderHook`
tests the hook's return value, which is closer to an implementation detail than
to what a user experiences.

### Debugging a failing query

```tsx
import { screen, logRoles } from '@testing-library/react';

function example(container: HTMLElement) {
  // Print the whole body, or one element.
  screen.debug();
  screen.debug(screen.getByRole('table'));

  // Print every role in the tree, with the accessible names.
  logRoles(container);
}
```

`logRoles` is the fix for "why can't `getByRole` find my button". It lists every
role Testing Library can see and the accessible name attached to each, which
usually reveals that the name is empty or that the element has the wrong role.

Testing Library's own failure output also helps: a failed `getByRole` prints the
available roles automatically.

> [!TIP]
> `screen.getByRole('button', { name: /save/i })` with a regex is more robust
> than an exact string when the label contains extra whitespace, a nested icon,
> or a count badge.

## Advanced example

A component with loading, error and success states, tested through all three.

```tsx
import { it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';

interface Invoice {
  id: string;
  customer: string;
  amountDue: number;
  status: 'paid' | 'overdue';
}

interface InvoiceTableProps {
  invoices: Invoice[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

function InvoiceTable({ invoices, isLoading, error, onRetry }: InvoiceTableProps) {
  const [showPaidOnly, setShowPaidOnly] = useState(false);

  if (isLoading) {
    return <p role="status">Loading invoices…</p>;
  }

  if (error) {
    return (
      <div role="alert">
        <p>Could not load invoices.</p>
        <button onClick={onRetry}>Try again</button>
      </div>
    );
  }

  const visible = showPaidOnly
    ? invoices.filter((invoice) => invoice.status === 'paid')
    : invoices;

  if (visible.length === 0) {
    return <p role="status">No invoices to show.</p>;
  }

  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={showPaidOnly}
          onChange={(event) => setShowPaidOnly(event.target.checked)}
        />
        Show paid only
      </label>
      <table>
        <caption>Invoices</caption>
        <tbody>
          {visible.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.customer}</td>
              <td>{invoice.amountDue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const invoices: Invoice[] = [
  { id: '4021', customer: 'Acme Corp', amountDue: 1200, status: 'overdue' },
  { id: '4022', customer: 'Globex', amountDue: 0, status: 'paid' },
];

const baseProps = {
  invoices,
  isLoading: false,
  error: null,
  onRetry: () => {},
};

it('announces the loading state', () => {
  render(<InvoiceTable {...baseProps} isLoading />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading invoices');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('offers a retry when loading fails', () => {
  render(<InvoiceTable {...baseProps} error={new Error('offline')} />);

  const alert = screen.getByRole('alert');
  expect(within(alert).getByRole('button', { name: 'Try again' })).toBeEnabled();
});

it('renders one row per invoice', () => {
  render(<InvoiceTable {...baseProps} />);

  const table = screen.getByRole('table', { name: 'Invoices' });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(table).getByRole('cell', { name: 'Acme Corp' })).toBeVisible();
});
```

Every assertion goes through a role. `role="status"` and `role="alert"` are not
decoration for the test's benefit — they are what makes the loading and error
states audible to a screen reader, and querying them keeps the two concerns
aligned. See [Announcements](../accessibility/announcements.md).

## Common mistakes

- **`queryBy` for presence.** It works but hides the DOM when it fails. Use
  `getBy` to assert presence, `queryBy` only for absence.
- **`getBy` for something asynchronous.** It throws immediately instead of
  waiting. Use `findBy` and await it.
- **Forgetting to await a `findBy`.** You assert on a `Promise`, which is always
  truthy, so the test passes for the wrong reason.
- **Destructuring queries from `render`.** They cannot see portals. Use `screen`.
- **Reaching for `getByTestId` first.** If nothing user-facing identifies the
  element, the accessibility of the component is the actual problem.
- **`container.querySelector('.btn-primary')`.** A class name is a styling
  decision, not a contract.
- **Mocking child components** to assert they rendered. You are testing the mock.
- **Sharing one `QueryClient` across tests**, so cached data from an earlier test
  makes a later one pass or fail depending on order.
- **Writing `<Context.Provider>` in a test** after React 19 made the context
  object itself renderable as `<Context value={...}>`.
- **Asserting on `result.current` from `renderHook`** when the hook exists to
  drive UI. Render the UI and assert on that instead.

## Related topics

- [Testing setup](./setup.md) — installing and configuring the runner and matchers.
- [User events](./user-events.md) — clicking, typing and keyboard navigation.
- [act and async](./act-and-async.md) — `waitFor`, act warnings, and async state.
- [Semantics](../accessibility/semantics.md) — the roles `getByRole` queries.
- [Announcements](../accessibility/announcements.md) — `role="status"` and `role="alert"`.
- [useContext](../hooks/use-context.md) — the context API these tests render.
