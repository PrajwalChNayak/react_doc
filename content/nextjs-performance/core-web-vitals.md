---
title: Core Web Vitals
description: Collect LCP, INP and CLS from real users with useReportWebVitals, send them to your own endpoint, and pick the Next.js lever for each metric.
group: nextjs-performance
order: 80
status: current
related: [performance/profiling, performance/overview, nextjs-performance/images-and-fonts, nextjs-instant-navigations/devtools]
---

## Overview

Next.js reports Web Vitals from real users through one hook:

```tsx file="app/_components/web-vitals.tsx"
'use client';

import { useReportWebVitals } from 'next/web-vitals';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

const logWebVitals: ReportWebVitalsCallback = (metric) => {
  console.log(metric.name, metric.value, metric.rating);
};

export function WebVitals() {
  useReportWebVitals(logWebVitals);
  return null;
}
```

The hook reports TTFB, FCP, LCP, CLS and INP (and FID, which is no longer a Core
Web Vital). It is imported from `next/web-vitals` and needs `"use client"`, so it
lives in its own small component that the root layout renders.

For what LCP, INP and CLS measure and their thresholds, see the
[React performance overview](../performance/overview.md). This page covers
collecting them in Next.js and the framework levers that move each one.

## Why it exists

Lab measurements on a developer laptop over a fast connection miss what users
actually experience: slow phones, slow networks, cold caches and real
interaction patterns. Field data is the only honest measure of those.

The hook wraps the `web-vitals` library, which handles the parts that are hard to
get right by hand: buffered entries, CLS session windows, INP across the page's
lifetime and page lifecycle events. It also reports the navigation type, so you
can separate back-forward cache restores from real loads.

## When to use it

- Before any performance work, to get a baseline.
- After a deploy that touches rendering, images, fonts or dependencies, to catch
  regressions a lab test would miss.
- When you do not use a managed analytics product that already collects vitals.

## When not to use it

- **You already run a real-user monitoring product** that collects Web Vitals.
  Two collectors double the beacons and rarely agree to the decimal.
- **To debug one slow interaction.** Field data tells you *that* INP is poor on a
  route. A profile tells you *why*. See [Profiling](../performance/profiling.md).

## Basic example

Render the component once, in the root layout. Because it is its own Client
Component, the client boundary stays confined to it and the layout remains a
Server Component:

```tsx file="app/layout.tsx"
import type { ReactNode } from 'react';
import { WebVitals } from './_components/web-vitals';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
```

Define the callback at module scope, as above, not inline. The docs note that a
new function passed to `useReportWebVitals` is called with all metrics reported
so far, so a callback that changes identity on every render reports duplicates.

Each `metric` has `id` (unique per page load), `name`, `value`, `delta` (change
since the last report), `rating` (`"good"`, `"needs-improvement"` or `"poor"`),
`navigationType` and `entries`.

## How it works

### Sending metrics to your own endpoint

Use `navigator.sendBeacon` so reports survive the page being closed, and fall
back to `fetch` with `keepalive`:

```tsx file="app/_components/web-vitals.tsx"
'use client';

import { useReportWebVitals } from 'next/web-vitals';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

const sendToAnalytics: ReportWebVitalsCallback = (metric) => {
  const body = JSON.stringify({
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
    path: window.location.pathname,
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/vitals', body);
  } else {
    fetch('/api/vitals', { body, method: 'POST', keepalive: true });
  }
};

export function WebVitals() {
  useReportWebVitals(sendToAnalytics);
  return null;
}
```

A Route Handler receives the beacon. Validate it, because the endpoint is public
and anyone can post to it:

```ts file="app/api/vitals/route.ts"
import * as z from 'zod';
import { recordWebVital } from '@/lib/metrics';

const WebVital = z.object({
  id: z.string().max(100),
  name: z.enum(['TTFB', 'FCP', 'LCP', 'FID', 'CLS', 'INP']),
  value: z.number().nonnegative(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  navigationType: z.string().max(40),
  path: z.string().max(2048),
});

export async function POST(request: Request) {
  const parsed = WebVital.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  await recordWebVital(parsed.data);
  return new Response(null, { status: 204 });
}
```

Store the raw values and compute percentiles when you report. Core Web Vitals are
judged at the 75th percentile, so an average hides the users who are having a bad
time.

### Finding the element behind a poor score

