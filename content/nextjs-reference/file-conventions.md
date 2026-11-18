---
title: File conventions reference
description: Every special file, folder pattern, segment export and top-level file in a Next.js 16.3 App Router project, in one table per kind.
group: nextjs-reference
order: 10
status: current
since: "16.3"
related: [nextjs-routing/file-conventions, nextjs-getting-started/project-structure, nextjs-reference/next-config, nextjs-reference/cheat-sheet]
shape: reference
---

Lookup, not reading. For how these files compose into a route, read
[File conventions](../nextjs-routing/file-conventions.md). Labels: **Current**
(stable, no flag), **Opt-in** (stable, needs a flag), **Experimental** (needs an
`experimental.*` flag), **Deprecated**.

## Route files

Special files inside `app/`. Each applies to the segment (folder) it sits in.

| File | Extensions | Purpose | Label | Version notes |
|---|---|---|---|---|
| `layout` | `.js` `.jsx` `.tsx` | Shared UI that wraps a segment and its children and persists across navigations. The root `app/layout` must render `<html>` and `<body>`. | Current | `params` is a Promise (since 15). Type with `LayoutProps<'/route'>`. |
| `page` | `.js` `.jsx` `.tsx` | Makes a segment publicly routable and renders its UI. | Current | `params` and `searchParams` are Promises. Synchronous access was removed in 16.0. |
| `loading` | `.js` `.jsx` `.tsx` | A `<Suspense>` fallback for the segment. | Current | |
| `error` | `.js` `.jsx` `.tsx` | Error boundary for the segment. Must be a Client Component. | Current | `retry` prop stable in 16.3.0 (renamed from `unstable_retry`, 16.2). |
| `global-error` | `.js` `.jsx` `.tsx` | Error UI for the root layout. Renders its own `<html>` and `<body>`. | Current | Same `retry` prop. |
| `not-found` | `.js` `.jsx` `.tsx` | UI for `notFound()` and, at the root, unmatched URLs. | Current | |
| `global-not-found` | `.js` `.jsx` `.tsx` | A 404 for unmatched URLs that bypasses layouts. For apps with several root layouts or a dynamic root segment. | Experimental | Needs `experimental.globalNotFound`. |
| `forbidden` | `.js` `.jsx` `.tsx` | UI for `forbidden()` (403). | Experimental | Needs `experimental.authInterrupts`. |
| `unauthorized` | `.js` `.jsx` `.tsx` | UI for `unauthorized()` (401). | Experimental | Needs `experimental.authInterrupts`. |
| `template` | `.js` `.jsx` `.tsx` | Like a layout, but remounts on every navigation. | Current | |
| `default` | `.js` `.jsx` `.tsx` | Fallback for a parallel route slot when the URL does not match it. | Current | **Required for every slot since 16.0.** Builds fail without it. |
| `route` | `.js` `.ts` | Route Handler: HTTP endpoints using Web `Request` / `Response`. | Current | `context.params` is a Promise. `GET` not cached by default since 15. Type with `RouteContext<'/route'>`. |

## Folder conventions

| Pattern | Example | Meaning |
|---|---|---|
| `folder` | `app/blog/page.tsx` | A URL segment: `/blog`. |
| `[segment]` | `app/blog/[slug]/page.tsx` | Dynamic segment: `/blog/hello`. |
| `[...segment]` | `app/help/[...topic]/page.tsx` | Catch-all: `/help/a/b`. |
| `[[...segment]]` | `app/wiki/[[...path]]/page.tsx` | Optional catch-all: also matches `/wiki`. |
| `(group)` | `app/(marketing)/page.tsx` | Route group: organizes files, omitted from the URL. Can hold its own root layout. |
| `_folder` | `app/blog/_components/post-card.tsx` | Private folder: never routable. |
| `@slot` | `app/dashboard/@analytics/page.tsx` | Parallel route slot, passed to the parent layout as a prop. Needs `default`. |
| `(.)folder` | `app/lookbook/@modal/(.)looks/[lookId]/page.tsx` | Intercept a sibling route. |
| `(..)folder` | | Intercept one level up. |
| `(..)(..)folder` | | Intercept two levels up. |
| `(...)folder` | | Intercept from the `app` root. |

