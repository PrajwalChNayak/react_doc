---
title: Unit testing Client Components
description: Set up Vitest 5, @vitejs/plugin-react and jsdom for a Next.js app, and mock next/navigation so Client Components render outside the router.
group: nextjs-testing
order: 20
status: current
related: [testing/setup, testing/testing-library, testing/user-events, nextjs-rendering/client-components]
---

## Overview

Client Components are the part of a Next.js app that unit tests handle best. They
are ordinary React components with state, Effects and event handlers, so Vitest,
jsdom and Testing Library render them the same way they render any React
component.

What is different in Next.js is the imports. A Client Component that calls
`useRouter()` or `usePathname()` from `next/navigation` expects the App Router to
be mounted around it, and in a unit test it is not. This page covers the Vitest
configuration for a Next.js project and how to handle `next/navigation`,
`next/link` and `next/image`.

For queries, `act`, and user events, read the React pages:
[Testing setup](../testing/setup.md), [Testing Library](../testing/testing-library.md)
and [User events](../testing/user-events.md).

## Why it exists

Next.js does not ship a Vitest integration. You configure Vitest yourself, and
three Next.js details matter:

- **`next/navigation` hooks need the router.** `useRouter()` throws
  `invariant expected app router to be mounted` when there is no App Router
  context. `usePathname()` has nothing to read.
- **The `@/` import alias comes from `tsconfig.json`.** Next.js resolves it
  during a build, and Vite does not unless you turn on tsconfig path resolution.
- **Some modules must never load in a browser-like environment.** A component
  that imports a module marked `server-only` fails as soon as Vitest imports it.

## When to use it

- Client Components with state or interaction: forms, menus, filters, tabs.
- Components that read `usePathname()`, `useSearchParams()` or `useParams()` to
  decide what to render, such as an active navigation link.
- Components that call `useRouter().push()` or `refresh()` after an interaction.
- Synchronous components with no `"use client"` directive that only render props.
  The Next.js docs note these can be unit tested too.

## When not to use it

- **Async Server Components.** Vitest does not support them. See
  [Testing Server Components](./testing-server-components.md).
- **Real navigation, prefetching, or anything that depends on the server.** A
  mocked router only proves you called `push()` with the right URL. Whether the
  page then loads is a [Playwright](./playwright.md) test.
