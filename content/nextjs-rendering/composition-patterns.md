---
title: Composition Patterns
description: Combine Server and Client Components in the App Router with slots, deep providers, Server Actions as props and cached wrappers.
group: nextjs-rendering
order: 30
status: current
related: [patterns/composition, nextjs-rendering/client-components, nextjs-rendering/server-components, nextjs-mutations/server-actions]
---

## Overview

A Client Component cannot import a Server Component. It can still **display**
one, if a Server Component renders it and passes the result in as `children` or
another prop. That rule, plus the fact that Server Actions cross the boundary as
references, is enough to build almost any layout without moving data access to
the client.

This page collects the patterns that follow from it in a Next.js app. The
underlying React technique, slots and `children`, is explained in
[Composition](../patterns/composition.md). The boundary rules are on
[Client Components in Next.js](./client-components.md).

## Why it exists

Interactive UI often wraps content that should stay on the server: a modal
around a cart, a collapsible sidebar around navigation built from the database,
tabs around server-rendered panels. The naive fix is to add `"use client"` to
the wrapper and import everything else into it. Now the cart query, the
navigation query and every formatting library ship to the browser, or stop
working.

Composition keeps each piece in the environment it belongs to. The Client
Component owns the state. The Server Component owns the data. Neither imports
the other's code.

## When to use it

- A Client Component needs to show server-rendered content (modals, drawers,
  tabs, accordions, carousels of server-rendered cards).
- A provider must wrap part of the tree but should not turn that part into
  client code.
- A Client Component needs to trigger a server mutation.
- A cached server wrapper must contain dynamic or per-user content.

## When not to use it

If the child content depends on the Client Component's state (for example, a
list filtered by what the user types), the server cannot pre-render it for
every possible state. Either render that part on the client from data passed as
props, or re-render on the server by putting the state in the URL.

Do not build deep chains of slots to avoid one small Client Component. If a leaf
only needs a `useState`, make the leaf a Client Component.

## Basic example

A Client Component with a slot. `Modal` holds open/closed state and does not
know what it contains.

```tsx file="app/ui/modal.tsx"
'use client';

import { useState, type ReactNode } from 'react';

export function Modal({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        View cart
      </button>
      {open && (
        <div role="dialog" aria-modal="true">
          <header>
            {title}
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          {children}
        </div>
      )}
    </>
  );
}
```

A Server Component fills both slots. `Cart` is an async Server Component that
reads the database.

```tsx file="app/checkout/page.tsx"
import { Suspense } from 'react';
import { Modal } from '@/app/ui/modal';
import { Cart } from '@/app/ui/cart';

export default function CheckoutPage() {
  return (
    <main>
      <h1>Checkout</h1>
      <Modal title={<h2>Your cart</h2>}>
        <Suspense fallback={<p>Loading cart…</p>}>
          <Cart />
        </Suspense>
      </Modal>
    </main>
  );
}
```

`CheckoutPage` is the **owner** of `Cart`: its source contains the `<Cart />`
JSX, so `Cart` renders on the server. `Modal` is only the **parent**. It
receives `Cart`'s output and decides where to place it, but never has its code.

## How it works

### Owner decides the environment, parent decides the position

React separates who creates an element (the owner) from where it ends up in the
tree (the parent). In the App Router, the owner's environment is what matters.
An element written in a Server Component renders on the server, even when its
parent is a Client Component.

The RSC Payload then contains `Cart`'s rendered result inside a placeholder for
`Modal`. The browser downloads `Modal`'s JavaScript and nothing for `Cart`.

### Slots render even when hidden

`Cart` renders on the server whether or not the modal is open, because the
server does not know the client state. That is usually what you want (opening
is instant), but it means expensive slot content costs server time on every
render. Wrap it in `<Suspense>` so it streams instead of blocking the page, as
the example does.

### Server Actions cross as references

A function defined with `"use server"` is not sent as code. The Client Component
receives a reference it can call, and Next.js turns the call into a POST request
to the server. That is why a Server Component may pass an action as a prop when
it may not pass an ordinary callback.

## Server and client implications

- **Only rendered output crosses in slots.** The Client Component can place
  `children` but cannot read its props or inspect it meaningfully. Treat slots
  as opaque.
- **Client state does not flow into server slots.** When the user changes
  something that should change server content, update the URL (for example,
  `searchParams`) or call a Server Action that revalidates, and let the server
  render again.
- **Closures in inline actions are sent to the client, encrypted.** An action
  defined inside a component captures variables from its scope. Next.js
  encrypts the captured values with a key generated per build, and they
  round-trip through the browser. Do not rely on that encryption to protect
  secrets. Read sensitive values inside the action instead of capturing them.

## Caching implications

`"use cache"` components can receive `children` and Server Actions as
**pass-through** values, as long as the cached function does not read or call
them. The cached entry stores the wrapper and leaves the slot open, so the
content inside can still be dynamic or per-user.

