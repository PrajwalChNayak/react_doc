---
title: Redirects
description: Send users to another URL with redirect() and permanentRedirect(), next.config redirects, or proxy.ts, and pick the right status code.
group: nextjs-routing
order: 90
status: current
related: [nextjs-backend/proxy, nextjs-security/open-redirects, nextjs-mutations/server-actions, server-react/server-functions]
---

## Overview

Next.js offers four ways to redirect. They differ in **when** they run, which
decides what information they have:

| API | Runs | Typical use | Status |
|---|---|---|---|
| `redirects()` in `next.config.ts` | Before proxy and before any route, from a static list | Moved pages, renamed sections | 307 or 308 |
| `NextResponse.redirect()` in `proxy.ts` | Before rendering, per request | Locale negotiation, large redirect maps, cookie-based routing | Any (307 by default) |
| `redirect()` from `next/navigation` | During rendering, in a Server Action, or in a Route Handler | "Not signed in", "after creating a post, go to it" | 307, or 303 for a Server Action without JavaScript |
| `permanentRedirect()` from `next/navigation` | Same places as `redirect()` | A record's canonical URL changed | 308, or 303 for a Server Action without JavaScript |

On the client, navigate from an event handler with `router.push()` from
`useRouter`. See [linking and navigation](./linking-and-navigation.md).

## Why it exists

A redirect is a routing decision, and the earliest point you can make it is the
cheapest. A redirect from `next.config.ts` costs no rendering at all. A redirect
from `proxy.ts` costs one small function. A `redirect()` inside a page runs after
the route has started rendering, but it is the only one that can use the data the
page loads.

Next.js uses **307** and **308** rather than 302 and 301 because 307 and 308
preserve the request method. Many clients turn a `POST` that receives a `302`
into a `GET`, which silently breaks form submissions and APIs.

## When to use it

- **Config `redirects()`** for any mapping you know at build time: `/docs/v1/*`
  to `/docs/*`, `/team` to `/about`.
- **`proxy.ts`** when the decision needs the request (a cookie, a header, the
  `Accept-Language` list) or when the list is too large for config.
- **`redirect()`** in a Server Component when the data decides: the invoice
  belongs to another team, the onboarding step is already complete.
- **`redirect()` in a Server Action** after a successful mutation, so the browser
  lands on the new resource.
- **`permanentRedirect()`** when an entity's URL changed for good, such as a user
  renaming their profile handle.

## When not to use it

**Do not redirect when content is missing.** Call `notFound()` instead, so the
response is a 404 and search engines drop the URL. See
[not found and redirect](../nextjs-errors/not-found-and-redirect.md).

**Do not use proxy redirects for authorization alone.** A matcher change can
silently stop the proxy from running on a path. Check access where data is read.
See [protecting routes](../nextjs-auth/protecting-routes.md).

**Do not mark a redirect permanent unless it is.** Browsers and search engines
cache 308s. Undoing one is slow.

**Do not call `redirect()` from a click handler.** It works during rendering, not
in event handlers. Use `router.push()`.

## Basic example

Redirect from a Server Component when the user is not signed in:

```tsx file="app/account/page.tsx"
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function AccountPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login?next=/account')
  }

  return <h1>Welcome back, {session.user.name}</h1>
}
```

`redirect()` returns TypeScript's `never` type: it throws a special error that
Next.js catches, so no `return` is needed and nothing after it runs.

## How it works

### `redirect()` throws

Because it works by throwing, a `redirect()` inside a `try` block is caught by
your own `catch`. Call it **after** the `try`/`catch`:

```ts file="app/posts/actions.ts"
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'

export async function createPost(formData: FormData) {
  const user = await requireUser()
  const title = String(formData.get('title') ?? '').trim()
  if (title.length === 0) return

  let postId: string
  try {
    const post = await db.post.create({ data: { title, authorId: user.id } })
    postId = post.id
  } catch (error) {
    console.error('createPost failed', error)
    throw new Error('Could not save the post. Try again.')
  }

  revalidatePath('/posts')
  redirect(`/posts/${postId}`) // outside the try block
}
```

