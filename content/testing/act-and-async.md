---
title: act and async testing
description: Understand what act does, why the act warning appears, and how to test asynchronous React correctly.
group: testing
order: 30
status: current
since: "19.0"
related: [testing/testing-library, testing/user-events, testing/setup, hooks/use-action-state]
---

## Overview

`act` is the boundary React draws around a chunk of work in a test. Inside it,
React batches updates, runs Effects, and flushes the resulting renders — so that
by the time `act` returns, the tree has settled and your assertions see the final
DOM rather than a half-updated one.

```js
import { act } from 'react';
```

That import path is the React 19 change that breaks existing suites. `act` used
to live elsewhere; the module it lived in was removed in 19.0.

The most important thing to know is this: **you rarely call `act` yourself.**
Testing Library wraps `render`, `fireEvent`, `user-event` and `renderHook` in
`act` already. When you see the "not wrapped in act" warning, the fix is almost
never to add an `act` call.

> [!LEGACY]
> **React 18 and earlier.** `act` for DOM tests came from `react-dom/test-utils`,
> which was **removed in React 19.0**:
>
> ```js legacy
> // Removed in React 19 — the module no longer exists.
> import { act } from 'react-dom/test-utils';
> ```
>
> ```js
> // React 19.
> import { act } from 'react';
> ```
>
> The behavior is unchanged; only the import moved. `npx codemod@latest
> react/19/migration-recipe` rewrites these across a codebase.

## Why it exists

React does not render synchronously when you set state. It schedules the work
and processes it later, and with concurrent rendering "later" can mean across
several browser tasks. Effects run after the browser has painted. Transitions
are deliberately interruptible.

That is exactly what you want in an app and exactly what you do not want in a
test, where an assertion running one microtask too early sees stale output.

`act` closes that gap. It tells React "I am in a test — collect the work I am
about to trigger, then flush all of it before giving me control back."

The warning exists because React can detect the opposite case: a state update
arrived from outside any `act` scope, which means the test may already have moved
on and asserted against a tree that is about to change.

## When to use it

Call `act` directly in exactly two situations:

1. **You are driving `createRoot` by hand**, without Testing Library.
2. **You are advancing time or resolving a promise** that you know will cause a
   React update, and there is no query to await instead — most commonly with
   `renderHook`, which has no DOM to observe.

```tsx
import { it, expect } from 'vitest';
import { act, useState, useCallback } from 'react';
import { renderHook } from '@testing-library/react';

function useStepper(max: number) {
  const [step, setStep] = useState(0);
  const next = useCallback(() => setStep((n) => Math.min(n + 1, max)), [max]);
  return { step, next };
}

it('advances the step', () => {
  const { result } = renderHook(() => useStepper(3));

  act(() => {
    result.current.next();
  });

  expect(result.current.step).toBe(1);
});
```

## When not to use it

**Do not add `act` to silence the act warning.** That warning tells you an update
arrived while your test was not looking. Wrapping the assertion in `act` hides
the symptom and leaves a race in the test.

Do not wrap `render` — Testing Library already does. Do not wrap
`await user.click(...)` — `user-event` already does. Doing it twice produces
nested-act warnings and no benefit.

And do not reach for `act` when a query would do. `await screen.findByText(...)`
is more readable, asserts something real, and produces a better failure message.

> [!BEST-PRACTICE]
> Prefer, in this order: `await screen.findBy*` → `await waitFor(...)` →
> `await act(...)`. If you find yourself at the third option in a component test,
> stop and work out what update you failed to await.

## Basic example

The wrong instinct, and the right fix:

