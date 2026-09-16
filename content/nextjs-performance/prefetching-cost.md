---
title: The cost of prefetching
description: What Link prefetches by default, what prefetch={true} costs in server work, and how 16.x reduces prefetch requests and bytes.
group: nextjs-performance
order: 60
status: current
since: "16.3"
related: [nextjs-instant-navigations/partial-prefetching, nextjs-instant-navigations/link-prefetching, nextjs-routing/linking-and-navigation, performance/code-splitting]
---

## Overview

Prefetching makes navigations fast by downloading a route's JavaScript, CSS and
RSC payload before the click. It is not free. Every prefetch is a request, and a
prefetch that renders dynamic content is server work for a page the user may
never open.

In production, `<Link>` prefetches when it enters the viewport. How much it
fetches depends on the route and on the `prefetch` prop:

| `prefetch` value | Static route | Dynamic route |
|---|---|---|
| `"auto"` or `null` (default) | The full route, including its data | The route down to the nearest `loading.js` boundary |
| `true` | The full route | The full route, rendered for this link |
| `false` | Nothing, on viewport entry or hover | Nothing |

Prefetching is **disabled in development**, so `next dev` never shows you its
cost.

## Why it exists

Server Components move rendering to the server, so a click on an un-prefetched
link waits on a network round trip before anything changes. Prefetching pays that
cost ahead of time. The trade-off is that you pay it for every *visible* link, not
for every *clicked* link. A page with 200 product cards pays for 200 prefetches.

Next.js 16.0 and 16.3 shipped changes that make the default cheaper, so the
question for most apps is no longer whether to prefetch but where to stop the
defaults from over-fetching.

## When to use it

Read this page when:

- Server logs or bills show far more RSC requests than page views.
- A page with long lists of links (feeds, tables, search results) generates a
  burst of requests on scroll.
- You are about to add `prefetch={true}` to make a navigation feel instant.
- Layouts or pages run side effects, such as analytics, that should only run on
  a real visit.

## When not to use it

Do not turn prefetching off globally to save requests. The default is tuned to
prefetch cheap, cacheable work, and disabling it makes static routes wait for the
click and dynamic routes wait for a full server render.

If the goal is instant navigations on a dynamic app, the lever is structure
(Suspense boundaries, cached content, Partial Prefetching), not more prefetching.
See [Instant Navigations](../nextjs-instant-navigations/overview.md).

## Basic example

For a long list whose links are rarely all clicked, prefetch on intent instead of
on viewport entry:

```tsx file="app/ui/hover-prefetch-link.tsx"
'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

export function HoverPrefetchLink({ href, children }: { href: string; children: ReactNode }) {
  const [active, setActive] = useState(false);

  return (
    <Link href={href} prefetch={active ? null : false} onMouseEnter={() => setActive(true)}>
      {children}
    </Link>
  );
}
```

The link starts with `prefetch={false}`. On hover it switches to `null`, which
restores the default prefetch, so only links the user points at are fetched.
Test the pattern on touch devices, where hover events behave differently.

## How it works

### The prefetch queue

Next.js keeps a small task queue so a page full of links does not flood the
network. It prioritizes links in the viewport, then links showing intent (hover
or touch), lets newer links replace older ones, and discards links scrolled off
screen. Prefetched RSC payloads are kept in memory, keyed by route segment.

### Layout deduplication and incremental prefetching (16.0)

Next.js 16.0 changed what a prefetch downloads:

- **Layout deduplication.** When several prefetched URLs share a layout, the
  layout is downloaded once.
- **Incremental prefetching.** Only segments not already in the client cache are
  prefetched, rather than the entire page.

The upgrade guide notes the side effect: you may see **more individual prefetch
requests with much lower total transfer size**. A higher request count after
upgrading to 16 is expected, not a regression.

### Bundling small prefetch responses (16.3)

16.3 addresses that request count. Prefetch responses below a size threshold are
now inlined into one bundled response instead of one request per segment. Larger
shared segments stay separate so they can still be reused across routes.

The defaults, measured in bytes of the gzip-compressed segment response, are a
2048-byte maximum per inlined segment and a 10240-byte maximum for one bundled
response along a path. Most apps should leave these alone.