### Status codes by context

| Where `redirect()` is called | What the browser gets |
|---|---|
| Server Component, before streaming starts | A `307` response |
| Server Component, after streaming started | A tag in the streamed HTML that navigates on the client (the status is already sent as 200) |
| Server Action, JavaScript available | A client-side navigation, no HTTP redirect |
| Server Action, form submitted before JavaScript loaded | A `303 See Other`, so the browser follows with `GET` |
| Route Handler | A `307` response |

`permanentRedirect()` behaves the same, with `308` in place of `307`.

### History: push or replace

In a Server Action, `redirect()` **pushes** a new history entry. Everywhere else
it **replaces** the current one. Override that with the second argument:

```ts file="app/checkout/actions.ts"
'use server'

import { redirect, RedirectType } from 'next/navigation'

export async function confirmOrder(formData: FormData) {
  const orderId = String(formData.get('orderId') ?? '')
  // Replace, so Back does not return to the submitted checkout form.
  redirect(`/orders/${encodeURIComponent(orderId)}`, RedirectType.replace)
}
```

The type argument has no effect in Server Components.

### Permanent redirects for changed URLs

```tsx file="app/articles/[slug]/page.tsx"
import { notFound, permanentRedirect } from 'next/navigation'
import { findArticleBySlug } from '@/lib/articles'

export default async function ArticlePage({ params }: PageProps<'/articles/[slug]'>) {
  const { slug } = await params
  const article = await findArticleBySlug(slug)
  if (!article) notFound()

  // The article was renamed: send old links to the canonical URL with a 308.
  if (article.slug !== slug) {
    permanentRedirect(`/articles/${article.slug}`)
  }

  return <h1>{article.title}</h1>
}
```

### Redirects in Route Handlers

```ts file="app/go/[code]/route.ts"
import { redirect } from 'next/navigation'
import { findShortLink } from '@/lib/short-links'

export async function GET(_request: Request, context: RouteContext<'/go/[code]'>) {
  const { code } = await context.params
  const link = await findShortLink(code)
  if (!link) {
    return new Response('Unknown short link', { status: 404 })
  }
  redirect(link.targetPath)
}
```

`link.targetPath` comes from your database, not from the request, which is what
keeps this from being an open redirect.

### Redirects in `next.config.ts`

```ts file="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // 308: the docs moved for good.
      { source: '/docs/v1/:path*', destination: '/docs/:path*', permanent: true },
      // 307: a temporary campaign URL.
      { source: '/summer', destination: '/pricing?plan=annual', permanent: false },
      // Only when the beta cookie is missing.
      {
        source: '/dashboard/:path*',
        missing: [{ type: 'cookie', key: 'beta' }],
        destination: '/waitlist',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
```

- `source` supports `:param`, `:param*` (zero or more segments), and regex groups.
  Keep the `/` before each `:param`, or the path is treated as a literal and can
  loop.
- `has` and `missing` match on `header`, `cookie`, `host` or `query`.
- The query string of the incoming request is passed through to the destination.
- Config redirects run **before** `proxy.ts` and before the file system.
- Some hosts cap the number of config redirects. For thousands of entries, use a
  lookup in `proxy.ts` instead.

### Redirects in `proxy.ts`

`proxy.ts` runs before rendering, on the Node.js runtime, for every path its
`matcher` includes. It can redirect based on anything in the request. See
[proxy](../nextjs-backend/proxy.md) for the full API.

```ts file="proxy.ts"
import { NextResponse, type NextRequest } from 'next/server'

const legacyProductPaths: Record<string, string> = {
  '/products/classic-tee': '/shop/t-shirts/classic',
  '/products/rain-jacket': '/shop/outerwear/rain-shell',
}

export function proxy(request: NextRequest) {
  const destination = legacyProductPaths[request.nextUrl.pathname]
  if (destination) {
    return NextResponse.redirect(new URL(destination, request.url), 308)
  }

  // Send signed-out visitors to the login page, remembering where they were going.
  if (request.nextUrl.pathname.startsWith('/app') && !request.cookies.has('session')) {
    const login = new URL('/login', request.url)
    login.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/products/:path*', '/app/:path*'],
}
```

