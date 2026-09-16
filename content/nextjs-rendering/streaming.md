---
title: Streaming in Next.js
description: How the App Router streams HTML and the RSC Payload, what that means for status codes, metadata and crawlers, and what can break it.
group: nextjs-rendering
order: 40
status: current
related: [server-react/streaming, data-fetching/suspense, nextjs-errors/loading-ui, nextjs-rendering/static-and-dynamic-rendering]
---

## Overview

The App Router streams every page by default. There is no option to turn on and
no server entry point to write: Next.js calls React's streaming renderer, sends
what is ready, and fills in each `<Suspense>` boundary as its content resolves.

What a shell is, how boundaries reveal and how selective hydration works are
React behavior, explained in [Streaming](../server-react/streaming.md) and
[Suspense](../data-fetching/suspense.md). This page covers what Next.js adds:
`loading.tsx`, the two streams it sends, the HTTP contract once bytes are on the
wire, metadata for crawlers, and the infrastructure that can quietly undo it
all.

## Why it exists

Without streaming, the slowest query on a page sets the time to first byte for
the whole page. A dashboard with a 20 ms header and a 3 second recommendations
call shows nothing for 3 seconds.

Next.js builds on streaming for a second reason. With Cache Components, the part
of a page above its Suspense boundaries can be **prerendered at build time** and
served immediately, while the rest streams from the server. That split, a
static shell plus streamed dynamic content, only works because the response can
arrive in pieces. See
[static and dynamic rendering](./static-and-dynamic-rendering.md).

## When to use it

You are already using it. The decisions are where to put boundaries:

- Around uncached data fetches and request-data reads (`cookies()`,
  `headers()`, `searchParams`), so they do not hold back the shell.
- Around independent regions with different latencies, so each appears when it
  is ready.
- At the segment level with `loading.tsx` when nothing on the page is useful
  until its data arrives.

## When not to use it

Do not add a boundary around content that renders without waiting. It does not
make that content faster, and React may still show the fallback under a slow
network or busy CPU.

Do not wrap your LCP element (the hero image or main heading) in a boundary if
you can avoid it. It cannot paint until the boundary's content is swapped in.

## Basic example

Two ways to create a boundary. A `loading.tsx` file wraps the segment's page in
`<Suspense>` with the file's component as the fallback:

```tsx file="app/kitchen/loading.tsx"
export default function KitchenLoading() {
  return (
    <div className="skeleton" aria-busy="true">
      <div className="skeleton-heading" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </div>
  );
}
```

Inline `<Suspense>` boundaries let independent sections stream on their own:

```tsx file="app/kitchen/page.tsx"
import { Suspense } from 'react';
import { OpenOrders } from './open-orders';
import { StockAlerts } from './stock-alerts';

export default function KitchenPage() {
  return (
    <main>
      <h1>Kitchen</h1>
      <div className="kitchen-grid">
        <Suspense fallback={<p>Loading open orders…</p>}>
          <OpenOrders />
        </Suspense>
        <Suspense fallback={<p>Loading stock alerts…</p>}>
          <StockAlerts />
        </Suspense>
      </div>
    </main>
  );
}
```

The `<h1>` and both fallbacks are sent first. `OpenOrders` and `StockAlerts`
each stream in when their data resolves, in whichever order that happens.
Choosing between `loading.tsx` and inline boundaries, including how each behaves
on navigation, is covered in [loading UI](../nextjs-errors/loading-ui.md).

## How it works

### Two streams on a first visit

**The HTML stream.** The shell (layouts, content outside boundaries, and
fallbacks) is sent first. When a boundary resolves, React streams its HTML with
a small inline script that swaps it in for the fallback. The swap happens before
the page's JavaScript bundle has loaded.

**The RSC Payload.** On a first visit, the payload is embedded in the same HTML
response, in inline scripts, so React can hydrate. On a client-side navigation,
the router requests only the payload, with an `rsc: 1` request header, and no
HTML is transferred.

