---
title: Static generation
description: Prerender HTML ahead of time, and resume the dynamic parts later with partial pre-rendering.
group: server-react
order: 70
status: current
related: [server-react/ssr-and-hydration, server-react/streaming, server-react/overview, patterns/document-metadata]
---

## Overview

Static generation is server rendering moved earlier. Instead of rendering on
every request, you render once — at build time, or on a schedule — and serve the
resulting HTML as a file.

React 19 added two APIs for this in `react-dom/static`:

| API | Environment | Returns |
|---|---|---|
| `prerender` | Web Streams | `{ prelude, postponed }` where `prelude` is a Web stream |
| `prerenderToNodeStream` | Node.js | `{ prelude, postponed }` where `prelude` is a Node.js stream |

Both wait for all data before resolving, which is exactly what you want for a
file you are going to write to disk.

> [!NOTE]
> `prerender` originally required a Web Streams runtime. Since **19.2** it is
> available on Node as well. React still recommends the Node Streams APIs on
> Node — `prerenderToNodeStream` and `resumeToPipeableStream` — because they are
> faster and support compression by default.

## Why it exists

If the output does not depend on the request, computing it per request is pure
waste. A prerendered page is a file: a CDN serves it from an edge location in
milliseconds, with no server to scale, no cold start, and no database to keep
available.

The second reason is failure isolation. A prerendered page keeps working when
your database is down, because nothing is queried at request time.

## When to use it

Use it for anything identical for every visitor: marketing pages,
documentation, changelogs, blog posts, legal text.

Use it for pages that change on a schedule rather than per request. Rebuild
hourly and serve a file for the rest of the hour.

Use it when your traffic pattern is spiky. Static files absorb a traffic spike
that would melt a render server.

## When not to use it

Do not prerender pages whose content depends on the signed-in user. You would
either build one file per user or leak one user's data to another.

Do not prerender a catalogue of a million pages because a hundred of them get
traffic. Build time is real; render the rest on demand.

Do not prerender content that must be fresh to the second. Prices, inventory and
live scores belong in a per-request render — or in the resumed part of a
partial pre-render.

## Basic example

Node streams:

```jsx nocheck="Build-time entry point. Runs in Node, outside the example harness."
import { prerenderToNodeStream } from 'react-dom/static';
import { createWriteStream } from 'node:fs';
import App from './App';

export async function buildPage(outputPath) {
  const { prelude } = await prerenderToNodeStream(<App />, {
    bootstrapScripts: ['/main.js'],
    onError(error) {
      console.error(error);
      process.exitCode = 1;
    },
  });

  prelude.pipe(createWriteStream(outputPath));
}
```

Web streams:

```jsx nocheck="Build-time entry point. Requires a Web Streams runtime."
import { prerender } from 'react-dom/static';
import App from './App';

export async function handler() {
  const { prelude } = await prerender(<App />, {
    bootstrapScripts: ['/main.js'],
  });

  return new Response(prelude, {
    headers: { 'content-type': 'text/html' },
  });
}
```

`prerender` takes the same shape of options as the streaming server renderers —
`bootstrapScripts`, `bootstrapModules`, `identifierPrefix`, `onError`, `signal`
and so on. `nonce` is not available when prerendering: a nonce must be unique
per request, which is incompatible with output that is reused.

## How it works

### The `postponed` state

Both prerender APIs resolve to two things, not one.

- `prelude` — the HTML produced so far.
- `postponed` — a JSON-serializable, opaque object you pass to a resume API if
  the prerender **did not finish**. It is `null` when the prelude contains
  everything and no resume is necessary.

You make a prerender stop early by aborting it. Pass an `AbortSignal` as the
`signal` option; when it aborts, any Suspense boundary with incomplete children
is included in the prelude in its fallback state, and the work left to do is
captured in `postponed`.

That combination is the whole feature: a complete HTML shell you can cache, plus
an opaque token describing the holes in it.

### Partial pre-rendering (19.2)

> In 19.2 we're adding a new capability to pre-render part of the app ahead of
> time, and resume rendering it later. This feature is called "Partial
> Pre-rendering", and allows you to pre-render the static parts of your app and
> serve it from a CDN, and then resume rendering the shell to fill it in with
> dynamic content later.

The four resume APIs, and where each one lives:

| API | Module | Output |
|---|---|---|
| `resume` | `react-dom/server` | A readable Web stream, with an `allReady` promise |
| `resumeToPipeableStream` | `react-dom/server` | An object with `pipe` and `abort` |
| `resumeAndPrerender` | `react-dom/static` | `{ prelude, postponed }`, Web stream |
| `resumeAndPrerenderToNodeStream` | `react-dom/static` | `{ prelude, postponed }`, Node stream |

