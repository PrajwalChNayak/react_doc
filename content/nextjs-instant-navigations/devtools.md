---
title: Instant Insights and the Navigation Inspector
description: Find navigations that would block with Instant Insights, and pause page loads and client navigations at their shell with the Navigation Inspector.
group: nextjs-instant-navigations
order: 40
status: opt-in
since: "16.3"
related: [nextjs-instant-navigations/overview, nextjs-instant-navigations/partial-prefetching, nextjs-testing/instant-navigation-tests, data-fetching/suspense]
---

## Overview

Next.js 16.3 adds two development tools for instant navigations:

- **Instant Insights** validates your routes as you use the app in `next dev`
  and reports every navigation that would not be instant. Each insight names
  the component at fault, offers fixes, and can copy a prompt for a coding
  agent.
- The **Navigation Inspector** is a panel in the Next.js DevTools that pauses a
  page load or client navigation at its shell, so you can see exactly what the
  user sees before dynamic data arrives.

> [!NOTE]
> **Opt-in (16.3).** Instant Insights and the Navigation Inspector are part of
> the Instant Navigations suite. Both are available once `cacheComponents: true`
> is set. Partial Prefetching (`partialPrefetching: true`) adds its own insights.
> These behaviors are slated to become the default in a future major version of
> Next.js.

## Why it exists

**Next.js does not prefetch in development.** Every navigation in `next dev`
waits on the server, so a route that will be instant in production feels slow
locally, and a route that will block in production feels no worse than the
rest. You cannot judge navigation speed by clicking around the dev server.

A second problem is that page loads and client navigations produce different
shells. A client navigation only re-renders below the layout the two routes
share, so a `<Suspense>` boundary in the root layout can cover a refresh and
still leave a navigation blocked. Checking every route, from every entry point,
by hand does not scale.

Instant Insights does that checking for you and reflects what `next start` will
do. The Navigation Inspector lets you look at the result.

## When to use it

- While building or refactoring a route, to confirm the shell contains the
  content you expect.
- While adopting Cache Components or Partial Prefetching. The insights are the
  to-do list.
- When deciding where to place `<Suspense>` boundaries. Validation passing only
  means the navigation is instant, not that the loading state is good.
- When handing the work to a coding agent, which can follow the insights and
  copied prompts.

## When not to use it

- **To measure real network or server timing.** The Inspector freezes the
  navigation. Use production profiling for timing.
- **As a regression guard.** Insights appear only in development, for routes
  someone actually opens. Use the `instant()` helper in CI (see
  [Instant navigation tests](../nextjs-testing/instant-navigation-tests.md)).
- **In apps without Cache Components.** Neither tool is available.

## Basic example