- **Layout-dependent behavior.** jsdom does no layout. The
  [React setup page](../testing/setup.md#when-not-to-use-it) lists what is missing.

## Basic example

### Install

```bash
npm install -D vitest@5.0.1 vite@^8 @vitejs/plugin-react@6.1.1 jsdom@30.0.1 \
  @testing-library/react@16.3.3 @testing-library/dom@^10 \
  @testing-library/jest-dom@^7 @testing-library/user-event@^14.6.7
```

Why each non-obvious package is listed:

- **`vite`**: Vitest 5 no longer depends on Vite directly, it declares it as a
  peer. `@vitejs/plugin-react` 6 requires Vite 8. Installing `vite@^8` explicitly
  keeps both satisfied with every package manager.
- **`@testing-library/dom`**: a required peer of `@testing-library/react` 16.
- **`@vitejs/plugin-react`**: compiles JSX with the automatic runtime, so test
  files do not import React to use JSX.

> [!NOTE]
> `@vitejs/plugin-react` 6 lists `oxc-transform-react` as an **optional** peer.
> You only need it for the plugin's experimental Rust React Compiler option
> (`react({ compiler: true })`). A test setup does not use it, so do not install
> it for Vitest.

> [!WARNING]
> Vitest 5 requires **Node.js 22.12.0 or newer**. Next.js 16.3 accepts Node.js
> 20.9.0, so a project can build on a Node version its tests cannot run on.

### Configure Vitest

```ts file="vitest.config.mts"
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['app/**/*.test.{ts,tsx}', 'lib/**/*.test.{ts,tsx}'],
  },
});
```

- **`.mts`**: the Next.js Vitest guide uses this extension. It makes the config an
  ES module whether or not `package.json` sets `"type": "module"`.
- **`resolve.tsconfigPaths: true`**: a Vite 8 option that reads `paths` from
  `tsconfig.json`, so `@/lib/format` resolves the same way it does in
  `next build`. The Next.js guide uses the `vite-tsconfig-paths` plugin for the
  same job. Either works. The built-in option is one less dependency.
- **`include`**: lists only the directories that hold unit tests, so Vitest never
  picks up Playwright specs in `e2e/`.
- **`environment: 'jsdom'`**: gives component tests a `document`. Tests that do
  not need one can opt out per file with a `// @vitest-environment node` comment.

### The setup file

```ts file="vitest.setup.ts"
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

Testing Library unmounts rendered trees automatically only when it finds a global
`afterEach`. This config leaves Vitest's `globals` off, so the setup file calls
`cleanup()` itself. The `/vitest` entry point registers matchers such as
`toBeInTheDocument` on Vitest's `expect`.

### A first component test

A navigation link that marks itself as current:

```tsx file="app/ui/nav-links.tsx"
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/invoices', label: 'Invoices' },
  { href: '/dashboard/customers', label: 'Customers' },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? 'page' : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
```

The test replaces `next/navigation` with a module whose `usePathname` returns the
path the test chooses:

```tsx file="app/ui/nav-links.test.tsx"
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { NavLinks } from './nav-links';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

describe('NavLinks', () => {
  it('marks the link for the current path', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/invoices');

    render(<NavLinks />);

    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('links to each section', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard');

    render(<NavLinks />);

    expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute('href', '/dashboard/customers');
  });
});
```

`next/link` needs no mock. Without a router it renders a plain `<a>` with the
right `href`, which is what the second test asserts.

## How it works

### `vi.mock` is hoisted

Vitest moves every `vi.mock()` call to the top of the file, above the imports. That
is why the test above can import `usePathname` and receive the mock. In Vitest 5,
`vi.mock()` and `vi.hoisted()` **must be at the top level of the module**. Calling
them inside `describe`, `it` or a helper function throws.

Because the factory runs before the file's other code, it cannot reference
variables declared in the test file. Create shared mock functions with
`vi.hoisted()`, as the router example below does.

### Mock state between tests

Vitest 5 turns on `clearMocks` by default, so call history (`mock.calls`) resets
before each test. Implementations set with `mockReturnValue` are **not** reset.
Set the return value inside each test, as above, so no test depends on the one
before it.

### What `next/link` and `next/image` do in a test

- **`next/link`** renders an `<a>`. Clicking it in jsdom does not perform a
  Next.js navigation, because there is no router to send it to. Assert on `href`.
  Test that the destination loads in Playwright.
- **`next/image`** renders an `<img>`. It still validates its props, so an image
  with a string `src` and no `width` and `height` (or `fill`) throws `is missing
  required "width" property`. Vite imports an image file as a URL string, not the
  object with dimensions that `next build` produces, so statically imported images
  hit this error in tests. Pass explicit dimensions, or mock `next/image` when the
  image is not what the test is about.

## Server and client implications

A Client Component can import a module that must not run in the browser only by
mistake, and Next.js catches that at build time with `server-only`. Vitest does
not apply the `react-server` export condition, so importing `server-only` in a
test throws. If a component test hits that error, the component's import graph
reaches server code. Fix the import rather than mocking `server-only` in a
component test.

Unit tests of server-side modules are different: they import server code on
purpose. See [Testing Server Components](./testing-server-components.md).

## Common patterns

### Asserting on `router.push`

```tsx file="app/ui/search-form.tsx"
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SearchForm() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) return;
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <label htmlFor="search-query">Search invoices</label>
      <input id="search-query" value={query} onChange={(event) => setQuery(event.target.value)} />
      <button type="submit">Search</button>
    </form>
  );
}
```

```tsx file="app/ui/search-form.test.tsx"
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchForm } from './search-form';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('SearchForm', () => {
  it('navigates to the encoded search URL', async () => {
    const user = userEvent.setup();
    render(<SearchForm />);

    await user.type(screen.getByLabelText('Search invoices'), 'acme & co');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(router.push).toHaveBeenCalledWith('/search?q=acme%20%26%20co');
  });

  it('does not navigate for an empty query', async () => {
    const user = userEvent.setup();
    render(<SearchForm />);

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(router.push).not.toHaveBeenCalled();
  });
});
```

`vi.hoisted()` creates the `router` object before the hoisted `vi.mock` factory
runs, so the factory and the tests share the same functions. The second test
relies on `clearMocks` having reset the `push` call history.

### Mocking `useSearchParams`

`useSearchParams()` returns a read-only `URLSearchParams`. A real
`URLSearchParams` instance is the most honest stand-in:

```tsx file="app/ui/status-filter.test.tsx"
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { StatusFilter } from './status-filter';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
  usePathname: () => '/dashboard/invoices',
  useRouter: () => ({ replace: vi.fn() }),
}));

