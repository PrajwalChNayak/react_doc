---
title: Introduction to Next.js
description: What Next.js adds on top of React, when to choose it over a plain React app, and how this area relates to the React sections.
group: nextjs-getting-started
order: 10
status: current
related: [nextjs-getting-started/installation, nextjs-getting-started/learning-path, getting-started/introduction, server-react/overview]
---

## Overview

Next.js is a React framework. React gives you components, hooks, Server
Components and Server Functions as a *model*. Next.js is the part that turns that
model into a running application: it owns the router, the bundler, the server,
the cache, and the build.

This area of the site documents **Next.js 16.3** (pinned examples use
`next@16.3.5`) and the **App Router**, which is the current way to build a
Next.js app. It assumes you know React. Where a page leans on a React concept,
it links the React page instead of explaining the concept again.

| Next.js adds | What it means in practice | Start here |
|---|---|---|
| File-system routing | Folders in `app/` are URL segments. `page.tsx`, `layout.tsx`, `loading.tsx` and `error.tsx` are conventions, not imports. | [File conventions](../nextjs-routing/file-conventions.md) |
| Rendering and prerendering | Every route is a Server Component tree by default. `next build` prerenders what it can and streams the rest at request time. | [Server Components in Next.js](../nextjs-rendering/server-components.md) |
| Caching | With Cache Components, caching is opt-in and explicit: `"use cache"`, `cacheLife`, `cacheTag`. | [Caching model](../nextjs-data-caching/caching-model.md) |
| Server Actions wiring | React defines Server Functions. Next.js generates their endpoints, wires them to `<form action>`, and ties them to revalidation. | [Server Actions](../nextjs-mutations/server-actions.md) |
| Backend features | Route Handlers, `proxy.ts`, environment variables and `after()` in the same project as the UI. | [Route Handlers](../nextjs-backend/route-handlers.md) |
| Bundling | Turbopack is the default bundler for both `next dev` and `next build`. | [Dev and build](./dev-and-build.md) |
| Images, fonts, metadata | `next/image`, `next/font`, and the Metadata API solve layout shift, font loading and `<head>` management. | [Images](../nextjs-styling/images.md) |

## Why it exists

React deliberately stops at the component. The
[React introduction](../getting-started/introduction.md) lists what it leaves to
you: a router, a data layer, a build tool, a server. Server Components make that
gap wider, not narrower, because they need a bundler that understands the
`"use client"` boundary and a server that can stream the result.

Wiring that yourself is a large, security-sensitive project. Next.js exists so
that routing, server rendering, the RSC bundler integration and the cache are
one coherent system, upgraded together. The trade is that you adopt its
conventions and its upgrade cadence.

## When to use it

Choose Next.js when at least one of these is true:

- Public pages need to arrive as HTML: marketing sites, stores, docs, content
  that search engines and link previews must read.
- You want Server Components and Server Functions in production. The
  [build tooling comparison](../ecosystem/build-tooling.md) explains why Next.js
  is the framework with a stable React Server Components implementation.
- The UI and a thin backend (form handling, webhooks, auth callbacks) belong in
  one deployable project.
- You want prerendering and caching decisions made per route rather than for the
  whole app.

## When not to use it

Choose a **plain React single-page app** (Vite plus a client router) when:

- The app lives entirely behind a login and nothing needs server-rendered HTML:
  an internal dashboard, an editor, an admin panel.
- You deploy only static files to a CDN and do not want to operate a Node.js
  server. Next.js has a static export mode, but it gives up the features that
  justify the framework.
- You already have a separate backend and want the front end to be a pure
  client of it.

[Build tooling](../ecosystem/build-tooling.md) walks through the Vite setup, and
[Routing](../ecosystem/routing.md) compares React Router and TanStack Router
for that shape of app. Adding Next.js to render one page on the server is a large
commitment for a small win.

> [!WARNING]
> **App Router apps run a React Canary build.** `next@16.3.5` vendors
> `19.3.0-canary-cbb046ab-20260731` and uses it for everything under `app/`,
> whatever `react` version your `package.json` lists. The React sections of this
> site document **React 19.2 stable**. A few React APIs you will meet on Next.js
> pages come from that Canary build, are stable in React 19.3, and are not
> available in React 19.2. Those pages label them.
> [React Canary in Next.js](../nextjs-rendering/react-canary.md) explains the
> relationship and what it means for upgrades and security patches.

## Basic example

The smallest App Router app is two files. The root layout renders the document
shell, and the page renders the content for `/`.

