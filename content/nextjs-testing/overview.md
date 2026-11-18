---
title: Testing a Next.js app
description: Decide which parts of a Next.js app to unit test with Vitest and which need Playwright against a running production server.
group: nextjs-testing
order: 10
status: current
related: [nextjs-testing/unit-testing-components, nextjs-testing/playwright, nextjs-testing/testing-server-components, testing/setup]
---

## Overview

A Next.js app has two kinds of code. Some of it is ordinary TypeScript and React
that runs anywhere: validation schemas, formatting helpers, data-access
functions, Client Components. The rest only means something inside the
framework: async Server Components, streaming, `proxy.ts`, caching, prefetching,
Route Handlers and the router itself.

That split decides your test pyramid. The first kind belongs in fast unit tests
with **Vitest**. The second kind needs a running Next.js server, so you test it
end to end with **Playwright**.

| Layer | Tool | What it covers well |
|---|---|---|
| Pure functions, Zod schemas, DAL functions | Vitest, `node` environment | Validation, authorization decisions, data shaping |
| Client Components | Vitest + jsdom + Testing Library | Rendering from props, interaction, `next/navigation` hooks (mocked) |
| Server Actions as functions | Vitest, `node` environment, mocked `next/headers` and `next/cache` | Validation errors, authorization failures, which tag gets invalidated |
| Async Server Components, streaming, `proxy.ts`, Route Handlers, navigation | Playwright against `next build` + `next start` | What a user actually receives from the real server |
| Instant Navigations | Playwright + `instant()` from `@next/playwright` | What is visible before dynamic data arrives |

> [!NOTE]
> **Opt-in (16.3).** Instant Navigations and the `instant()` helper apply only when
> you enable `cacheComponents` and `partialPrefetching`. These behaviors are slated
> to become the default in a future major version. The `@next/playwright` README
> labels `instant()` Experimental and not yet stable.

This page explains the split and the tooling. The React side of component
testing (queries, `act`, user events) is covered in
[Testing setup](../testing/setup.md) and is not repeated here.

## Why it exists

Unit tests cannot boot Next.js. When Vitest imports your code, there is no
incoming request, so `cookies()` and `headers()` have nothing to read. There is no
cache handler for `"use cache"`, and there is no router to mount. Many of these
APIs throw outside the framework. `updateTag()`, for example, throws unless it
runs inside a Server Action.

The Next.js testing guides say the same thing about rendering. Vitest and Jest do
not support `async` Server Components yet, so Next.js recommends end-to-end tests
for them. Synchronous Server and Client Components can still be unit tested.

So a Next.js suite is deliberately two-layered: fast tests for logic you can
isolate, and a smaller browser suite for behavior that only exists once the
framework is running.

## When to use it

- **Unit test** anything that makes a decision: a Zod schema, a permission
  check, a function that maps database rows to view data, a Client Component
  with state.
- **Unit test Server Actions as functions** when the interesting part is
  validation and authorization. Those branches are cheap to cover with mocks and
  expensive to reach through a browser.
- **End-to-end test** every flow that crosses the server: a page that reads the
  session, a form that submits a Server Action and redirects, a `proxy.ts`
  redirect, a Route Handler's status codes, a streamed page.
- **Add `instant()` tests** once a route relies on Instant Navigations, so a
  refactor cannot quietly make it slow again.

## When not to use it

- Do not unit test framework behavior: that `redirect()` redirects, that
  `"use cache"` caches, or that a `<Link>` navigates. Next.js tests those. Test
  what your code does with them.
- Do not mock your way into rendering an async Server Component in jsdom. You end
  up testing your mocks. Extract the logic and test that instead (see
  [Testing Server Components](./testing-server-components.md)).
- Do not run end-to-end tests against `next dev` in CI. Development mode compiles
  routes on demand, disables prefetching and adds dev-only checks, so it does not
  behave like what you deploy.

## Basic example

A typical setup installs both layers as dev dependencies:

```bash
npm install -D vitest@5.0.1 vite@^8 @vitejs/plugin-react@6.1.1 jsdom@30.0.1 \
  @testing-library/react@16.3.3 @testing-library/dom@^10 \
  @testing-library/jest-dom@^7 @testing-library/user-event@^14.6.7
npm install -D @playwright/test@1.63.0
```

Add one script per layer, so developers and CI can run them separately:

