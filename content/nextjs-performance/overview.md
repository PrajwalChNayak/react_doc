---
title: Performance in Next.js
description: Where Next.js apps are actually slow, how to measure before you change anything, and which page covers each fix.
group: nextjs-performance
order: 10
status: current
related: [nextjs-performance/bundle-analysis, nextjs-performance/core-web-vitals, performance/overview, performance/profiling]
---

## Overview

Most slow Next.js apps are not slow because React renders too often. They are
slow because the server waits on data one request at a time, because routes that
could be prerendered run on every request, because too much code ships to the
browser, or because images and fonts arrive late and move the layout.

This group covers the framework side of those problems for **Next.js 16.3**. The
React side (render cost, memoization, virtualization, the Profiler) is in the
[React performance overview](../performance/overview.md), and this group links
to it instead of repeating it.

| Where the time goes | What the user feels | Next.js lever | Page |
|---|---|---|---|
| Sequential `await`s in Server Components | Slow first byte, late streaming | Parallel fetches, Suspense boundaries, caching | [Fetching data](../nextjs-data-caching/fetching-data.md) |
| Routes rendered at request time that could be prerendered | Slow TTFB on pages that rarely change | Cache Components and `"use cache"` | [Static and dynamic rendering](../nextjs-rendering/static-and-dynamic-rendering.md) |
| Large client bundles | Slow load, poor INP on mid-range phones | `"use client"` placement, `next/dynamic`, dependency diet | [Bundle analysis](./bundle-analysis.md) |
| Unneeded prefetches | Server load and data transfer nobody clicks on | Prefetch defaults, `prefetch={false}`, Partial Prefetching | [The cost of prefetching](./prefetching-cost.md) |
| Unsized or late images and fonts | Poor LCP, layout shift | `next/image` `sizes` and `preload`, `next/font` | [Images and fonts](./images-and-fonts.md) |
| Re-render cost in Client Components | Sticky typing, slow interactions | React Compiler | [React Compiler in Next.js](./react-compiler.md) |
| Slow or memory-hungry dev server and builds | Slow feedback loop, slow CI | Turbopack, filesystem cache, memory eviction | [Turbopack](./turbopack.md), [Dev memory and caching](./dev-memory-and-caching.md) |
| Unknown | Users complain, nothing obvious | Field data first | [Core Web Vitals](./core-web-vitals.md) |

## Why it exists

A Next.js app splits its work across the server, the network and the browser.
A React profile only sees the browser part. A four-second database query, a
route that opted out of prerendering because of one `cookies()` call, or a
charting library imported into a layout never shows up as a wide bar in the
React DevTools flamegraph.

The framework also makes several performance decisions for you by default:
what is prerendered, what `<Link>` prefetches, which bundler runs and what it
caches. Knowing those defaults tells you which problems you have to solve and
which ones Next.js already solved.

## When to use it

Read this group when you have a symptom and a number: an LCP regression in field
data, a route that `next build` marks as dynamic when you expected static, a
client bundle that grew after a dependency upgrade, or a dev server that runs
out of memory.

## When not to use it

Do not optimize a Next.js app that no metric flags. Every `next/dynamic` call,
cache directive and `prefetch` override is code someone has to maintain, and
several of them trade one cost for another (server invocations for faster
navigations, for example).

Do not start with render-level tuning. In a Server Components app the browser
renders far less than in a single-page app, so memoization is rarely where the
time goes.

## Basic example

The most common server-side problem is a waterfall: two independent requests
awaited one after the other, so the page waits for the sum of both.

```tsx file="app/store/[slug]/page.tsx"
import { getProduct, getReviews } from '@/lib/catalog';

export default async function ProductPage({ params }: PageProps<'/store/[slug]'>) {
  const { slug } = await params;

  // Both requests start before either is awaited, so the page waits for the
  // slower of the two instead of their sum.
  const [product, reviews] = await Promise.all([getProduct(slug), getReviews(slug)]);

  return (
    <main>
      <h1>{product.name}</h1>
      <p>{reviews.length} reviews</p>
    </main>
  );
}
```

