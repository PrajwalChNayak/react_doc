---
title: SSR and hydration
description: Rendering React to HTML on a server, attaching React to that HTML in the browser, and fixing mismatches.
group: server-react
order: 50
status: current
related: [server-react/streaming, server-react/static-generation, migration/removed-apis, hooks/use-sync-external-store]
---

## Overview

Server-side rendering is two halves that must agree.

On the server, you render your tree to HTML with an API from `react-dom/server`.
The browser receives markup it can paint before any JavaScript has parsed.

In the browser, `hydrateRoot` from `react-dom/client` renders the same tree
again, walks the existing DOM instead of creating new nodes, and attaches event
handlers. The user sees content early; React takes over once the bundle arrives.

The contract between the halves is strict: **the client render must produce the
same output as the server render**. Every hydration bug is a violation of that
one sentence.

## Why it exists

Client rendering ships an empty `<div>` and asks the user to wait for a bundle,
a parse, a render and usually a fetch before anything appears. On a slow phone
that is seconds of blank screen, and crawlers that do not execute JavaScript see
nothing at all.

SSR moves the first render onto hardware you control. It does not make the app
finish loading sooner; it makes the app show something sooner, which is the
metric users actually experience.

## When to use it

Use SSR when first paint matters and the output depends on the request: a
signed-in home page, a search results page, anything personalized.

Use it when crawlers must see real content and you cannot prerender because the
content is per-user or changes constantly.

## When not to use it

Do not use SSR when the output is identical for every visitor. Prerender it once
instead and serve a file — see [static generation](./static-generation.md).

Do not use SSR for a tool behind a login with no first-paint pressure. You are
adding a server to operate, a second execution environment for every component,
and hydration as a new bug class.

## Basic example

### Node streams — `renderToPipeableStream`

```jsx nocheck="Server rendering entry point. Runs in Node, outside the example harness."
import { renderToPipeableStream } from 'react-dom/server';
import App from './App';

export function handler(request, response) {
  const { pipe, abort } = renderToPipeableStream(<App />, {
    bootstrapScripts: ['/main.js'],
    onShellReady() {
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html');
      pipe(response);
    },
    onShellError(error) {
      response.statusCode = 500;
      response.setHeader('content-type', 'text/html');
      response.send('<h1>Something went wrong</h1>');
      console.error(error);
    },
    onError(error) {
      console.error(error);
    },
  });

  setTimeout(abort, 10000);
}
```

`onShellReady` fires when everything outside a Suspense boundary has rendered —
that is the moment you can start sending bytes. `onAllReady` fires when
everything is done, which is what crawlers and static generation want. `abort`
gives up on the remaining server work and lets the client render the rest.

### Web streams — `renderToReadableStream`

```jsx nocheck="Server rendering entry point. Requires a Web Streams runtime."
import { renderToReadableStream } from 'react-dom/server';
import App from './App';

export async function handler(request) {
  const stream = await renderToReadableStream(<App />, {
    bootstrapScripts: ['/main.js'],
    signal: request.signal,
    onError(error) {
      console.error(error);
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/html' },
  });
}
```

The returned stream carries an `allReady` promise. `await stream.allReady`
before responding when you need the complete document rather than a stream.

> [!NOTE]
> `renderToReadableStream` was originally for Web Streams runtimes only — Deno
> and edge runtimes. Since **19.2** it is available on Node as well. React still
> recommends the Node Streams APIs (`renderToPipeableStream`) on Node: they are
> faster and support compression by default.

### The client half — `hydrateRoot`

```jsx
import { hydrateRoot } from 'react-dom/client';
import App from './App';

hydrateRoot(document, <App />);
```

That is the whole client entry point when the server rendered the entire
document, including `<html>`.

> [!LEGACY]
> Before React 19, server-rendered apps hydrated with `ReactDOM.hydrate` and
> client-rendered apps mounted with `ReactDOM.render`. **Both were removed in
> React 19.** Replace them with `hydrateRoot(container, <App />)` and
> `createRoot(container).render(<App />)` respectively. See
> [removed APIs](../migration/removed-apis.md).

```jsx legacy
// React 17 and earlier. Removed in React 19 — do not write this.
import ReactDOM from 'react-dom';
import App from './App';

ReactDOM.hydrate(<App />, document.getElementById('root'));
```

## How it works

### Root error options (19.0)

React 19 added three error callbacks to both `createRoot` and `hydrateRoot`.
Before this, the only supported hook was `onRecoverableError`, and uncaught
errors went to the console with no structured way to report them.

| Option | Fires when |
|---|---|
| `onCaughtError` | React catches an error in an Error Boundary |
| `onUncaughtError` | An error is thrown and **not** caught by any Error Boundary |
| `onRecoverableError` | React automatically recovers from an error |

Each receives the `error` and an `errorInfo` object containing a
`componentStack`. Some recoverable errors carry the original cause as
`error.cause`.

