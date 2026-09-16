---
title: Incremental Static Regeneration
description: Prerender the dynamic routes that matter at build time, generate the rest on demand, and keep them fresh with cacheLife and tags.
group: nextjs-data-caching
order: 70
status: current
since: "16.0"
related: [nextjs-data-caching/cache-life-and-tags, nextjs-instant-navigations/overview, server-react/static-generation]
---

## Overview

**Incremental Static Regeneration (ISR)** lets a dynamic route such as
`/recipes/[slug]` behave like a static one without prerendering every possible
URL at build time. With Cache Components it is built from pieces you already
know:

- **`generateStaticParams`** lists the param values to prerender at build time.
- **`"use cache"` with `cacheLife`** makes the page's data cacheable and sets how
  often it regenerates.
- **`cacheTag` and `revalidateTag`** regenerate pages on demand when content
  changes.
- **`<Suspense>` around the `params` read** lets Next.js build a reusable shell
  for URLs it has not seen.

Since **16.3**, with Partial Prefetching also enabled, a URL that was not
prerendered gets that shell instantly on its first visit and is upgraded to a
full static page in the background.

## Why it exists

Prerendering every product, article or recipe at build time makes builds slow
and produces pages that may never be visited before the next deploy. Rendering
everything at request time throws away the speed of static HTML. ISR splits the
difference: build the popular pages, generate the long tail when someone asks,
and cache the result for everyone after them.

Regeneration solves the other half. A static page that can never change is only
useful for content that never changes. `cacheLife` and tags let the cached page
follow the data.

## When to use it

- **Large sets of pages with a popular head and a long tail**: product catalogs,
  documentation, blog archives, user-generated content.
- **Content that changes occasionally**, especially when a CMS can call a webhook
  on publish.
- **Routes where first-visit speed matters** even for URLs you did not prerender.

## When not to use it

- **Pages whose main content is personal** (a dashboard, an inbox). There is
  nothing to share between visitors; stream it behind `<Suspense>` instead.
- **Data that must be exact on every request**, such as stock at checkout.
- **A handful of fixed URLs.** List them all in `generateStaticParams`; there is
  no long tail to regenerate.

## Basic example

The data functions are cached and tagged:

```ts file="lib/recipes.ts"
import { cacheLife, cacheTag } from 'next/cache';

export type Recipe = { slug: string; title: string; minutes: number; steps: string[] };

const API = 'https://recipes.example.com';

export async function getRecipe(slug: string): Promise<Recipe | null> {
  'use cache';
  cacheLife('days');
  cacheTag('recipes', `recipe:${slug}`);

  const response = await fetch(`${API}/recipes/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Recipe API responded with ${response.status}`);
  return response.json();
}

export async function getPopularRecipeSlugs(): Promise<string[]> {
  'use cache';
  cacheLife('days');
  cacheTag('recipes');

  const response = await fetch(`${API}/recipes/popular?limit=50`);
  const recipes: { slug: string }[] = await response.json();
  return recipes.map((recipe) => recipe.slug);
}
```

The page prerenders the popular recipes and reads `params` inside a boundary:

```tsx file="app/recipes/[slug]/page.tsx"
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getPopularRecipeSlugs, getRecipe } from '@/lib/recipes';

export async function generateStaticParams() {
  const slugs: string[] = await getPopularRecipeSlugs();
  // Must return at least one entry with Cache Components.
  return slugs.map((slug) => ({ slug }));
}

async function RecipeDetails({ params }: Pick<PageProps<'/recipes/[slug]'>, 'params'>) {
  const { slug } = await params;
  const recipe = await getRecipe(slug);
  if (!recipe) notFound();

  return (
    <article>
      <h1>{recipe.title}</h1>
      <p>Ready in {recipe.minutes} minutes</p>
      <ol>
        {recipe.steps.map((step: string) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </article>
  );
}

export default function RecipePage({ params }: PageProps<'/recipes/[slug]'>) {
  return (
    <main>
      <Suspense fallback={<p>Loading recipe…</p>}>
        <RecipeDetails params={params} />
      </Suspense>
    </main>
  );
}
```

At build time, Next.js prerenders a full page for every popular slug. It also
renders the route once with `params` unresolved, which produces the shell: the
`<main>` element and the fallback, with nothing specific to a recipe.

## How it works

### Build time

For each value returned by `generateStaticParams`, `await params` resolves, the
cached data loads, and the page is prerendered completely. For the generic
render, `await params` suspends, so the output stops at the `<Suspense>`
fallback. That generic output is the route's **App Shell**: the part of the page
that does not depend on URL data.

This is why the example does not await `params` in `RecipePage` itself. An
`await` above the boundary would tie the whole page to a specific URL, leaving
no reusable shell.

### Request time

| Visit | What the visitor receives |
|---|---|
| A prerendered slug | The complete static page, from the cache |
| A slug not returned by `generateStaticParams` | Served on demand. The shell is prerendered, and the recipe streams in at request time. Its data still comes from the `"use cache"` entry when one exists. |

