---
title: Streaming
description: Send the shell immediately and stream Suspense boundaries as their data resolves.
group: server-react
order: 60
status: current
related: [server-react/ssr-and-hydration, data-fetching/suspense, patterns/error-boundaries, server-react/static-generation]
---

## Overview

A non-streaming server render is all-or-nothing: the server waits for every
query, builds one HTML string, and sends it. The slowest thing on the page sets
the time to first byte for the whole page.

Streaming SSR breaks that. React sends the **shell** — everything outside a
`<Suspense>` boundary — as soon as it is ready, with each boundary's `fallback`
in place. As data resolves, React streams each boundary's real HTML and swaps
out the fallback.

> During streaming server rendering, a boundary also activates while its HTML is
> still streaming in. With any streaming server rendering API, React sends the
> shell with the `fallback` first, then streams in each boundary's HTML and
> swaps out its `fallback` as that content arrives.

Every streaming API in `react-dom/server` does this: `renderToPipeableStream`
for Node streams, `renderToReadableStream` for Web streams.

## Why it exists

Two costs disappear.

The first is head-of-line blocking. A comment feed that takes 800 ms no longer
delays the article that took 20 ms. The user reads while the rest arrives.

The second is the hydration cliff. Without streaming, the browser gets the whole
document and must hydrate the whole tree before anything is interactive.
Streaming lets React hydrate boundaries independently — and prioritize the one
the user touched.

## When to use it

Use streaming when parts of the page have very different latencies: a product
description from cache next to a recommendations call to another service.

Use it when the shell is genuinely useful on its own — a header, navigation, a
title and a layout the user can orient in.

Use it when you want interactivity to arrive progressively rather than in one
late jump.

## When not to use it

Crawlers and static generation usually want the finished document. Wait for
everything: call `pipe` inside `onAllReady`, or `await stream.allReady` before
responding.

Do not stream if there is nothing meaningful above the first boundary. A shell
that is an empty layout plus three spinners is worse than a slightly later
complete page, because you have traded one wait for a flash of skeletons.

## Basic example

Boundaries are placed in your component tree, not in your server entry point.

```tsx static="Runs on the server."
import { Suspense } from 'react';
import ArticleBody from './ArticleBody';
import CommentList from './CommentList';
import RelatedArticles from './RelatedArticles';

export default function ArticlePage({ slug }: { slug: string }) {
  return (
    <main>
      <h1>Release notes</h1>
      <ArticleBody slug={slug} />

      <Suspense fallback={<p>Loading comments…</p>}>
        <CommentList slug={slug} />
      </Suspense>

      <Suspense fallback={<p>Loading related articles…</p>}>
        <RelatedArticles slug={slug} />
      </Suspense>
    </main>
  );
}
```

`ArticleBody` is part of the shell — nothing streams until it is ready. The two
Suspense boundaries stream in independently, in whatever order their data
arrives.

## How it works

### The shell decides your time to first byte

The shell is everything not inside a Suspense boundary. `onShellReady` fires
when it has rendered; that is the earliest you can start sending bytes.

This gives you a direct lever. Move something above a boundary and it delays the
whole page. Move it below a boundary and it arrives late but costs nothing up
front.

If a component **inside** the shell throws, there is no fallback to show and the
render fails: `onShellError` fires, and you send an error page yourself. That
asymmetry is a good reason to keep the shell small and boring.

### Selective hydration

React does not have to hydrate the tree in order. When HTML for a boundary
arrives, React hydrates it independently of its siblings — and if the user
clicks inside a boundary that has not been hydrated yet, React prioritizes that
one.

The practical effect: a click during loading is not lost. React records the
interaction, hydrates the boundary the user touched ahead of the others, and
replays the event.

You do not opt into this. It is a consequence of placing Suspense boundaries at
all, which is one more reason boundary placement is a real design decision.

### Batched boundary reveals (19.2)

Before 19.2, a Suspense boundary revealed differently depending on whether it
was streamed from the server or resolved on the client. Server-streamed
boundaries popped in one at a time, the instant each arrived.

> Starting in 19.2, React will batch reveals of server-rendered Suspense
> boundaries for a short time, to allow more content to be revealed together and
> align with the client-rendered behavior.

Why this matters for perceived quality: three sibling boundaries finishing 30 ms
apart used to produce three separate layout jumps. Batching reveals them
together, so the page settles once. It also avoids chained animations, which is
groundwork for view transitions during SSR.

You do not configure this. Upgrading to 19.2 or later changes the reveal timing
for you.

### Errors after the shell

A component that throws *inside* a boundary does not abort the server render.

> If a component throws an error on the server, React will not abort the server
> render. Instead, it will find the closest `<Suspense>` component above it and
> include its fallback (such as a spinner) into the generated server HTML.

