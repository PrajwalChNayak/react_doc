---
title: Prerendering
description: Prerender dynamic routes with generateStaticParams under Cache Components, understand first-request rendering, and produce a static export.
group: nextjs-rendering
order: 60
status: current
since: "16.0"
related: [nextjs-rendering/static-and-dynamic-rendering, nextjs-data-caching/isr, server-react/static-generation, nextjs-routing/dynamic-segments]
---

## Overview

Prerendering means Next.js renders a route before anyone asks for it, during
`next build`, and stores the HTML and RSC Payload. A static route is prerendered
automatically. A dynamic route such as `app/cookbook/[cuisine]/[dish]/page.tsx`
has no concrete URL to render until you tell Next.js which parameter values
exist. `generateStaticParams` is how you do that.

This page covers `generateStaticParams` with Cache Components, what happens to
URLs you did not list, and `output: 'export'`, which turns the whole app into
static files. What goes into a prerendered shell component by component is on
[static and dynamic rendering](./static-and-dynamic-rendering.md). The React
APIs underneath are in [Static generation](../server-react/static-generation.md).

## Why it exists

Work done at build time is work no user waits for. A recipe page that is
prerendered is served as a file, from a CDN if you have one, and costs no
database query on the hot path.

Parameter values also matter for correctness. When `params` is known during the
build, `await params` completes and everything that depends on it can be part
of the prerendered page. When it is not known, that work has to wait for a
request.

## When to use it

- Content with a known, bounded set of URLs: documentation, blog posts, product
  categories, marketing pages.
- The most visited subset of a large set (top products, recent posts), with the
  long tail rendered on demand.
- Sites that must be hosted as static files with no Node.js server, using a
  static export.

## When not to use it

Do not list every one of a million product IDs. Each listed value is build time
and storage, and most of those pages may never be visited before the next
deploy. Prerender the popular ones and let the rest render on first visit.

Do not use a static export if you need cookies, Server Actions, proxy, rewrites,
redirects, ISR or default image optimization. None of them work without a
server.

## Basic example

Return one object per URL. Each key is a dynamic segment name.

```tsx file="app/cookbook/[cuisine]/[dish]/page.tsx"
import { notFound } from 'next/navigation';
import { getDish, listPopularDishes } from '@/lib/cookbook';

export async function generateStaticParams() {
  const dishes: { cuisine: string; slug: string }[] = await listPopularDishes();

  return dishes.map((dish) => ({
    cuisine: dish.cuisine,
    dish: dish.slug,
  }));
}

export default async function DishPage({ params }: PageProps<'/cookbook/[cuisine]/[dish]'>) {
  const { cuisine, dish } = await params;
  const recipe = await getDish(cuisine, dish);

  if (!recipe) {
    notFound();
  }

  return (
    <article>
      <h1>{recipe.title}</h1>
      <p>{recipe.introduction}</p>
    </article>
  );
}
```

For the returned pairs, `next build` renders the page with those values. For
this to prerender fully, `getDish` must be cached with `"use cache"`. An uncached
query would still need a `<Suspense>` boundary.

## How it works

### Build time

During `next build`, `generateStaticParams` runs before the pages and layouts it
belongs to. Next.js renders the route once per returned object. During
`next dev`, it runs when you navigate to the route.

Identical `fetch` requests are memoized across `generateStaticParams`, layouts,
pages and Server Components, so fetching the same list in
`generateStaticParams` and in a layout does not send the request twice.

### With Cache Components: at least one value

With `cacheComponents` enabled, `generateStaticParams` must return **at least
one** params object. An empty array is a build error. The sample values are how
the build validates that the route does not read `cookies()`, `headers()` or
`searchParams` outside a Suspense boundary.

That validation only covers code paths the samples reach. If a branch runs only
for some values, such as `slug.startsWith('members-')`, and none of your samples
hit it, a problem in that branch appears on the first request for such a URL
instead of at build time. Include a sample for each branch that behaves
differently.

The official docs mention returning a placeholder value and handling it with
`notFound()` when no real values are known at build time. That weakens build
validation, so prefer at least one real value.

### URLs you did not list

A URL whose params were not returned is not an error. Next.js renders it on the
first request, validates it then, and saves the result for later requests.
Anything cached in that render is reused, and uncached or request-time parts
still stream behind their boundaries.

> [!NOTE]
> **Opt-in (16.3).** With `cacheComponents: true` **and** top-level
> `partialPrefetching: true`, a URL that was not prerendered serves an instant
> **App Shell** on its first visit (the route's static shell with param-specific
> parts behind their fallbacks) and is upgraded in the background for the next
> visitor. This is part of Instant Navigations, which is slated to become the
> default in a future major. Details are on [ISR](../nextjs-data-caching/isr.md).

For the App Shell to be useful, keep `await params` inside a Suspense boundary
in layouts, instead of at the top. Otherwise the layout is tied to one URL and
cannot be reused for unknown values.

### Multiple dynamic segments

A `generateStaticParams` can fill segments at its own level and above, never
below. There are two ways to generate nested values.

**Bottom up:** the page returns both `cuisine` and `dish`, as in the basic
example.

**Top down:** the layout returns `cuisine`, and the page's
`generateStaticParams` runs once per parent value. It receives the parent params
as a plain object, not a promise:

