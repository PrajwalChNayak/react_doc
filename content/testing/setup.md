---
title: Testing setup
description: Configure Vitest or Jest with Testing Library for a React 19 app, and decide what is worth testing.
group: testing
order: 10
status: current
since: "19.0"
related: [testing/testing-library, testing/act-and-async, testing/user-events, ecosystem/build-tooling]
---

## Overview

A React test setup has four moving parts, and every one of them is a separate
package:

| Part | What it does | Package |
|---|---|---|
| Test runner | Finds test files, runs them, reports results | `vitest` or `jest` |
| DOM implementation | Gives Node a `document` to render into | `jsdom` or `happy-dom` |
| React renderer bindings | Renders components and queries the result | `@testing-library/react` |
| DOM matchers | `toBeInTheDocument`, `toBeDisabled`, and friends | `@testing-library/jest-dom` |

Add `@testing-library/user-event` for realistic interaction, and you have the
whole stack. React itself ships no test utilities you need to install — `act` is
exported from the `react` package you already have.

> [!WARNING]
> **This is the setup step that breaks when you upgrade to React 19.** The module
> that used to export `act` for DOM tests was removed in 19.0, and `act` now
> comes from `"react"`. See [The React 19 change that breaks
> tests](#the-react-19-change-that-breaks-tests) below. If your test suite
> exploded the moment you upgraded, that is almost certainly why.

## Why it exists

React components are functions that return a description of UI. Calling one and
inspecting the returned object tells you almost nothing useful, because the
interesting behavior — state updates, Effects, event handlers, conditional
rendering — only happens once React commits that description to a host
environment.

So a React test needs a real DOM. `jsdom` and `happy-dom` provide one in Node so
you do not have to launch a browser for every assertion. Testing Library then
renders your component into that DOM and gives you queries that find elements
the way a user would.

## When to use it

Use this setup for **component and integration tests**: a component plus its
children, its state, its Effects, and the hooks it calls, driven through the DOM.
This is where the ratio of confidence to effort is best.

It also covers custom hooks, context providers, reducers, and small feature
slices — a form and its validation, a list and its filter controls.

## When not to use it

Do not use jsdom for anything that depends on real layout or real browser
behavior. `jsdom` does not do layout: `getBoundingClientRect` returns zeros,
`IntersectionObserver` and `ResizeObserver` do not exist unless you polyfill
them, and `scrollIntoView` is a no-op. Virtualized lists, drag-and-drop, and
anything measuring elements belong in a real browser — Playwright, Cypress, or
Vitest's browser mode.

Do not use it for Server Components either. An async Server Component is not
something `@testing-library/react` can render; test the data functions it calls
directly, and test the client boundary underneath it as a normal component.

And do not reach for a unit test when the thing you want to check is a type. The
type checker is faster and more thorough.

## Basic example

Install the stack. Vitest is the right default for a Vite app because it reuses
your existing `vite.config` — same resolver, same aliases, same plugins, no
second build pipeline to keep in sync.

:::tabs
== Vitest (npm)
```bash
npm install -D vitest@^5 jsdom@^30 \
  @testing-library/react@^16.3.3 \
  @testing-library/jest-dom@^7 \
  @testing-library/user-event@^14.6.7
```
== Vitest (pnpm)
```bash
pnpm add -D vitest@^5 jsdom@^30 \
  @testing-library/react@^16.3.3 \
  @testing-library/jest-dom@^7 \
  @testing-library/user-event@^14.6.7
```
== Jest (npm)
```bash
npm install -D jest@^30 jest-environment-jsdom@^30 \
  babel-jest @babel/preset-env @babel/preset-react @babel/preset-typescript \
  @testing-library/react@^16.3.3 \
  @testing-library/jest-dom@^7 \
  @testing-library/user-event@^14.6.7
```
:::

> [!WARNING]
> `@testing-library/react` must be **16.0.0 or newer** to work with React 19. Its
> peer range is `^18.0.0 || ^19.0.0`; the current release is 16.3.3. Version 15
> and below peer-depend on React 18 only and will either refuse to install or
> fail at runtime. This is a separate problem from the `act` import change, and
> upgrading React without upgrading this package produces confusing errors.

### Vitest configuration

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```

Four options are doing real work:

- **`environment: 'jsdom'`** gives every test file a `document`. Swap in
  `'happy-dom'` if you want the faster, less complete implementation. Set it per
  file with a `// @vitest-environment jsdom` comment at the top when only some
  tests need a DOM.
- **`globals: true`** puts `describe`, `it`, `expect` and `afterEach` on the
  global object. Testing Library's automatic cleanup keys off a global
  `afterEach`, so turning globals on saves you wiring it manually.
- **`setupFiles`** runs before every test file. That is where matchers get
  registered.
- **`css: false`** skips processing stylesheets you are not asserting on. It is
  the single biggest speed win in most suites.

### The setup file

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

The `/vitest` entry point is not optional — the bare
`'@testing-library/jest-dom'` import extends Jest's `expect`, not Vitest's.

`cleanup()` unmounts everything rendered in the previous test. With
`globals: true` Testing Library registers this itself, but writing it explicitly
costs one line and makes the behavior visible to the next person reading the
file.

> [!TIP]
> If a test passes alone and fails in a suite, missing cleanup is the first thing
> to check. Leftover DOM from a previous test makes `getByRole` throw "found
> multiple elements".

### Jest configuration

Jest needs a transform because it does not compile JSX or TypeScript itself.

```js
// jest.config.js
export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss)$': '<rootDir>/src/test/style-mock.js',
  },
};
```

```js
// babel.config.js
export default {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};
```

```ts
// src/test/setup.ts  (Jest version)
import '@testing-library/jest-dom';
```

`runtime: 'automatic'` matters: without it, every test file needs
`import React from 'react'` at the top, which is not how you write components
anywhere else in a React 19 codebase.

### A first test

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

function LikeButton({ initialLikes = 0 }: { initialLikes?: number }) {
  const [likes, setLikes] = useState(initialLikes);
  return (
    <button onClick={() => setLikes((n) => n + 1)}>
      Like ({likes})
    </button>
  );
}

describe('LikeButton', () => {
  it('increments the count when clicked', async () => {
    const user = userEvent.setup();
    render(<LikeButton />);

    const button = screen.getByRole('button', { name: /like/i });
    expect(button).toHaveTextContent('Like (0)');

    await user.click(button);

    expect(button).toHaveTextContent('Like (1)');
  });
});
```

Note that `user.click` is awaited. In `@testing-library/user-event` v14 every
interaction returns a promise — see [User events](./user-events.md).

## How it works

### The React 19 change that breaks tests

React 19 removed the module that used to export DOM test utilities. `act` is now
exported from the `react` package.

> [!LEGACY]
> **React 18 and earlier.** Test helpers came from `react-dom/test-utils`, which
> was **removed in React 19.0**. Any of these imports will now throw:
>
> ```js legacy
> // Removed in React 19 — this module no longer exists.
> import { act } from 'react-dom/test-utils';
> import ReactTestUtils from 'react-dom/test-utils';
> ```
>
> Replace every one of them with the export from `react`:
>
> ```js
> import { act } from 'react';
> ```
>
> Nothing else about `act` changed. Only the import path did. Run
> `npx codemod@latest react/19/migration-recipe` to rewrite these automatically
> across a large suite.

You will most often hit this indirectly, through a helper library or a snippet
copied from a pre-2025 blog post, rather than in your own test files. If an
import fails to resolve inside `node_modules`, upgrade that package rather than
patching around it.

> [!DEPRECATED]
> `react-test-renderer` is **deprecated as of React 19**. It renders to a plain
> JavaScript object tree instead of a DOM, which means your tests assert on
> React's internal element structure rather than on what a user can perceive.
> Use `@testing-library/react` instead. The shallow renderer moved out of the
> package entirely and now lives in `react-shallow-renderer`; do not adopt it in
> new code either.

### IS_REACT_ACT_ENVIRONMENT

React needs to know it is running in a test so it can queue work for `act` to
flush rather than scheduling it normally. It reads a global flag:

```ts nocheck="Illustrative — Testing Library sets this for you; you rarely write it."
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
```

**You almost never write this line.** `@testing-library/react` sets it around
every `render` and `act` call. Set it yourself only when you drive
`createRoot` directly without Testing Library — a rare case, and usually a sign
you should be using Testing Library.

If you see "The current testing environment is not configured to support act",
the flag is missing. If you see "An update to X was not wrapped in act", the flag
is fine and something else is wrong — see [act and async](./act-and-async.md).

### jsdom versus happy-dom

`jsdom` is the more complete and more standards-faithful implementation, and it
is the safer default. `happy-dom` is meaningfully faster but implements less; you
find out which parts are missing when a test fails for reasons unrelated to your
component.

Start on `jsdom`. Move to `happy-dom` only when test startup time is measurably
hurting you, and expect to polyfill a few things.

Both need common browser APIs stubbed regardless:

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { vi, beforeAll } from 'vitest';

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  } as unknown as typeof IntersectionObserver;

  globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});
```

Stub these in the setup file once rather than in individual tests. A component
that crashes because `IntersectionObserver` is undefined is not telling you
anything about your code.

## Common patterns

### What to test, and what not to

Be deliberate here, because the wrong tests cost more than no tests. They fail
on every refactor and teach the team to distrust the suite.

**Test these:**

- What renders for a given set of props, from the user's point of view.
- What happens after an interaction: click, type, submit, keyboard navigation.
- Loading, empty, error and success states of anything asynchronous.
- Accessible names, roles and labels — asserting through `getByRole` tests
  accessibility for free.
- Edge cases the product actually has: zero items, one item, a very long name.

**Do not test these:**

- **Internal state.** `useState` values are an implementation detail. Assert on
  the rendered output the state produces.
- **Whether a child component was called.** Mocking children to assert they
  rendered tests your mock, not your app.
- **Class names and DOM structure.** These change with every restyle.
- **Full-component snapshots.** A snapshot of a whole component fails on every
  change and gets regenerated without being read, which means it catches
  nothing. Small, targeted snapshots of serialized data are fine.
- **The library.** React's rendering, React Router's matching, and TanStack
  Query's caching are already tested by their maintainers.

> [!BEST-PRACTICE]
> Write the test so it would still pass if you rewrote the component's internals
> completely, keeping only its props and its rendered behavior. If a refactor
> that changes no behavior breaks the test, the test is coupled to
> implementation.

### Project structure

Colocate tests next to the code. `Button.tsx` and `Button.test.tsx` in the same
folder means moving the component moves its test, and a directory listing shows
you immediately what is untested.

```text
src/
  features/
    checkout/
      CheckoutForm.tsx
      CheckoutForm.test.tsx
      use-cart.ts
      use-cart.test.ts
  test/
    setup.ts
    render.tsx        <- custom render with providers
```

The `src/test/render.tsx` module is worth building on day one — see
[Testing Library](./testing-library.md#a-custom-render-with-providers).

### Testing with StrictMode

Your app renders inside `<StrictMode>`, so your tests should too. StrictMode
double-invokes component bodies and mounts, unmounts, then remounts Effects in
development, which surfaces exactly the class of bug — impure render, missing
cleanup — that is hardest to find in production.

```tsx
import { StrictMode, type ReactElement } from 'react';
import { render } from '@testing-library/react';

export function renderStrict(ui: ReactElement) {
  return render(ui, { wrapper: StrictMode });
}
```

> [!WARNING]
> If a test only passes outside StrictMode, you have found a real bug, not a
> testing problem. The usual cause is an Effect that subscribes without
> unsubscribing, or one that increments something on mount.

### Coverage without cargo-culting

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.config.*', '**/test/**', '**/*.d.ts'],
    },
  },
});
```

Read coverage as a map of what is untested, not as a number to raise. A file at
100% coverage with assertions that never fail is worse than one at 60% with
tests that mean something.

## Advanced example

A complete setup for an app with a router, a query client and a theme — the
shape most real projects converge on.

```tsx static="Configuration module — needs a test runner and the app's providers."
// src/test/render.tsx
import { createContext, type ReactElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

// In a real project this is imported from your theme module.
export const ThemeContext = createContext<'light' | 'dark'>('light');

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function renderApp(ui: ReactElement, options: { route?: string } = {}) {
  const { route = '/' } = options;
  const queryClient = createTestQueryClient();

  const router = createMemoryRouter(
    [{ path: '*', element: ui }],
    { initialEntries: [route] },
  );

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeContext value="light">{children}</ThemeContext>
      </QueryClientProvider>
    );
  }

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(<RouterProvider router={router} />, { wrapper: Providers }),
  };
}

