---
title: Internationalization
description: Serve localized routes under app/[lang] with root params, server-side dictionaries, locale negotiation in proxy.ts, and prerendered locales.
group: nextjs-routing
order: 110
status: current
since: "16.3"
related: [nextjs-routing/root-params, nextjs-backend/proxy, nextjs-rendering/prerendering, server-react/server-components]
---

## Overview

The App Router has no built-in i18n configuration. You build localized routing
from features it already has:

| Concern | Next.js feature |
|---|---|
| Locale in the URL (`/en/pricing`, `/de/pricing`) | A `[lang]` dynamic segment above the root layout |
| Reading the locale anywhere on the server | [Root params](./root-params.md): `import { lang } from 'next/root-params'` |
| Choosing a locale for `/pricing` | A redirect in `proxy.ts` based on `Accept-Language` |
| Translated strings | Dictionaries loaded in Server Components |
| Prerendering every language | `generateStaticParams` in the root layout |

> [!NOTE]
> The `i18n` key in `next.config` belongs to the Pages Router. It is not used by
> the App Router, where the pattern on this page replaces it.

## Why it exists

A locale in the path is the most robust way to localize a site. Each language has
its own URL, so search engines index them separately, links shared in German stay
German, and CDNs can cache each language without varying on headers.

Loading translations in Server Components means the dictionaries never ship to
the browser. A page only sends the rendered strings it used, instead of every
translation for every language. The only client-side translation cost is the
strings you pass to Client Components.

## When to use it

- A public site or app that serves more than one language.
- A site whose content differs by region, where the region belongs in the URL.
- When you want each language prerendered and cached separately.

## When not to use it

**A single-language app with localized number and date formatting only** does not
need routing. Use `Intl` with a fixed locale.

**User-specific language inside a signed-in app** can come from the user's saved
preference instead of the URL, if links are never shared across languages.

**Do not reach for a library before you need one.** Dictionaries plus root params
cover static strings. Add a library when you need ICU plurals, rich formatting, or
typed message keys across a large team.

## Basic example

### 1. Put everything under `app/[lang]`

```text
app/
└── [lang]/
    ├── layout.tsx       ← the root layout, so `lang` is a root param
    ├── page.tsx         ← /en, /de
    └── pricing/
        └── page.tsx     ← /en/pricing, /de/pricing
```

There is no `app/layout.tsx` above it. Every special file lives inside `[lang]`.

### 2. Define the supported locales

Keep the list in a module with no Next.js imports, so `proxy.ts` can share it:

```ts file="lib/i18n/config.ts"
export const locales = ['en', 'de'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export function hasLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value)
}
```

### 3. Write dictionaries

Write the default language as a TypeScript module, and type the others against
it. A missing or misspelled key in German is then a compile error:

```ts file="dictionaries/en.ts"
const en = {
  nav: { pricing: 'Pricing', signIn: 'Sign in' },
  pricing: { title: 'Simple pricing', perMonth: 'per month' },
}

export type Dictionary = typeof en
export default en
```

```ts file="dictionaries/de.ts"
import type { Dictionary } from './en'

const de: Dictionary = {
  nav: { pricing: 'Preise', signIn: 'Anmelden' },
  pricing: { title: 'Einfache Preise', perMonth: 'pro Monat' },
}

export default de
```

JSON files work too (the official guide uses them with dynamic `import()`), but
they do not give you that check.

### 4. Load them with the root param

```ts file="lib/i18n/dictionaries.ts"
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'
import de from '@/dictionaries/de'
import en from '@/dictionaries/en'
import { hasLocale, type Locale } from './config'

const dictionaries = { en, de }

export async function getLocale(): Promise<Locale> {
  const value = await lang()
  if (!hasLocale(value)) notFound()
  return value
}

export async function getDictionary() {
  const locale = await getLocale()
  return dictionaries[locale]
}
```

`getDictionary()` takes no arguments. It reads `lang` itself, and an unsupported
value such as `/xx/pricing` becomes a 404 instead of a crash. This module is only
imported by server code, so no dictionary reaches the browser unless you pass
strings to a Client Component.