```tsx
import { it, expect } from 'vitest';
import { useState, useEffect } from 'react';
import { render, screen } from '@testing-library/react';

function UserGreeting({ userId }: { userId: string }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}`)
      .then((response) => response.json())
      .then((user: { name: string }) => {
        if (!cancelled) setName(user.name);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (name === null) return <p role="status">Loading…</p>;
  return <h1>Hello, {name}</h1>;
}

// WRONG — getBy does not wait, so this throws before the fetch resolves,
// and the late setState produces "not wrapped in act".
it('greets the user', () => {
  render(<UserGreeting userId="ada" />);
  expect(screen.getByRole('heading')).toHaveTextContent('Hello, Ada');
});

// RIGHT — findBy retries until the element exists, inside act.
it('greets the user once loaded', async () => {
  render(<UserGreeting userId="ada" />);
  expect(await screen.findByRole('heading')).toHaveTextContent('Hello, Ada');
});
```

The second version fixes the warning as a side effect of being correct. That is
the pattern: the act warning is a symptom of an unawaited update, and awaiting
the update properly makes it disappear.

## How it works

### Decoding the act warning

```text
Warning: An update to UserGreeting inside a test was not wrapped in act(...).
```

Read it as: **a state update landed after your test stopped paying attention.**
There are only a few causes.

| Cause | Fix |
|---|---|
| Async work resolves after the test's last assertion | `await` a `findBy*` query or `waitFor` |
| An interaction was not awaited | `await user.click(...)` — every v14 API returns a promise |
| A timer fires later | Advance fake timers inside `act`, or `await` a query |
| The component updates after the test ends | Assert on the settled state, or unmount before the update |
| A stray update in an Effect with no cleanup | Add the cleanup — this one is a real bug |

The last row matters most. A component that updates state after unmount because
its Effect never cleaned up will warn in tests and leak in production. Fix the
component.

### waitFor and its footguns

`waitFor` re-runs a callback until it stops throwing, or until the timeout
expires. Defaults are a 1000 ms timeout and a 50 ms interval, with the first run
happening immediately.

```tsx
import { it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useState, useEffect } from 'react';

function SaveIndicator() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSaved(true), 50);
    return () => clearTimeout(id);
  }, []);
  return <p role="status">{saved ? 'Saved' : 'Saving…'}</p>;
}

it('reports a successful save', async () => {
  render(<SaveIndicator />);

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
```

Three rules keep `waitFor` honest:

- **The callback must throw to retry.** Returning `false` is not enough. Use an
  assertion — that is what throws.
- **No side effects inside.** The callback may run twenty times. A `user.click`
  or a `fetch` inside `waitFor` runs an unpredictable number of times, and the
  test becomes a coin flip.
- **One assertion, ideally.** With several, a failure tells you the block failed
  but not which condition never became true.

> [!WARNING]
> `await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())`
> passes instantly on the first run, before the alert has even appeared. Waiting
> for something to be absent only works if it was present first — use
> `waitForElementToBeRemoved`, which throws if the element was never there.

And prefer `findBy` where it applies. These are equivalent, and the first is
better:

```tsx
import { screen, waitFor } from '@testing-library/react';

async function equivalent() {
  const a = await screen.findByRole('alert');
  const b = await waitFor(() => screen.getByRole('alert'));
  return [a, b];
}
```

### Fake timers

Fake timers and async code interact badly unless you wire them together.
`user-event` inserts real delays between the events it dispatches, so with fake
timers installed and nothing advancing them, it hangs.

Pass your runner's advance function to `userEvent.setup`:

```tsx
import { it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { useState, useEffect } from 'react';

function AutoDismiss({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;
  return <p role="alert">{message}</p>;
}

it('dismisses the toast after five seconds', async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  render(<AutoDismiss message="Invoice sent" />);
  expect(screen.getByRole('alert')).toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(5000);
  });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  vi.useRealTimers();
});
```

Two details do the work:

- **`advanceTimers: vi.advanceTimersByTime`** lets `user-event` push the fake
  clock forward through its own internal delays instead of waiting forever.
- **`await act(async () => { ... })`** around the advance. Moving the clock
  triggers the timeout, which sets state; `act` flushes the resulting render
  before the next assertion. This is one of the few places you write `act` by
  hand.

Always restore real timers afterwards, ideally in an `afterEach`, or every later
test in the file inherits the fake clock.

## Common patterns

### Testing a Suspense boundary

Assert on the fallback first, then on the resolved content. Both states matter.

```tsx
import { it, expect } from 'vitest';
import { Suspense, use } from 'react';
import { render, screen } from '@testing-library/react';

function Quote({ quotePromise }: { quotePromise: Promise<string> }) {
  const quote = use(quotePromise);
  return <blockquote>{quote}</blockquote>;
}