```tsx
import { hydrateRoot } from 'react-dom/client';
import App from './App';

function reportToMonitoring(kind: string, error: unknown, componentStack?: string | null) {
  console.error(kind, error, componentStack);
}

hydrateRoot(document, <App />, {
  onCaughtError(error, errorInfo) {
    reportToMonitoring('caught', error, errorInfo.componentStack);
  },
  onUncaughtError(error, errorInfo) {
    reportToMonitoring('uncaught', error, errorInfo.componentStack);
  },
  onRecoverableError(error, errorInfo) {
    reportToMonitoring('recovered', error, errorInfo.componentStack);
  },
});
```

`onRecoverableError` is the one to watch in production: a hydration mismatch
that React repaired shows up here, and nowhere else once the app looks fine.

### Why mismatches happen

The server renders once, at one moment, in one environment. The browser renders
again, later, somewhere else. Anything that differs between those two contexts
produces different output.

React's list of the most common causes:

- Extra whitespace, such as newlines, around the React-generated HTML inside the
  root node.
- Checks like `typeof window !== 'undefined'` in rendering logic.
- Browser-only APIs such as `window.matchMedia` in rendering logic.
- Rendering different data on the server and the client.

In practice, that is: `Date.now()` and `new Date()`, `Math.random()`,
locale-dependent formatting (`toLocaleDateString` uses the server's locale and
time zone, then the browser's), reading `localStorage` during render, and
browser extensions that inject nodes into your markup before hydration runs.

> [!WARNING]
> React recovers from some hydration errors, but they are still bugs. In the
> best case you pay for a re-render; in the worst case event handlers attach to
> the wrong elements and clicks do the wrong thing.

### Fixing mismatches

**Client-only values belong in an Effect.** Render the server-safe value first,
then update after mount. The extra render is the point: it happens after
hydration has already matched.

```tsx
import { useEffect, useState } from 'react';

export default function RenderedAt() {
  const [renderedAt, setRenderedAt] = useState<string | null>(null);

  useEffect(() => {
    setRenderedAt(new Date().toLocaleTimeString());
  }, []);

  return <p>{renderedAt ?? 'Loading time…'}</p>;
}
```

**External stores need a server snapshot.** `useSyncExternalStore` takes a third
argument used during server rendering and during hydration. It must return the
same value on both sides. Omit it and rendering the component on the server
throws.

```tsx
import { useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

export default function ConnectionStatus() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  return <p>{isOnline ? 'Online' : 'Offline'}</p>;
}
```

**`suppressHydrationWarning` is the last resort.** It silences the warning for
one element and one level deep. React will not patch mismatched text content —
you are choosing to live with whatever the server sent.

```jsx
export default function BuildStamp() {
  return (
    <time suppressHydrationWarning={true}>
      {new Date().toLocaleDateString()}
    </time>
  );
}
```

Use it for values that are genuinely allowed to differ, such as a timestamp
rendered for display only. Do not use it to hide a real data difference.

### Interaction with StrictMode and concurrent rendering

[StrictMode](../core-concepts/strict-mode.md) double-invokes render functions in
development. A component whose output depends on a counter, a random value or a
mutable module-level variable will produce two different results locally — which
is the same impurity that breaks hydration in production. Treat a StrictMode
warning as an early hydration warning.

Hydration itself is concurrent. React may hydrate in chunks and yield to the
browser between them, so do not assume the whole tree is interactive the instant
`hydrateRoot` returns. See [streaming](./streaming.md) for how React chooses
what to hydrate first.

## Common mistakes

**Rendering `Date.now()` or `Math.random()` in the component body.** The server
value and the client value can never match. Move it to an Effect, or pass a
fixed value down as a prop.

**Branching on `typeof window`.** The two branches render different trees by
construction. Render the server branch, then switch after mount.

**Formatting dates and numbers without a fixed locale and time zone.** The
server has its own; the browser has the user's. Pin both explicitly or format
after hydration.

**Reading `localStorage` during render.** It does not exist on the server. Read
it in an Effect and store the result in state.

**Blaming your code for an extension's markup.** Password managers and
translation extensions mutate the DOM before hydration. Reproduce in a clean
profile before you go hunting.

**Reaching for `suppressHydrationWarning` first.** It hides the symptom. Find
out which value differs before you silence it.

**Ignoring `onRecoverableError` in production.** Recovered mismatches are
invisible to users and to you unless you report them.

## Related topics

- [Streaming](./streaming.md) — sending the shell first and filling Suspense
  boundaries as they resolve.
- [Static generation](./static-generation.md) — the same render, done at build
  time.
- [useSyncExternalStore](../hooks/use-sync-external-store.md) — the server
  snapshot argument in detail.
- [Removed APIs](../migration/removed-apis.md) — the React 18 mounting and
  hydration entry points and what replaced them.
- [Strict Mode](../core-concepts/strict-mode.md) — catching impure renders
  before they become hydration bugs.
- [Server React overview](./overview.md) — how SSR relates to RSC.