```tsx file="app/cookbook/[cuisine]/layout.tsx"
import type { ReactNode } from 'react';
import { listCuisines } from '@/lib/cookbook';

export async function generateStaticParams() {
  const cuisines: string[] = await listCuisines();
  return cuisines.map((cuisine) => ({ cuisine }));
}

export default function CuisineLayout({ children }: { children: ReactNode }) {
  return <section className="cuisine">{children}</section>;
}
```

The page's own `generateStaticParams` returns only `dish`:

```tsx file="app/cookbook/[cuisine]/[dish]/page.tsx"
import { notFound } from 'next/navigation';
import { getDish, listDishesForCuisine } from '@/lib/cookbook';

export async function generateStaticParams({
  params,
}: {
  params: Awaited<LayoutProps<'/cookbook/[cuisine]'>['params']>;
}) {
  const dishSlugs: string[] = await listDishesForCuisine(params.cuisine);
  return dishSlugs.map((dish) => ({ dish }));
}

export default async function DishPage({ params }: PageProps<'/cookbook/[cuisine]/[dish]'>) {
  const { cuisine, dish } = await params;
  const recipe = await getDish(cuisine, dish);

  if (!recipe) {
    notFound();
  }

  return <h1>{recipe.title}</h1>;
}
```

The `LayoutProps` helper types the parent params from the route, so a renamed
segment is a type error rather than an `undefined` at build time.

When the parent segment is a root param, the child can also read it with its
getter from `next/root-params`. See [root params](../nextjs-routing/root-params.md).

### Route Handlers

`generateStaticParams` also works in `route.ts` files, so `GET` responses for
known IDs can be generated at build time:

```ts file="app/api/cuisines/[cuisine]/route.ts"
import { getCuisineSummary, listCuisines } from '@/lib/cookbook';

export async function generateStaticParams() {
  const cuisines: string[] = await listCuisines();
  return cuisines.map((cuisine) => ({ cuisine }));
}

async function loadSummary(cuisine: string) {
  'use cache';
  return getCuisineSummary(cuisine);
}

export async function GET(_request: Request, { params }: RouteContext<'/api/cuisines/[cuisine]'>) {
  const { cuisine } = await params;
  return Response.json(await loadSummary(cuisine));
}
```

## Caching implications

Prerendered pages are cache entries like any other. The `"use cache"` scopes
inside them refresh on their `cacheLife` schedule, and tags invalidate them on
demand. `generateStaticParams` is **not** called again during revalidation, so a
new product appears either through first-request rendering or at the next build.
See [revalidation](../nextjs-data-caching/revalidation.md).

All of these entries are scoped to one deployment. A new deploy prerenders
again from scratch.

## Common patterns

### Static export

Set `output: 'export'` and `next build` writes an `out/` folder of HTML, CSS
and JavaScript that any static host can serve:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    loader: 'custom',
    loaderFile: './image-loader.ts',
  },
};

export default nextConfig;
```

`trailingSlash: true` writes `/about/index.html` instead of `/about.html`, which
suits hosts that map folders to `index.html`. The custom loader is required for
`next/image`, because the default loader needs a server.

Server Components still work: they run during the build, and their output is
saved as HTML for the first load and as a payload for client-side navigation.
Client Components are prerendered to HTML too, so browser APIs still belong in
Effects.

**Not supported in a static export:**

| Feature | Why |
|---|---|
| Dynamic routes without `generateStaticParams` | No list of files to write |
| Cookies, Draft Mode, Route Handlers that read the request | No request at build time |
| Server Actions | No server to call |
| `proxy.ts`, rewrites, redirects, custom headers | No server in front of the files |
| ISR and on-demand revalidation | Nothing regenerates the files |
| `next/image` with the default loader | No optimizer |
| Intercepting routes | Need server routing |
| Streaming | The host sends complete files |

Next.js reports these in `next dev` when `output: 'export'` is set, so problems
show up before deployment.

> [!WARNING]
> The bundled static export guide does not describe combining
> `output: 'export'` with `cacheComponents`. Run `next build` and check the
> output before relying on that combination.

### Prerender the head, render the tail

Return the top of a ranked list from `generateStaticParams` (the 200 most viewed
dishes) and let everything else render on first visit. Build time stays
bounded, and popular URLs never pay for a render.

## Common mistakes

**Returning an empty array under Cache Components.** It fails the build. Return
at least one real value.

**Expecting unlisted URLs to 404.** They render on first request. If a value is
invalid, call `notFound()` in the page after checking your data source.

**Awaiting `params` at the top of a shared layout.** The layout cannot be part of
an App Shell for unknown values. Await it inside a boundary.

**Relying on samples that skip a branch.** Code only reached by unlisted values
is validated on the first request. Add a sample for each distinct branch.

**Expecting new rows to appear in a static export.** Nothing runs after the
build. Rebuild and redeploy, or move to a server deployment with ISR.

**Using `export const dynamicParams = false` to restrict URLs.** Route segment
config such as `dynamicParams` is removed under Cache Components. Validate the
value in the page and call `notFound()`.

## Related topics

- [Static and dynamic rendering](./static-and-dynamic-rendering.md): what ends
  up in a prerendered shell and what streams.
- [ISR](../nextjs-data-caching/isr.md): App Shells for unlisted params and
  background upgrades.
- [Dynamic segments](../nextjs-routing/dynamic-segments.md): `[slug]`,
  catch-all and optional catch-all segments.
- [Static generation (React)](../server-react/static-generation.md): React's
  `prerender` APIs that build-time rendering relies on.
- [Build output](../nextjs-deployment/build-output.md): reading what
  `next build` prerendered.