Parallel fetching is the first fix, not the last. If the reviews are slow and not
essential to the first paint, move them into their own component behind a
`<Suspense>` boundary so the product streams first. See
[Streaming](../nextjs-rendering/streaming.md) for the Next.js side and
[Suspense](../data-fetching/suspense.md) for the React model.

## How it works

Measure in this order. Each step narrows where the time goes before you touch
code.

1. **Field data.** Collect LCP, INP and CLS from real users with
   `useReportWebVitals`. Lab numbers on a fast laptop hide the problems your users
   have. See [Core Web Vitals](./core-web-vitals.md).
2. **The build output.** `next build` prints every route with a symbol: `○` for
   prerendered static content and `ƒ` for routes rendered on demand. A route you
   expected to be static that shows `ƒ` is an over-dynamic route. See
   [Static and dynamic rendering](../nextjs-rendering/static-and-dynamic-rendering.md).
3. **The server.** In development, the React Performance Tracks include a Server
   track that shows every awaited Promise in your Server Components. A staircase
   of sequential requests is a waterfall. See
   [Profiling](../performance/profiling.md).
4. **The client bundle.** `next experimental-analyze` shows which modules each
   route ships to the browser and why. Next.js 16.0 removed the JS bundle-size
   columns from the `next build` output, so the analyzer is where you look now.
   See [Bundle analysis](./bundle-analysis.md).
5. **Navigations.** If first loads are fine but clicks feel slow, look at what is
   prefetched and whether the destination has a loading shell. See
   [The cost of prefetching](./prefetching-cost.md) and
   [Instant Navigations](../nextjs-instant-navigations/overview.md).

Fix the largest number first and measure again. Performance problems mask each
other: removing a waterfall often reveals that the real LCP element is an
unsized image.

## Common patterns

- **Keep interactivity at the leaves.** Mark the smallest component that needs
  state or event handlers with `"use client"`, so its parents stay on the server
  and out of the bundle. See [Client Components](../nextjs-rendering/client-components.md).
- **Cache deliberately.** With Cache Components, caching is opt-in. Mark data
  that can be shared across requests with `"use cache"` and a `cacheLife`
  profile. See [use cache](../nextjs-data-caching/use-cache.md).
- **Give every slow region a boundary.** A `<Suspense>` fallback lets the rest of
  the page stream instead of waiting for the slowest query.
- **Upgrade before tuning.** Next.js 16.3 added native Node.js streams to App
  Router server rendering. The Next.js team reported up to 22% more requests
  handled under load in Vercel's benchmark, with no application changes. It also
  enabled the build cache and dev memory eviction by default.

## Common mistakes

- **Profiling the development server.** `next dev` compiles routes on demand,
  skips prefetching and runs React's development build. Measure `next build`
  followed by `next start`, or production field data.
- **Treating every slow page as a React render problem.** Check the Server track
  and the network waterfall before adding memoization.
- **Reading one `cookies()` call as harmless.** A request-time API in a shared
  layout makes every route under it render on demand unless the access sits
  behind a `<Suspense>` boundary.
- **Adding `prefetch={true}` everywhere to make navigations feel faster.** Each
  visible link can then cost a server render. See
  [The cost of prefetching](./prefetching-cost.md).
- **Optimizing without a baseline.** Record the metric before the change, or
  you cannot tell whether the change helped.

## Related topics

- [React performance overview](../performance/overview.md) — the render-side
  problems and levers this group does not repeat.
- [Profiling](../performance/profiling.md) — Performance Tracks, including the
  Server track for finding waterfalls.
- [Bundle analysis](./bundle-analysis.md) — find what ships to the browser and
  why.
- [Core Web Vitals](./core-web-vitals.md) — collect field data before you change
  anything.
- [Dev memory and caching](./dev-memory-and-caching.md) — when the slow part is
  your own feedback loop.
- [Turbopack](./turbopack.md) — the default bundler behind `next dev` and
  `next build`.