export * from '@testing-library/react';
```

Three decisions in there are worth copying:

- **`retry: false`** on the query client. Default retries turn a failing request
  into a test that hangs for seconds and then fails with a timeout instead of the
  real error.
- **`createMemoryRouter`** rather than a browser router, so tests can start at any
  URL without touching `window.history`.
- **Returning `user` from the render helper.** `userEvent.setup()` must run
  before render, and bundling it here means no test can forget.

Note `<ThemeContext value="light">` — since React 19 a context object renders
directly as its own provider.

## Common mistakes

- **Upgrading React to 19 without upgrading `@testing-library/react`.** You need
  16.0.0 or newer. The errors you get otherwise do not mention versions.
- **Leaving a `react-dom/test-utils` import in a helper file.** It was removed in
  React 19 and the module genuinely does not exist. Import `act` from `react`.
- **Importing `'@testing-library/jest-dom'` instead of
  `'@testing-library/jest-dom/vitest'`** under Vitest. The matchers silently do
  not register and `toBeInTheDocument` is not a function.
- **Forgetting `runtime: 'automatic'`** in the Babel React preset, then adding
  `import React from 'react'` to every test file to work around it.
- **Setting `IS_REACT_ACT_ENVIRONMENT` manually** because a blog post said to.
  Testing Library handles it. Setting it by hand hides the real cause of act
  warnings.
- **Snapshotting whole components.** Nobody reviews a 200-line snapshot diff;
  they run `--update` and move on.
- **Testing that a mocked child rendered.** That asserts your mock works.
- **Skipping StrictMode in tests** while shipping it in the app, so Effect
  cleanup bugs never appear until production.
- **Chasing a coverage percentage** instead of covering the paths that break.

## Related topics

- [Testing Library](./testing-library.md) — queries, `screen`, and a custom render helper.
- [act and async](./act-and-async.md) — what `act` does and how to fix act warnings properly.
- [User events](./user-events.md) — realistic interaction with `user-event` v14.
- [Build tooling](../ecosystem/build-tooling.md) — the Vite config your Vitest config inherits.
- [StrictMode](../core-concepts/strict-mode.md) — why double-invocation finds real bugs.
- [React 18 to 19](../migration/react-18-to-19.md) — the full upgrade, including the removed test utilities.
