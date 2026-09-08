---
title: use with promises
description: Read data during render with use, and get the promise from somewhere that will not recreate it.
group: data-fetching
order: 30
status: current
since: "19.0"
related: [hooks/use, data-fetching/suspense, patterns/error-boundaries, data-fetching/libraries]
---

## Overview

[`use(promise)`](../hooks/use.md) reads a promise's resolved value during
render. Pending suspends the nearest [`<Suspense>`](./suspense.md) boundary;
rejected goes to the nearest
[error boundary](../patterns/error-boundaries.md); fulfilled returns the value
synchronously.

The API is one line. Everything difficult about it is the answer to a single
question: **where does the promise come from?**

There are exactly three good answers.

| Source | Who guarantees a stable promise | Use when |
|---|---|---|
| A Server Component passes it as a prop | The framework | You have RSC |
| A Suspense-enabled library or framework | The library | Client app with a data layer |
| Your own cache, keyed and module-scoped | You | Load-once data, no library |

And one answer that is not supported: creating the promise during render in a
Client Component.

> [!WARNING]
> Promises passed to `use` must be cached so the same promise instance is reused
> across re-renders. If a new promise is created directly in render, React
> displays the Suspense fallback on every re-render and the content never
> settles.

## Why it exists

Rendering is not allowed to have side effects, and starting a network request is
a side effect. So React cannot let a component *begin* a fetch during render —
but it can let a component *read* something that is already in flight.

That split is the whole design. Somebody outside the render starts the request
and owns its identity; `use` only observes it. When you create the promise
inline, you collapse the split and make render the owner, which React has no way
to make work: every render produces a new owner.

The payoff for respecting the split is that data reading stops needing a state
machine. No `isLoading`, no `data === undefined` branch, no Effect. The pending
and failed cases become boundaries in the tree.

## When to use it

- A Server Component starts the request and hands the promise to a Client
  Component. This is the pattern react.dev leads with.
- Configuration, translations, feature flags, or any document that is loaded
  once per session and never invalidated.
- You want a route's loading UI expressed as a `<Suspense>` boundary rather than
  a boolean threaded through components.

## When not to use it

- **Anything that needs revalidation, invalidation or refetching.** `use` reads;
  it does not manage. Use [a data library](./libraries.md).
- **Mutations.** A promise you read during render must be idempotent. Submitting
  a form is [an action](../patterns/forms-and-actions.md).
- **Data that depends on a value changing many times a second.** Each distinct
  key creates a cache entry that your hand-rolled cache will never evict.
- **Inside `try`/`catch`.** `use` throws internally to signal Suspense. Wrap the
  component in an error boundary instead.

## Basic example

The supported client-side shape: a cache outside the component owns the promise,
the component reads it.

```jsx live
import { Suspense, use, useState } from 'react';

// The cache lives outside React, so the promise identity is stable.
const documentCache = new Map();

function loadDocument(docId) {
  if (!documentCache.has(docId)) {
    documentCache.set(
      docId,
      new Promise(resolve => {
        // Stands in for a network call so this example is self-contained.
        setTimeout(
          () => resolve({ id: docId, title: `Runbook ${docId}` }),
          800
        );
      })
    );
  }
  return documentCache.get(docId);
}

function DocumentTitle({ docId }) {
  const runbook = use(loadDocument(docId));
  return <h3>{runbook.title}</h3>;
}

export default function DocumentViewer() {
  const [docId, setDocId] = useState(1);

  return (
    <div>
      <button onClick={() => setDocId(id => id + 1)}>Next runbook</button>{' '}
      <button onClick={() => setDocId(1)}>Back to first</button>
      <Suspense fallback={<h3>Loading runbook…</h3>}>
        <DocumentTitle docId={docId} />
      </Suspense>
    </div>
  );
}
```

Click "Next runbook" and you see the fallback. Click "Back to first" and you do
not — the promise for that key is already fulfilled, so `use` returns
synchronously with no suspension at all.

## How it works

React tracks each promise it has seen. On each render, `use(promise)` looks at
that promise's state:

- **Pending** — the component suspends. React shows the nearest fallback and
  subscribes to the promise. When it settles, React re-renders the subtree.