it('shows the fallback, then the quote', async () => {
  const quotePromise = Promise.resolve('Talk is cheap. Show me the code.');

  render(
    <Suspense fallback={<p role="status">Loading quote…</p>}>
      <Quote quotePromise={quotePromise} />
    </Suspense>,
  );

  expect(screen.getByRole('status')).toBeInTheDocument();

  expect(await screen.findByText(/talk is cheap/i)).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
```

The promise is created outside render. Creating it during render restarts the
request on every attempt and the boundary never resolves — the same rule that
applies in application code.

### Testing an error boundary

Error boundaries still require a class component; that is the one place React 19
has no function equivalent.

```tsx
import { it, expect, vi } from 'vitest';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <p role="alert">Something went wrong.</p>;
    }
    return this.props.children;
  }
}

function Boom(): ReactNode {
  throw new Error('Report generation failed');
}

it('renders the fallback when a child throws', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');

  consoleError.mockRestore();
});
```

The `console.error` spy is not optional housekeeping — React logs every caught
error, and without the spy the test output is unreadable. Restore it afterwards
so you do not swallow genuine errors in later tests.

> [!TIP]
> `createRoot` accepts `onCaughtError` and `onUncaughtError` (both added in React
> 19.0). In tests you can pass these to assert on what React reported, rather
> than parsing console output.

### Testing an Action and useActionState

React 19 Actions are async transitions. The pending flag flips on, the async
function runs, and the returned state lands — all of which you observe through
the DOM.

```tsx
import { it, expect } from 'vitest';
import { useActionState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

interface FormState {
  message: string | null;
}

async function subscribeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = formData.get('email');
  if (typeof email !== 'string' || !email.includes('@')) {
    return { message: 'Enter a valid email address.' };
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { message: `Subscribed ${email}.` };
}

function SubscribeForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    subscribeAction,
    { message: null },
  );

  return (
    <form action={formAction}>
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Subscribing…' : 'Subscribe'}
      </button>
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}

it('reports success after the action resolves', async () => {
  const user = userEvent.setup();
  render(<SubscribeForm />);

  await user.type(screen.getByLabelText('Email address'), 'ada@example.com');
  await user.click(screen.getByRole('button', { name: 'Subscribe' }));

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Subscribed ada@example.com.',
  );
  expect(screen.getByRole('button')).toBeEnabled();
});

it('rejects an invalid address without calling the network', async () => {
  const user = userEvent.setup();
  render(<SubscribeForm />);

  await user.type(screen.getByLabelText('Email address'), 'not-an-email');
  await user.click(screen.getByRole('button', { name: 'Subscribe' }));

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Enter a valid email address.',
  );
});
```

Note what is **not** here: no `act`, no `waitFor`, no timer manipulation. The
awaited `user.click` flushes the transition start, and `findByRole` waits for the
result. React's Actions integrate with `act` through the normal scheduler, so
ordinary Testing Library patterns work.

Asserting on the pending state is possible but fragile — a fast action can settle
before you look. Prefer asserting the button is re-enabled afterwards, which is
what the user perceives.

### Testing Effect cleanup

Cleanup bugs are invisible until they are not. Make them explicit.

```tsx
import { it, expect } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';

function ConnectionStatus({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    setStatus('connecting');
    const timer = setInterval(() => setStatus('connected'), 10);
    return () => {
      clearInterval(timer);
      setStatus('disconnected');
    };
  }, [roomId]);

  return <p role="status">{status}</p>;
}

it('reconnects when the room changes', async () => {
  const { rerender } = render(<ConnectionStatus roomId="general" />);

  expect(await screen.findByRole('status')).toHaveTextContent('connected');

  rerender(<ConnectionStatus roomId="random" />);

  expect(await screen.findByRole('status')).toHaveTextContent('connected');
});
```

`rerender` with different props is how you test that an Effect tears down and
re-runs. If the cleanup is missing you get two live intervals, and under
StrictMode you get an act warning that points straight at it.

### StrictMode in tests

StrictMode double-invokes render and runs mount → unmount → mount for Effects in
development. Tests inherit that, which is the point.

```tsx
import { it, expect } from 'vitest';
import { StrictMode, useEffect, useRef } from 'react';
import { render, screen } from '@testing-library/react';

function AnalyticsPage() {
  const views = useRef(0);

  useEffect(() => {
    views.current += 1;
  }, []);

  return <p role="status">Rendered</p>;
}