All four take the same first two arguments: the React node you originally called
`prerender` with, and the `postponedState` you stored.

The split is by intent. The two in `react-dom/server` **stream a response to a
user now**. The two in `react-dom/static` **produce more static output**, and can
themselves postpone again — useful for filling in one layer of dynamic content
at a time, for example resolving per-region content at the edge while leaving
per-user content for the request.

> [!NOTE]
> `resume` and `resumeAndPrerender` are the Web Streams pair and, like
> `prerender`, are available on Node as of **19.2**. On Node, prefer
> `resumeToPipeableStream` and `resumeAndPrerenderToNodeStream`.

### The workflow

1. **At build time**, prerender the page with an abort signal. Anything that
   suspends past the deadline stays as a fallback.
2. **Store both outputs.** The prelude goes to a CDN as a file. The postponed
   state goes wherever your infrastructure can read it at request time — Redis,
   S3, a file next to the HTML.
3. **At request time**, load the postponed state and resume. React continues the
   same render, fills in the boundaries that were left as fallbacks, and streams
   the result.

The user gets bytes from the CDN immediately, and the dynamic parts arrive as a
stream — the same reveal mechanism as ordinary
[streaming SSR](./streaming.md).

## Advanced example

Build step — prerender, abort after a deadline, keep both halves:

```jsx nocheck="Build-time entry point. Runs in Node, outside the example harness."
import { prerenderToNodeStream } from 'react-dom/static';
import { savePrelude, savePostponedState } from './storage';
import App from './App';

export async function buildDashboardShell() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5000);

  const { prelude, postponed } = await prerenderToNodeStream(<App />, {
    bootstrapScripts: ['/main.js'],
    signal: controller.signal,
    onError(error) {
      console.error(error);
    },
  });

  await savePrelude('dashboard', prelude);

  if (postponed !== null) {
    await savePostponedState('dashboard', JSON.stringify(postponed));
  }
}
```

Request handler — resume into the response:

```jsx nocheck="Server rendering entry point. Runs in Node, outside the example harness."
import { resumeToPipeableStream } from 'react-dom/server';
import { getPostponedState } from './storage';
import App from './App';

export async function handler(request, response) {
  const postponed = JSON.parse(await getPostponedState('dashboard'));

  const { pipe } = resumeToPipeableStream(<App />, postponed, {
    onShellReady() {
      response.setHeader('content-type', 'text/html');
      pipe(response);
    },
    onError(error) {
      console.error(error);
    },
  });
}
```

On a Web Streams runtime the same handler is shorter, because `resume` resolves
to a stream you can hand straight to a `Response`:

```jsx nocheck="Server rendering entry point. Requires a Web Streams runtime."
import { resume } from 'react-dom/server';
import { getPostponedState } from './storage';
import App from './App';

export async function handler(request) {
  const postponed = JSON.parse(await getPostponedState('dashboard'));
  const stream = await resume(<App />, postponed);

  return new Response(stream, {
    headers: { 'content-type': 'text/html' },
  });
}
```

The `<App />` element passed to a resume API must be the same tree you
prerendered. The postponed state describes positions in that tree; hand it a
different tree and the positions mean nothing.

## Common mistakes

**Assuming `postponed` is always `null`.** It is `null` only when the prerender
finished. If you never abort, you never postpone — but if you do abort and then
throw the postponed state away, the fallbacks in your prelude are permanent.

**Storing the postponed state somewhere slow.** It is read on every request. If
fetching it costs more than rendering the page, the optimization is inverted.

**Passing a different tree to `resume`.** Same component, same props, same
element.

**Mixing up the two families.** `react-dom/server` resume APIs stream to a user;
`react-dom/static` resume APIs produce more static output. Picking the wrong one
gives you either a file you cannot send or a stream you cannot cache.

**Using `nonce` with `prerender`.** Nonces must be unique per request and are
inappropriate for prerendered content, so the option is not available.

**Prerendering user-specific content.** If the HTML differs per visitor, it is
not static. Put that part behind a Suspense boundary and resume it per request.

**Forgetting `bootstrapScripts`.** Prerendered HTML with no script tag is a
static page forever — it never hydrates and nothing becomes interactive.

## Related topics

- [Streaming](./streaming.md) — how the resumed boundaries reach the browser.
- [SSR and hydration](./ssr-and-hydration.md) — the per-request equivalent, and
  the client half of every prerendered page.
- [Server React overview](./overview.md) — choosing between per-request and
  build-time rendering.
- [Document metadata](../patterns/document-metadata.md) — `<title>` and `<meta>`
  in prerendered HTML.
- [Server Components](./server-components.md) — where the data for a prerendered
  page is usually read.
