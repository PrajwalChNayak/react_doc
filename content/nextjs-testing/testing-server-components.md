---
title: Testing Server Components
description: Why async Server Components cannot be rendered in Vitest, and how to test their data functions in isolation and their output end to end.
group: nextjs-testing
order: 30
status: current
related: [server-react/server-components, nextjs-rendering/server-components, nextjs-auth/data-access-layer, nextjs-testing/playwright]
---

## Overview

Most pages in the App Router are `async` Server Components. They `await params`,
read `cookies()`, query a database and render the result. That is exactly the kind
of component a unit test cannot render today.

The Next.js testing guides are direct about it. Vitest and Jest do not support
`async` Server Components yet. You can unit test **synchronous** Server and Client
Components, and Next.js recommends **end-to-end tests** for `async` ones.

This page shows the strategy that follows from that:

1. Move the decisions out of the component into plain functions: a data access
   layer (DAL) and mappers. Unit test those with Vitest.
2. Keep presentational pieces synchronous, taking data as props. Unit test those
   with Testing Library if they have logic worth testing.
3. Test the assembled page, with real requests, streaming and caching, in
   [Playwright](./playwright.md).

The React model of Server Components is explained in
[Server Components](../server-react/server-components.md).

## Why it exists

An `async` Server Component is a function that returns a promise of React
elements. Testing Library renders into a client React root in jsdom, and client
roots do not render async components the way the server renderer does.

Even if rendering worked, the component depends on things that only exist inside
a Next.js request:

- **`params` and `searchParams`** are promises that Next.js creates from the URL.
- **`cookies()` and `headers()`** read the incoming request. There is none in a
  unit test.
- **`"use cache"`, `cacheLife()` and `cacheTag()`** need the Next.js cache
  runtime. `cacheLife()` and `cacheTag()` throw when they run outside it.
- **`server-only`** throws when it is imported without the `react-server` export
  condition, which Vitest does not set.
- **`<Suspense>` streaming** is a property of the server response, not of the
  component tree in isolation.

Mocking all of that produces a test that verifies the mocks. Splitting the code
along the same line the framework already draws gives you tests that verify
your logic.

## When to use it

- **Unit test a DAL function** when it makes an authorization decision, filters
  rows by owner, or maps database records to what the UI needs.
- **Unit test a synchronous component** that renders data from props with real
  branching: an empty state, a status badge, a formatted total.
- **Write an end-to-end test** for every page that matters: it proves `params`
  were awaited, the session was read, the right data was loaded, and the
  `<Suspense>` fallbacks resolved.

## When not to use it

- Do not unit test a page component that only wires a DAL call to a presentational
  component. There is no logic left to test, and Playwright covers the wiring.
- Do not test caching with unit tests. Whether `"use cache"` returns a cached value
  depends on the Next.js runtime. Test that fresh data appears after a mutation in
  an end-to-end test instead.
- Do not export extra internals from a page file only for tests. Next.js
  type-checks page exports during `next build`, and an export it does not
  expect fails the build. Put shared functions in `lib/`.

## Basic example

A page that lists the signed-in user's invoices. The page stays thin:

```tsx file="app/invoices/page.tsx"
import { getInvoicesForCurrentUser } from '@/lib/invoices';
import { InvoiceTable } from './invoice-table';

export default async function InvoicesPage() {
  const invoices = await getInvoicesForCurrentUser();

  return (
    <main>
      <h1>Invoices</h1>
      <InvoiceTable invoices={invoices} />
    </main>
  );
}
```

The decisions live in the DAL. It checks the session, scopes the query to the
current user, and shapes the rows:

```ts file="lib/invoices.ts"
import 'server-only';
import { cache } from 'react';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/session';

export type InvoiceSummary = {
  id: string;
  number: string;
  total: string;
  status: 'paid' | 'overdue' | 'open';
};

type InvoiceRow = {
  id: string;
  number: string;
  amountCents: number;
  currency: string;
  paidAt: Date | null;
  dueAt: Date;
};

export function toInvoiceSummary(row: InvoiceRow, now: Date): InvoiceSummary {
  const status = row.paidAt ? 'paid' : row.dueAt < now ? 'overdue' : 'open';
  const total = new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency }).format(
    row.amountCents / 100,
  );
  return { id: row.id, number: row.number, total, status };
}

export const getInvoicesForCurrentUser = cache(async (): Promise<InvoiceSummary[]> => {
  const session = await verifySession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const rows: InvoiceRow[] = await db.invoice.findMany({
    where: { ownerId: session.userId },
    orderBy: { dueAt: 'desc' },
  });

  const now = new Date();
  return rows.map((row) => toInvoiceSummary(row, now));
});
```

The unit test runs in the `node` environment, replaces `server-only`, the session
module and the database client, and asserts on the decisions:

```ts file="lib/invoices.test.ts"
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { getInvoicesForCurrentUser, toInvoiceSummary } from '@/lib/invoices';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/session', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { invoice: { findMany: vi.fn() } } }));

const baseRow = {
  id: 'inv_1',
  number: 'INV-1001',
  amountCents: 125000,
  currency: 'USD',
  paidAt: null,
  dueAt: new Date('2026-09-30'),
};

describe('toInvoiceSummary', () => {
  it('marks an unpaid invoice past its due date as overdue', () => {
    const summary = toInvoiceSummary(baseRow, new Date('2026-10-01'));
    expect(summary).toEqual({ id: 'inv_1', number: 'INV-1001', total: '$1,250.00', status: 'overdue' });
  });

  it('marks a paid invoice as paid regardless of the due date', () => {
    const summary = toInvoiceSummary({ ...baseRow, paidAt: new Date('2026-09-01') }, new Date('2026-10-01'));
    expect(summary.status).toBe('paid');
  });
});

describe('getInvoicesForCurrentUser', () => {
  it('refuses to query without a session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);

    await expect(getInvoicesForCurrentUser()).rejects.toThrow('Unauthorized');
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it("only loads the signed-in user's invoices", async () => {
    vi.mocked(verifySession).mockResolvedValue({ userId: 'user_42' });
    vi.mocked(db.invoice.findMany).mockResolvedValue([baseRow]);

    const invoices = await getInvoicesForCurrentUser();

    expect(db.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'user_42' } }),
    );
    expect(invoices).toHaveLength(1);
  });
});
```

