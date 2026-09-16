---
title: Next.js learning path
description: An ordered route through the React prerequisites and all seventeen Next.js groups, from a first route to a production deploy.
group: nextjs-getting-started
order: 70
status: current
shape: reference
related: [nextjs-getting-started/introduction, getting-started/learning-path, nextjs-reference/cheat-sheet]
---

This path assumes you are building an App Router app on **Next.js 16.3**. Each
stage names the first page of a group. Read that page, then continue through the
group in sidebar order before moving on. The order is not arbitrary: caching
makes no sense before rendering, and security makes no sense before mutations
and backend features.

## Stage 0 — React first

Next.js pages do not re-explain React. If any of these are unfamiliar, read them
before Stage 1. The full React route is the
[React learning path](../getting-started/learning-path.md).

- [Introduction to React](../getting-started/introduction.md) and
  [Thinking in React](../getting-started/thinking-in-react.md) — the component
  model everything else assumes.
- [State](../core-concepts/state.md), [useEffect](../hooks/use-effect.md) and
  [Composition](../patterns/composition.md) — the client-side vocabulary. The
  "when not to use it" part of `useEffect` matters more in Next.js, where most
  data loading moves to the server.
- [Suspense](../data-fetching/suspense.md) — the loading boundaries Next.js
  streams around.
- [Server React](../server-react/overview.md),
  [Server Components](../server-react/server-components.md),
  [Directives](../server-react/directives.md) and
  [Server Functions](../server-react/server-functions.md) — the React model the
  App Router is built on. Do not skip these.
- [Forms and Actions](../patterns/forms-and-actions.md) and
  [Error boundaries](../patterns/error-boundaries.md) — what Server Actions and
  `error.tsx` build on.
- [TypeScript setup](../typescript/setup.md) — the React type packages every
  Next.js project installs.

## Stage 1 — Getting started

1. [Introduction to Next.js](./introduction.md) — what the framework adds, and
   the React Canary build the App Router runs.
2. [Installation](./installation.md) — a running app on 16.3.5, above the
   security floor.
3. [Project structure](./project-structure.md) — which file names are API.
4. [Dev and build](./dev-and-build.md) — `next dev`, `next build`, Turbopack.
5. [TypeScript in Next.js](./typescript.md) — generated route types.
6. [AI coding agents](./ai-agents.md) — `AGENTS.md` and the bundled docs, if you
   work with an agent.

## Stage 2 — Routes and rendering

- **Routing.** Start at [File conventions](../nextjs-routing/file-conventions.md).
  Folders become URLs, layouts nest, and `params` is a Promise.
- **Rendering.** Start at
  [Server Components in Next.js](../nextjs-rendering/server-components.md). Where
  code runs, what is prerendered, and
  [React Canary in Next.js](../nextjs-rendering/react-canary.md).
- **Errors and loading UI.** Start at
  [Error boundaries](../nextjs-errors/error-boundaries.md). `error.tsx`,
  `catchError`, `notFound()` and `loading.tsx`.

## Stage 3 — Data

- **Data and caching.** Start at
  [Caching model](../nextjs-data-caching/caching-model.md). Cache Components,
  `"use cache"`, `cacheLife` and revalidation. The most important group for
  performance and the one old tutorials get most wrong.
- **Mutations.** Start at [Server Actions](../nextjs-mutations/server-actions.md).
  Forms, revalidating after a write, and optimistic updates.
- **Databases and ORMs.** Start at [Databases overview](../nextjs-databases/overview.md).
  Connection pooling, Prisma and Drizzle.

## Stage 4 — Backend and security

- **Backend features.** Start at [Route Handlers](../nextjs-backend/route-handlers.md).
  Then `proxy.ts`, runtimes, environment variables, webhooks and background work.
- **Authentication and authorization.** Start at
  [Auth overview](../nextjs-auth/overview.md). Sessions, a data access layer and
  protecting routes.
- **Security.** Start at [Security overview](../nextjs-security/overview.md).
  Read it before you deploy anything with a Server Action in it. Keep
  [Security advisories](../nextjs-security/security-advisories.md) bookmarked.

## Stage 5 — Polish and speed

- **Styling, images, fonts and metadata.** Start at
  [CSS and Tailwind](../nextjs-styling/css-and-tailwind.md).
- **Performance.** Start at [Performance overview](../nextjs-performance/overview.md).
  Measure before changing anything.
- **Instant Navigations.** Start at
  [Instant Navigations overview](../nextjs-instant-navigations/overview.md). This
  is opt-in in 16.3 and requires Cache Components, so read it after the data
  and caching group.

## Stage 6 — Ship it

- **Testing.** Start at [Testing overview](../nextjs-testing/overview.md). Unit
  tests for components, and Playwright for everything that needs a server.
- **Deployment.** Start at [Build output](../nextjs-deployment/build-output.md),
  and finish with the [deployment checklist](../nextjs-deployment/checklist.md).

## Stage 7 — Existing apps and reference

- **Migration.** Start at [Next.js 15 to 16](../nextjs-migration/next-15-to-16.md).
  Read it if you maintain an older app, or whenever a tutorial's code does not
  compile.
- **Reference.** Start at [File conventions reference](../nextjs-reference/file-conventions.md).
  Not reading material: the [cheat sheet](../nextjs-reference/cheat-sheet.md) and
  [troubleshooting](../nextjs-reference/troubleshooting.md) are for bookmarking.

## Common mistakes

- **Starting with Next.js before Server Components make sense.** The App Router
  is Server Components plus conventions. Without Stage 0 the conventions look
  arbitrary.
- **Learning caching from a pre-16 tutorial.** Implicit `fetch` caching and
  route segment exports like `revalidate` belong to the previous model. Learn
  Cache Components from the data and caching group, and use the migration group
  only for old code.
- **Treating `proxy.ts` as the place for authorization.** Read the auth and
  security groups before protecting anything.
- **Enabling Instant Navigations first.** It is opt-in and builds on Cache
  Components. Get caching right, then opt in.
- **Skipping testing until the end of a project.** Server Actions and Route
  Handlers are public endpoints, and tests are how you prove their checks work.

## Related topics

- [Introduction to Next.js](./introduction.md) — what this path is building
  toward.
- [React learning path](../getting-started/learning-path.md) — the full React
  route behind Stage 0.
- [Server React](../server-react/overview.md) — the one React group every
  Next.js reader needs.
- [Cheat sheet](../nextjs-reference/cheat-sheet.md) — the quick-reference
  companion to this path.
- [Next.js 15 to 16](../nextjs-migration/next-15-to-16.md) — if you arrive with
  Next.js experience from an earlier version.