A dynamic segment **above the root layout** (for example `app/[lang]/layout.tsx`)
is a root param. Its name becomes an async getter in `next/root-params` (16.3).
The folder name must be a valid JavaScript identifier, so `[post-slug]` fails.

## Metadata files

Static files are served as they are. Code files (`.js` `.ts` `.tsx`) generate
the asset and are cached by default.

| File | Static extensions | Generated | Location | Version notes |
|---|---|---|---|---|
| `favicon` | `.ico` | Not generatable | `app/` root only | |
| `icon` | `.ico` `.jpg` `.jpeg` `.png` `.svg` | `.js` `.ts` `.tsx` | any segment | Generated: `params` and `id` are Promises since 16.0. Several formats with the same name render as separate links since 16.2. |
| `apple-icon` | `.jpg` `.jpeg` `.png` | `.js` `.ts` `.tsx` | any segment | Same as `icon`. |
| `opengraph-image` | `.jpg` `.jpeg` `.png` `.gif` | `.js` `.ts` `.tsx` | any segment | Image function: `params` and `id` are Promises since 16.0. `generateImageMetadata` still receives `params` synchronously. |
| `twitter-image` | `.jpg` `.jpeg` `.png` `.gif` | `.js` `.ts` `.tsx` | any segment | Same as `opengraph-image`. |
| `opengraph-image.alt`, `twitter-image.alt` | `.txt` | | next to the image | Alt text. |
| `sitemap` | `.xml` | `.js` `.ts` | any segment | `id` from `generateSitemaps` is a `Promise<string>` since 16.0. |
| `robots` | `.txt` | `.js` `.ts` | `app/` root only | |
| `manifest` | `.json` `.webmanifest` | `.js` `.ts` | `app/` root only | |

## Route segment config exports

Exported from `page`, `layout` or `route` files.

| Export | Values | With Cache Components | Label |
|---|---|---|---|
| `runtime` | `'nodejs'` (default) | Node.js only | Current. The `'edge'` value is **Deprecated**; remove the export. |
| `maxDuration` | `number` (seconds) | Allowed | Current |
| `preferredRegion` | `string \| string[]` | Allowed | **Deprecated** in the 16.3.5 docs. Remove the export. |
| `instant` | `true`, `false`, or `{ level }` | Only with `cacheComponents` | Current. Controls instant-navigation validation for the segment. |
| `prefetch` | `'partial'`, `'force-disabled'` | Only with `cacheComponents` | Current. Per-segment override of `partialPrefetching`. |
| `dynamicParams` | `boolean` | **Build error** | Previous Model only |
| `dynamic`, `revalidate`, `fetchCache` | | **Build error** | Previous Model only. See [The pre-16 caching model](../nextjs-migration/pre-16-caching-model.md). |

`experimental_ppr` was removed in 16.0.

Other exports Next.js reads from route files: `generateStaticParams`,
`metadata` / `generateMetadata`, `viewport` / `generateViewport` (pages and
layouts), and `size`, `alt`, `contentType`, `generateImageMetadata` (image
files).

## Top-level files and folders