it('selects the status from the URL', () => {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('status=overdue'));

  render(<StatusFilter />);

  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('overdue');
});
```

### Mocking `next/image` when the image is incidental

```tsx file="app/ui/customer-card.test.tsx"
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerCard } from './customer-card';

vi.mock('next/image', () => ({
  default: ({ src, alt }: Pick<ComponentProps<'img'>, 'src' | 'alt'>) => <img src={src} alt={alt} />,
}));

it('shows the customer name and avatar', () => {
  render(<CustomerCard name="Ada Lovelace" avatarUrl="/avatars/ada.png" />);

  expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveAttribute('src', '/avatars/ada.png');
});
```

The mock keeps only `src` and `alt`, so props that `next/image` accepts and a
plain `<img>` does not (such as `priority`) never reach the DOM.

### Components that need providers

If a Client Component reads context from a provider in your root layout, render
it inside that provider. Build a shared render helper once, as described in
[Testing Library](../testing/testing-library.md#a-custom-render-with-providers),
and keep the `next/navigation` mocks in the test files that need them.

## Common mistakes

- **Rendering a component that calls `useRouter()` without mocking
  `next/navigation`.** It throws `invariant expected app router to be mounted`.
- **Calling `vi.mock()` inside a test or `describe`.** Vitest 5 throws. Keep it at
  the top level and set per-test values with `vi.mocked(...).mockReturnValue()`.
- **Referencing a test-file variable inside a `vi.mock` factory.** The factory is
  hoisted above the declaration. Use `vi.hoisted()`.
- **Clicking a `<Link>` and expecting the next page to render.** jsdom has no
  router. Assert on `href`, and test the navigation in Playwright.
- **Mocking `server-only` to make a Client Component test pass.** The error is
  telling you a Client Component imports server code.
- **Forgetting `resolve.tsconfigPaths`.** Every `@/` import fails to resolve,
  even though `next build` succeeds.
- **Not calling `cleanup()` with `globals` off.** Trees from earlier tests stay in
  the document, and `getByRole` finds multiple elements.
- **Installing `oxc-transform-react` for tests.** It is only for the plugin's
  experimental compiler option.

## Related topics

- [Testing setup](../testing/setup.md) — the React testing stack, jsdom limits and StrictMode in tests.
- [Testing Library](../testing/testing-library.md) — query priority and a shared render helper.
- [User events](../testing/user-events.md) — realistic typing and clicking with `user-event` v14.
- [Client Components](../nextjs-rendering/client-components.md) — where the `"use client"` boundary goes, and why.
- [Testing Server Components](./testing-server-components.md) — what to do when the component is async.
- [Playwright](./playwright.md) — test real navigation instead of a mocked router.
