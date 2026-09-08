---
title: use
description: Read the value of a promise or a context during render, with the unique ability to be called conditionally.
group: hooks
order: 170
status: current
since: "19.0"
related: [hooks/use-context, data-fetching/use-with-promises, data-fetching/suspense, patterns/error-boundaries]
---

## Overview

`use` reads the value of a **resource** during render. React 19 supports two
kinds of resource:

```text
const value = use(promise);   // suspends until the promise resolves
const value = use(context);   // reads the nearest provider's value
```

`use` is an **API, not a Hook**. That distinction is not pedantry — it is the
reason `use` may be called inside an `if`, inside a loop, or after an early
return. It is the only documented exception to the
[rules of Hooks](./rules-of-hooks.md).

It still has one rule of its own: `use` must be called inside a component or a
Hook.

| | `use` | Hooks (`useState`, `useContext`, …) |
|---|---|---|
| Call inside `if` / loops | Yes | No |
| Call after an early return | Yes | No |
| Call in a plain function | No | No |
| Reads promises | Yes | No |

> [!NOTE]
> `use` was added in **React 19.0**. There is no React 18 equivalent for
> reading a promise during render.

## Why it exists

Two long-standing frictions motivated it.

**Context reads were positional.** `useContext` must run on every render, at the
top level, so a component that only needs a theme in one branch still paid for
it — or you split the component in two. `use(Context)` lets the read live where
the need lives.

**Reading async data during render had no primitive.** Before React 19, the only
supported way to consume a promise was to resolve it into state inside an
Effect, which means a render pass with no data, a second render pass with data,
and a hand-rolled loading flag every time. `use(promise)` lets a component read
the resolved value directly and delegates the loading UI to the nearest
[`<Suspense>`](../data-fetching/suspense.md) boundary and the failure UI to the
nearest [error boundary](../patterns/error-boundaries.md).

## When to use it

- A Server Component created a promise and passed it as a prop to a Client
  Component. This is the primary supported pattern.
- Your framework or data library hands you a **Suspense-enabled** resource —
  one that returns a stable, cached promise.
- You need a context value only in some branches, or after an early return.
- You want the loading state expressed as a boundary in the tree rather than as
  a boolean in every component.

## When not to use it

- **Do not create the promise during render in a Client Component.** A promise
  created inline is a new instance on every render, so React suspends again on
  every render and the fallback never goes away. See
  [use with promises](../data-fetching/use-with-promises.md) for the fix.
- Do not use it to read context in a Server Component — react.dev states that
  reading context with `use` is not supported in Server Components.
- Do not wrap it in `try`/`catch`. `use` throws internally to integrate with
  Suspense, so a `catch` intercepts a control-flow signal, not an error. Use an
  error boundary.
- Do not reach for `use(promise)` as a general data-fetching layer in a
  client-only app. You still need caching, deduplication and revalidation —
  read [the overview](../data-fetching/overview.md) first.

## Basic example

Reading context after an early return — impossible with `useContext`:

```jsx live
import { createContext, use, useState } from 'react';

const ThemeContext = createContext('light');

function SectionDivider({ visible }) {
  if (!visible) {
    return null;
  }
  // `use` runs after an early return. `useContext` could not.
  const theme = use(ThemeContext);
  return (
    <hr
      style={{
        border: 0,
        height: 2,
        background: theme === 'dark' ? '#475569' : '#cbd5e1',
      }}
    />
  );
}

export default function ThemedPanel() {
  const [theme, setTheme] = useState('dark');
  const [visible, setVisible] = useState(true);

  return (
    <ThemeContext value={theme}>
      <button onClick={() => setVisible(v => !v)}>
        {visible ? 'Hide' : 'Show'} divider
      </button>{' '}
      <button onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>
        Switch to {theme === 'dark' ? 'light' : 'dark'}
      </button>
      <SectionDivider visible={visible} />
      <p>The divider color follows the {theme} theme.</p>
    </ThemeContext>
  );
}
```

Note `<ThemeContext value={theme}>`. Since React 19 the context object renders
as its own provider.

> [!DEPRECATED]
> `<ThemeContext.Provider value={theme}>` still works in React 19 but is
> deprecated as of **19.0**. Render `<ThemeContext value={theme}>` instead.
> `npx codemod@latest react/19/migration-recipe` performs the change.

## How it works

**`use(context)`** walks up from the calling component to find the closest
matching provider. It does not consider a provider rendered by the same
component — the search starts above you. With no provider anywhere, you get the
`defaultValue` passed to `createContext`.

**`use(promise)`** inspects the promise React already knows about:

- Pending → the component suspends. React shows the nearest `<Suspense>`
  fallback and retries the render when the promise settles.
- Fulfilled → the value is returned synchronously, with no extra render pass.
- Rejected → the rejection propagates to the nearest error boundary.

The retry is a **full re-render of the suspended subtree from scratch**. React
does not preserve state for a tree that suspended before it ever mounted. This
is why the promise identity matters so much: on the retry render, `use` must
receive the *same* promise instance, or React sees a new pending promise and
suspends again.

React reveals suspended content at most once every 300ms, measured from the
last reveal, so boundaries that become ready close together are revealed
together.

> [!WARNING]
> Promises passed to `use` must be cached so the same promise instance is reused
> across re-renders. If a new promise is created directly in render, React
> displays the Suspense fallback on every re-render.

### Interaction with StrictMode

StrictMode double-invokes render. A cached promise survives that unharmed — the
second render reads the same instance. A promise created in render does not,
which is one reason StrictMode surfaces the bug early. Treat a fallback that
flickers forever in development as a caching bug, not a StrictMode bug.

