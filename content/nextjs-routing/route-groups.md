---
title: Route Groups
description: Organize routes with (folder) names that never appear in the URL, share layouts selectively, and create multiple root layouts.
group: nextjs-routing
order: 50
status: current
related: [nextjs-routing/pages-and-layouts, nextjs-routing/file-conventions, patterns/composition]
---

## Overview

A folder whose name is wrapped in parentheses, such as `(marketing)`, is a
**route group**. It organizes files and can hold a layout, but it is left out of
the URL.

```text
app/
├── (marketing)/
│   ├── layout.tsx       ← wraps / and /pricing only
│   ├── page.tsx         ← /
│   └── pricing/
│       └── page.tsx     ← /pricing
└── (app)/
    ├── layout.tsx       ← wraps /dashboard and /settings only
    ├── dashboard/
    │   └── page.tsx     ← /dashboard
    └── settings/
        └── page.tsx     ← /settings
```

`/pricing` and `/dashboard` sit side by side in the URL space, but each renders
inside a different layout.

## Why it exists

Layouts follow the folder tree, and so do URLs. Without groups, the only way to
give two sets of pages different layouts is to give them different URL prefixes,
such as `/app/dashboard`. That leaks your code organization into links people
bookmark.

Route groups separate the two concerns. The URL describes what the user is
looking at, and the group describes which frame it renders in and which team owns
the code.

## When to use it

- **Different chrome for sections at the same URL depth.** A marketing site with
  a big footer and a signed-in app with a sidebar.
- **Applying a layout to some siblings but not others.** Put the pages that share
  a layout in a group, and leave the rest outside it.
- **Multiple root layouts.** Each group defines its own `<html>` and `<body>`,
  for example a marketing site and an embedded widget with entirely different
  global CSS.
- **Organizing by team or feature** without changing any URL.

## When not to use it

**Do not use a group when a URL prefix is honest.** If every admin page is under
`/admin`, a plain `admin/` folder with a layout is simpler.

**Do not create multiple root layouts to separate CSS alone.** Crossing between
root layouts forces a full page reload, which throws away client state and the
benefits of client-side navigation. Prefer one root layout with section layouts
below it unless the documents are truly different.

**Do not treat a group as an access boundary.** Wrapping pages in `(admin)` does
not protect them. Authorization happens in the data layer. See
[protecting routes](../nextjs-auth/protecting-routes.md).

## Basic example

One root layout, with a group that opts the product pages into a shared shell:

```text
app/
├── layout.tsx
├── page.tsx                 ← /           (no sidebar)
├── about/page.tsx           ← /about      (no sidebar)
└── (workspace)/
    ├── layout.tsx           ← sidebar for everything in this group
    ├── projects/page.tsx    ← /projects
    └── reports/page.tsx     ← /reports
```

```tsx file="app/(workspace)/layout.tsx"
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="workspace">
      <aside>
        <Link href="/projects">Projects</Link>
        <Link href="/reports">Reports</Link>
      </aside>
      <main>{children}</main>
    </div>
  )
}
```

```tsx file="app/(workspace)/projects/page.tsx"
export default function ProjectsPage() {
  return <h1>Projects</h1>
}
```

The URL is `/projects`. Moving that folder into or out of `(workspace)` changes
the layout it renders in, and nothing else.

## How it works

### Groups are stripped from the route

Next.js drops every `(name)` segment when it builds the URL and the route type.
`app/(workspace)/projects/page.tsx` is the route `/projects`, and its generated
props type is `PageProps<'/projects'>`. See [typed routes](./typed-routes.md).

Groups can nest, and they can appear at any depth:
`app/account/(settings)/profile/page.tsx` is `/account/profile`.

### Two groups cannot claim the same URL

Because the group name disappears, `app/(marketing)/about/page.tsx` and
`app/(shop)/about/page.tsx` both resolve to `/about`. Next.js reports that as an
error. Each URL must come from exactly one page.

### Multiple root layouts

A root layout is any layout with no layout above it. If you delete `app/layout.tsx`
and give each group its own, every group becomes a separate document:

```text
app/
├── (marketing)/
│   ├── layout.tsx     ← root layout: <html> + marketing CSS
│   └── page.tsx       ← /
└── (shop)/
    ├── layout.tsx     ← root layout: <html> + shop CSS
    └── cart/page.tsx  ← /cart
```

```tsx file="app/(marketing)/layout.tsx"
import type { ReactNode } from 'react'
import './marketing.css'

export default function MarketingRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="marketing">{children}</body>
    </html>
  )
}
```

```tsx file="app/(shop)/layout.tsx"
import type { ReactNode } from 'react'
import './shop.css'

export default function ShopRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="shop">{children}</body>
    </html>
  )
}
```

Two rules apply:

- **Each root layout must render `<html>` and `<body>`.**
- **The home page must live inside one of the groups** (here
  `app/(marketing)/page.tsx`), because there is no top-level layout to host
  `app/page.tsx`.

> [!WARNING]
> **Navigating between different root layouts is a full page load**, not a
> client-side navigation. Going from `/cart` (in `(shop)`) to `/` (in
> `(marketing)`) reloads the document, so all client state is lost and nothing is
> kept from the previous page. This only applies across root
> layouts. Navigations within one root layout stay client-side.

With multiple root layouts there is no single layout to wrap a 404 page. The
[file conventions](./file-conventions.md) page covers the experimental
`global-not-found.tsx` convention for that case.

## Server and client implications

A group layout is a normal layout: a Server Component by default, mounted once
and preserved across navigations inside the group. Leaving the group unmounts it,
so Client Component state inside a group layout does not survive a navigation to
a page outside the group.

## Common patterns

### Excluding one page from a shared layout

Move everything except the exception into a group:

```text
app/
├── layout.tsx
├── (with-nav)/
│   ├── layout.tsx
│   ├── page.tsx           ← /           (has nav)
│   └── pricing/page.tsx   ← /pricing    (has nav)
└── checkout/page.tsx      ← /checkout   (no nav, fewer distractions)
```

### Per-section loading and error states

A group can hold `loading.tsx` and `error.tsx` like any folder, so a whole
section shares one fallback without adding a URL prefix.

### A runnable version

The [routing example app](../../examples/nextjs/routing/README.md) uses
`(marketing)` and `(shop)` groups under one `app/[lang]` root layout. Only the
`(shop)` group renders a shipping banner.

## Common mistakes

**Two groups with a page at the same URL.** `(a)/about` and `(b)/about` conflict,
because the group name is not part of the URL.

**Multiple root layouts without a home page in a group.** With no top-level
`app/layout.tsx`, `/` must be defined inside one of the groups.

**Using multiple root layouts for sections users move between constantly.** Every
crossing is a full reload. Use nested layouts under one root instead.

**Linking to the group name.** `href="/(shop)/cart"` is not a URL. Link to
`/cart`.

**Relying on a group for access control.** `(admin)` is a folder name. Check
permissions where the data is read.

## Related topics

- [Pages and layouts](./pages-and-layouts.md): how layouts nest and persist.
- [File conventions](./file-conventions.md): the files a group can contain, and
  `global-not-found.tsx`.
- [Parallel routes](./parallel-routes.md): the other folder prefix that does not
  change the URL (`@slot`).
- [Protecting routes](../nextjs-auth/protecting-routes.md): where authorization
  belongs instead of in a folder name.
- [Composition](../patterns/composition.md): the React pattern behind a layout
  wrapping `children`.