Enable Cache Components, and Partial Prefetching if you are adopting it:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
```

This page would block navigations, because the uncached fetch runs outside any
`<Suspense>` boundary:

```tsx file="app/feed/page.tsx"
export default async function FeedPage() {
  const response = await fetch('https://api.example.com/feed');
  const posts: { id: string; title: string }[] = await response.json();

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

Run `next dev` and open `/feed`. The dev overlay shows a **blocking-route**
insight that points at `FeedPage` and offers fixes: **cache** the data with
`"use cache"`, **stream** it by wrapping it in `<Suspense>`, or **block** by
allowing the route to wait with `export const instant = false`. The same menu
prints in the `next dev` terminal.

The fix that keeps the feed fresh is a boundary:

```tsx file="app/feed/page.tsx"
import { Suspense } from 'react';

export default function FeedPage() {
  return (
    <>
      <h1>Feed</h1>
      <Suspense fallback={<p>Loading posts…</p>}>
        <Posts />
      </Suspense>
    </>
  );
}

async function Posts() {
  const response = await fetch('https://api.example.com/feed');
  const posts: { id: string; title: string }[] = await response.json();

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

Reload, and the insight clears. Open the Navigation Inspector to check that the
heading and "Loading posts…" are what the shell shows.

## How it works

### Opening the Next.js DevTools

`next dev` renders an on-screen indicator in a corner of the page (bottom left
by default; `devIndicators.position` moves it). Open the Next.js DevTools from
that indicator. Setting `devIndicators: false` hides the indicator, but compile
and runtime errors still appear.

> Placeholder: screenshot of the Instant Insights panel in the Next.js DevTools
> — not included.

### Instant Insights

In a Cache Components app, Next.js validates every page and default segment in
development, on page loads and on HMR updates. For each route it checks the
initial page load and client navigations entering at each shared layout, because
a boundary that covers one path may not cover another. Validation uses the real
request from your browser, so dynamic params are checked against actual values.

The insights you will see include:

| Insight | Trigger | Typical fixes |
|---|---|---|
| Blocking route | Uncached data, `connection()`, or a runtime API outside `<Suspense>` | Cache with `"use cache"`, wrap in `<Suspense>`, or `instant = false` |
| URL data outside of Suspense | With Partial Prefetching, `params` or `searchParams` read outside a boundary, which ties the App Shell to one URL | Move the read into a child inside `<Suspense>`, or `instant = false` |
| Dynamic data during prefetching | A `<Link prefetch={true}>` to a route that still uses the legacy full prefetch | `export const prefetch = 'partial'` on the destination, or drop `prefetch={true}` |

The two Partial Prefetching insights are development-only and never block
`next build`. A blocking route is different when it keeps a page from producing
its static shell: the build reports the same error and the same menu of fixes,
so CI logs show it too. Each fix card links
to a detailed page, and **Copy prompt** packages the chosen fix as a prompt for a
coding agent, including how to verify the result.

### Tuning validation

`export const instant = false` on a page or layout stops validation for
navigations into that segment. To validate only segments that export `instant`
explicitly, change the global level:

> [!WARNING]
> **Experimental.** `experimental.instantInsights.validationLevel` is an
> experimental option. The framework default may change in a future version
> without being treated as a breaking change, so set it explicitly if you depend
> on one behavior.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: {
      // 'warning' (default): validate every page and default segment in dev.
      // 'manual-warning': validate only segments that export `instant`.
      validationLevel: 'manual-warning',
    },
  },
};

export default nextConfig;
```

The framework error routes `/_global-error` and `/_not-found` are excluded from
implicit validation. Export `instant` from them to validate them.

### The Navigation Inspector

1. Open the Next.js DevTools and select **Navigation Inspector**.
2. Turn on **Pause on navigations**. The panel shows "Awaiting navigation...".
3. **Refresh** the page. It freezes at the static shell, and the panel shows
   **Loading shell** labeled **Page load** with the target URL.
4. Click **Resume** to let the navigation finish.
5. **Click a link.** The page freezes at the prefetched destination, and the
   panel shows **Loading shell** labeled **Client nav** with the source and
   target URLs.
6. Turn **Pause on navigations** off when you are done. While it is on, every
   refresh and link click pauses.

Check both a refresh and a link click for each route you care about, because
the two shells can differ. For example, `useSearchParams()` suspends on a page
load but resolves synchronously on a client navigation.

The first refresh of a route may show more fallbacks than later ones, because
the cache is cold. Refresh again to see the warm-cache shell your users get.

The React DevTools Suspense panel complements the Inspector. It lists the
`<Suspense>` boundaries in the tree and lets you toggle each one between its
fallback and resolved state, so you can see which boundary covers which part of
the page.

## Server and client implications

The Inspector and the `instant()` test helper use the same mechanism: a
`next-instant-navigation-testing` cookie that holds back dynamic content. While
it is set, client navigations render only what is in the prefetch cache, and
server renders respond with only the static shell. Turning on **Pause on
navigations** is equivalent to entering an `instant()` scope, and **Resume** is
equivalent to leaving it.

> [!WARNING]
> Known issue in 16.3: cookies are scoped to the domain, not the port. If you run
> several projects on `localhost`, they share the cookie, which can cause
> unexpected behavior. Clear the cookie or close the Navigation Inspector panel when you
> switch projects. The docs say this will be fixed when the feature stabilizes.

## Common patterns

### Iterate on loading states, not only on insights

A single boundary around the whole page satisfies validation and replaces most
of the page with one fallback on every navigation. Use the Inspector to push
boundaries down until only data that is actually in flight shows a fallback.

### Lock the result in with a test

Once the Inspector shows the shell you want, write an `instant()` test that
asserts it. The testing API is on automatically in `next dev`. To run the tests
against `next start`, which is where prefetching happens, expose it in the
build you test:

> [!WARNING]
> **Experimental.** `experimental.exposeTestingApiInProductionBuild` exposes the
> testing API in production builds. Enable it only in controlled environments
> such as CI or preview deployments, never on a site real users reach.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    exposeTestingApiInProductionBuild: process.env.INSTANT_TESTING === '1',
  },
};

export default nextConfig;
```

```ts file="e2e/feed.spec.ts"
import { expect, test } from '@playwright/test';
import { instant } from '@next/playwright';

test('feed shows its heading before posts arrive', async ({ page }) => {
  await page.goto('/');

  await instant(page, async () => {
    await page.getByRole('link', { name: 'Feed' }).click();
    await page.waitForURL((url) => url.pathname === '/feed');
    await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible();
    await expect(page.getByText('Loading posts…')).toBeVisible();
  });

  await expect(page.getByText('Loading posts…')).toHaveCount(0);
});
```

The `@next/playwright` package README describes the helper's API as not yet
stable. The full workflow, including page-load tests and `baseURL`, is in
[Instant navigation tests](../nextjs-testing/instant-navigation-tests.md). A
complete app with a production Playwright setup is in
[the instant-navigations example](../../examples/nextjs/instant-navigations/README.md).

### Let an agent run the loop

An agent can observe the insights, write an `instant()` test that fails, apply
the suggested fix, and keep the passing test. Tell it what must appear
immediately, what may stream in, and what must stay fresh. When a caching
decision is unclear, keeping the data fresh behind `<Suspense>` is safer than
guessing a cache lifetime. See [AI agents](../nextjs-getting-started/ai-agents.md).

## Common mistakes

**Judging instant behavior by clicking around `next dev`.** Prefetching is off
in development. Use the Inspector or a production test.

**Treating a cleared insight as done.** Validation proves the navigation does
not block. It says nothing about whether the shell is useful.

**Checking only refreshes.** A client navigation can block where a page load
does not. Pause on a link click too.

**Leaving Pause on navigations turned on.** Every navigation keeps freezing,
and the shared cookie can affect other `localhost` projects.

**Silencing insights with `instant = false` on the root layout.** That also
disables static shell validation for the whole app. Place it as low as possible.

**Shipping `exposeTestingApiInProductionBuild` to production.** Gate it behind an
environment variable that only your test environment sets.

## Related topics

- [Instant Navigations](./overview.md) — the suite and how to enable it.
- [Partial Prefetching](./partial-prefetching.md) — what goes into the shell the
  Inspector shows, and the `instant` export.
- [Instant navigation tests](../nextjs-testing/instant-navigation-tests.md) —
  turn what you see in the Inspector into CI assertions with `instant()`.
- [Link prefetching](./link-prefetching.md) — why the client-navigation shell
  depends on how the link prefetches.
- [Suspense](../data-fetching/suspense.md) — the boundaries the Inspector
  reveals.
- [Profiling](../performance/profiling.md) — React-side tools for measuring
  render timing, which the Inspector does not do.
