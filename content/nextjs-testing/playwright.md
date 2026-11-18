---
title: End-to-end testing with Playwright
description: Run Playwright against a production Next.js build, reuse signed-in state, test streamed pages and Route Handlers, and run the suite in CI.
group: nextjs-testing
order: 50
status: current
related: [nextjs-testing/overview, nextjs-testing/instant-navigation-tests, nextjs-rendering/streaming, server-react/streaming]
---

## Overview

Playwright drives Chromium, Firefox and WebKit through one API. For a Next.js app,
it is the layer that sees what unit tests cannot: async Server Components, the
session read from `cookies()`, `proxy.ts`, `<Suspense>` streaming, Route Handler
responses, caching after a mutation, and client-side navigation.

The Next.js Playwright guide recommends running these tests against your
**production** code, because that is how the app behaves once deployed. This page
sets that up with Playwright's `webServer` option, then covers signed-in state,
streamed pages, API tests with the `request` fixture, and CI.

## Why it exists

Most of what makes a Next.js page correct is decided at request time on the
server. Whether `params` was awaited, whether the right user's data was loaded,
whether a `<Suspense>` boundary resolved: none of that exists until a server
handles a real request. A browser test is the only test that exercises the whole
path.

`next dev` is not a faithful stand-in. It compiles routes on first request, turns
off prefetching and adds development-only checks. `next build` followed by
`next start` gives you prerendered shells, real caching and prefetching, which is
what users get.

## When to use it

- Critical user flows: sign in, checkout, creating and editing records.
- Every page built from `async` Server Components you care about.
- Authorization at the page level: what a signed-out or unprivileged user sees.
- `proxy.ts` redirects and rewrites.
- Route Handlers' status codes, headers and bodies.
- Anything that depends on caching or revalidation after a mutation.

## When not to use it

- Validation messages for every malformed input. Cover the branches in a
  [Server Action unit test](./testing-server-actions.md) and keep one end-to-end
  test for the wiring.
- Pure formatting and mapping logic. A Vitest test runs in milliseconds.
- Exhaustive cross-browser runs on every commit. Run Chromium on pull requests and
  the full matrix on a schedule if you need it.

## Basic example

Install the runner and one browser:

```bash
npm install -D @playwright/test@1.63.0
npx playwright install --with-deps chromium
```

`--with-deps` also installs the operating system libraries the browser needs,
which matters on a fresh CI machine.

Configure Playwright to build and start the app itself:

```ts file="playwright.config.ts"
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
```

And write a first test:

```ts file="e2e/navigation.spec.ts"
import { expect, test } from '@playwright/test';

test('navigates from the home page to pricing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Pricing' }).click();

  await expect(page).toHaveURL('/pricing');
  await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible();
});
```

Run it with `npx playwright test`.

## How it works

### `webServer` and `baseURL`

`webServer.command` runs before the first test, and Playwright waits until
`webServer.url` responds. The `timeout` has to cover a full `next build`, which is
why it is much longer than Playwright's default.

- **A dedicated port** (`--port` is a `next start` option) keeps the test server
  from colliding with a `next dev` you already have running on 3000.
- **`reuseExistingServer: !process.env.CI`** lets you start `next start` yourself
  locally and iterate without rebuilding. In CI, it always starts a fresh server.
- **`use.baseURL`** makes `page.goto('/pricing')` and `toHaveURL('/pricing')`
  relative to the test server, so no test hard-codes a port.

### Hidden previous pages under Cache Components

With Cache Components enabled, Next.js does not unmount the page you navigate
away from. It hides it with React's `<Activity>` (`display: none`) and keeps up to
three routes. The DOM of the previous page is still in the document.

A CSS locator such as `page.locator('h1')` can match both headings and fail
Playwright's strict mode, or match the wrong one. Role-based locators such as
`getByRole('heading', { level: 1 })` ignore hidden elements, which is another
reason to prefer them. Background on the mechanism is in
[Activity](../performance/activity.md).

### Testing streamed pages

A page with `<Suspense>` boundaries sends its shell first and streams the rest.
`page.goto()` waits for the `load` event by default, which fires after the
streamed document finishes, so by then the fallbacks have usually been replaced.

Assert the **final** state, and let Playwright's auto-waiting assertions absorb
the streaming delay:

```ts file="e2e/dashboard.spec.ts"
import { expect, test } from '@playwright/test';

test('the dashboard streams in revenue and recent orders', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Revenue' })).toContainText('$');
  await expect(page.getByRole('table', { name: 'Recent orders' }).getByRole('row')).not.toHaveCount(0);
  await expect(page.getByText('Loading revenue…')).toHaveCount(0);
});
```

Asserting that a fallback such as "Loading revenue…" is **visible** is a race.
Whether the test sees it depends on how fast the data arrived on that run. If what
you want to guard is the loading state itself, use `instant()`, which holds
dynamic content back until your assertions finish. See
[Instant navigation tests](./instant-navigation-tests.md).

> [!NOTE]
> **Opt-in (16.3).** `instant()` is part of Instant Navigations, which need
> `cacheComponents: true` and `partialPrefetching: true`. These behaviors are
> slated to become the default in a future major version. The `@next/playwright`
> README still labels `instant()` Experimental and not yet stable.