it('survives StrictMode double mounting', () => {
  render(
    <StrictMode>
      <AnalyticsPage />
    </StrictMode>,
  );

  expect(screen.getByRole('status')).toBeInTheDocument();
});
```

> [!WARNING]
> If a test passes without `<StrictMode>` and fails with it, you have found a
> bug: an Effect that does not clean up, an impure render, or a subscription
> registered twice. Do not remove StrictMode from the test. Fix the component —
> the same double-invocation happens in your app's development build.

## Advanced example

A search field that debounces, cancels stale requests, and shows three distinct
states. This exercises fake timers, `act`, `findBy` and cleanup together.

```tsx
import { it, expect, vi } from 'vitest';
import { act, useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

interface Product {
  id: string;
  name: string;
}

function ProductSearch({ search }: { search: (q: string) => Promise<Product[]> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = setTimeout(() => {
      search(query).then((products) => {
        if (cancelled) return;
        setResults(products);
        setIsSearching(false);
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  return (
    <div>
      <label htmlFor="q">Search products</label>
      <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} />
      {isSearching && <p role="status">Searching…</p>}
      {results !== null && results.length === 0 && (
        <p role="status">No products matched.</p>
      )}
      {results !== null && results.length > 0 && (
        <ul>
          {results.map((product) => (
            <li key={product.id}>{product.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

it('debounces, then shows results', async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  const search = vi.fn().mockResolvedValue([{ id: '1', name: 'Desk lamp' }]);
  render(<ProductSearch search={search} />);

  await user.type(screen.getByLabelText('Search products'), 'lamp');

  // Debounce has not elapsed — no request yet.
  expect(search).not.toHaveBeenCalled();

  await act(async () => {
    vi.advanceTimersByTime(300);
  });

  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledWith('lamp');
  expect(await screen.findByText('Desk lamp')).toBeVisible();

  vi.useRealTimers();
});

it('ignores a stale response when the query changes', async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  const search = vi.fn().mockResolvedValue([]);
  render(<ProductSearch search={search} />);

  const input = screen.getByLabelText('Search products');
  await user.type(input, 'la');
  await user.type(input, 'mp');

  await act(async () => {
    vi.advanceTimersByTime(300);
  });

  // Only the final query is requested; the cleanup cancelled the first timer.
  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenLastCalledWith('lamp');

  vi.useRealTimers();
});
```

The second test is the valuable one. It asserts the Effect's cleanup actually
cancels stale work — the bug class that produces flickering results and the act
warning in equal measure.

## Common mistakes

- **Importing `act` from the removed test-utils module.** It comes from `react`
  in React 19.
- **Adding `act` to silence the warning.** The warning means an update was not
  awaited. Await it with `findBy*` or `waitFor` instead.
- **Wrapping `render` or `user.click` in `act`.** Testing Library already does,
  and double-wrapping warns.
- **Not awaiting `user.click` / `user.type`.** Every `user-event` v14 API returns
  a promise; an unawaited one is the single most common source of act warnings.
- **Side effects inside `waitFor`.** The callback runs repeatedly.
- **`waitFor` with a `queryBy` absence assertion.** It passes on the first tick,
  before the element ever appeared. Use `waitForElementToBeRemoved`.
- **Fake timers without `advanceTimers` on `userEvent.setup`.** The interaction
  hangs until the test times out.
- **Forgetting `vi.useRealTimers()`**, which poisons every later test in the file.
- **Creating the promise inside a Suspense component's render.** It restarts on
  every attempt and never resolves.
- **Asserting on a pending flag** in a fast Action. Assert on the settled result.
- **Removing `<StrictMode>` from a test to make it pass.** That is a bug report,
  not a test problem.

## Related topics

- [Testing Library](./testing-library.md) — `findBy` queries and the query priority.
- [User events](./user-events.md) — why every interaction must be awaited.
- [Testing setup](./setup.md) — the runner and `IS_REACT_ACT_ENVIRONMENT`.
- [useActionState](../hooks/use-action-state.md) — the Action flow tested above.
- [Suspense](../data-fetching/suspense.md) — boundaries and fallbacks.
- [Error boundaries](../patterns/error-boundaries.md) — the class component pattern.
- [StrictMode](../core-concepts/strict-mode.md) — what double-invocation catches.
