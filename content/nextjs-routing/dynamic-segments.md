---
title: Dynamic Segments
description: Capture URL values with [slug], [...slug] and [[...slug]] folders, and read them from the params Promise.
group: nextjs-routing
order: 30
status: current
since: "15.0"
related: [nextjs-routing/typed-routes, nextjs-rendering/prerendering, data-fetching/use-with-promises, hooks/use]
---

## Overview

A folder name in square brackets captures part of the URL instead of matching it
literally. `app/blog/[slug]/page.tsx` matches `/blog/hello-world` and hands the
page `{ slug: 'hello-world' }`.

| Folder | Matches | `params` value |
|---|---|---|
| `app/blog/[slug]` | `/blog/a` | `{ slug: 'a' }` |
| `app/help/[...topic]` | `/help/a`, `/help/a/b` | `{ topic: ['a'] }`, `{ topic: ['a', 'b'] }` |
| `app/wiki/[[...path]]` | `/wiki`, `/wiki/a/b` | `{ path: undefined }`, `{ path: ['a', 'b'] }` |
| `app/teams/[team]/[project]` | `/teams/acme/website` | `{ team: 'acme', project: 'website' }` |

Pages, layouts, route handlers, `default.tsx` and `generateMetadata` receive
these values as `params`. **`params` is a Promise.** Await it in a Server
Component, or unwrap it with React's `use` in a Client Component.

## Why it exists

Most content is data-driven: a post per row, a product per SKU, a docs page per
Markdown file. A folder per record would be absurd, so one folder stands in for
all of them and the router extracts the variable part.

`params` became a Promise in Next.js 15. Because the value is awaited where it is
needed, you decide which component waits for it: a layout can pass the Promise
down instead of blocking its whole subtree. Code that reads `params`
synchronously comes from Next.js 14 or earlier and fails type-checking against
16.3.

## When to use it

- Use `[slug]` when exactly one segment varies: a post, a user, an order ID.
- Use `[...slug]` (catch-all) for arbitrary depth where at least one segment is
  required, such as nested documentation paths or file browsers.
- Use `[[...slug]]` (optional catch-all) when the same page should also handle the
  bare parent URL, such as `/wiki` and `/wiki/a/b` rendered by one page.

## When not to use it

**Do not use a dynamic segment for filters, sorting, or pagination.** Those belong
in the query string (`?sort=price`), which a page reads from `searchParams`. A
path segment implies a distinct resource.

**Do not use a catch-all to avoid designing routes.** `[...slug]` at the top of
`app/` swallows every URL, so your 404 handling, prefetching, and typed routes
all get less precise.

**Do not put a dynamic segment above the root layout without meaning to.** A
segment like `app/[lang]/layout.tsx` becomes a root param with its own rules. See
[root params](./root-params.md).

## Basic example

```tsx file="app/blog/[slug]/page.tsx"
import { notFound } from 'next/navigation'

type Post = { title: string; html: string }

async function getPost(slug: string): Promise<Post | undefined> {
  const response = await fetch(`https://api.example.com/posts/${encodeURIComponent(slug)}`)
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`Could not load post ${slug}`)
  return response.json()
}

export default async function BlogPostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()

  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  )
}
```

`PageProps<'/blog/[slug]'>` is generated from your folders, so `slug` is typed as
`string` without writing the type by hand. See [typed routes](./typed-routes.md).

`notFound()` renders the nearest `not-found.tsx`. Always handle the case where the
captured value matches nothing, because anyone can type any URL.

> [!WARNING]
> The example renders HTML from the API with `dangerouslySetInnerHTML`. Only do
> that with HTML your own pipeline sanitized. The URL value itself is never safe
> to inject into markup or queries.

## How it works

### Catch-all segments

A catch-all value is an array with one entry per matched path segment.

```tsx file="app/help/[...topic]/page.tsx"
import { notFound } from 'next/navigation'

const articles: Record<string, { title: string; body: string }> = {
  'billing': { title: 'Billing', body: 'How invoices and receipts work.' },
  'billing/refunds': { title: 'Refunds', body: 'Refunds take five business days.' },
}