## Server and client implications

A Playwright test is a client of your server, not a module inside it. It cannot
mock `cookies()` or `next/cache`. You control the server through its inputs:
environment variables in `webServer.env`, a seeded test database, and cookies set
in the browser context. Treat the test server like a small deployment.

## Caching implications

Caching is real in these tests. `"use cache"` results survive between tests that
share a server, and prerendered pages were built before the first test ran.
Create unique data per test (a timestamp in a title, a fresh user) instead of
depending on a known empty state, and assert on the data you created.

## Common patterns

### Reusing signed-in state

Signing in through the UI before every test is slow. Playwright's recommended
pattern is a **setup project** that signs in once and saves the browser's storage
state, which later projects load:

```ts file="e2e/auth.setup.ts"
import { expect, test as setup } from '@playwright/test';

const editorStateFile = 'playwright/.auth/editor.json';

setup('sign in as an editor', async ({ page }) => {
  const email = process.env.E2E_EDITOR_EMAIL;
  const password = process.env.E2E_EDITOR_PASSWORD;
  if (!email || !password) {
    throw new Error('Set E2E_EDITOR_EMAIL and E2E_EDITOR_PASSWORD for the test user.');
  }

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL('/dashboard');
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();

  await page.context().storageState({ path: editorStateFile });
});
```

```ts file="playwright.config.ts"
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/editor.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
```

The saved file contains the session cookie. Add `playwright/.auth` to
`.gitignore`, and read the test user's credentials from CI secrets, never from the
repository.

For a test that must run signed out, override the state in that file or
`describe` block:

```ts file="e2e/access.spec.ts"
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('a signed-out visitor is sent to the login page', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
```

### Testing Route Handlers with the `request` fixture

API tests do not need a page. Playwright's `request` fixture sends HTTP requests
relative to `baseURL`. `page.request` shares the browser context's cookies, so it
carries the signed-in session. A new request context from the `playwright` fixture
carries none:

```ts file="e2e/api/bookmarks.spec.ts"
import { expect, test } from '@playwright/test';

test.describe('POST /api/bookmarks', () => {
  test('creates a bookmark for the signed-in user', async ({ page }) => {
    const response = await page.request.post('/api/bookmarks', {
      data: { url: 'https://nextjs.org/docs' },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({ url: 'https://nextjs.org/docs' });
  });

  test('rejects anonymous requests', async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    try {
      const response = await anonymous.post('/api/bookmarks', {
        data: { url: 'https://nextjs.org/docs' },
      });
      expect(response.status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
  });

  test('rejects a non-numeric limit', async ({ request }) => {
    const response = await request.get('/api/bookmarks?limit=not-a-number');
    expect(response.ok()).toBe(false);
  });
});
```

Route Handlers themselves are covered in
[Route Handlers](../nextjs-backend/route-handlers.md). The
[security pairs example](../../examples/nextjs/security-pairs/README.md) uses this
fixture to send the same attack to a vulnerable and a fixed endpoint.

### Running in CI

A GitHub Actions job that runs both layers:

```text file=".github/workflows/test.yml"
name: Test
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - run: npm ci
      - run: npx vitest run
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          E2E_EDITOR_EMAIL: ${{ secrets.E2E_EDITOR_EMAIL }}
          E2E_EDITOR_PASSWORD: ${{ secrets.E2E_EDITOR_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

- **Node 22** satisfies both Next.js 16.3 (20.9.0 or newer) and Vitest 5 (22.12.0
  or newer).
- **`CI` is set by GitHub Actions**, so the config above forbids `test.only`,
  retries twice, and always starts a fresh server.
- **The report upload** runs even when tests fail, which is when you need the
  traces.

The config's `reporter` only writes an HTML report if you add the `html` reporter.
Adjust the upload path to match what you configure.

## Security considerations

Storage state files contain live session cookies for your test user. Keep them out
of version control, give the test user the minimum permissions the tests need, and
never point the suite at production with a real account.

## Common mistakes

- **Testing against `next dev` in CI.** It skips prefetching and prerendering,
  so production-only bugs pass.
- **A `webServer.timeout` shorter than your build.** The run fails before the first
  test with a timeout that looks like a server crash.
- **Asserting that a `<Suspense>` fallback is visible.** It is a race. Assert the
  final content, or use `instant()` for the loading state.
- **CSS locators that match the hidden previous page.** Under Cache Components the
  last routes stay in the DOM. Use role-based locators.
- **Committing `playwright/.auth`.** It holds a working session cookie.
- **Depending on an empty database.** Cached pages and leftover rows from earlier
  runs break the assumption. Create unique data per test.
- **Forgetting `dispose()` on a request context you created.** Contexts from
  `playwright.request.newContext()` are not cleaned up automatically.

## Related topics

- [Testing overview](./overview.md) — what belongs in Playwright and what belongs in Vitest.
- [Instant navigation tests](./instant-navigation-tests.md) — deterministic assertions on loading states with `instant()`.
- [Streaming in Next.js](../nextjs-rendering/streaming.md) — how `<Suspense>` boundaries become a streamed response.
- [Streaming](../server-react/streaming.md) — the React model behind streamed HTML.
- [Route Handlers](../nextjs-backend/route-handlers.md) — the endpoints the `request` fixture tests.