Each boundary is also a hydration unit. React hydrates boundaries independently
and prioritizes the one the user interacts with.

### The static shell

Everything that renders before any async work resolves forms the **static
shell**. With `cacheComponents` enabled, Next.js prerenders it at build time, so
a direct visit gets the shell without waiting for any server rendering, and a
CDN can serve it. Without Cache Components, the shell is rendered per request
and sent as soon as it is ready.

### When the prerenderer needs a boundary

With Cache Components, dynamic work (an uncached fetch, `await cookies()`,
`await io()`) must sit under a Suspense boundary. The prerenderer walks
up from the dynamic access to the nearest boundary. If it finds none, the dev
overlay reports a blocking route and `next build` fails.

A `loading.tsx` high in the tree counts as that boundary. It fixes the error,
but the whole page then falls back to one skeleton. Boundaries close to the
dynamic access keep more real content in the shell.

## Server and client implications

### Status codes are decided before streaming starts

Headers, including the status code, are sent with the first chunk. After that
they cannot change. The response starts streaming when a Suspense fallback
renders or a component suspends under a boundary.

| Happens | Before streaming starts | After streaming starts |
|---|---|---|
| `notFound()` | HTTP `404` | Status stays `200`. Next.js injects `<meta name="robots" content="noindex">` into the streamed HTML |
| `redirect()` | HTTP redirect | Client-side redirect |
| An error is thrown | — | Nearest `error.tsx` renders in place of the failed section. Status stays `200` |

To return a real 404, check existence **before** any boundary or `await` that
may suspend:

```tsx file="app/changelog/[version]/page.tsx"
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { listReleaseVersions, releaseExists } from '@/lib/releases';
import { ReleaseNotes } from './release-notes';

export async function generateStaticParams() {
  const versions: string[] = await listReleaseVersions();
  return versions.map((version) => ({ version }));
}

export default async function ReleasePage({ params }: PageProps<'/changelog/[version]'>) {
  const { version } = await params;

  if (!(await releaseExists(version))) {
    notFound();
  }

  return (
    <article>
      <h1>Release {version}</h1>
      <Suspense fallback={<p>Loading release notes…</p>}>
        <ReleaseNotes version={version} />
      </Suspense>
    </article>
  );
}
```

`releaseExists` should be a fast, cached lookup. The full notes stream inside the
boundary. If the check cannot happen in the page, do it in
[`proxy.ts`](../nextjs-backend/proxy.md), which runs before rendering and can
still return any status.

### Metadata and crawlers

`generateMetadata` can be slow too. Next.js handles it differently depending on
who is asking:

- **Browsers and DOM-capable crawlers** (such as Googlebot) get **streaming
  metadata**: the page streams without waiting, and the metadata tags are
  appended to `<body>` when `generateMetadata` resolves.
- **HTML-limited bots** that do not run JavaScript (such as
  `facebookexternalhit` or `Twitterbot`) get blocking metadata: Next.js waits
  for `generateMetadata` and puts the tags in `<head>`.

Next.js picks the behavior from the `User-Agent` header. With Cache Components,
HTML-limited bots skip the prerendered shell and get the page rendered at
request time, so the metadata can go in `<head>`. That means any build-time-only
input your shell depends on must also be available at request time, or the page
works for people and fails for crawlers.

You can override the bot list with the `htmlLimitedBots` option. A pattern that
matches everything turns streaming metadata off:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  htmlLimitedBots: /.*/,
};

export default nextConfig;
```

That makes every visitor wait for metadata, so leave the default unless you have
measured a problem. Metadata itself is covered in
[metadata](../nextjs-styling/metadata.md).

### Streaming and Core Web Vitals

- **TTFB and FCP** drop to the time it takes to send the shell.
- **LCP** suffers if the LCP element is inside a boundary. Keep it in the shell.
- **CLS** grows when a fallback and its content differ in size. Size skeletons
  to match.
- **INP** improves, because hydration happens per boundary instead of in one
  long task.

## Common patterns

### Push request reads into the boundary

Awaiting `cookies()` at the top of a layout makes the whole layout wait. Pass
the unawaited promise down and resolve it inside the boundary:

```tsx file="app/kitchen/layout.tsx"
import { Suspense, type ReactNode } from 'react';
import { cookies } from 'next/headers';
import { StationPicker } from './station-picker';