// /help/billing/refunds -> topic is ['billing', 'refunds']
export default async function HelpArticlePage({ params }: PageProps<'/help/[...topic]'>) {
  const { topic } = await params
  const article = articles[topic.join('/')]
  if (!article) notFound()

  return (
    <article>
      <nav aria-label="Breadcrumb">{topic.join(' › ')}</nav>
      <h1>{article.title}</h1>
      <p>{article.body}</p>
    </article>
  )
}
```

### Optional catch-all segments

With double brackets the parameter can be absent, so its type includes
`undefined`:

```tsx file="app/wiki/[[...path]]/page.tsx"
export default async function WikiPage({ params }: PageProps<'/wiki/[[...path]]'>) {
  const { path } = await params

  if (!path) {
    return <h1>Wiki home</h1>
  }

  return <h1>Wiki: {path.join(' / ')}</h1>
}
```

A route cannot have both `app/wiki/page.tsx` and `app/wiki/[[...path]]/page.tsx`,
because both match `/wiki`.

### The types are deliberately broad

| Folder | `params` type |
|---|---|
| `[slug]` | `{ slug: string }` |
| `[...slug]` | `{ slug: string[] }` |
| `[[...slug]]` | `{ slug?: string[] }` |

Values are `string`, never a union of your known IDs, because the URL is user
input. Narrow with a runtime check, then work with the narrow type:

```tsx file="app/reports/[period]/page.tsx"
import { notFound } from 'next/navigation'

const periods = ['week', 'month', 'quarter'] as const
type Period = (typeof periods)[number]

function isPeriod(value: string): value is Period {
  return periods.some((period) => period === value)
}

export default async function ReportPage({ params }: PageProps<'/reports/[period]'>) {
  const { period } = await params
  if (!isPeriod(period)) notFound()

  // `period` is now 'week' | 'month' | 'quarter'.
  return <h1>Revenue this {period}</h1>
}
```

### Layouts receive params too

A layout gets the params for every dynamic segment from the root down to its own
folder, never the ones below it. `app/teams/[team]/layout.tsx` sees `team`, not
`project`.

```tsx file="app/teams/[team]/layout.tsx"
export default async function TeamLayout({ children, params }: LayoutProps<'/teams/[team]'>) {
  const { team } = await params
  return (
    <>
      <header>Team: {team}</header>
      {children}
    </>
  )
}
```

## Server and client implications

### Server Components

Await `params` directly, as in every example above.

### Client Component pages

A page marked `"use client"` cannot be `async`, so unwrap the Promise with React's
[`use`](../hooks/use.md):

```tsx file="app/blog/[slug]/comments/page.tsx"
'use client'

import { use, useState } from 'react'

export default function CommentsPage({ params }: PageProps<'/blog/[slug]/comments'>) {
  const { slug } = use(params)
  const [draft, setDraft] = useState('')

  return (
    <form>
      <label htmlFor="comment">Comment on {slug}</label>
      <textarea id="comment" value={draft} onChange={(event) => setDraft(event.target.value)} />
    </form>
  )
}
```

`use` can suspend until the Promise resolves, so keep a Suspense boundary above
the page (a `loading.tsx` works). See [use with promises](../data-fetching/use-with-promises.md).

### Client Components deeper in the tree

A Client Component that is not the page does not receive `params`. Read the
current values with `useParams` from `next/navigation` instead of drilling props:

```tsx file="app/blog/[slug]/share-button.tsx"
'use client'

import { useParams } from 'next/navigation'