- **Fulfilled** — the value is returned in the same render pass.
- **Rejected** — the rejection is rethrown toward the nearest error boundary.

The retry after a suspension re-renders the suspended subtree **from scratch**;
React preserves no state for a tree that never mounted. On that retry, `use`
must be handed the same promise instance, or React sees another pending promise
and suspends again. That is the entire reason caching is mandatory.

React also lets a promise carry its own status. If you set `status` and `value`
(or `reason`) fields on the promise, `use` reads a fulfilled value synchronously
without ever suspending. Most libraries do this; the deep-dive cache below shows
how.

### Do not bypass `use`

You may call `use` conditionally. You must not decide *whether* to call it by
inspecting the promise.

```jsx nocheck="Anti-pattern shown deliberately."
// 🔴 Reading the promise's own fields to skip `use`.
if (settingsPromise.status === 'fulfilled') {
  return settingsPromise.value;
}
const settings = use(settingsPromise);
```

```jsx nocheck="Correct counterpart to the block above."
// ✅ Always hand the promise to `use` and let React track it.
const settings = use(settingsPromise);
```

Bypassing it breaks React's Suspense bookkeeping and the DevTools integration.

## Common patterns

### From a Server Component

The framework owns the request; the promise streams across the boundary.

```jsx static="Server Components require a framework with an RSC bundler."
import { Suspense } from 'react';
import { fetchDeployments } from './lib/deployments.js';
import DeploymentTable from './DeploymentTable.js';

export default function DeploymentsPage({ params }) {
  // Started, not awaited: the pending promise is passed down.
  const deploymentsPromise = fetchDeployments(params.serviceId);

  return (
    <Suspense fallback={<p>Loading deployments…</p>}>
      <DeploymentTable deploymentsPromise={deploymentsPromise} />
    </Suspense>
  );
}
```

```jsx static="Client Component paired with the Server Component above."
'use client';

import { use } from 'react';

export default function DeploymentTable({ deploymentsPromise }) {
  const deployments = use(deploymentsPromise);

  return (
    <table>
      <tbody>
        {deployments.map(deployment => (
          <tr key={deployment.id}>
            <td>{deployment.sha.slice(0, 7)}</td>
            <td>{deployment.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Values crossing the boundary must be serializable.

### Preloading to avoid waterfalls

`use` does not start anything. If the request only begins when the reading
component renders, you have built a waterfall — each level of the tree adds a
round trip.

Start the request at the moment the data becomes inevitable: a route match, a
hover, a click. The component then reads a promise that is already in flight, or
already settled.

```jsx static="Illustrates request timing against a real endpoint."
import { Suspense, use, useState } from 'react';

const invoiceCache = new Map();

function loadInvoice(invoiceId) {
  if (!invoiceCache.has(invoiceId)) {
    invoiceCache.set(
      invoiceId,
      fetch(`/api/invoices/${invoiceId}`).then(response => {
        if (!response.ok) {
          throw new Error(`Invoice ${invoiceId} failed to load`);
        }
        return response.json();
      })
    );
  }
  return invoiceCache.get(invoiceId);
}

function InvoiceDetail({ invoicePromise }) {
  const invoice = use(invoicePromise);
  return <p>Total: {invoice.total}</p>;
}

export default function InvoiceRow({ invoiceId }) {
  const [invoicePromise, setInvoicePromise] = useState(null);

  return (
    <div
      // Warm the cache before the click happens.
      onMouseEnter={() => loadInvoice(invoiceId)}
      onFocus={() => loadInvoice(invoiceId)}
    >
      <button onClick={() => setInvoicePromise(loadInvoice(invoiceId))}>
        Show invoice {invoiceId}
      </button>
      {invoicePromise ? (
        <Suspense fallback={<p>Loading invoice…</p>}>
          <InvoiceDetail invoicePromise={invoicePromise} />
        </Suspense>
      ) : null}
    </div>
  );
}
```

For scripts, stylesheets and fonts the equivalent tools are `preload`,
`preinit`, `preconnect` and `prefetchDNS` from `react-dom`, added in React 19.0.

### Handling rejection

A rejected promise does not go to `use`'s caller. It goes to the nearest error
boundary, which needs to sit above the reading component and below anything you
want to keep on screen.

```jsx static="Uses a third-party error boundary component."
import { Suspense, use } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