### 5. Use them in layouts and pages

```tsx file="app/[lang]/layout.tsx"
import Link from 'next/link'
import type { ReactNode } from 'react'
import { locales } from '@/lib/i18n/config'
import { getDictionary, getLocale } from '@/lib/i18n/dictionaries'

export function generateStaticParams() {
  return locales.map((locale) => ({ lang: locale }))
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const dict = await getDictionary()

  return (
    <html lang={locale}>
      <body>
        <header>
          <Link href={`/${locale}/pricing`}>{dict.nav.pricing}</Link>
        </header>
        {children}
      </body>
    </html>
  )
}
```

```tsx file="app/[lang]/pricing/page.tsx"
import { getDictionary, getLocale } from '@/lib/i18n/dictionaries'

export default async function PricingPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()])
  const price = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(12)

  return (
    <main>
      <h1>{dict.pricing.title}</h1>
      <p>
        {price} {dict.pricing.perMonth}
      </p>
    </main>
  )
}
```

`generateStaticParams` in the root layout prerenders every page once per locale.
With Cache Components enabled it is required: each root param needs at least one
value, or the build fails.

## How it works

### Locale negotiation in `proxy.ts`

A visitor who types `example.com/pricing` has no locale in the URL. `proxy.ts`
runs before routing, reads the `Accept-Language` header, and redirects to the
best supported locale:

```ts file="proxy.ts"
import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, locales, type Locale } from '@/lib/i18n/config'

function negotiateLocale(request: NextRequest): Locale {
  // A saved choice wins over the browser's header.
  const saved = request.cookies.get('locale')?.value
  const savedLocale = locales.find((locale) => locale === saved)
  if (savedLocale) return savedLocale

  const header = request.headers.get('accept-language') ?? ''
  const ranked = header
    .split(',')
    .map((entry) => {
      const [tag = '', quality] = entry.trim().split(';q=')
      return { base: tag.toLowerCase().split('-')[0], q: quality ? Number(quality) : 1 }
    })
    .sort((a, b) => b.q - a.q)

  for (const { base } of ranked) {
    const match = locales.find((locale) => locale === base)
    if (match) return match
  }
  return defaultLocale
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasLocale = locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`))
  if (hasLocale) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = `/${negotiateLocale(request)}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

export const config = {
  // Skip Next.js internals and files with an extension (favicon.ico, images).
  matcher: ['/((?!_next|.*\\..*).*)'],
}
```

The redirect is a `307`, because the right locale depends on the visitor. Browsers
cache a permanent `308`, so the first negotiated language would stick even after
the visitor changes their preferences.

The official Next.js guide negotiates with the `negotiator` and
`@formatjs/intl-localematcher` packages, which implement standards-based language
matching. The hand-written version above covers the common cases without
dependencies. See
[proxy](../nextjs-backend/proxy.md) for the proxy API.

### Why root params instead of `params`

Every page could `await params` and pass `lang` into `getDictionary(lang)`. That
works, and it is what code written before Next.js 16.3 does. Root params remove
the plumbing: a deeply nested Server Component, a formatting helper, or a
`"use cache"` function can read the locale directly. Root params are covered in
depth on [their own page](./root-params.md).

### Translations in Client Components

Client Components cannot call `lang()` or load dictionaries on the server. Pass
only the strings they need as props:

```tsx file="app/[lang]/newsletter-form.tsx"
'use client'

import { useState } from 'react'

type NewsletterStrings = { label: string; submit: string; thanks: string }

export function NewsletterForm({ strings }: { strings: NewsletterStrings }) {
  const [submitted, setSubmitted] = useState(false)
  if (submitted) return <p>{strings.thanks}</p>

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
      }}
    >
      <label htmlFor="email">{strings.label}</label>
      <input id="email" type="email" required />
      <button type="submit">{strings.submit}</button>
    </form>
  )
}
```

Passing a small slice keeps the client bundle and the serialized props small.
Passing the whole dictionary to a Client Component defeats the point of loading
it on the server.

## Server and client implications

