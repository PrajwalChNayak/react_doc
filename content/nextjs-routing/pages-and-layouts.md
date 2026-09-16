---
title: Pages and Layouts
description: Build routes from page files, share UI with layouts that persist across navigation, and know what a layout cannot see.
group: nextjs-routing
order: 20
status: current
related: [nextjs-routing/file-conventions, nextjs-routing/dynamic-segments, patterns/composition, server-react/server-components]
---

## Overview

A **page** is the UI unique to one URL. A **layout** is UI shared by every URL
below its folder. You create them by default-exporting a component from
`page.tsx` and `layout.tsx`.

```text
app/
├── layout.tsx          ← root layout: wraps every route
├── page.tsx            ← /
└── blog/
    ├── layout.tsx      ← wraps /blog and /blog/*
    ├── page.tsx        ← /blog
    └── [slug]/
        └── page.tsx    ← /blog/any-post
```

Layouts nest: the root layout wraps the blog layout, which wraps whichever blog
page matched. Both are [Server Components](../server-react/server-components.md)
by default, so they can be `async` and read data directly.

## Why it exists

Most apps repeat the same frame around changing content: a header, a sidebar, a
tab bar. If the frame re-rendered on every navigation, it would lose scroll
position, collapse open menus, and refetch data it already had.

A layout is Next.js's answer. On a client-side navigation between two pages
that share a layout, the layout **stays mounted and does not re-render**. Only
the part of the tree below it is replaced. That is also what lets Next.js
prefetch and cache a layout separately from the pages inside it.

The cost of that guarantee is that a layout cannot depend on anything that
changes between its children, which is the source of every layout restriction on
this page.

## When to use it

- Use the **root layout** (`app/layout.tsx`) for `<html>`, `<body>`, global CSS,
  fonts, and providers the whole app needs. It is required.
- Use a **nested layout** for chrome shared by a section: account settings tabs,
  a documentation sidebar, a dashboard navigation.
- Use a **page** for anything that belongs to exactly one URL, and for
  everything that depends on the query string.

## When not to use it

**Do not read `searchParams` or the pathname in a layout.** Because the layout
does not re-render on navigation, the value would go stale. Read search params in
the page, or in a Client Component with `useSearchParams`.

**Do not use a layout to pass data to its page.** A layout cannot pass props to
`children`. Fetch the data in both places and deduplicate the call.

**Do not mark a layout `"use client"` to add one interactive widget.** Extract the
widget into its own Client Component and keep the layout on the server.

## Basic example

The root layout renders the document shell. It is the only layout that must
include `<html>` and `<body>`.

```tsx file="app/layout.tsx"
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Acme', template: '%s | Acme' },
  description: 'Invoices and payments for small teams.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

A section layout adds shared chrome, and the page fills it:

```tsx file="app/blog/layout.tsx"
import Link from 'next/link'

export default function BlogLayout({ children }: LayoutProps<'/blog'>) {
  return (
    <div className="blog">
      <aside>
        <Link href="/blog">All posts</Link>
        <Link href="/blog/rss.xml">RSS</Link>
      </aside>
      <article>{children}</article>
    </div>
  )
}
```

```tsx file="app/blog/page.tsx"
import Link from 'next/link'

type PostSummary = { slug: string; title: string }

async function getRecentPosts(): Promise<PostSummary[]> {
  const response = await fetch('https://api.example.com/posts?limit=10')
  if (!response.ok) throw new Error('Could not load posts')
  return response.json()
}

export default async function BlogIndexPage() {
  const posts = await getRecentPosts()
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}
```

`LayoutProps<'/blog'>` is a global type that Next.js generates from your folders.
It types `children`, any [parallel route](./parallel-routes.md) slots, and
`params`. See [typed routes](./typed-routes.md).

## How it works

### Rendering on navigation

When a user moves from `/blog` to `/blog/hello-world`, Next.js keeps the root
layout and the blog layout mounted, and renders only the new page on the server.
Client Component state inside the layouts survives: an expanded menu stays
expanded and an input keeps its value.

A full page load (typing the URL, refreshing) renders everything, because there
is no previous tree to keep. Navigating between two different **root** layouts
also causes a full page load; see [route groups](./route-groups.md).

### What a layout receives

| Prop | Page | Layout |
|---|---|---|
| `params` (a Promise) | Yes | Yes, for segments down to the layout |
| `searchParams` (a Promise) | Yes | **No** |
| `children` | No | Yes |
| Parallel route slots | No | Yes, one prop per `@slot` folder |

`params` and `searchParams` are Promises since Next.js 15. Await them in a Server
Component. [Dynamic segments](./dynamic-segments.md) covers the details.

### Search params belong to the page

```tsx file="app/invoices/page.tsx"
type Invoice = { id: string; customer: string; status: 'paid' | 'open' }

async function getInvoices(status: string): Promise<Invoice[]> {
  const response = await fetch(`https://api.example.com/invoices?status=${encodeURIComponent(status)}`)
  if (!response.ok) throw new Error('Could not load invoices')
  return response.json()
}