export default function KitchenLayout({ children }: { children: ReactNode }) {
  return (
    <div className="kitchen-layout">
      <header>
        <Suspense fallback={<span>Station…</span>}>
          <StationPicker cookieStorePromise={cookies()} />
        </Suspense>
      </header>
      {children}
    </div>
  );
}
```

The header, the fallback and `children` are in the shell. Only `StationPicker`
waits for the request. The same works for `params` and `searchParams`: pass the
promise down, or unwrap it inline with `params.then(...)` inside the boundary.

### Turn off proxy buffering

Anything between the server and the browser that buffers the response turns
streaming back into one late response. Nginx buffers by default. Next.js can
send the header that disables it:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*{/}?',
        headers: [{ key: 'X-Accel-Buffering', value: 'no' }],
      },
    ];
  },
};

export default nextConfig;
```

Other places that buffer: CDNs (check your provider's streaming support),
serverless platforms (AWS Lambda needs response streaming mode enabled),
compression layers that do not flush early, and Safari, which buffers until it
has 1024 bytes. A static export (`output: 'export'`) does not stream at all. See
[self-hosting](../nextjs-deployment/self-hosting.md).

### Verify that a page streams

In Chrome DevTools, select the document request and open **Timing**. An early
time to first byte with a long content download means the response is
streaming. To see the chunks themselves, read the body as a stream with
compression off:

```ts file="scripts/observe-stream.ts"
import process from 'node:process';

const url = process.argv[2] ?? 'http://localhost:3000/kitchen';
const response = await fetch(url, { headers: { 'Accept-Encoding': 'identity' } });

if (!response.body) {
  throw new Error(`No response body from ${url}`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
const startedAt = Date.now();
let chunkIndex = 0;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(`\n--- chunk ${chunkIndex++} (+${Date.now() - startedAt} ms) ---`);
  console.log(decoder.decode(value, { stream: true }));
}
```

Run it against `next start`, not `next dev`. Several chunks with growing
timestamps mean streaming works end to end. One chunk means something in
between is buffering. Sending a crawler user agent, such as `Twitterbot/1.0`,
should produce one chunk after the full render, which is the bot behavior
described above.

## Common mistakes

**Calling `notFound()` after a boundary has suspended.** The status is already
`200`. The page gets a `noindex` tag but not a 404. Check existence first.

**One `loading.tsx` at the root to silence blocking-route errors.** Every page
then shows a full-page skeleton. Put boundaries next to the dynamic access.

**Awaiting request data at the top of a layout.** Nothing in that layout can be
in the shell. Pass the promise down.

**Testing streaming with `curl` alone.** `curl` buffers output, and even with
`-N` it flushes on newlines. Read the body as a stream, as shown above.

**Blaming Next.js when a proxy buffers.** If streaming works against
`next start` directly but not through your load balancer or CDN, the buffering
is in between.

**Hiding the LCP element behind a boundary.** It cannot paint until the swap.
Keep it in the shell.

## Related topics

- [Streaming (React)](../server-react/streaming.md): the shell, boundary
  reveals and selective hydration that Next.js builds on.
- [Suspense](../data-fetching/suspense.md): how a boundary behaves on the
  client.
- [Loading UI](../nextjs-errors/loading-ui.md): `loading.tsx` versus inline
  `<Suspense>`, and navigation behavior.
- [Static and dynamic rendering](./static-and-dynamic-rendering.md): what goes
  into the prerendered shell.
- [Streaming responses](../nextjs-backend/streaming-responses.md): streaming raw
  data from Route Handlers.