Params that `generateStaticParams` did not return are rendered on request.
`dynamicParams` is not supported with Cache Components; to reject unknown values,
call `notFound()` when the data does not exist, as the example does.

> [!NOTE]
> **Opt-in (16.3).** Enable `partialPrefetching: true` alongside
> `cacheComponents: true` and a URL that was not prerendered is served the App
> Shell **instantly on its first visit**, then rendered in the background with
> its now-known params. The next visitor gets the upgraded result from the
> cache. This improved ISR is part of the
> [Instant Navigations](../nextjs-instant-navigations/overview.md) suite, which
> is slated to become the default in a future major version.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
```

With Partial Prefetching on, **a prefetch counts as the first visit**. When a
`<Link>` to an unlisted recipe enters the viewport, the background upgrade starts
before the click, so the navigation lands on the upgraded page. According to the
16.3 docs, versions before 16.3 waited for a full server render for unlisted
params instead of serving the App Shell.

### What the upgrade produces

After the first visit, Next.js renders the page with the known params and pushes
the static boundary as far down the tree as it can:

- **Every read cached, all params known:** a fully static page.
- **All params known, but uncached data or `cookies()` behind `<Suspense>`:** a
  cached page with those fallbacks. Those parts still stream per request.
- **Nested params:** they resolve in route order. A value not returned by the
  outer segment's `generateStaticParams` stays unresolved, and deeper params
  cannot upgrade past it.

### Regeneration

A generated page is only as fresh as the data it was built from:

- **Time-based:** the `cacheLife` of the page's cached data sets it. With `days`,
  a request more than a day after the entry was filled is served the cached page
  and triggers a background regeneration.
- **On demand:** `revalidateTag('recipe:pancakes', 'max')` from a Route Handler
  or Server Action marks that recipe stale, and it regenerates on its next visit.
  See [Revalidation](./revalidation.md).

## Caching implications

- **`generateStaticParams` must return at least one param.** An empty array is a
  build error with Cache Components, because Next.js needs a real render to
  validate the route. Removing the export entirely opts the route out of ISR, so
  it renders on every request even if its data uses `"use cache"`.
- **Prerendered pages are stored where the deployment stores them**: on disk when
  self-hosting, or in the platform's durable storage behind a CDN. With several
  self-hosted instances, configure shared storage so every instance serves the
  same generation. See [Self-hosting](../nextjs-deployment/self-hosting.md).
- **A deploy starts over.** Pages generated on demand in one deployment are not
  carried into the next.
- **Bots receive the full page** rendered at request time rather than the shell,
  so the data behind the page must be reachable at request time as well as at
  build time.

## Common patterns

### Prerender a sample, generate the rest

List only the pages that are worth the build time: the most visited, the most
linked, or the newest. Everything else is generated on its first visit. Choosing
fewer pages makes builds faster without making those pages slower for long.

### Layout and page params separately

For `/[category]/[product]`, give the category layout its own
`generateStaticParams` and its own `<Suspense>` around the category read. A known
category with an unknown product can then serve a shell that already contains
the category header.

### Webhook-driven content

Combine `cacheLife('max')` on the data with a CMS webhook that calls
`revalidateTag(tag, 'max')`. Pages regenerate only when content changes.

### Coming from the Pages Router

The Pages Router ISR APIs map onto this model: `getStaticPaths` becomes
`generateStaticParams`, `getStaticProps` with `revalidate` becomes
`"use cache"` with `cacheLife`, and `fallback: true` behavior is what an
unlisted param now gets, without `router.isFallback`. Migration steps are in
[Pages to App Router](../nextjs-migration/pages-to-app-router.md).

## Common mistakes

**Returning an empty array from `generateStaticParams`.** It is a build error with
Cache Components. Return at least one real param.

**Awaiting `params` at the top of the page or layout.** The shell for unlisted
URLs is then empty of anything useful. Pass the `params` promise into a component
inside `<Suspense>`.

**Exporting `dynamicParams`.** It is not supported with Cache Components and fails
the build. Call `notFound()` for unknown values.

**Leaving the page's data uncached.** Without `"use cache"`, there is nothing
static to regenerate, and the recipe streams on every request.

**Describing the instant first-visit shell as default behavior.** It requires
`partialPrefetching: true` in 16.3.

**Expecting on-demand revalidation to regenerate every page at once.** Tagged
pages regenerate as they are visited.

## Related topics

- [cacheLife and cacheTag](./cache-life-and-tags.md): the lifetimes and tags that
  decide when a generated page regenerates.
- [Revalidation](./revalidation.md): regenerating pages on demand after content
  changes.
- [Instant Navigations](../nextjs-instant-navigations/overview.md): the opt-in
  suite that serves the App Shell on the first visit.
- [Static generation (React)](../server-react/static-generation.md): the React
  prerendering and resuming that static shells are built on.
- [Suspense (React)](../data-fetching/suspense.md): the boundary that separates
  the reusable shell from URL-specific content.