```tsx file="app/layout.tsx"
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx file="app/page.tsx"
export default async function HomePage() {
  const response = await fetch('https://api.github.com/repos/vercel/next.js');
  const repo: { stargazers_count: number } = await response.json();

  return (
    <main>
      <h1>Hello, Next.js</h1>
      <p>The Next.js repository has {repo.stargazers_count} stars.</p>
    </main>
  );
}
```

`HomePage` is an `async` Server Component. It fetches on the server, and none
of its code is sent to the browser. There is no router setup, no entry file and
no `createRoot` call: the file's location is the route.

The runnable version of this, with a dynamic route added, is
[the minimal example app](../../examples/nextjs/minimal/README.md).

## How it works

A request to a Next.js app goes through a fixed pipeline:

1. **`proxy.ts`** (optional) runs first and can rewrite, redirect or set headers.
2. **The router** matches the URL against the `app/` folder tree and collects
   the layouts, pages and boundaries for that route.
3. **React renders Server Components** on the server into the RSC payload and
   HTML. Parts that are prerendered at build time are served from the build
   output; parts that depend on the request stream in behind Suspense
   boundaries.
4. **The browser hydrates** only the Client Components, the files marked
   `"use client"` and what they import.
5. **Client-side navigation** fetches the RSC payload for the next route,
   so layouts that stay on screen keep their state.

The React model behind steps 3 and 4 is explained in
[Server React](../server-react/overview.md). The Next.js pages explain what the
framework decides at each step: what is prerendered, what is cached, and where
code runs.

> [!NOTE]
> **The Pages Router is legacy.** Next.js still ships the older `pages/`
> router, and it is still supported, but new features land in the App Router
> and this site documents only the App Router. If you maintain a `pages/` app,
> read [Pages Router to App Router](../nextjs-migration/pages-to-app-router.md).

### How this area relates to the React sections

- **React sections** (Getting Started through Reference, React 19.2): hooks,
  components, Suspense, error boundaries, Server Components as a React concept,
  Actions and forms.
- **Next.js area** (every page with a Next.js badge):
  file conventions, rendering and caching decisions, Server Actions wiring,
  backend features, deployment, and Next.js-specific security.

Every Next.js page carries a "Targets Next.js 16.3" badge. If a Next.js page and
a tutorial disagree, check the tutorial's version first: most published Next.js
material predates 16.0.

## Common patterns

- **Start from `create-next-app`.** It sets up TypeScript, ESLint, Tailwind CSS,
  the `@/*` import alias and `AGENTS.md`. See [Installation](./installation.md).
- **Keep components on the server until they need interactivity.** Add
  `"use client"` at the leaves that use state, effects or browser APIs. See
  [Client Components](../nextjs-rendering/client-components.md).
- **Opt into caching deliberately.** Enable Cache Components and mark cached
  work with `"use cache"`, rather than relying on framework defaults you have not
  read. See [use cache](../nextjs-data-caching/use-cache.md).
- **Follow the ordered path.** The [Next.js learning path](./learning-path.md)
  orders all seventeen Next.js groups.

## Common mistakes

- **Following a Next.js 13–15 tutorial as written.** Next.js 16 removed synchronous
  access to `params`, `searchParams`, `cookies()` and `headers()`, replaced `middleware.ts`
  with `proxy.ts`, and made Turbopack the default. Check the
  [15 to 16 migration page](../nextjs-migration/next-15-to-16.md) before copying
  old code.
- **Assuming `package.json` controls the React version.** The App Router uses
  the React Canary build vendored inside `next`. Upgrading `next` is what
  patches an App Router app's React. See
  [React Canary in Next.js](../nextjs-rendering/react-canary.md).
- **Marking everything `"use client"`.** It turns off the main benefit of the
  App Router and ships every component to the browser.
- **Choosing Next.js for an app with no server-rendering needs.** A Vite SPA is
  smaller to operate. See [Build tooling](../ecosystem/build-tooling.md).
- **Running a Next.js version below the security floor.** Anything below
  16.3.3 is exposed to the August 2026 critical advisories. See
  [Installation](./installation.md).

## Related topics

- [Installation](./installation.md) — create a Next.js 16.3 app and the minimum
  safe version to run.
- [Next.js learning path](./learning-path.md) — the order to read the Next.js
  groups in.
- [Introduction to React](../getting-started/introduction.md) — the React
  model this framework builds on.
- [Server React](../server-react/overview.md) — SSR, streaming, static
  generation and Server Components as React concepts.
- [React Canary in Next.js](../nextjs-rendering/react-canary.md) — why App
  Router apps run a newer React than the React sections document.
- [Build tooling](../ecosystem/build-tooling.md) — the Vite alternative when you
  do not need a framework.
