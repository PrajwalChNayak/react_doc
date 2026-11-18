---
title: Instant navigation tests
description: Use instant() from @next/playwright to assert what a route shows before dynamic data arrives, so refactors cannot make navigations slow again.
group: nextjs-testing
order: 60
status: opt-in
since: "16.3"
related: [nextjs-instant-navigations/overview, nextjs-testing/playwright, nextjs-instant-navigations/link-prefetching, data-fetching/suspense]
---

## Overview

`instant()` is a Playwright helper from `@next/playwright`. It runs a callback in
which Next.js renders **only** what is available without waiting on the network:
the static shell on a page load, the prefetched UI on a client navigation, and
`<Suspense>` fallbacks for everything else. Dynamic content is held back until the
callback returns.

Inside that window, your assertions describe the instant UI. After it, they
describe the finished page. A test that says "the product name is visible, the
inventory is still loading" becomes deterministic instead of a race.

> [!NOTE]
> **Opt-in (16.3).** `instant()` is part of Instant Navigations, which apply only
> when you set `cacheComponents: true` and `partialPrefetching: true`. These
> behaviors are slated to become the default in a future major version of Next.js.
> The `@next/playwright` README still labels `instant()` "Experimental. This API is
> not yet stable", so expect its details to change.

This page assumes you have Playwright set up as described in
[Playwright](./playwright.md), and that you know what Instant Navigations are from
[the Instant Navigations overview](../nextjs-instant-navigations/overview.md).

## Why it exists

Development-time validation (Instant Insights) tells you whether a route *has* a
shell. It cannot tell you whether the *right content* is in it, and it does not run
in CI. A route that is instant today can become slow tomorrow without any error:

- A component that reads `cookies()` is added to a shared header. The part of the
  page it sits in now depends on the request and can no longer be prerendered, so
  UI that used to appear immediately waits for the server.
- A `<Suspense>` boundary moves up during a refactor. The page still loads, and
  still passes validation, but the product name is now hidden behind a
  full-page fallback on every navigation.
- A `"use cache"` directive is removed from a data function. The content it
  produced drops out of the shell.

In each case, the finished page looks identical, so an ordinary end-to-end test
keeps passing. An `instant()` test fails, because the content it expects in the
instant window is no longer there.

## When to use it

- Routes where perceived speed matters and you have already made navigation
  instant: product pages, dashboards, search results, documentation.
- As a regression guard after following Instant Insights to a passing route.
- For both ways a user reaches a route. A `<Suspense>` boundary can cover a page
  load without covering a client navigation, so test the one users take, or both.

## When not to use it

- Apps without Cache Components. The helper relies on the Instant Navigations
  testing API.
- Every route. Focus on the flows that matter most, as the Next.js guide
  recommends. Each test is a full browser test.
- To test that data is correct. Assert correctness after `instant()` returns, or
  in an ordinary Playwright test.
- Routes you opted out with `export const instant = false`. They block on the
  server by design.

## Basic example

Install the helper next to Playwright:

```bash
npm install -D @next/playwright@16.3.5 @playwright/test@1.63.0
```

A course page. Course details come from a cached function, and the enrollment
status reads the session cookie behind its own `<Suspense>` boundary:

```tsx file="app/courses/[courseSlug]/page.tsx"
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

type Params = PageProps<'/courses/[courseSlug]'>['params'];

export async function generateStaticParams() {
  return [{ courseSlug: 'testing-nextjs' }];
}

export default function CoursePage(props: PageProps<'/courses/[courseSlug]'>) {
  return (
    <main>
      <Suspense fallback={<p>Loading course…</p>}>
        <CourseDetails params={props.params} />
      </Suspense>
      <Suspense fallback={<p>Checking your enrollment…</p>}>
        <Enrollment params={props.params} />
      </Suspense>
    </main>
  );
}

async function CourseDetails({ params }: { params: Params }) {
  const { courseSlug } = await params;
  const course = await getCourse(courseSlug);
  return (
    <article>
      <h1>{course.title}</h1>
      <p>{course.summary}</p>
    </article>
  );
}

async function getCourse(slug: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(`course-${slug}`);
  return db.course.findBySlug(slug);
}

async function Enrollment({ params }: { params: Params }) {
  const { courseSlug } = await params;
  const cookieStore = await cookies();
  const enrolled = await db.enrollment.exists(courseSlug, cookieStore.get('session')?.value);
  return <p>{enrolled ? 'You are enrolled.' : 'Not enrolled yet.'}</p>;
}
```