> [!WARNING]
> **Experimental.** The inlining behavior is a permanent part of the App Router,
> but the `experimental.prefetchInlining` config key that controls it is
> experimental. Use it to disable inlining (`false`) while debugging navigation
> issues or measuring request volume.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Debugging only: one request per segment again.
    prefetchInlining: false,
  },
};

export default nextConfig;
```

Lower thresholds keep more per-segment deduplication. Higher thresholds cut the
request count further but duplicate shared data across routes.

## Server and client implications

A prefetch renders Server Components on the server. Anything a layout or page
does during render also happens during prefetch, for a user who has not visited
the route:

```tsx file="app/ui/page-view-tracker.tsx"
'use client';

import { useEffect } from 'react';
import { trackPageView } from '@/lib/analytics';

export function PageViewTracker() {
  useEffect(() => {
    // Runs only when the route actually renders in the browser.
    trackPageView();
  }, []);

  return null;
}
```

Render `<PageViewTracker />` from the layout instead of calling `trackPageView()`
in the layout body. Otherwise every prefetch counts as a page view.

## Caching implications

The cost of `prefetch={true}` depends on what the destination can serve from a
cache:

- **Static destination.** The prefetch is served from prerendered output. It is
  cheap.
- **Dynamic destination without Partial Prefetching.** The whole route is
  rendered for each visible link, including uncached, request-time data. On a
  grid of cards that is one server render per card as it scrolls into view.
- **With Partial Prefetching.** A default `<Link>` fetches one reusable App Shell
  per route, shared by every link to that route. `prefetch={true}` adds a per-link
  prefetch that resolves cached content depending on that link's `params` or
  `searchParams`, which costs **a server invocation per prefetchable link**.
  Pages whose content is fully static are served from the static cache instead.

> [!NOTE]
> **Opt-in (16.3).** Partial Prefetching requires `cacheComponents: true` and the
> top-level `partialPrefetching: true`. It is slated to become the default in a
> future major version, but it is not the default in 16.3. See
> [Partial Prefetching](../nextjs-instant-navigations/partial-prefetching.md).

## Common patterns

- **Disable prefetch for long, rarely clicked lists.** Footer links, infinite
  tables, and "related" lists at the bottom of a page are good candidates for
  `prefetch={false}` or the hover pattern.
- **Keep the default for primary navigation.** A handful of nav links to static
  routes costs little and makes the most common clicks instant.
- **Prefetch programmatically on strong intent.** `useRouter().prefetch('/checkout')`
  in a handler warms one route you are confident the user will open next.
- **Reserve `prefetch={true}` for high-traffic links** whose destination has
  cached, URL-dependent content. See
  [Link prefetching](../nextjs-instant-navigations/link-prefetching.md).
- **Add `loading.tsx` or Suspense boundaries to dynamic routes.** The default
  prefetch stops at the nearest loading boundary, so the shell is prefetched and
  the navigation shows something immediately.

## Common mistakes

- **Adding `prefetch={true}` to every link.** On dynamic routes it multiplies
  server renders by the number of visible links.
- **Measuring prefetch behavior in `next dev`.** Prefetching only runs in
  production builds.
- **Reading a higher request count after upgrading to 16 as a regression.**
  Layout deduplication trades more, smaller requests for fewer bytes. Compare
  total transfer size.
- **Side effects in layouts.** Logging, analytics or writes during render run on
  prefetch. Move them into an Effect or a Server Action.
- **Leaving `experimental.prefetchInlining: false` in production** after a
  debugging session. It brings back one request per segment.
- **Replacing `<Link>` with a custom `router.push` component.** You take over
  prefetching and cache invalidation yourself, and usually lose both.

## Related topics

- [Partial Prefetching](../nextjs-instant-navigations/partial-prefetching.md) —
  the opt-in App Shell model that bounds prefetch cost by route count.
- [Link prefetching](../nextjs-instant-navigations/link-prefetching.md) — when
  per-link `prefetch={true}` is worth its server invocation.
- [Linking and navigation](../nextjs-routing/linking-and-navigation.md) — how
  `<Link>` and client-side navigation work.
- [Code splitting](../performance/code-splitting.md) — the React side of loading
  route code on demand, including preloading on intent.
- [Core Web Vitals](./core-web-vitals.md) — confirm that navigations got faster
  for real users.