The cookie check is a fast optimistic redirect for a better experience, not
access control. The page or data layer must still verify the session.

> [!NOTE]
> `proxy.ts` replaced the deprecated middleware file convention in Next.js 16.0.
> Current code goes in `proxy.ts` and exports a function named `proxy`.

## Server and client implications

`redirect()` and `permanentRedirect()` work in Server Components, Server Actions
and Route Handlers. They can also run while a Client Component **renders** (during
server rendering that becomes a server redirect), but never inside an event
handler. For a redirect in response to a click, use `router.push()` or
`router.replace()`:

```tsx file="app/onboarding/skip-button.tsx"
'use client'

import { useRouter } from 'next/navigation'

export function SkipOnboardingButton() {
  const router = useRouter()
  return (
    <button type="button" onClick={() => router.replace('/dashboard')}>
      Skip for now
    </button>
  )
}
```

For a redirect after a form submission, call `redirect()` inside the Server
Action instead, so the form keeps working before hydration. See
[Server Actions](../nextjs-mutations/server-actions.md) and the React model in
[Server Functions](../server-react/server-functions.md).

## Common patterns

### Redirecting back after login

Pass the intended destination as a query parameter, and validate it before use:

```ts file="lib/safe-redirect.ts"
// Accept only same-origin relative paths like "/invoices/42".
export function safeRedirectPath(value: FormDataEntryValue | string | null, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
```

```ts file="app/login/actions.ts"
'use server'

import { redirect } from 'next/navigation'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { signIn } from '@/lib/session'

export async function login(formData: FormData) {
  await signIn(formData)
  redirect(safeRedirectPath(formData.get('next'), '/dashboard'))
}
```

### Locale redirects

Redirecting `/pricing` to `/en/pricing` based on `Accept-Language` is a proxy
redirect. The full pattern is in [internationalization](./internationalization.md).

## Security considerations

Any redirect destination built from request input (`?next=`, a `Referer` header, a
path segment) is an **open redirect** unless you restrict it. Attackers use your
trusted domain to bounce victims to a phishing page. Allow only relative paths or
a fixed list of hosts, as `safeRedirectPath` does above. The full threat model,
exploit and test are in [open redirects](../nextjs-security/open-redirects.md).

The same applies to config redirects that interpolate request-controlled values
into a hostname. An SSRF and open redirect issue in `rewrites()` and `redirects()`
with request-controlled hostnames (CVE-2026-64645) was fixed in the July 2026
security release. Stay on `next@16.3.3` or later.

## Common mistakes

**Calling `redirect()` inside `try`.** Your `catch` swallows the redirect. Call it
after the `try`/`catch`.

**Using `redirect()` in an `onClick`.** It only works during rendering, in Server
Actions and in Route Handlers. Use `router.push()`.

**Redirecting to `formData.get('next')` without validation.** That is an open
redirect. Allow relative paths only.

**Using `permanent: true` for a temporary change.** 308s are cached by browsers and
search engines.

**Redirecting instead of returning 404.** Missing content should call
`notFound()`.

**Forgetting the leading `/` before `:param` in config `source`.** The pattern is
treated literally and can cause a redirect loop.

**Relying on a proxy cookie check as authorization.** It improves the experience.
It does not secure the data.

## Related topics

- [Proxy](../nextjs-backend/proxy.md): the request-time hook where conditional
  redirects run.
- [Open redirects](../nextjs-security/open-redirects.md): the vulnerability that
  unvalidated redirect targets create.
- [Server Actions](../nextjs-mutations/server-actions.md): redirecting after a
  mutation.
- [Not found and redirect](../nextjs-errors/not-found-and-redirect.md): how
  `notFound()` and `redirect()` interact with error boundaries.
- [Server Functions](../server-react/server-functions.md): the React model behind
  Server Actions.
- [Linking and navigation](./linking-and-navigation.md): client-side navigation
  with `useRouter`.