The course list links to each course with `<Link prefetch={true}>`, so per-link
prefetching resolves the `courseSlug` param before the click
([Link prefetching](../nextjs-instant-navigations/link-prefetching.md) explains
why a param-dependent route needs it).

The test covers both entry points:

```ts file="e2e/course-navigation.spec.ts"
import { expect, test } from '@playwright/test';
import { instant } from '@next/playwright';

test.describe('Course page (/courses/[courseSlug])', () => {
  test('a client navigation shows course details before enrollment', async ({ page }) => {
    await page.goto('/courses');
    await expect(page.getByRole('heading', { level: 1, name: 'Courses' })).toBeVisible();
    // Let viewport prefetches finish, so the test checks structure, not timing.
    await page.waitForLoadState('networkidle');

    await instant(page, async () => {
      await page.getByRole('link', { name: 'Testing Next.js apps' }).click();
      await page.waitForURL((url) => url.pathname === '/courses/testing-nextjs');

      // Instantly visible: cached content and the enrollment fallback.
      await expect(page.getByRole('heading', { level: 1, name: 'Testing Next.js apps' })).toBeVisible();
      await expect(page.getByText('Checking your enrollment…')).toBeVisible();

      // Held back until the instant() scope ends.
      await expect(page.getByText('Not enrolled yet.')).toHaveCount(0);
    });

    await expect(page.getByText('Not enrolled yet.')).toBeVisible();
  });

  test('a page load serves the static shell first', async ({ page, baseURL }) => {
    await instant(
      page,
      async () => {
        await page.goto('/courses/testing-nextjs');

        await expect(page.getByRole('heading', { level: 1, name: 'Testing Next.js apps' })).toBeVisible();
        await expect(page.getByText('Checking your enrollment…')).toBeVisible();
        await expect(page.getByText('Not enrolled yet.')).toHaveCount(0);
      },
      { baseURL },
    );

    await expect(page.getByText('Not enrolled yet.')).toBeVisible();
  });
});
```

A complete, runnable version of this pattern (a store with cached product details
and streamed inventory, tested with both entry points against `next start`) is in
[the Instant Navigations example](../../examples/nextjs/instant-navigations/README.md).

## How it works

### The signature

From `@next/playwright@16.3.5`'s type declarations:

```text
export declare function instant<T>(
  page: PlaywrightPage,
  fn: () => Promise<T>,
  options?: { baseURL?: string },
): Promise<T>;
```

- **`page`** is structurally typed (anything with `url()` and `context()`), so it
  accepts a `Page` from `@playwright/test`, `playwright` or `playwright-core`.
- **`fn`** is where navigation and instant-UI assertions go. `instant()` returns
  whatever `fn` returns.
- **`options.baseURL`** is needed when the page has not navigated yet, because
  the helper must know the origin before the first request. Pass Playwright's
  `baseURL` fixture. Without it, a fresh page throws `Could not infer the base URL
  of the application`.

### The mechanism

`instant()` adds a `next-instant-navigation-testing` cookie to the browser
context, runs `fn`, then deletes the cookie, even if `fn` throws. While the cookie
is set:

- **Client navigations** render only what is in the prefetch cache. Dynamic data
  waits until the cookie is cleared.
- **Server renders** (the initial load, a reload, a full-page navigation) respond
  with the static shell only, without per-request dynamic data.

When `@playwright/test` is installed, acquiring and releasing the lock show up as
steps named "Acquire Instant Lock" and "Release Instant Lock" in Playwright's
report and trace viewer. The Next.js guide describes the scope as the test
equivalent of the Navigation Inspector's **Pause on navigations** toggle.

The helper assumes a warm cache: prefetches have completed and cacheable data is
available. If content you expected to be cached is missing inside the callback,
the cause is structural: a missing `"use cache"`, a misplaced `<Suspense>`
boundary, or a missing per-link prefetch.

### Development server or production build

The testing API that `instant()` uses is on automatically in `next dev`. Under
`next start` it is **off** unless you enable it in `next.config.ts`:

> [!WARNING]
> **Experimental.** `experimental.exposeTestingApiInProductionBuild` makes
> `next start` honor the `instant()` cookie. Next.js marks it for profiling and
> testing only. Never enable it on a deployment that real users can reach.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Only the Playwright webServer sets INSTANT_TESTING=1.
    exposeTestingApiInProductionBuild: process.env.INSTANT_TESTING === '1',
  },
};

export default nextConfig;
```

```ts file="playwright.config.ts"
import { defineConfig, devices } from '@playwright/test';

const PORT = 3130;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `${baseURL}/courses`,
    env: { INSTANT_TESTING: '1' },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