```json file="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

`vitest` watches files, which is what you want while writing code. `vitest run`
runs once and exits, which is what CI needs. `playwright test` starts the app
through the `webServer` option in `playwright.config.ts`, described in
[Playwright](./playwright.md).

A project that uses both layers usually looks like this:

```text
app/
  posts/
    actions.ts
    actions.test.ts        <- Server Action unit test (Vitest)
  ui/
    nav-links.tsx
    nav-links.test.tsx     <- Client Component test (Vitest + jsdom)
lib/
  invoices.ts
  invoices.test.ts         <- DAL function test (Vitest)
e2e/
  create-post.spec.ts      <- End-to-end test (Playwright)
vitest.config.mts
vitest.setup.ts
playwright.config.ts
```

Keep end-to-end tests in their own directory and exclude it from Vitest. The two
runners use different `test` and `expect` functions, and each fails on the
other's files.

## How it works

### What each layer can see

| Capability | Vitest | Playwright against `next start` |
|---|---|---|
| Your module graph, with mocks | Yes | No |
| `cookies()`, `headers()`, `params` from a real request | No, mock them | Yes |
| `"use cache"`, `cacheLife`, `cacheTag`, `updateTag` | No, they need the Next.js runtime | Yes |
| Async Server Components rendered | No | Yes |
| `<Suspense>` streaming and `loading.tsx` | No | Yes |
| `proxy.ts` | No | Yes |
| Client-side navigation and prefetching | No, mock `next/navigation` | Yes |
| Speed | Milliseconds per test | Seconds per test, plus a build |

### Why end-to-end tests run against a production build

The Next.js Playwright guide recommends testing production code because it more
closely matches how the app behaves once deployed. `next build` prerenders what it
can, builds the static shells, and enables prefetching. None of that happens in
`next dev`.

The trade-off is one build per CI run. Run `next build` once, then point
Playwright at `next start`. The `webServer` option in `playwright.config.ts`
can do both, and it waits for the server before the first test.

> [!NOTE]
> The one exception is `instant()`. Its testing API is on by default in `next dev`
> and off in `next start` unless you set an experimental flag. See
> [Instant navigation tests](./instant-navigation-tests.md).

## Common patterns

### Node.js versions

Next.js 16.3 needs Node.js 20.9.0 or newer. **Vitest 5 needs Node.js 22.12.0 or
newer.** If your CI image still runs Node 20, the Next.js build works and the
Vitest step fails. Pin CI to a Node version that satisfies both.

### A CI pipeline

Run the fast layer first, so a broken schema fails the job in seconds instead of
after a build:

```bash
npm ci
npx vitest run
npx playwright install --with-deps chromium
npx playwright test
```

`playwright test` builds and starts the app itself through `webServer`, so the
pipeline has no separate `next build` step. If your pipeline already builds the
app for deployment, set the `webServer` command to `next start` only and reuse
that build.

### Choosing where a test goes

Ask what would have to be true for the test to fail. If the answer is "my
function returned the wrong thing", write a Vitest test. If the answer is "the
server sent the wrong page", or "the page was right but arrived too late", write a
Playwright test.

## Common mistakes

- **Rendering an async Server Component with Testing Library.** Vitest does not
  support it. Test the data functions it calls, and cover the rendered page with
  Playwright.
- **Running Playwright against `next dev` in CI.** Tests pass locally and then
  miss prerendering and prefetching bugs that only exist in a production build.
- **Letting Vitest pick up `e2e/*.spec.ts`.** Vitest tries to run Playwright's
  `test()` and fails with confusing errors. Exclude the directory.
- **Forgetting that caching is real end to end.** Unit tests mock `next/cache`,
  but Playwright talks to a server where `"use cache"` works. A test that passes
  once and fails on a second run against the same server is often reading data
  cached by the previous run.
- **Running CI on Node 20.** Next.js accepts it, and Vitest 5 does not.
- **Only writing end-to-end tests.** Authorization and validation branches in a
  Server Action are cheap to unit test and slow to reach through a browser.

## Related topics

- [Testing setup](../testing/setup.md) — the React testing stack this section builds on.
- [Unit testing Client Components](./unit-testing-components.md) — Vitest, jsdom and mocking `next/navigation`.
- [Testing Server Components](./testing-server-components.md) — what you can unit test and what needs a browser.
- [Testing Server Actions](./testing-server-actions.md) — actions as functions, then through the form.
- [Playwright](./playwright.md) — end-to-end tests against a production build.
- [Instant navigation tests](./instant-navigation-tests.md) — guard Instant Navigations with `instant()`.
