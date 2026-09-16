---
title: Linking and Navigation
description: Navigate with next/link and useRouter, read the URL with usePathname, useSearchParams and useParams, and control scrolling and view transitions.
group: nextjs-routing
order: 80
status: current
related: [nextjs-instant-navigations/link-prefetching, nextjs-routing/redirects, hooks/use-transition, ecosystem/routing]
---

## Overview

Next.js gives you one component and four hooks for moving around an App Router
app:

| API | From | Use it to |
|---|---|---|
| `<Link>` | `next/link` | Navigate when the user clicks. The default choice. |
| `useRouter()` | `next/navigation` | Navigate from code: after an event, a timer, or a keyboard shortcut |
| `usePathname()` | `next/navigation` | Read the current path in a Client Component |
| `useSearchParams()` | `next/navigation` | Read the current query string in a Client Component |
| `useParams()` | `next/navigation` | Read the current dynamic segment values in a Client Component |

`<Link>` renders a real `<a>` element, so it works before JavaScript loads, opens
in a new tab with a modifier key, and is announced as a link. After hydration it
turns clicks into client-side navigations.

> [!WARNING]
> Import `useRouter` from `next/navigation`. The `next/router` version belongs to
> the Pages Router and does not work in `app/`.

## Why it exists

A plain `<a href>` in a server-rendered app throws away the page on every click:
the browser downloads a new document, re-runs every script, and resets scroll and
state. That is the correct fallback, and a poor default.

A **client-side navigation** keeps the shared layouts mounted, fetches only the
new segments from the server, and swaps them in. Next.js adds **prefetching**, so
by the time the user clicks, the next route is often already on the client. Each
navigation runs inside a React transition, so the current page stays interactive
while the next one loads. See [useTransition](../hooks/use-transition.md) for the
underlying model.

## When to use it

- Use `<Link>` for anything the user clicks to go somewhere: navigation menus,
  cards, breadcrumbs, pagination.
- Use `router.push()` or `router.replace()` when navigation follows logic rather
  than a click on a link: after a client-side validation step, from a command
  palette, or on a keyboard shortcut.
- Use `router.refresh()` to re-render the current route's Server Components with
  fresh data, without losing client state.
- Use the read hooks in Client Components that must react to the URL, such as an
  active-link style or a search box.

## When not to use it

**Do not use `router.push` for a normal link.** You lose the `<a>` element:
no prefetching, no open in new tab, no right-click menu, and worse accessibility.

**Do not use `useSearchParams` in a page to load data.** Server Component pages
receive the `searchParams` prop. Fetch there, on the server.

**Do not navigate after a Server Action with `router.push`.** Call `redirect()`
inside the action instead, so it also works without JavaScript. See
[redirects](./redirects.md).

**Do not use `<Link>` for external sites.** A plain `<a>` is fine, and nothing
about the destination can be prefetched.

## Basic example

```tsx file="app/ui/site-header.tsx"
import Link from 'next/link'

export function SiteHeader() {
  return (
    <header>
      <Link href="/">Acme</Link>
      <nav aria-label="Main">
        <Link href="/pricing">Pricing</Link>
        <Link href="/blog">Blog</Link>
        <Link href={{ pathname: '/search', query: { q: 'invoices' } }}>Search invoices</Link>
      </nav>
    </header>
  )
}
```

`<Link>` works in Server Components. Only components that call the hooks need
`"use client"`.

## How it works

### Link props

| Prop | Default | What it does |
|---|---|---|
| `href` | required | A path string or a URL object (`{ pathname, query }`) |
| `replace` | `false` | Replace the current history entry instead of pushing a new one |
| `scroll` | `true` | Manage scroll position on navigation (see below) |
| `prefetch` | `"auto"` / `null` | Control prefetching (see below) |
| `onNavigate` | none | Runs on client-side navigation only; call `event.preventDefault()` to cancel |
| `transitionTypes` | none | Tag the navigation for view transitions (React Canary, see below) |

Other `<a>` attributes such as `className`, `target`, `rel` and `aria-*` pass
through to the rendered element.

### Prefetching, briefly

In production, `<Link>` prefetches its route when it enters the viewport or is
hovered.

- **`"auto"` or `null` (default):** static routes are prefetched in full. Dynamic
  routes are prefetched down to the nearest `loading.tsx`, so the loading state can
  show instantly.