> [!WARNING]
> **Experimental.** `experimental.webVitalsAttribution` adds attribution data
> (for example, the LCP element or the element that shifted) for the metrics you
> list. It is disabled by default.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    webVitalsAttribution: ['CLS', 'LCP'],
  },
};

export default nextConfig;
```

Attribution makes each report larger. Enable it for the metrics you are
investigating, then turn it off.

## Server and client implications

`useReportWebVitals` runs only in the browser. TTFB still reflects the server:
slow data fetching, a route rendered on demand instead of prerendered, or a
missing Suspense boundary that holds back the first streamed bytes all show up as
TTFB, and then as LCP.

If you need analytics initialized before any app code runs (error tracking, a
third-party SDK), put that setup in `instrumentation-client.ts` at the project
root rather than in a component.

## Common patterns

### LCP: get the main content painted sooner

- **Prerender the shell.** A route with a static shell sends HTML immediately.
  Keep request-time reads (`cookies()`, uncached data) behind `<Suspense>` so they
  do not block the rest. See
  [Static and dynamic rendering](../nextjs-rendering/static-and-dynamic-rendering.md).
- **Remove server waterfalls.** Start independent requests together, and cache
  shared data with `"use cache"`.
- **Prioritize the LCP image.** Give it `fetchPriority="high"` or
  `loading="eager"`, and a correct `sizes`. See
  [Images and fonts](./images-and-fonts.md).
- **Self-host fonts with `next/font`** so text does not wait on a third-party
  connection.

### INP: keep the main thread free to respond

- **Ship less client JavaScript.** Push `"use client"` to the leaves and lazy
  load heavy widgets. See [Bundle analysis](./bundle-analysis.md).
- **Defer third-party scripts.** Load non-critical scripts with
  `next/script` and `strategy="lazyOnload"` so they run during idle time instead
  of competing with hydration.
- **Reduce re-render work** in interactive Client Components with the
  [React Compiler](./react-compiler.md) or transitions.

### CLS: reserve space for everything

- **Size every image.** Static imports or `width` and `height`, or `fill` inside a
  positioned parent with dimensions.
- **Use `next/font`.** Its size-adjusted fallback keeps text metrics stable when
  the web font swaps in.
- **Match fallbacks to content.** A `loading.tsx` skeleton or `<Suspense>`
  fallback with a different height than the streamed content shifts everything
  below it.

### Profile the slow cases

Field data narrows the problem to a route and a metric. To see why, record the
interaction in Chrome DevTools, where React's Performance Tracks show
Scheduler, Components and (in development) Server work in context. See
[Profiling](../performance/profiling.md).

### Find slow navigations during development

> [!NOTE]
> **Opt-in (16.3).** Instant Insights, part of Instant Navigations, surfaces
> client navigations that would not be instant in the Next.js DevTools while you
> develop. It requires `cacheComponents: true` and the top-level
> `partialPrefetching: true`. These behaviors are slated to become the default in
> a future major version; they are not the default in 16.3.

Web Vitals focus on the first page load. Soft navigations inside the app are
where Instant Insights and the Navigation Inspector help. See
[Instant Navigations DevTools](../nextjs-instant-navigations/devtools.md).

## Common mistakes

- **Passing an inline callback to `useReportWebVitals`.** A new function
  identity makes the hook re-report metrics it already sent.
- **Calling the hook in the root layout directly.** It needs `"use client"`,
  which would make the whole layout a Client Component. Use a separate
  component.
- **Optimizing for FID.** INP replaced FID as a Core Web Vital in March 2024.
  Watch INP.
- **Averaging metric values.** Report the 75th percentile, split by route and
  device type.
- **Leaving the collection endpoint unvalidated.** It is public. Validate shape
  and size, and rate limit if it writes to a paid store.
- **Judging performance from `next dev`.** Development builds are slower and do
  not prefetch. Collect field data from production.

## Related topics

- [Profiling](../performance/profiling.md) — Performance Tracks and the Profiler
  for finding why a metric is poor.
- [React performance overview](../performance/overview.md) — what LCP, INP and
  CLS measure and their thresholds.
- [Images and fonts](./images-and-fonts.md) — the most common LCP and CLS fixes
  in Next.js.
- [Instant Navigations DevTools](../nextjs-instant-navigations/devtools.md) —
  Instant Insights for slow client navigations (opt-in).
- [Bundle analysis](./bundle-analysis.md) — reduce the JavaScript that hurts
  INP.