| Path | Purpose | Label |
|---|---|---|
| `app/` | App Router. | Current |
| `pages/` | Pages Router. Can coexist with `app/`. | Current, maintenance only. See [Pages to App Router](../nextjs-migration/pages-to-app-router.md). |
| `public/` | Static assets served from `/`. | Current |
| `src/` | Optional folder holding `app/`, `pages/` and the files below. | Current |
| `proxy.ts` | Runs before routes are rendered: rewrite, redirect, set headers. One function, optional `config.matcher`. **Node.js runtime only.** | Current (16.0) |
| `middleware.ts` | Deprecated name of `proxy.ts`. The only file of the two that can still run on Edge. | **Deprecated** in 16.0. See [Middleware to proxy](../nextjs-migration/middleware-to-proxy.md). |
| `instrumentation.ts` | Server startup hook (`register`) and `onRequestError`. | Current |
| `instrumentation-client.ts` | Client code that runs before the app becomes interactive. | Current |
| `mdx-components.tsx` | Required for `@next/mdx` with the App Router. | Current |
| `next.config.ts` (`.js`, `.mjs`) | Framework configuration. `.cjs` and `.cts` are not supported. | Current. See [next.config reference](./next-config.md). |
| `next-env.d.ts` | Generated TypeScript references. Do not commit. | Current |
| `tsconfig.json` / `jsconfig.json` | TypeScript or JavaScript project config. | Current |
| `.env`, `.env.local`, `.env.development`, `.env.production` | Environment variables. Keep secrets out of version control. | Current |
| `eslint.config.mjs` | ESLint flat config. Run `eslint` directly; `next lint` was removed in 16.0. | Current |
| `AGENTS.md` | Written by `create-next-app` (16.2) and maintained by `next dev` (16.3) to point coding agents at the bundled docs. | Current |

## Generated output

| Path | Written by | Notes |
|---|---|---|
| `.next/` | `next build` | Production build. |
| `.next/dev/` | `next dev` | Separate from build output since 16.0, so both can run at once. |
| `.next/cache/turbopack` | `next build` | Filesystem cache, on by default in 16.3. Restore it in CI. |
| `.next/dev/cache/turbopack` | `next dev` | On by default since 16.1. |
| `.next/types`, `.next/dev/types` | `next build`, `next dev`, `next typegen` | `PageProps`, `LayoutProps`, `RouteContext`, `next/root-params` types. |
| `.next/diagnostics/analyze` | `next experimental-analyze --output` | Bundle analysis files. |

## A minimal tree

```text
.
├── app/
│   ├── layout.tsx            root layout
│   ├── page.tsx              /
│   ├── not-found.tsx
│   ├── global-error.tsx
│   ├── blog/
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   └── [slug]/
│   │       ├── page.tsx      /blog/:slug
│   │       └── opengraph-image.tsx
│   ├── dashboard/
│   │   ├── layout.tsx        receives children and analytics
│   │   ├── page.tsx
│   │   └── @analytics/
│   │       ├── page.tsx
│   │       └── default.tsx   required since 16.0
│   └── api/items/[id]/route.ts
├── public/
├── proxy.ts
├── instrumentation.ts
└── next.config.ts
```

## Common mistakes

- **A parallel route slot without `default.tsx`.** Builds fail since 16.0.
- **Naming the request interceptor `middleware.ts` in new code.** It is
  deprecated; write `proxy.ts`.
- **Putting `proxy.ts` inside `app/`.** It belongs at the project root or in
  `src/`, next to `app/`.
- **Exporting `dynamic` or `revalidate` with Cache Components on.** Both are build
  errors under `cacheComponents`.
- **Kebab-case root param folders** such as `app/[site-locale]`. `next/root-params`
  needs a valid identifier.
- **Using `forbidden.tsx` without `experimental.authInterrupts`.** The file is
  ignored until the flag is on.

## Related topics

- [File conventions guide](../nextjs-routing/file-conventions.md) — how layouts,
  pages, loading and error files nest into one route.
- [Project structure](../nextjs-getting-started/project-structure.md) — how to
  organize the rest of a project around these files.
- [next.config reference](./next-config.md) — the flags several of these files
  depend on.
- [Cheat sheet](./cheat-sheet.md) — code for the most used conventions.
- [Suspense](../data-fetching/suspense.md) — the React feature `loading.tsx` is
  built on.