- **`true`:** prefetch the full route, static or dynamic.
- **`false`:** never prefetch, on viewport entry or on hover.

Prefetching does not run in `next dev`. What exactly is prefetched changes when
you opt into Partial Prefetching. The details, costs, and tuning are in
[link prefetching](../nextjs-instant-navigations/link-prefetching.md).

### Navigating from code

```tsx file="app/ui/command-palette.tsx"
'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function GoToShortcuts() {
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey) return
      if (event.key === 'i') router.push('/invoices')
      if (event.key === 's') router.push('/settings', { scroll: false })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router])

  return null
}
```

| Method | Effect |
|---|---|
| `router.push(href, options?)` | Navigate and add a history entry |
| `router.replace(href, options?)` | Navigate without adding a history entry |
| `router.refresh()` | Re-render the current route on the server and merge the result, keeping client state and scroll position. It does not invalidate server-side caches. |
| `router.prefetch(href)` | Prefetch a route you expect the user to visit |
| `router.back()` / `router.forward()` | Move through browser history |

`push` and `replace` accept `{ scroll: boolean }`, plus the React Canary
`transitionTypes` option described in
[view transition types](#view-transition-types).

### Reading the URL in Client Components

```tsx file="app/invoices/status-filter.tsx"
'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const statuses = ['all', 'open', 'paid', 'overdue'] as const

export function StatusFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('status') ?? 'all'

  function selectStatus(status: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (status === 'all') next.delete('status')
    else next.set('status', status)
    const query = next.toString()
    // replace: filter changes should not fill the Back button history.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <select value={current} onChange={(event) => selectStatus(event.target.value)}>
      {statuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  )
}
```

`useSearchParams()` returns a **read-only** `URLSearchParams`. Copy it before
changing values, as above.

The page reads the same value from its `searchParams` prop and fetches on the
server, so the filter is shareable and survives a refresh:

```tsx file="app/invoices/page.tsx"
import { Suspense } from 'react'
import { StatusFilter } from './status-filter'

export default async function InvoicesPage({ searchParams }: PageProps<'/invoices'>) {
  const { status } = await searchParams
  return (
    <>
      <Suspense fallback={<select disabled aria-label="Loading filter" />}>
        <StatusFilter />
      </Suspense>
      <p>Showing {typeof status === 'string' ? status : 'all'} invoices</p>
    </>
  )
}
```

> [!NOTE]
> On a prerendered route, a Client Component that calls `useSearchParams` renders
> on the client up to the nearest `<Suspense>` boundary. Wrap it in one, as above.
> Without a boundary, `next build` fails for a static page, although `next dev`
> appears to work.

`useParams()` returns the dynamic segment values for the current URL, such as
`{ slug: 'hello-world' }`. See [dynamic segments](./dynamic-segments.md).

The native `window.history.pushState` and `replaceState` also work. Next.js syncs
them with `usePathname` and `useSearchParams`, which is handy for URL updates that
should not trigger a server round trip, such as a client-side sort.

### Scrolling

On navigation to a new page, Next.js keeps the scroll position if the new page is
visible in the viewport. Otherwise it scrolls to the top of the new page's first
element. Pass `scroll={false}` to `<Link>`, or `{ scroll: false }` to
`push`/`replace`, to leave the scroll position alone.

A hash link (`href="/docs#install"`) scrolls to the element with that `id`. With a
sticky header, content can land behind it. Offset it with CSS:

```css file="app/globals.css"
html {
  scroll-padding-top: 4rem; /* the height of the sticky header */
}
```

> [!NOTE]
> **Changed in 16.0.** If your CSS sets `scroll-behavior: smooth` on `<html>`,
> Next.js no longer switches it to `auto` during route navigations, so page
> changes animate the scroll too. To get the previous behavior back (smooth for
> in-page anchors, instant for navigations), opt in with
> `data-scroll-behavior="smooth"` on the `<html>` element.

```tsx file="app/layout.tsx"
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
```

### Pending feedback

When a navigation cannot finish instantly (prefetching was disabled or not done
yet, and the destination has no `loading.tsx`), `useLinkStatus` from `next/link`
reports whether the enclosing link is pending. It must be called from a component
rendered inside a `<Link>`.

```tsx file="app/ui/nav-item.tsx"
'use client'

import Link, { useLinkStatus } from 'next/link'

function PendingDot() {
  const { pending } = useLinkStatus()
  return <span aria-hidden="true" className={pending ? 'dot dot-pending' : 'dot'} />
}

export function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}>
      {label} <PendingDot />
    </Link>
  )
}
```

Prefer a `loading.tsx` for the destination. `useLinkStatus` is for small inline
hints.

### View transition types

> [!NOTE]
> **React Canary.** `transitionTypes` (added in Next.js **16.2**, App Router only)
> passes its values to React's `addTransitionType` inside the navigation, so
> `<ViewTransition>` can animate differently per navigation. `<ViewTransition>`
> and `addTransitionType` come from the **React Canary build the App Router
> ships**. They are stable in React 19.3 and **not available in React 19.2**,
> which the React sections of this site document. See
> [React Canary in Next.js](../nextjs-rendering/react-canary.md).

```tsx file="app/journal/page.tsx" canary
import Link from 'next/link'
import { ViewTransition } from 'react'

const entries = [
  { slug: 'first-light', title: 'First light' },
  { slug: 'harbor-walk', title: 'Harbor walk' },
]

export default function JournalPage() {
  return (
    <ViewTransition
      enter={{ 'nav-forward': 'slide-in', 'nav-back': 'slide-back', default: 'none' }}
      exit={{ 'nav-forward': 'slide-out', 'nav-back': 'slide-away', default: 'none' }}
      default="none"
    >
      <ul>
        {entries.map((entry) => (
          <li key={entry.slug}>
            <Link href={`/journal/${entry.slug}`} transitionTypes={['nav-forward']}>
              {entry.title}
            </Link>
          </li>
        ))}
      </ul>
    </ViewTransition>
  )
}
```

The type names are yours. The strings on the right are CSS class names you style
with `::view-transition-old(.slide-out)` and related selectors. Put the wrapper in
each `page.tsx`, not in a layout: layouts persist across navigation, so their
enter and exit animations never fire.

## Server and client implications

`<Link>` is usable from Server Components. `useRouter`, `usePathname`,
`useSearchParams`, `useParams` and `useLinkStatus` are hooks and require a Client
Component. Keep those components small and pass server-rendered content into them
as `children`.

Layouts do not re-render on navigation, so a Server Component layout never sees a
new pathname. Anything that tracks the current URL, like an active-link highlight,
belongs in a Client Component. See [pages and layouts](./pages-and-layouts.md).

## Security considerations

Never pass an unvalidated URL to `router.push` or `router.replace`. A
`javascript:` URL runs in the context of your page, which makes a `?next=` query
parameter an XSS vector as well as an open redirect. Allow only relative paths you
expect. See [open redirects](../nextjs-security/open-redirects.md).

## Common mistakes

**Importing `useRouter` from `next/router`.** That is the Pages Router hook. Use
`next/navigation`.

**Using `router.push` where a `<Link>` belongs.** You lose prefetching, new-tab
behavior and link semantics.

**Mutating the object from `useSearchParams`.** It is read-only. Copy it with
`new URLSearchParams(searchParams.toString())`.

**`useSearchParams` without a Suspense boundary on a static page.** The production
build fails even though `next dev` works.

**Judging prefetching in development.** Prefetching only runs in production
builds.

**Expecting `router.refresh()` to clear cached server data.** It re-renders the
route, but cached entries stay cached. Revalidate them on the server.

**Relying on global `scroll-behavior: smooth` for instant page changes.** Since
16.0, add `data-scroll-behavior="smooth"` to `<html>` if navigations should jump
while anchors animate.

## Related topics

- [Link prefetching](../nextjs-instant-navigations/link-prefetching.md): what is
  prefetched, when, and how to tune it.
- [Redirects](./redirects.md): server-side `redirect()`, config redirects, and
  proxy redirects.
- [Intercepting routes](./intercepting-routes.md): what a soft navigation can
  render differently from a full page load.
- [useTransition](../hooks/use-transition.md): the React transition every
  navigation runs in.
- [Routing in the React ecosystem](../ecosystem/routing.md): how framework routing
  compares with React Router and TanStack Router.
- [React Canary in Next.js](../nextjs-rendering/react-canary.md): why
  `transitionTypes` and `<ViewTransition>` work in the App Router.
