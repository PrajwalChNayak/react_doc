---
title: Intercepting Routes
description: Show another route inside the current layout on client-side navigation, with (.), (..), (..)(..) and (...) folders, and build URL-addressable modals.
group: nextjs-routing
order: 70
status: current
related: [nextjs-routing/parallel-routes, nextjs-routing/linking-and-navigation, patterns/portals, accessibility/focus-management]
---

## Overview

An intercepting route renders a different route's content **in the current
layout**, while the address bar shows the intercepted URL. The classic case: on a
photo feed, clicking a photo opens `/photos/42` in a modal over the feed. Refresh,
or open the link in a new tab, and `/photos/42` renders as a normal full page.

You create one by prefixing a folder with a relative matcher:

| Folder prefix | Intercepts a segment… | Like the path |
|---|---|---|
| `(.)photos` | on the **same level** | `./photos` |
| `(..)photos` | **one level above** | `../photos` |
| `(..)(..)photos` | **two levels above** | `../../photos` |
| `(...)photos` | from the **root** `app` directory | `/photos` |

Interception only happens on **client-side (soft) navigation**, such as a `<Link>`
click or `router.push()`. A full page load always renders the real route.

## Why it exists

A modal with no URL cannot be shared, bookmarked, or restored after a refresh,
and the browser Back button closes the whole page instead of the modal. A
dedicated page loses the context the user was browsing.

Intercepting routes give you both. The detail view has one canonical URL. Users
who arrive through the list see it layered over the list. Users who arrive
through a link see the full page. Back and Forward open and close the modal,
because they are ordinary history entries.

## When to use it

- **Photo or product quick views** over a grid, where the detail also needs a
  real page for sharing and search engines.
- **Login or sign-up dialogs** opened from a header, with a real `/login` page
  for direct visits.
- **Side panels**, such as a cart drawer, whose content is also reachable
  directly.

## When not to use it

**Do not intercept a confirmation dialog.** "Delete this invoice?" has no URL
worth sharing. Use component state.

**Do not intercept when the two views should behave the same.** If the modal and
the page are identical, a link to the page is simpler.

**Do not use it for content that must never render as a full page.** The
intercepted route always has a real page behind it for hard navigations.

## Basic example

A lookbook where each look opens in a modal from the grid. Intercepting routes
almost always pair with a [parallel route](./parallel-routes.md) slot, so the
modal renders alongside the grid instead of replacing it.

```text
app/lookbook/
├── layout.tsx                  ← renders children and the @modal slot
├── page.tsx                    ← /lookbook (the grid)
├── looks/
│   └── [lookId]/
│       └── page.tsx            ← /lookbook/looks/7 as a full page
└── @modal/
    ├── default.tsx             ← null: no modal on a hard load
    ├── [...rest]/
    │   └── page.tsx            ← null: closes the modal on other soft navigations
    └── (.)looks/
        └── [lookId]/
            └── page.tsx        ← /lookbook/looks/7 as a modal
```

```tsx file="app/lookbook/layout.tsx"
export default function LookbookLayout({ children, modal }: LayoutProps<'/lookbook'>) {
  return (
    <>
      {children}
      {modal}
    </>
  )
}
```

```tsx file="app/lookbook/page.tsx"
import Link from 'next/link'

const looks = [
  { id: '1', title: 'Linen weekend' },
  { id: '2', title: 'Rainy commute' },
  { id: '3', title: 'Evening layers' },
]

export default function LookbookPage() {
  return (
    <ul className="grid">
      {looks.map((look) => (
        <li key={look.id}>
          <Link href={`/lookbook/looks/${look.id}`}>{look.title}</Link>
        </li>
      ))}
    </ul>
  )
}
```

```tsx file="app/lookbook/looks/[lookId]/page.tsx"
import { getLook } from '@/lib/looks'
import { notFound } from 'next/navigation'

export default async function LookPage({ params }: PageProps<'/lookbook/looks/[lookId]'>) {
  const { lookId } = await params
  const look = await getLook(lookId)
  if (!look) notFound()

  return (
    <article>
      <h1>{look.title}</h1>
      <p>{look.description}</p>
    </article>
  )
}
```

```tsx file="app/lookbook/@modal/(.)looks/[lookId]/page.tsx"
import { getLook } from '@/lib/looks'
import { notFound } from 'next/navigation'
import { Modal } from '@/app/ui/modal'

export default async function LookModal({ params }: PageProps<'/lookbook/looks/[lookId]'>) {
  const { lookId } = await params
  const look = await getLook(lookId)
  if (!look) notFound()

  return (
    <Modal title={look.title}>
      <p>{look.description}</p>
    </Modal>
  )
}
```