```tsx file="app/ui/recipe-shell.tsx"
import type { ReactNode } from 'react';
import { cacheLife } from 'next/cache';
import { getSiteNavigation } from '@/lib/navigation';

export async function RecipeShell({ children }: { children: ReactNode }) {
  'use cache';
  cacheLife('days');

  const navigation = await getSiteNavigation();

  return (
    <div className="recipe-shell">
      <nav aria-label="Recipe categories">
        {navigation.map((item: { href: string; label: string }) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      {children}
    </div>
  );
}
```

`children` is not part of the cache key and is not stored in the entry. Put the
per-request parts there. How cache keys are formed is covered in
[`use cache`](../nextjs-data-caching/use-cache.md).

## Common patterns

### Keep providers deep

A provider has to be a Client Component, but its `children` are not. Render it
around the smallest subtree that consumes the context.

```tsx file="app/checkout/layout.tsx"
import type { ReactNode } from 'react';
import { CheckoutProvider } from './checkout-provider';

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <section className="checkout">
      <CheckoutProvider>{children}</CheckoutProvider>
    </section>
  );
}
```

Here only `/checkout` pays for the provider, and the root layout stays free of
client code. A provider around `<html>` in the root layout would mean every
route in the app mounts it.

### Pass a Server Action to a Client Component

Define actions in a `"use server"` module. Check who is calling inside the
action: it is a public endpoint, whoever renders the button.

```ts file="app/recipes/[slug]/actions.ts"
'use server';

import { verifySession } from '@/lib/session';
import { db } from '@/lib/db';

export async function toggleSavedRecipe(recipeId: string): Promise<{ saved: boolean }> {
  const session = await verifySession();

  const existing = await db.savedRecipe.findUnique({
    where: { userId_recipeId: { userId: session.userId, recipeId } },
  });

  if (existing) {
    await db.savedRecipe.delete({ where: { id: existing.id } });
    return { saved: false };
  }

  await db.savedRecipe.create({ data: { userId: session.userId, recipeId } });
  return { saved: true };
}
```

A Client Component can import the action directly, as the save button on
[Client Components in Next.js](./client-components.md) does. Or a Server
Component can pass it as a prop, which lets a generic Client Component work
with different actions:

```tsx file="app/ui/confirm-button.tsx"
'use client';

import { useTransition } from 'react';

export function ConfirmButton({
  label,
  confirmAction,
}: {
  label: string;
  confirmAction: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (window.confirm(`${label}?`)) {
          startTransition(() => confirmAction());
        }
      }}
    >
      {isPending ? 'Working…' : label}
    </button>
  );
}
```

The prop name ends in `Action`, which the Next.js TypeScript plugin accepts for a
function prop on a Client Component. Validation, authorization and revalidation
belong in the action. See [Server Actions](../nextjs-mutations/server-actions.md).

### Pass a promise, resolve it on the client

A Server Component can start a query without awaiting it and pass the promise
to a Client Component that reads it with `use`. The request starts during the
server render, and the Client Component still controls its own loading UI
through the nearest `<Suspense>`. The React side of this is on
[use with promises](../data-fetching/use-with-promises.md).

### Export compound component parts by name

`Tabs.Panel` as a static property does not survive the boundary: a Server
Component receives a client reference for `Tabs`, and `Tabs.Panel` is
`undefined`. Export `Tabs`, `TabList` and `TabPanel` as separate named exports
from the `"use client"` module, and compose them in the Server Component.

## Common mistakes

**Importing a Server Component into a Client Component.** It either fails to
build or turns the imported component into client code, depending on what it
uses. Pass it in as `children` from a Server Component instead.

**Reading `children` inside a cached component.** Pass-through only works while
the cached function does not introspect the value. Mapping over, cloning or
inspecting a slot inside `"use cache"` breaks that contract. Place it in the
output and do nothing else with it.

**Wrapping the whole document in providers.** Every route mounts every provider,
and more of the tree is tied to client code than needs to be. Move providers to
the layout of the segment that uses them.

**Capturing secrets in inline Server Actions.** Captured variables travel to the
browser, encrypted. Read the secret inside the action body.

**Skipping authorization because only an admin page renders the button.** The
action is callable by anyone who can send a POST request. Check the session in
the action.

**Expecting a slot to update when client state changes.** Server-rendered
`children` only change when the server renders again. Put that state in the URL,
or call an action that revalidates.

## Related topics

- [Composition](../patterns/composition.md): the React technique behind slots
  and `children`.
- [Client Components in Next.js](./client-components.md): where the boundary
  goes and what crosses it.
- [Server Actions](../nextjs-mutations/server-actions.md): defining, securing
  and revalidating the actions you pass down.
- [`use cache`](../nextjs-data-caching/use-cache.md): cache keys and pass-through
  arguments.
- [use with promises](../data-fetching/use-with-promises.md): streaming a
  server-started promise into a Client Component.