- `next/root-params` works in Server Components and server helpers only. Not in
  Client Components, Server Actions, or Route Handlers (Route Handler support is
  planned).
- In a Server Action, send the locale with the form data and validate it with
  `hasLocale`, or read the user's saved preference.
- In a Route Handler under `app/[lang]/`, read the locale from
  `RouteContext` params: `const { lang } = await context.params`.
- In a Client Component, `useParams()` includes `lang` because it is part of the
  URL.

## Caching implications

Each locale is a separate URL, so each is prerendered and cached separately.
Inside `"use cache"`, reading `lang()` adds only the locale to the cache key, so a
cached CMS query runs once per language rather than once per page. See
[use cache](../nextjs-data-caching/use-cache.md).

## Common patterns

### A language switcher

Swap the first path segment and keep the rest of the URL:

```tsx file="app/[lang]/language-switcher.tsx"
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { locales } from '@/lib/i18n/config'

const labels: Record<string, string> = { en: 'English', de: 'Deutsch' }

export function LanguageSwitcher() {
  const pathname = usePathname()
  const [, , ...rest] = pathname.split('/')
  const suffix = rest.length ? `/${rest.join('/')}` : ''

  return (
    <nav aria-label="Language">
      {locales.map((locale) => (
        <Link key={locale} href={`/${locale}${suffix}`} hrefLang={locale} lang={locale}>
          {labels[locale]}
        </Link>
      ))}
    </nav>
  )
}
```

To remember the choice for future visits to `/`, set a `locale` cookie in a
Server Action, which the proxy above reads before it looks at `Accept-Language`.

### Alternate-language links for search engines

```tsx file="app/[lang]/page.tsx"
import type { Metadata } from 'next'
import { getDictionary } from '@/lib/i18n/dictionaries'

export async function generateMetadata({ params }: PageProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params
  return {
    alternates: {
      canonical: `/${lang}`,
      languages: { en: '/en', de: '/de' },
    },
  }
}

export default async function HomePage() {
  const dict = await getDictionary()
  return <h1>{dict.pricing.title}</h1>
}
```

See [metadata](../nextjs-styling/metadata.md) for the rest of the Metadata API.

### Using a library

For plurals, ICU message syntax, and typed message keys, consider a dedicated
library. **next-intl** (4.14.5, with a peer dependency of `next ^16`) is a
widely used option for the App Router. Follow its own documentation at
[next-intl.dev](https://next-intl.dev) for setup, because its routing and message
APIs are its own. Other options are listed in the official Next.js
internationalization guide.

### A runnable version

The [routing example app](../../examples/nextjs/routing/README.md) implements
`app/[lang]` with English and French dictionaries, `getDictionary()` built on
`next/root-params`, and negotiation in `proxy.ts`.

## Common mistakes

**Leaving an `app/layout.tsx` above `app/[lang]`.** Then `[lang]` is not above the
root layout, the root layout cannot set `<html lang>`, and there is no `lang`
root param.

**Not validating the locale.** `/xx/pricing` matches `[lang]`. Check the value and
call `notFound()`.

**Permanent redirects for negotiation.** A `308` from `/` to `/de` is cached by the
browser, which keeps sending that visitor to German. Use the default `307`.

**A proxy matcher that includes static files.** Redirecting `/logo.png` to
`/en/logo.png` breaks every asset. Exclude `_next` and paths with a file extension.

**Passing the whole dictionary to a Client Component.** All strings for the page
end up serialized to the browser. Pass the few it needs.

**Calling `lang()` in a Route Handler or Server Action.** Not supported. Use
`params` or submitted data.

**Using the Pages Router `i18n` config in `next.config`.** The App Router does not
use it.

## Related topics

- [Root params](./root-params.md): the `next/root-params` API this pattern is
  built on.
- [Proxy](../nextjs-backend/proxy.md): the request hook that negotiates the
  locale.
- [Prerendering](../nextjs-rendering/prerendering.md): `generateStaticParams`
  for every locale.
- [Redirects](./redirects.md): choosing between 307 and 308.
- [Server Components](../server-react/server-components.md): why dictionaries
  loaded on the server cost the browser nothing.