### Interaction with concurrent rendering

Because suspending is a render-time signal, `use` composes with transitions. If
an update wrapped in `startTransition` causes a component to suspend, React
keeps the previous UI on screen instead of replacing it with a fallback. See
[Suspense](../data-fetching/suspense.md#common-patterns).

## Common patterns

### A promise created on the server, read on the client

This is the pattern react.dev leads with, and the one with no caching caveats:
the Server Component starts the request, streams the promise across, and the
Client Component reads it.

```jsx static="Server Components require a framework with an RSC bundler."
// app/page.js — Server Component
import { Suspense } from 'react';
import { fetchNotifications } from './lib/notifications.js';
import NotificationList from './NotificationList.js';

export default function InboxPage() {
  // Not awaited here: the promise is passed down and streamed.
  const notificationsPromise = fetchNotifications();

  return (
    <Suspense fallback={<p>Loading notifications…</p>}>
      <NotificationList notificationsPromise={notificationsPromise} />
    </Suspense>
  );
}
```

```jsx static="Client Component paired with the Server Component above."
'use client';

import { use } from 'react';

export default function NotificationList({ notificationsPromise }) {
  const notifications = use(notificationsPromise);

  return (
    <ul>
      {notifications.map(notification => (
        <li key={notification.id}>{notification.summary}</li>
      ))}
    </ul>
  );
}
```

The values that cross the boundary must be serializable.

### A module-level cache in a client-only app

Without a framework, you supply the stable identity yourself.

```jsx live
import { Suspense, use, useState } from 'react';

const profileCache = new Map();

// Stands in for a network call so this example stays self-contained.
function loadProfile(userId) {
  if (!profileCache.has(userId)) {
    profileCache.set(
      userId,
      new Promise(resolve => {
        setTimeout(
          () => resolve({ id: userId, name: `Engineer #${userId}` }),
          600
        );
      })
    );
  }
  return profileCache.get(userId);
}

function ProfileCard({ userId }) {
  const profile = use(loadProfile(userId));
  return (
    <p>
      <strong>{profile.name}</strong> (id {profile.id})
    </p>
  );
}

export default function ProfileViewer() {
  const [userId, setUserId] = useState(1);

  return (
    <div>
      <button onClick={() => setUserId(id => id + 1)}>Next engineer</button>
      <Suspense fallback={<p>Loading profile…</p>}>
        <ProfileCard userId={userId} />
      </Suspense>
    </div>
  );
}
```

Go back to engineer #1 and the card appears with no fallback: the promise is
already fulfilled, so `use` returns synchronously.

> [!WARNING]
> This cache never evicts, never revalidates and never dedupes concurrent
> mutations. It is correct for a documentation example and wrong for an
> application. Use a real cache — see
> [data libraries](../data-fetching/libraries.md).

## Advanced example

Typed, with the promise supplied by the parent rather than created in render:

```tsx
import { Suspense, use } from 'react';

type Invoice = {
  id: string;
  customer: string;
  amountCents: number;
};

function InvoiceRows({ invoicesPromise }: { invoicesPromise: Promise<Invoice[]> }) {
  const invoices = use(invoicesPromise);

  return (
    <tbody>
      {invoices.map(invoice => (
        <tr key={invoice.id}>
          <td>{invoice.customer}</td>
          <td>{(invoice.amountCents / 100).toFixed(2)}</td>
        </tr>
      ))}
    </tbody>
  );
}

export function InvoiceTable({ invoicesPromise }: { invoicesPromise: Promise<Invoice[]> }) {
  return (
    <table>
      <Suspense fallback={<tbody><tr><td>Loading invoices…</td></tr></tbody>}>
        <InvoiceRows invoicesPromise={invoicesPromise} />
      </Suspense>
    </table>
  );
}
```

`use` narrows `Promise<Invoice[]>` to `Invoice[]` with no cast and no
`data === undefined` branch. The absence of that branch is the ergonomic win.

## Common mistakes

**Creating the promise in render.**

```jsx nocheck="Broken on purpose — shows the fallback forever."
function Dashboard({ userId }) {
  // 🔴 A new promise on every render. React suspends forever.
  const stats = use(fetch(`/api/stats/${userId}`).then(r => r.json()));
  return <Chart data={stats} />;
}
```

Pass the promise in from a Server Component, or return it from a cache that
returns the same instance for the same key.

**Wrapping `use` in `try`/`catch`.** You will see
`Suspense Exception: This is not a real error!`. Wrap the component in an error
boundary instead.

**Skipping `use` when the promise looks settled.** Never read `promise.status`
or `promise.value` yourself to bypass the call. You may call `use` conditionally
based on props or state; you must not decide whether to call it based on the
promise's own state. Bypassing it breaks React's Suspense bookkeeping and
DevTools integration.

**No `<Suspense>` boundary above the component.** With nothing to catch the
suspension, the suspension bubbles to the root and the whole app shows the root
fallback — or nothing at all.

**Expecting `use(Context)` to see a provider you render yourself.** The lookup
starts *above* the calling component. Render the provider in a parent.

**Calling `use` outside a component or Hook.** A utility function is not a
render scope; `use` will not work there.

## Related topics

- [use with promises](../data-fetching/use-with-promises.md) — where the promise
  may legitimately come from, and how to preload it.
- [Suspense](../data-fetching/suspense.md) — the boundary that renders the
  fallback while `use` is pending.
- [useContext](./use-context.md) — the top-level-only way to read context, still
  correct when the read is unconditional.
- [Error boundaries](../patterns/error-boundaries.md) — where a rejected promise
  lands.
- [Rules of Hooks](./rules-of-hooks.md) — why `use` is the exception.