The client then retries that component. If it succeeds there, the user never
learns anything went wrong. If it fails there too, React throws and the nearest
[Error Boundary](../patterns/error-boundaries.md) renders.

Two things follow. Your `onError` callback fires for errors that the user never
saw — log them, because nothing else will tell you. And a Suspense fallback is
not only a loading state; it is also your server-side error state, so a
`fallback` that looks like a permanent piece of UI will be misleading.

```jsx nocheck="Server rendering entry point. Runs in Node, outside the example harness."
import { renderToPipeableStream } from 'react-dom/server';
import App from './App';

export function handler(request, response) {
  let didError = false;

  const { pipe } = renderToPipeableStream(<App />, {
    bootstrapScripts: ['/main.js'],
    onShellReady() {
      response.statusCode = didError ? 500 : 200;
      response.setHeader('content-type', 'text/html');
      pipe(response);
    },
    onError(error) {
      didError = true;
      console.error(error);
    },
  });
}
```

The status code is decided in `onShellReady`, because by then you know whether
anything failed while producing the shell. Errors after that point cannot change
the status — the headers are already sent.

## Common patterns

### Choosing boundary placement

| Placement | Effect |
|---|---|
| No boundaries | One long wait, then the whole page. Simple, slowest first paint |
| One boundary around everything slow | Fast shell, one skeleton, one reveal |
| A boundary per independent region | Fastest useful content, more moving parts |
| A boundary per list item | Excessive — dozens of reveals and a visibly unstable page |

The trade-off is fast shell versus layout shift. Every boundary is a place where
content will appear later and push things around. Reserve space in the fallback
so the swap does not move the page: give a skeleton the same height as the
content it stands in for.

Group boundaries by *when data arrives*, not by component structure. Two regions
backed by the same query belong in one boundary; splitting them creates two
reveals of the same information.

### Starting network work earlier (19.0)

React 19 added four resource hints in `react-dom`. They let you tell the browser
about a resource before the component that needs it renders, which is
particularly effective mid-stream: you can emit a hint in the shell for
something a later boundary will need.

| Function | Signature | Use for |
|---|---|---|
| `prefetchDNS` | `prefetchDNS(href)` | Resolve DNS for a host you will probably use |
| `preconnect` | `preconnect(href)` | Open the connection to a host you will definitely use |
| `preload` | `preload(href, options)` | Download a resource you will need; `options.as` is required |
| `preinit` | `preinit(href, options)` | Download **and execute** a script or stylesheet; `options.as` is `"script"` or `"style"` |

```jsx
import { preconnect, prefetchDNS, preload, preinit } from 'react-dom';

export default function CheckoutRoute() {
  prefetchDNS('https://metrics.example.com');
  preconnect('https://payments.example.com');
  preload('https://cdn.example.com/fonts/inter-variable.woff2', {
    as: 'font',
    crossOrigin: 'anonymous',
    fetchPriority: 'high',
  });
  preinit('https://cdn.example.com/checkout.css', {
    as: 'style',
    precedence: 'high',
  });

  return <h1>Checkout</h1>;
}
```

`preload` requires `as`; allowed values include `font`, `image`, `script`,
`style`, `fetch`, `audio`, `video` and several more. `crossOrigin: 'anonymous'`
is required for fonts and for `as: 'fetch'`. `preinit` accepts only `script` or
`style`, and stylesheets also take a `precedence`.

Reach for `prefetchDNS` when you are unsure you will use a host, and
`preconnect` when you are sure — a connection you never use is wasted work on
both ends.

## Common mistakes

**Putting the slow component in the shell.** Everything above the first
Suspense boundary blocks the first byte. If the page is slow to start streaming,
look there first.

**Fallbacks that do not reserve space.** A one-line spinner replaced by a
400-pixel table moves the page under the user's cursor. Size the skeleton.

**A boundary per row.** Dozens of reveals, dozens of layout shifts, and — before
19.2 — dozens of separate paint moments. Group by query.

**Sending a 200 before you know.** Decide the status code in `onShellReady`.
Once bytes are on the wire, you cannot take the header back.

**Swallowing `onError`.** Errors inside boundaries are recovered on the client
and become invisible. If you do not log them, nobody finds out.

**Streaming to a crawler.** Use `onAllReady` (Node streams) or
`await stream.allReady` (Web streams) when the consumer wants a finished
document.

**Calling `preload` for everything.** Hints compete for bandwidth with the
resources you actually need now. Preload the few things on the critical path.

## Related topics

- [SSR and hydration](./ssr-and-hydration.md) — the server APIs and the client
  half of the render.
- [Suspense](../data-fetching/suspense.md) — what a boundary is and how it
  behaves on the client.
- [Error boundaries](../patterns/error-boundaries.md) — where a failed retry
  ends up.
- [Static generation](./static-generation.md) — streaming's build-time
  counterpart.
- [Server Components](./server-components.md) — the async components that
  suspend inside these boundaries.