```

Run instant tests in CI against the production build. Prefetching is disabled in
development, and the shells your users receive come from `next build`. Gating the
flag on an environment variable that only the test server sets keeps a regular
`next build` for deployment free of it. `reuseExistingServer: false` guarantees
the server Playwright talks to was started with that variable.

## Caching implications

`instant()` tests the shape of your caching, not its freshness. A passing test
means the content is cacheable and placed where Next.js can put it in a shell. It
does not mean the cached value is current. Test freshness after mutations with an
ordinary [Playwright](./playwright.md) test that runs outside `instant()`.

## Common patterns

### Failure modes it catches

**A `cookies()` read moves into a shared header.** Someone adds a greeting to the
course layout and reads the session there, outside any `<Suspense>` boundary:

```diff
 // app/courses/layout.tsx
+import { cookies } from 'next/headers';
+
-export default function CoursesLayout({ children }: LayoutProps<'/courses'>) {
+export default async function CoursesLayout({ children }: LayoutProps<'/courses'>) {
+  const session = (await cookies()).get('session');
   return (
     <>
-      <SiteHeader />
+      <SiteHeader signedIn={Boolean(session)} />
       {children}
     </>
   );
 }
```

The finished page is unchanged. Inside `instant()`, the course heading no longer
appears, because everything below the layout now waits for the request. The
heading assertions fail, and on a client navigation the `waitForURL` call can time
out first, because the destination cannot commit. The fix is to move the session read into a small
component behind its own `<Suspense>` boundary.

**A `<Suspense>` boundary moves up.** A refactor wraps the whole page in one
boundary:

```diff
 export default function CoursePage(props: PageProps<'/courses/[courseSlug]'>) {
   return (
-    <main>
-      <Suspense fallback={<p>Loading course…</p>}>
-        <CourseDetails params={props.params} />
-      </Suspense>
-      <Suspense fallback={<p>Checking your enrollment…</p>}>
-        <Enrollment params={props.params} />
-      </Suspense>
-    </main>
+    <Suspense fallback={<CourseSkeleton />}>
+      <main>
+        <CourseDetails params={props.params} />
+        <Enrollment params={props.params} />
+      </main>
+    </Suspense>
   );
 }
```

Validation still passes, because a fallback exists. Inside `instant()`, only the
skeleton renders, so the heading assertion fails. The test encodes the product
decision that the course title must never wait for enrollment.

### Write the test before the fix

When you make a slow route instant, write the `instant()` test first and confirm it
fails. The Next.js guide recommends the same loop. A test that passes before the
fix is not checking the content that was missing.

### Assert absence as well as presence

`toHaveCount(0)` for dynamic content inside the scope proves the test is really
looking at the instant UI. Without it, a test can pass on a slow machine where the
helper is misconfigured and the whole page rendered.

## Common mistakes

- **Running against `next start` without `exposeTestingApiInProductionBuild`.** The
  cookie is ignored, dynamic content renders normally, and absence assertions
  fail for reasons that look unrelated.
- **Enabling `exposeTestingApiInProductionBuild` unconditionally.** It then ships
  in the build you deploy. Gate it on a variable only the test server sets.
- **No `baseURL` when `page.goto()` is the first navigation.** The helper throws,
  because it cannot scope the cookie.
- **Asserting before `waitForURL` on a client navigation.** A shared selector can
  match the source page before the destination commits.
- **CSS locators that match the previous page.** Cache Components keeps recent
  routes in the DOM, hidden with `<Activity>`. Use role-based locators, which ignore
  hidden elements.
- **Nesting `instant()` calls, or not awaiting one.** Nesting on the same browser
  context throws `An instant() scope is already active`.
- **Clicking before prefetches finish.** The helper assumes a warm cache. Wait for
  the source page to settle first.
- **Mixing up projects on `localhost`.** The Next.js docs list a known issue: the
  testing cookie is scoped to the domain, not the port, so it can leak between
  projects running on `localhost`. Clear it, or close the Navigation Inspector, when
  switching projects.

## Related topics

- [Instant Navigations](../nextjs-instant-navigations/overview.md) — the opt-in suite this helper tests.
- [Link prefetching](../nextjs-instant-navigations/link-prefetching.md) — why a param-dependent route needs `prefetch={true}` to be instant.
- [DevTools](../nextjs-instant-navigations/devtools.md) — Instant Insights and the Navigation Inspector, the development-time half of the loop.
- [Playwright](./playwright.md) — the base setup, signed-in state and CI.
- [Suspense](../data-fetching/suspense.md) — how boundaries decide what shows while content loads.