export function ShareButton() {
  const { slug } = useParams<{ slug: string }>()

  async function share() {
    await navigator.clipboard.writeText(`${window.location.origin}/blog/${slug}`)
  }

  return (
    <button type="button" onClick={share}>
      Copy link to {slug}
    </button>
  )
}
```

`useParams` returns the params of the whole current URL, and re-renders on
navigation. The generic is an assertion, not a check, so keep it in sync with the
folder names.

## Caching implications

Whether a dynamic route can be prerendered depends on whether Next.js knows the
param values at build time.

- **With `generateStaticParams`**, you return sample or complete values, and
  Next.js prerenders those pages at build time. Other values render on the first
  request. See [prerendering](../nextjs-rendering/prerendering.md).
- **Without it, under Cache Components**, param values are request-time data.
  Next.js prerenders a shell, and the part that awaits `params` must sit inside a
  `<Suspense>` boundary (or below a `loading.tsx`), or the build reports an error.

```tsx file="app/blog/[slug]/page.tsx"
export async function generateStaticParams() {
  const response = await fetch('https://api.example.com/posts?fields=slug')
  const posts: { slug: string }[] = await response.json()
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function BlogPostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  return <h1>{slug}</h1>
}
```

> [!NOTE]
> With Cache Components enabled, `generateStaticParams` must return **at least
> one** entry. An empty array is a build error, because Next.js needs a real value
> to validate that the route does not read request data outside a Suspense
> boundary.

When you cannot enumerate values at build time, pass the Promise down and await
it inside a boundary, so the rest of the page is still prerendered:

```tsx file="app/orders/[orderId]/page.tsx"
import { Suspense } from 'react'

async function OrderSummary({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const response = await fetch(`https://api.example.com/orders/${encodeURIComponent(orderId)}`)
  const order: { id: string; total: string } = await response.json()
  return <p>Order {order.id}: {order.total}</p>
}

export default function OrderPage({ params }: PageProps<'/orders/[orderId]'>) {
  return (
    <main>
      <h1>Your order</h1>
      <Suspense fallback={<p>Loading order…</p>}>
        <OrderSummary params={params} />
      </Suspense>
    </main>
  )
}
```

The same advice applies to layouts: awaiting `params` at the top of a layout
blocks the whole subtree.

## Common patterns

### Linking to a dynamic route

Build the URL with a template literal, and encode values that come from user
content:

```tsx file="app/blog/post-list.tsx"
import Link from 'next/link'

export function PostList({ posts }: { posts: { slug: string; title: string }[] }) {
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.slug}>
          <Link href={`/blog/${encodeURIComponent(post.slug)}`}>{post.title}</Link>
        </li>
      ))}
    </ul>
  )
}
```

With `typedRoutes` enabled, Next.js checks that the template matches a real route.
See [typed routes](./typed-routes.md).

### A runnable version

The [routing example app](../../examples/nextjs/routing/README.md) has a
`[slug]` product page with `generateStaticParams` and a `[...slug]` docs page.

## Security considerations

A captured segment is attacker-controlled input with a friendlier name. Validate
it before it reaches a database query, a file path, or an external URL, and check
that the current user may see the record it names.
[Insecure direct object references](../nextjs-security/idor.md) covers the most
common bug with `[id]` routes.

## Common mistakes

**Reading `params` synchronously.** Reading `slug` off `params` without `await`
is a type error against Next.js 16.3. Write `const { slug } = await params`.

**Making a Client Component page `async`.** Client Components cannot be async.
Use `use(params)`.

**Trusting the value's type.** `[id]` is always `string`. Validate and narrow it,
and call `notFound()` when it matches nothing.

**Forgetting that catch-all values are arrays.** `topic` in `[...topic]` is
`string[]`. Join it before looking it up.

**Adding both `page.tsx` and `[[...path]]/page.tsx` in the same folder.** Both
match the bare URL and conflict.

**Returning an empty array from `generateStaticParams` under Cache Components.**
It fails the build. Return at least one value.

**Using different names for the same dynamic level.** `app/blog/[slug]` and
`app/blog/[id]` cannot coexist. Pick one name per level.

## Related topics

- [Typed routes](./typed-routes.md): where `PageProps` and `LayoutProps` come
  from.
- [Prerendering](../nextjs-rendering/prerendering.md): `generateStaticParams` in
  depth.
- [Root params](./root-params.md): dynamic segments above the root layout.
- [use with promises](../data-fetching/use-with-promises.md): the React model
  behind unwrapping `params` in a Client Component.
- [use](../hooks/use.md): the hook itself, and its Suspense requirement.
- [Linking and navigation](./linking-and-navigation.md): `useParams`,
  `usePathname` and building links to dynamic routes.
