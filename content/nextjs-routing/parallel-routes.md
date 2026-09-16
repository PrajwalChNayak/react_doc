---
title: Parallel Routes
description: Render several independently navigable pages in one layout with @slot folders, and why every slot needs a default.tsx since Next.js 16.
group: nextjs-routing
order: 60
status: current
since: "16.0"
related: [nextjs-routing/intercepting-routes, nextjs-routing/pages-and-layouts, data-fetching/suspense, patterns/composition]
---

## Overview

A folder named with an `@` prefix, such as `@analytics`, is a **slot**. A slot is
a second (or third) `children`: the parent layout receives it as a prop and
decides where to render it. Each slot matches the URL on its own, streams on its
own, and can have its own `loading.tsx` and `error.tsx`.

```text
app/insights/
├── layout.tsx            ← receives children, revenue, activity
├── page.tsx              ← children at /insights
├── default.tsx
├── @revenue/
│   ├── page.tsx          ← revenue at /insights
│   └── default.tsx
└── @activity/
    ├── page.tsx          ← activity at /insights
    ├── default.tsx
    └── logins/
        └── page.tsx      ← activity at /insights/logins
```

Slots are not URL segments. `app/insights/@activity/logins/page.tsx` is served at
`/insights/logins`.

> [!WARNING]
> **Since Next.js 16.0, every slot must have an explicit `default.tsx`.** Builds
> fail without one. Before 16.0 a missing default silently rendered a 404. To keep
> that behavior, add a `default.tsx` that calls `notFound()`. To render nothing,
> return `null`.

## Why it exists

Dashboards, feeds, and split views show several unrelated regions at once. If all
of them are one page component, one slow query delays the entire screen, one
thrown error replaces all of it, and none of the regions can change without the
others re-rendering.

Slots make each region a route of its own. They load and fail independently, and
a region can navigate (switch tabs, open a detail view) while the other regions
keep their state. Combined with [intercepting routes](./intercepting-routes.md),
they also make URL-addressable modals possible.

## When to use it

- A **dashboard** where each panel has its own data and its own loading and error
  states.
- **Tabs inside one region** whose selection should be in the URL, while the rest
  of the page stays put.
- **Conditional sections**, such as an admin view and a member view of the same
  URL.
- A **modal** that has its own URL and survives a refresh, together with an
  intercepting route.

## When not to use it

**Do not use a slot for a plain component.** If a region never navigates on its
own, render a component inside the page and wrap it in `<Suspense>`. You get
streaming without the routing rules.