function Changelog({ changelogPromise }) {
  const entries = use(changelogPromise);
  return (
    <ul>
      {entries.map(entry => (
        <li key={entry.version}>{entry.version}</li>
      ))}
    </ul>
  );
}

export default function ChangelogPanel({ changelogPromise }) {
  return (
    <ErrorBoundary fallback={<p role="alert">Could not load the changelog.</p>}>
      <Suspense fallback={<p>Loading changelog…</p>}>
        <Changelog changelogPromise={changelogPromise} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

React 19 does not ship an error boundary component — only the class API and the
root options `onCaughtError`, `onUncaughtError` and `onRecoverableError`. Write
your own or use `react-error-boundary`. See
[error boundaries](../patterns/error-boundaries.md).

A caching detail that bites: a cache entry holding a rejected promise keeps
returning that rejection. A retry has to delete the key first.

## Advanced example

A minimal cache that also sets the status fields React looks for, so an
already-loaded value never suspends.

```js
const cache = new Map();

export function loadResource(url) {
  if (!cache.has(url)) {
    const promise = fetch(url).then(response => {
      if (!response.ok) {
        throw new Error(`${url} failed with ${response.status}`);
      }
      return response.json();
    });

    // React reads these fields to skip suspending on an already-settled promise.
    promise.status = 'pending';
    promise.then(
      value => {
        promise.status = 'fulfilled';
        promise.value = value;
      },
      reason => {
        promise.status = 'rejected';
        promise.reason = reason;
        // Let a retry start a fresh request instead of replaying the failure.
        cache.delete(url);
      }
    );

    cache.set(url, promise);
  }
  return cache.get(url);
}
```

> [!WARNING]
> This is a teaching cache, not a production one. It never evicts, so it leaks
> for every key you ever request. It has no staleness policy, so data is correct
> only until the moment it changes on the server. It cannot invalidate after a
> mutation, cannot revalidate on focus or reconnect, and has no request
> deduplication beyond identical keys. A real application should use
> [TanStack Query, SWR or RTK Query](./libraries.md), or a framework's router
> cache.

The version above also mutates the promise object, which is why the block is
plain JavaScript — adding those fields in TypeScript needs a declared type for
the extended promise.

## Common mistakes

**Creating the promise during render.** The defining mistake:

```jsx nocheck="Broken on purpose — the fallback never goes away."
function ServiceHealth({ serviceId }) {
  // 🔴 A brand-new promise on every render.
  const health = use(fetch(`/api/health/${serviceId}`).then(r => r.json()));
  return <p>{health.status}</p>;
}
```

Every render creates a new pending promise, so React suspends, retries, creates
another, and loops. Fix it by moving the request into a cache keyed by
`serviceId`, or by passing the promise in as a prop.

**Caching in a `useState` or `useRef` inside the suspending component.** That
component's state is destroyed when it suspends before its first mount. The
cache must outlive the component — module scope, a parent, or a library.

**Building the cache key from an unstable value.** An options object or an
inline array as a key means a new entry every render. Key on primitives.

**Wrapping `use` in `try`/`catch`.** You get
`Suspense Exception: This is not a real error!`. Use an error boundary.

**No `<Suspense>` above the reader.** The suspension travels to the root and
takes the whole app's fallback with it.

**Never evicting.** Rejected promises replay forever and successful ones go
stale forever. Both are arguments for a real cache.

**Serializing something unserializable across the RSC boundary.** A promise for
a class instance, a function or a `Map` will not cross from a Server Component
to a Client Component.

## Related topics

- [use](../hooks/use.md) — the full API, including `use(Context)`.
- [Suspense](./suspense.md) — boundary placement, reveal order and transitions.
- [Error boundaries](../patterns/error-boundaries.md) — where rejections land.
- [Data libraries](./libraries.md) — the caches you should be using instead of
  the one above.
- [Caching](./caching.md) — `cache()` on the server and what a client cache owes
  you.
- [Server Components](../server-react/server-components.md) — the source of
  promises with no caching caveats.
