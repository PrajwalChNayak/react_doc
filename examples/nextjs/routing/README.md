# Routing example (Next.js 16.3)

A small App Router app that exercises the routing conventions documented in the
Next.js Routing section. Everything lives under a single root layout at
`app/[lang]/layout.tsx`, so `lang` is a **root param**.

## What it demonstrates

| Convention | Where | Try it |
|---|---|---|
| Root params (`next/root-params`) | `app/[lang]/layout.tsx`, `lib/dictionaries.ts` | `/en` and `/fr` |
| Locale negotiation in `proxy.ts` | `proxy.ts` | `/` redirects to `/en` or `/fr` from `Accept-Language` |
| Dynamic segment with awaited `params` | `app/[lang]/(shop)/products/[slug]/page.tsx` | `/en/products/trail-runner` |
| Catch-all segment | `app/[lang]/docs/[...slug]/page.tsx` | `/en/docs/guides/routing/parallel-routes` |
| Route groups | `app/[lang]/(marketing)`, `app/[lang]/(shop)` with its own layout | `/en/about` vs `/en/products` |
| Parallel route slot with `default.tsx` | `app/[lang]/@modal/` | always rendered by the root layout |
| Intercepting route modal | `app/[lang]/@modal/(.)photos/[id]/page.tsx` | click a photo on `/en/photos`, then refresh |
| `PageProps` / `LayoutProps` | every `page.tsx` and `layout.tsx` | `npm run typecheck` |
| Typed links (`typedRoutes: true`) | `next.config.ts` | change an `href` to a route that does not exist and run `npm run typecheck` |
| Smooth-scroll opt-in | `data-scroll-behavior="smooth"` on `<html>` | |

## Doc pages it backs

- [File conventions](../../../content/nextjs-routing/file-conventions.md)
- [Pages and layouts](../../../content/nextjs-routing/pages-and-layouts.md)
- [Dynamic segments](../../../content/nextjs-routing/dynamic-segments.md)
- [Typed routes](../../../content/nextjs-routing/typed-routes.md)
- [Route groups](../../../content/nextjs-routing/route-groups.md)
- [Parallel routes](../../../content/nextjs-routing/parallel-routes.md)
- [Intercepting routes](../../../content/nextjs-routing/intercepting-routes.md)
- [Linking and navigation](../../../content/nextjs-routing/linking-and-navigation.md)
- [Redirects](../../../content/nextjs-routing/redirects.md)
- [Root params](../../../content/nextjs-routing/root-params.md)
- [Internationalization](../../../content/nextjs-routing/internationalization.md)

## Run it

From a fresh clone:

```bash
cd examples/nextjs
npm install
npm run dev --workspace @nextjs-examples/routing
```

Open http://localhost:3000. You are redirected to `/en` or `/fr`.

Production build and type check:

```bash
npm run build --workspace @nextjs-examples/routing
npm run start --workspace @nextjs-examples/routing
npm run typecheck --workspace @nextjs-examples/routing
```

## Environment variables and services

None. The data lives in `lib/catalog.ts` and `dictionaries/*.json`, so the app
needs no database, API key, or `.env` file.

## Things to notice

- **Soft vs hard navigation.** Clicking a photo intercepts `/en/photos/2` and
  shows it in the `@modal` slot over the gallery. Refreshing the same URL renders
  the full photo page, because interception only happens on client-side
  navigation.
- **Closing the modal.** `router.back()` pops the intercepted entry.
  `@modal/page.tsx` and `@modal/[...catchAll]/page.tsx` return `null` so that
  navigating to any other page with a link also clears the slot.
- **`default.tsx` is required.** Delete `app/[lang]/@modal/default.tsx` and
  `npm run build` fails. Next.js 16 made an explicit default mandatory for every
  slot.
- **Root params in shared code.** `lib/dictionaries.ts` calls `lang()` itself, so
  no page passes the locale down. It works in Server Components only, not in
  Client Components, Server Actions or Route Handlers.