```tsx file="app/lookbook/@modal/default.tsx"
export default function ModalDefault() {
  return null
}
```

```tsx file="app/lookbook/@modal/[...rest]/page.tsx"
export default function ModalClosed() {
  return null
}
```

The modal wrapper is a Client Component, because closing it uses the router:

```tsx file="app/ui/modal.tsx"
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'

export function Modal({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    // showModal() makes the rest of the page inert; Escape fires "cancel".
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault()
        router.back()
      }}
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button type="button" onClick={() => router.back()}>
        Close
      </button>
    </dialog>
  )
}
```

`router.back()` removes the intercepted history entry, so the grid's URL returns
and the slot goes back to what it showed before.

## How it works

### Soft versus hard navigation

| How the user reaches `/lookbook/looks/2` | What renders |
|---|---|
| Clicks a `<Link>` on `/lookbook` | Grid stays; `@modal/(.)looks/[lookId]` renders in the slot |
| Refreshes, or opens a shared link | `looks/[lookId]/page.tsx` as a full page; `@modal` renders `default.tsx` |
| Presses Back after opening the modal | Grid URL; modal closes |
| Presses Forward again | Modal reopens |

### Matchers count route segments, not folders

The `(.)` and `(..)` prefixes are relative to **route segments**. Slot folders
(`@modal`) and route groups (`(shop)`) are not segments, so they do not count.
That is why the example uses `(.)looks`: `@modal` is a slot inside `lookbook`, so
`looks` is on the same level, even though it is two folders up in the file tree.

An intercept of a sibling section uses `(..)`:

```text
app/
├── feed/
│   ├── layout.tsx
│   ├── page.tsx                 ← /feed
│   └── @modal/
│       ├── default.tsx
│       └── (..)photos/[id]/
│           └── page.tsx         ← intercepts /photos/[id] from /feed
└── photos/[id]/
    └── page.tsx                 ← /photos/[id]
```

`feed` and `photos` are siblings under the root, so from inside `feed` the match
is one level up.

### Closing the modal with a link

Slots keep their previous content when a soft navigation has no match for them.
If the user clicks a `<Link>` from inside the modal to another page, the modal
would stay open. The `@modal/[...rest]/page.tsx` catch-all returning `null` gives
the slot a match everywhere else below `/lookbook`, which clears it. Add an
`@modal/page.tsx` that returns `null` if links can go to `/lookbook` itself.

## Server and client implications

Both the intercepting page and the real page are Server Components that fetch
their own data. Share the loader (here `getLook`) so they cannot drift. Only the
modal chrome needs `"use client"`. Because the modal receives server-rendered
`children`, forms and content inside it can stay on the server.

## Common patterns

### Accessible modals

Use the native `<dialog>` with `showModal()` where you can, as in the example. It
moves focus into the dialog, handles `Escape`, and makes the background inert
without extra code. When the modal closes, return focus to the link that opened it. See
[focus management](../accessibility/focus-management.md) and
[portals](../patterns/portals.md) for the React side.

### A runnable version

The [routing example app](../../examples/nextjs/routing/README.md) implements a
photo modal under `app/[lang]/@modal/(.)photos/[id]`, including the `null` page
and catch-all that close it.

## Common mistakes

**Testing with a refresh.** Interception only happens on soft navigation. Click a
`<Link>` to see the modal; refresh to see the page.

**Counting `@slot` or `(group)` folders in the matcher.** `(..)` is relative to
route segments. A slot folder does not add a level.

**No `default.tsx` in the modal slot.** The build fails since Next.js 16.0, and
the slot has nothing to render on a hard load anyway.

**Closing the modal with `router.push('/lookbook')`.** It adds a history entry, so
Back reopens the modal. Use `router.back()`, or give the slot a `null` page at the
destination.

**Letting the modal and page fetch data differently.** Users see different
content depending on how they arrived. Share one loader.

**Using an intercepting route without a real page behind it.** A shared link then
404s.

## Related topics

- [Parallel routes](./parallel-routes.md): the `@modal` slot and why it needs
  `default.tsx`.
- [Linking and navigation](./linking-and-navigation.md): soft navigation with
  `<Link>` and `useRouter`, which is what triggers interception.
- [File conventions](./file-conventions.md): the other special files a slot can
  contain.
- [Portals](../patterns/portals.md): rendering overlay content outside the normal
  DOM flow in React.
- [Focus management](../accessibility/focus-management.md): moving and restoring
  focus when a modal opens and closes.