export default async function InvoicesPage({ searchParams }: PageProps<'/invoices'>) {
  const { status } = await searchParams
  const filter = typeof status === 'string' ? status : 'open'
  const invoices = await getInvoices(filter)

  return (
    <ul>
      {invoices.map((invoice) => (
        <li key={invoice.id}>
          {invoice.customer}: {invoice.status}
        </li>
      ))}
    </ul>
  )
}
```

Each search param is `string | string[] | undefined`, because a user can type any
query string. Narrow it before use.

Reading `searchParams` makes the page depend on the request, so it cannot be
fully prerendered. That is correct for a filtered list. See
[static and dynamic rendering](../nextjs-rendering/static-and-dynamic-rendering.md).

### Current URL inside layout chrome

For an active-link highlight in a layout, use a small Client Component. Client
Components re-render on navigation, so `usePathname` is always current.

```tsx file="app/ui/nav-link.tsx"
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link href={href} aria-current={isActive ? 'page' : undefined}>
      {children}
    </Link>
  )
}
```

The layout stays a Server Component and renders `<NavLink>` like any other
child. This is ordinary [composition](../patterns/composition.md): the server
tree owns the structure, and the client island owns the one interactive detail.

## Server and client implications

Pages and layouts run on the server by default and send no JavaScript for
themselves. Adding `"use client"` to a layout turns it and every module it
imports into client code, and it can no longer be `async` or read server-only
data. Prefer passing server-rendered `children` into a Client Component wrapper
instead.

Layouts do not receive the raw request. If a layout needs a cookie or header,
call `cookies()` or `headers()` from `next/headers` and `await` the result. That
opts the layout into request-time rendering, and a `loading.tsx` in the same
folder cannot show a fallback for it (the fallback sits below the layout). Wrap
the part that reads the request in its own `<Suspense>` boundary.

## Caching implications

A layout that awaits `params` or request data at its top level blocks everything
below it until that data resolves. With Cache Components enabled, awaiting
`params` at the top of a layout (for values not returned by
`generateStaticParams`) also prevents the layout from being prerendered. Pass the
`params` Promise down to the component that needs it and await it there. Keep layouts cheap, and
push request-specific reads down into the page or into a component wrapped in
`<Suspense>`. [Streaming](../nextjs-rendering/streaming.md) explains why this
shows content sooner.

## Common patterns

### Sharing data between a layout and its page

The layout and the page are rendered separately, so fetch in both and let React's
`cache` deduplicate the work within one request.

```ts file="lib/current-team.ts"
import 'server-only'
import { cache } from 'react'

export type Team = { id: string; name: string; plan: 'free' | 'pro' }

export const getCurrentTeam = cache(async (): Promise<Team> => {
  const response = await fetch('https://api.example.com/teams/current')
  if (!response.ok) throw new Error('Could not load team')
  return response.json()
})
```

```tsx file="app/settings/layout.tsx"
import { getCurrentTeam } from '@/lib/current-team'

export default async function SettingsLayout({ children }: LayoutProps<'/settings'>) {
  const team = await getCurrentTeam()
  return (
    <>
      <header>
        <h1>{team.name} settings</h1>
      </header>
      {children}
    </>
  )
}
```

```tsx file="app/settings/page.tsx"
import { getCurrentTeam } from '@/lib/current-team'

export default async function SettingsPage() {
  const team = await getCurrentTeam()
  return <p>Current plan: {team.plan}</p>
}
```

`fetch` calls with the same URL and options are also deduplicated during a
render. `cache` makes the same guarantee for database queries and SDK calls. See
[React-level caching](../data-fetching/caching.md).

### Resetting state on navigation

If a section needs its Client Components to start fresh on every child
navigation, use `template.tsx` instead of `layout.tsx`. See
[file conventions](./file-conventions.md).

## Common mistakes

**Adding `<html>` and `<body>` to a nested layout.** Only root layouts render the
document. Nested ones return a fragment or an element.

**Adding `<head>`, `<title>` or `<meta>` tags by hand in the root layout.** Export
`metadata` or `generateMetadata` instead, so Next.js can merge and deduplicate
tags across segments. See [metadata](../nextjs-styling/metadata.md).

**Reading `searchParams` in a layout.** Layouts do not receive it. Move the read
into the page, or into a Client Component with `useSearchParams`.

**Expecting a layout to re-render when the page changes.** It does not. Anything
that must track the URL belongs in a Client Component below it.

**Trying to pass props from a layout to `children`.** The page is rendered
separately. Fetch the shared data in both and deduplicate with `cache`.

**Synchronous `params` access.** `params` is a Promise. `const { slug } = await
params` in a Server Component.

## Related topics

- [File conventions](./file-conventions.md): where `template`, `loading` and
  `error` sit relative to a layout.
- [Dynamic segments](./dynamic-segments.md): reading `params` in pages and
  layouts.
- [Parallel routes](./parallel-routes.md): layouts that receive more than one
  `children`-like slot.
- [Composition](../patterns/composition.md): the React pattern behind layouts
  that receive `children`.
- [Server Components](../server-react/server-components.md): what a layout can
  and cannot do on the server.
- [React-level caching](../data-fetching/caching.md): deduplicating a fetch shared
  by a layout and its page.