The first two tests need no mocks at all, which is the point of pulling
`toInvoiceSummary` out as a pure function with `now` passed in.

## How it works

### Why `server-only` is mocked here and not in component tests

`server-only` resolves to an empty module under the `react-server` condition and
to a module that throws everywhere else. Next.js applies that condition when it
bundles Server Components. Vitest does not, so the import throws.

In a DAL test you are importing server code on purpose, so replacing
`server-only` with an empty module is correct. The Next.js Jest guide maps it to
an empty file for the same reason. In a Client Component test, the same error
means a real bug. See
[Unit testing Client Components](./unit-testing-components.md).

### React `cache` in a unit test

`cache` from `react` memoizes per server request only inside the React Server
Components environment. Outside it, React's client build returns a wrapper that
calls your function every time. Tests therefore see uncached calls, which is what
you want: each test controls its own mocks.

### Where `"use cache"` goes

A `"use cache"` directive is a string to Vitest, so a cached function runs
normally in a test. The calls inside it are the problem. `cacheLife()` and
`cacheTag()` throw outside the Next.js runtime. If a DAL function calls them,
mock `next/cache` in that test:

```ts file="lib/products.test.ts"
// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { cacheTag } from 'next/cache';
import { getProduct } from '@/lib/products';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: { product: { findUnique: vi.fn().mockResolvedValue({ id: 'p_1', name: 'Trail Runner' }) } },
}));

it('tags the cached product so a mutation can invalidate it', async () => {
  await getProduct('p_1');
  expect(cacheTag).toHaveBeenCalledWith('product-p_1');
});
```

Asserting the tag is useful, because a typo there makes `updateTag()` silently
miss. Whether the value is actually cached is the framework's job.

## Server and client implications

The split this page recommends is also the one Next.js recommends for security.
A [data access layer](../nextjs-auth/data-access-layer.md) that checks the session
next to the query keeps authorization out of individual pages. That same function
is the easiest place to test authorization. A page-level check only shows up in
an end-to-end test.

A synchronous presentational component such as `InvoiceTable` can be a Server
Component, since it has no `"use client"` directive, and still render in Testing
Library. The rendering path is the same as for a Client Component, as long as
it has no hooks that need the router and imports nothing server-only.

## Common patterns

### Test the assembled page end to end

The DAL tests prove the decisions. Playwright proves the page wires them up and
renders under a real request:

```ts file="e2e/invoices.spec.ts"
import { expect, test } from '@playwright/test';

test('lists the signed-in user\'s invoices', async ({ page }) => {
  await page.goto('/invoices');

  await expect(page.getByRole('heading', { level: 1, name: 'Invoices' })).toBeVisible();
  await expect(page.getByRole('row', { name: /INV-1001/ })).toContainText('Overdue');
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('does not show invoices', async ({ page }) => {
    await page.goto('/invoices');
    await expect(page.getByRole('row', { name: /INV-1001/ })).toHaveCount(0);
  });
});
```

The signed-in state comes from a Playwright setup project, described in
[Playwright](./playwright.md). The signed-out block overrides it with an empty
storage state.

### Test the synchronous presentational component

```tsx file="app/invoices/invoice-table.test.tsx"
import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceTable } from './invoice-table';

it('shows an empty state when there are no invoices', () => {
  render(<InvoiceTable invoices={[]} />);
  expect(screen.getByText('No invoices yet.')).toBeInTheDocument();
});
```

Only write this test if the component has branches. A table that maps props to
cells is covered by the end-to-end test.

## Common mistakes

- **`render(await Page())` in a test.** Calling the page as a function and
  rendering the result appears to work for a trivial page, then breaks as soon as
  a child is async or anything reads `cookies()`. The Next.js docs do not
  support this. Test the functions, and test the page end to end.
- **Putting logic inside the page component.** Anything written inline in an async
  page can only be tested through a browser. Move it to `lib/`.
- **Exporting helpers from `page.tsx` so tests can import them.** Page files may
  only export what Next.js expects, and `next build` rejects other exports.
- **Mocking `server-only` in a Client Component test.** In a DAL test it is
  expected. In a component test it hides a real import mistake.
- **Testing that `"use cache"` caches.** That is framework behavior. Assert the
  tag or profile you pass, and verify freshness end to end.
- **Calling `new Date()` inside the function under test.** Pass the time in, so a
  test about overdue invoices does not depend on the day it runs.

## Related topics

- [Server Components](../server-react/server-components.md) — the React model: what runs on the server and why.
- [Server Components in Next.js](../nextjs-rendering/server-components.md) — how the App Router renders them.
- [Data access layer](../nextjs-auth/data-access-layer.md) — where session checks and queries belong, and why that makes them testable.
- [Playwright](./playwright.md) — the end-to-end setup that covers rendering.
- [Testing Server Actions](./testing-server-actions.md) — the same approach for mutations.