**Do not use slots to hide data.** A layout that renders only one of two slots
still renders both on the server. See
[Security considerations](#security-considerations).

**Do not use slots when the regions must share state.** Slots are separate
subtrees rendered by the layout. Lift the shared state into a Client Component in
the layout, or reconsider the split.

## Basic example

```tsx file="app/insights/layout.tsx"
export default function InsightsLayout({ children, revenue, activity }: LayoutProps<'/insights'>) {
  return (
    <div className="insights">
      <section className="insights-main">{children}</section>
      <section aria-label="Revenue">{revenue}</section>
      <section aria-label="Activity">{activity}</section>
    </div>
  )
}
```

`LayoutProps<'/insights'>` includes `revenue` and `activity` because the
`@revenue` and `@activity` folders exist. Rename a folder and the layout stops
compiling. See [typed routes](./typed-routes.md).

```tsx file="app/insights/@revenue/page.tsx"
async function getMonthlyRevenue(): Promise<{ month: string; total: string }> {
  const response = await fetch('https://api.example.com/revenue/current-month')
  if (!response.ok) throw new Error('Revenue service unavailable')
  return response.json()
}

export default async function RevenuePanel() {
  const revenue = await getMonthlyRevenue()
  return (
    <p>
      {revenue.month}: {revenue.total}
    </p>
  )
}
```

```tsx file="app/insights/@revenue/loading.tsx"
export default function RevenueLoading() {
  return <p aria-busy="true">Loading revenue…</p>
}
```

```tsx file="app/insights/@revenue/default.tsx"
export default function RevenueDefault() {
  return null
}
```

While the revenue request is pending, only the revenue panel shows its fallback.
If it throws, an `@revenue/error.tsx` would replace only that panel.

## How it works

### Soft navigation keeps unmatched slots

Each slot tracks its own active page. On a **client-side (soft) navigation**,
Next.js renders the slots that match the new URL and **keeps the previous content
of the slots that do not match**.

Navigating from `/insights` to `/insights/logins`:

| Slot | Has a match for `/insights/logins`? | Renders |
|---|---|---|
| `@activity` | Yes, `@activity/logins/page.tsx` | The logins page |
| `@revenue` | No | What it showed before (its `/insights` page) |
| `children` | No | What it showed before (`page.tsx`) |

### Hard navigation falls back to `default.tsx`

After a **full page load** of `/insights/logins` (a refresh, or a shared link),
there is no previous state to keep. Next.js renders `default.tsx` in every slot
that has no match.

```tsx file="app/insights/@activity/default.tsx"
export default function ActivityDefault() {
  return null
}
```

```tsx file="app/insights/default.tsx"
import InsightsOverview from './page'

// children has no page for /insights/logins. On a refresh, show the same
// overview it would have kept during a soft navigation.
export default function InsightsDefault() {
  return <InsightsOverview />
}
```

`children` is an implicit slot, so the same logic applies to it. Without
`app/insights/default.tsx`, a refresh on `/insights/logins` renders a 404 for
the whole route.

`default.tsx` receives `params` (a Promise) like a page does, so it can render
something specific to the current dynamic segment.

### What the 16.0 requirement changes in practice

Before 16.0, a slot without a default fell through to a 404 on a hard load, which
typically showed up as "the page works when I click to it but 404s when I
refresh". With the build requirement, you decide what each slot shows on a hard
load before you ship, and `next build` tells you which slot you forgot.

### Slots and rendering mode

All slots at one level are combined into a single render of that route segment.
You cannot have one slot prerendered and a sibling slot rendered per request at
the same level: if one slot is dynamic, they all are.

## Server and client implications

Slots are Server Components by default, like pages. The layout receives each slot
as an already-rendered `ReactNode`, which it can place anywhere, including inside
a Client Component:

```tsx file="app/insights/@activity/layout.tsx"
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function ActivityTabs({ children }: { children: ReactNode }) {
  return (
    <>
      <nav aria-label="Activity tabs">
        <Link href="/insights">Overview</Link>
        <Link href="/insights/logins">Logins</Link>
      </nav>
      <div>{children}</div>
    </>
  )
}
```

A layout inside a slot turns that slot into its own tab group: navigating between
its links only changes the `@activity` region.

To read the active page of a slot from a Client Component rendered by the parent
layout (`app/insights/layout.tsx`), pass the slot name to
`useSelectedLayoutSegment`:

```tsx file="app/insights/activity-tab-label.tsx"
'use client'

import { useSelectedLayoutSegment } from 'next/navigation'

export function ActivityTabLabel() {
  // 'logins' on /insights/logins, null while the slot shows its own page.tsx
  const segment = useSelectedLayoutSegment('activity')
  return <span>Viewing: {segment ?? 'overview'}</span>
}
```

## Common patterns

### Conditional slots

Render one of two slots based on the user's role:

```tsx file="app/workspace/layout.tsx"
import { getCurrentUser } from '@/lib/dal'

export default async function WorkspaceLayout({ admin, member }: LayoutProps<'/workspace'>) {
  const user = await getCurrentUser()
  return user.role === 'admin' ? admin : member
}
```

```tsx file="app/workspace/@admin/page.tsx"
import { requireAdmin } from '@/lib/dal'

export default async function AdminWorkspace() {
  // Authorize here too: this page renders even when the layout shows `member`.
  const stats = await requireAdmin()
  return <h1>{stats.pendingApprovals} approvals waiting</h1>
}
```

```tsx file="app/workspace/@admin/default.tsx"
export default function AdminDefault() {
  return null
}
```

```tsx file="app/workspace/@member/page.tsx"
export default function MemberWorkspace() {
  return <h1>Your workspace</h1>
}
```

```tsx file="app/workspace/@member/default.tsx"
export default function MemberDefault() {
  return null
}
```

### Modals

A slot whose `default.tsx` returns `null`, plus an intercepting route inside it,
gives you a modal with a real URL. That pattern is covered step by step in
[intercepting routes](./intercepting-routes.md), and runs in the
[routing example app](../../examples/nextjs/routing/README.md).

## Security considerations

**Both slots in a conditional layout render on the server**, whichever one the
layout returns. `@admin/page.tsx` runs its data fetches for every user, and the
choice only decides what is displayed. Authorize inside each slot's page, or in a
[data access layer](../nextjs-auth/data-access-layer.md), never only in the layout
that picks the slot.

## Common mistakes

**Omitting `default.tsx` in a slot.** Builds fail since Next.js 16.0. Add one that
returns `null` or calls `notFound()`.

**Forgetting `default.tsx` for `children`.** A slot sub-page like
`@activity/logins` works on click but 404s on refresh unless the parent folder has
a `default.tsx`.

**Expecting a slot to reset on navigation.** Unmatched slots keep their previous
content during soft navigation. Add a page or a catch-all that returns `null`
where the slot should clear.

**Putting `@slot` in a URL or a route type.** `/insights/@activity/logins` is not a
URL, and `LayoutProps<'/insights/@activity'>` is not a route.

**Authorizing only in the layout that chooses a slot.** Every slot renders. Check
permissions inside the slot.

**Mixing a prerendered slot with a dynamic sibling.** At one level, they are all
dynamic if one is.

## Related topics

- [Intercepting routes](./intercepting-routes.md): combine with a slot to build a
  modal with its own URL.
- [Pages and layouts](./pages-and-layouts.md): how layouts receive `children`,
  and slots alongside it.
- [File conventions](./file-conventions.md): where `default.tsx`, `loading.tsx`
  and `error.tsx` fit.
- [Suspense](../data-fetching/suspense.md): the boundary each slot's
  `loading.tsx` creates.
- [Composition](../patterns/composition.md): the React idea of passing several
  element props to one component.
