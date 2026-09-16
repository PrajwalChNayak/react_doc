---
title: Root Params
description: Read dynamic segments above the root layout, such as [lang], from any Server Component with next/root-params, including inside "use cache".
group: nextjs-routing
order: 100
status: current
since: "16.3"
related: [nextjs-routing/internationalization, nextjs-routing/dynamic-segments, nextjs-data-caching/use-cache, server-react/server-components]
---

## Overview

A **root param** is a dynamic segment that sits **above the root layout**. In
`app/[lang]/layout.tsx`, the root layout lives inside `[lang]`, so `lang` is a
root param.

Next.js 16.3 generates a module, `next/root-params`, with one async getter per
root param. Any Server Component, and any server-side function it calls, can read
the value without receiving `params` as a prop:

```tsx file="app/[lang]/layout.tsx"
import { lang } from 'next/root-params'
import type { ReactNode } from 'react'

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={await lang()}>
      <body>{children}</body>
    </html>
  )
}
```

> [!NOTE]
> `next/root-params` is new in **Next.js 16.3**. An earlier experimental
> `unstable_rootParams()` API was removed in 16.0. Do not use it.

## Why it exists

A locale, a tenant, or a region is needed almost everywhere: in the root layout's
`<html lang>`, in a data helper three calls deep, inside a cached function. With
only the `params` prop, every page and layout has to await it and pass the value
down through every component and helper in between.

Root params are special because they cannot change below the root layout. Every
route under `app/[lang]` shares the same `lang`, so a global getter is safe.
Params deeper in the tree are different: `[slug]` means different things (or does
not exist) on different routes, so those stay on the `params` prop.

The getters also help caching. Next.js can see which root params a `"use cache"`
function reads, and only those become part of its cache key.

## When to use it

- A language or locale prefix: `app/[lang]/...`. See
  [internationalization](./internationalization.md).
- A tenant or workspace prefix that every route shares: `app/[tenant]/...`.
- Any shared server utility (translations, formatting, a data-access helper) that
  would otherwise take the segment as an argument everywhere.

## When not to use it

**Not for segments below the root layout.** `[slug]` in
`app/[lang]/posts/[slug]` is not a root param. Read it from `params`.

**Not in Client Components, Server Actions, or Route Handlers.** Root params are
not supported there. Route Handler support is planned for a future release.

**Not as the only locale validation.** The getter returns whatever the URL
contained. Check it against your supported values.

## Basic example

```text
app/
└── [lang]/
    ├── layout.tsx            ← root layout: `lang` is a root param
    ├── page.tsx              ← /en
    └── posts/
        └── [slug]/
            └── page.tsx      ← /en/posts/hello: `slug` is a regular param
```

```tsx file="app/[lang]/posts/[slug]/page.tsx"
import { lang } from 'next/root-params'

export default async function PostPage({ params }: PageProps<'/[lang]/posts/[slug]'>) {
  const { slug } = await params // regular param, from props
  const language = await lang() // root param, from anywhere

  return (
    <article>
      <p>Language: {language}</p>
      <h1>{slug}</h1>
    </article>
  )
}
```

The export name matches the folder name: `[lang]` produces `lang`, `[tenant]`
produces `tenant`.

## How it works

### Generated exports and their types

Next.js generates `next/root-params` with `next dev`, `next build` and
`next typegen`, the same way it generates `PageProps`. See
[typed routes](./typed-routes.md).

| Segment above the root layout | Getter | Resolves to |
|---|---|---|
| `[lang]` | `lang()` | `string` |
| `[...path]` | `path()` | `string[]` |
| `[[...path]]` | `path()` | `string[] \| undefined` |

With **multiple root layouts**, a getter is typed for every route. A param that
only some root layouts have resolves to `string | undefined`, and to `undefined`
on routes whose root layout does not define it.

### Segment names must be valid identifiers

Each root param becomes a JavaScript export, so its name must be a valid
identifier. `[lang]`, `[locale]` and `[tenantId]` work. A kebab-case name fails in
`next dev` and `next build`:

```text
app/[site-id]/layout.tsx   ← error: "site-id" is not a valid identifier
app/[siteId]/layout.tsx    ← works: import { siteId } from 'next/root-params'
```

### Where the getters work

| Context | Supported |
|---|---|
| Server Components (layouts, pages, any server component) | Yes |
| Server-side helpers called while rendering | Yes |
| Inside a `"use cache"` function or component | Yes |
| `generateStaticParams` of a nested segment | Yes |
| Client Components | No: importing the module is a build error |
| Server Actions | No |
| Route Handlers | No (planned) |
| Inside `unstable_cache` | No: throws at runtime (use `"use cache"` instead) |

Because a Client Component cannot import the module at all, a file that imports
`next/root-params` does not need `import 'server-only'`.

### Shared server code

The getter is an import, so utilities can read it without a parameter:

```ts file="lib/format.ts"
import { lang } from 'next/root-params'

export async function formatPrice(amountInCents: number, currency = 'EUR'): Promise<string> {
  const locale = (await lang()) ?? 'en'
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountInCents / 100)
}
```

```tsx file="app/[lang]/cart/page.tsx"
import { formatPrice } from '@/lib/format'

export default async function CartPage() {
  return <p>Total: {await formatPrice(4599)}</p>
}
```

`CartPage` never touches `params`, yet the price is formatted for `/de/cart` and
`/fr/cart` correctly.

## Server and client implications

Client Components cannot call the getters. Read the value on the server and pass
it down as a prop, or use `useParams()` from `next/navigation`, which includes
root params because they are part of the URL:

```tsx file="app/[lang]/language-badge.tsx"
'use client'

import { useParams } from 'next/navigation'

export function LanguageBadge() {
  const { lang } = useParams<{ lang: string }>()
  return <span className="badge">{lang.toUpperCase()}</span>
}
```

For Server Actions, which also cannot call the getters, send the value with the
form (a hidden input) and validate it in the action, or derive it from the
user's saved preferences.

## Caching implications

Inside `"use cache"`, a root param getter becomes part of the cache key
automatically, and only the root params you actually read are included:

```tsx file="app/[lang]/site-nav.tsx"
import { lang } from 'next/root-params'
import Link from 'next/link'

type NavItem = { href: string; label: string }

async function getNavigation(): Promise<NavItem[]> {
  'use cache'
  // Cached once per language, not once per page.
  const language = await lang()
  const response = await fetch(`https://cms.example.com/navigation?lang=${language}`)
  return response.json()
}

export async function SiteNav() {
  const items = await getNavigation()
  return (
    <nav>
      {items.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
```

With the `params` prop you would have to await it outside the cached function and
pass `language` as an argument. Both are correct. The getter keeps call sites
simpler and cannot accidentally include unrelated params in the key. See
[use cache](../nextjs-data-caching/use-cache.md).

### `generateStaticParams` with Cache Components

Root params work without `generateStaticParams`. With Cache Components enabled,
though, **each root param needs at least one value** from a
`generateStaticParams`, or the build fails:

```tsx file="app/[lang]/layout.tsx"
import { lang } from 'next/root-params'
import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'de' }, { lang: 'fr' }]
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={await lang()}>
      <body>{children}</body>
    </html>
  )
}
```

A nested segment's `generateStaticParams` runs once per parent value and can read
the root param through the getter:

```tsx file="app/[lang]/posts/[slug]/page.tsx"
import { lang } from 'next/root-params'

export async function generateStaticParams() {
  const language = await lang()
  const response = await fetch(`https://cms.example.com/posts?lang=${language}&fields=slug`)
  const posts: { slug: string }[] = await response.json()
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function PostPage({ params }: PageProps<'/[lang]/posts/[slug]'>) {
  const { slug } = await params
  return <h1>{slug}</h1>
}
```

## Common patterns

### Validating once, in a helper

```ts file="lib/locale.ts"
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

export const supportedLocales = ['en', 'de', 'fr'] as const
export type Locale = (typeof supportedLocales)[number]

function isLocale(value: string | undefined): value is Locale {
  return supportedLocales.some((locale) => locale === value)
}

export async function getLocale(): Promise<Locale> {
  const value = await lang()
  if (!isLocale(value)) notFound()
  return value
}
```

Every Server Component calls `getLocale()` and receives a narrowed, validated
value. The [routing example app](../../examples/nextjs/routing/README.md) uses
this pattern in `lib/dictionaries.ts`.

## Common mistakes

**Importing a param that is not above the root layout.** Only segments before the
root layout get a getter. `slug` in `app/[lang]/posts/[slug]` does not.

**Kebab-case segment names.** `[post-slug]` or `[site-id]` above the root layout
fails. Use `[postSlug]` or `[siteId]`.

**Calling a getter in a Route Handler or Server Action.** Not supported. Read the
value from the URL (`RouteContext` params) or from the submitted data.

**Importing `next/root-params` in a `"use client"` file.** It is a build error.
Pass the value as a prop, or use `useParams()`.

**Calling a getter inside `unstable_cache`.** It throws, because root params are not
supported there. Use `"use cache"` instead.

**Trusting the value.** `lang()` returns whatever the URL said. Validate it
against your supported list and call `notFound()` otherwise.

**Using `unstable_rootParams`.** That older experimental API was removed in 16.0.
Import from `next/root-params`.

## Related topics

- [Internationalization](./internationalization.md): the main use case, with
  dictionaries and locale negotiation.
- [Dynamic segments](./dynamic-segments.md): regular params below the root layout.
- [use cache](../nextjs-data-caching/use-cache.md): how root params become part of
  a cache key.
- [Typed routes](./typed-routes.md): how the getter types are generated.
- [Server Components](../server-react/server-components.md): the only place the
  getters run, and why Client Components cannot import them.
