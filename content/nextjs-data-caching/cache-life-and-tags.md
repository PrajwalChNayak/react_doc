---
title: cacheLife and cacheTag
description: Set how long a cached entry stays fresh with cacheLife profiles, and name it with cacheTag so you can invalidate it on demand.
group: nextjs-data-caching
order: 30
status: current
since: "16.0"
related: [nextjs-data-caching/use-cache, nextjs-data-caching/revalidation, data-fetching/caching]
---

## Overview

Every `"use cache"` scope has a **lifetime** and can carry **tags**. Both come
from `next/cache`:

- `cacheLife(profile)` sets the lifetime. The profile is a built-in name, a
  custom name from `next.config.ts`, or an inline object.
- `cacheTag(...tags)` attaches one or more names to the entry, so
  [revalidation](./revalidation.md) can target it later.

Both can only be called inside a cache directive scope. Calling either at module
scope throws.

## Why it exists

"How long is this data fresh?" has no single answer. A price list and a legal
page need very different lifetimes, and the right answer also differs between
the browser, the server and the prerendered HTML. `cacheLife` expresses all
three with one call next to the data access, instead of spreading them across
headers and config.

Time alone is also not enough. When an editor publishes a post, waiting for a
timer is wrong. Tags give each entry a name that a mutation or a webhook can
invalidate the moment the data changes.

## When to use it

- **`cacheLife`: in every `"use cache"` scope.** The official recommendation is
  to always set it, so the lifetime is visible where the cache is declared.
- **A built-in profile** when one matches how often the data changes.
- **A custom profile** when several functions share a policy that the built-ins
  do not express, such as "catalog data".
- **`cacheTag`: on everything you might need to invalidate**, which is almost
  everything.

## When not to use it

- **To make data "almost fresh".** If a value must be correct on every request,
  do not cache it with a tiny lifetime. Leave it uncached behind `<Suspense>`.
- **Redefining a time-named built-in** such as `days` to mean two hours. It is
  supported, but readers will assume the preset. Define a custom name instead.
- **Tags derived from unbounded input**, such as a search query. Each distinct
  tag is metadata to track, and nothing will ever invalidate most of them.

## Basic example

```ts file="lib/articles.ts"
import { cacheLife, cacheTag } from 'next/cache';

export type Article = { slug: string; title: string; body: string };

export async function getArticle(slug: string): Promise<Article | null> {
  'use cache';
  cacheLife('days');
  cacheTag('articles', `article:${slug}`);

  const response = await fetch(`https://cms.example.com/articles/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`CMS responded with ${response.status}`);
  return response.json();
}
```

The entry refreshes in the background after a day. Invalidating `articles`
refreshes every article; invalidating `article:getting-started` refreshes one.

## How it works

### The three timings

A profile has three properties, all in seconds:

| Property | Applies to | Meaning |
|---|---|---|
| `stale` | The browser | How long the client router reuses the result without asking the server. Also decides whether the result can be in the route's App Shell. |
| `revalidate` | The server | After this long, the next request is served the cached value **and** triggers a background refresh. |
| `expire` | The server | After this long **without requests**, the next request waits for fresh content instead of receiving the old value. Must be longer than `revalidate`. |

`revalidate` gives you stale-while-revalidate. `expire` is the upper bound on
how old a served value can be after a quiet period.

### Built-in profiles

| Profile | `stale` | `revalidate` | `expire` | Suits |
|---|---|---|---|---|
| `default` | 5 minutes | 15 minutes | never | Used when you call no `cacheLife` |
| `seconds` | 30 seconds | 1 second | 1 minute | Near-real-time data |
| `minutes` | 5 minutes | 1 minute | 1 hour | Feeds, news |
| `hours` | 5 minutes | 1 hour | 1 day | Inventory, weather |
| `days` | 5 minutes | 1 day | 1 week | Blog posts, articles |
| `weeks` | 5 minutes | 1 week | 30 days | Newsletters, podcasts |
| `max` | 5 minutes | 30 days | 1 year | Content that rarely changes |

Properties you omit in a custom or inline profile inherit from `default`.
`cacheLife({})` applies `default` as it is.

### Short lifetimes change where content is served from

A lifetime that is too short to store safely changes how the result is
prerendered:

| Condition | Effect |
|---|---|
| `revalidate` is `0`, or `expire` is under 5 minutes | Excluded from prerendering. It becomes a dynamic hole resolved at request time. |
| `stale` under 30 seconds | Excluded from prerendering, because a prefetch would expire before the click. |
| `stale` from 30 seconds up to 5 minutes | Prerendered, but kept out of the route's App Shell. |

Of the built-in profiles only `seconds` crosses a threshold: its one-minute
`expire` excludes it from prerendering. Wrap components that use it in
`<Suspense>`.

### Client stale time

The server sends `stale` to the browser in the `x-nextjs-stale-time` response
header, and the client router enforces a minimum of 30 seconds. A
`revalidateTag`, `revalidatePath`, `updateTag` or `refresh` call from a Server
Action clears the whole client cache regardless of `stale`.

### Nested caches

When one cached scope uses another:

- **The outer scope has an explicit `cacheLife`:** its own lifetime wins,
  shorter or longer than the inner one.
- **The outer scope has no `cacheLife`:** it starts from `default`, a shorter
  inner lifetime lowers it, and a longer one cannot raise it.
- **A short-lived inner cache inside an outer scope without `cacheLife`** fails
  during prerendering. The error exists so a third-party component using
  `seconds` cannot silently make your page dynamic. Add an explicit `cacheLife`
  to the outer scope.

### `cacheTag`

- `cacheTag` accepts one or more strings: `cacheTag('products', 'product:42')`.
- Tagging the same entry twice with the same tag has no extra effect.
- One call accepts up to 128 tags, each up to 256 characters. Longer tags are
  skipped, tags past the 128th are dropped, and both log a warning.
- You can call it after loading data, to tag with values from the result.

## Caching implications

- **One `cacheLife` call runs per invocation.** You may call it in different
  branches, but only one branch should run.
- **Changing a built-in in config changes every call site.** Redefining
  `default` also changes scopes that call no `cacheLife` at all.
- **Tags work across stores.** An invalidated tag affects the server entry, the
  prerendered page that included it, and, when called from a Server Action, the
  browser's cached copy.

## Common patterns

### Declare custom profiles in `next.config.ts`

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: {
    catalog: {
      stale: 300, // 5 minutes in the browser
      revalidate: 1800, // refresh in the background after 30 minutes
      expire: 86400, // after a quiet day, wait for fresh data
    },
    editorial: {
      stale: 600, // 10 minutes
      revalidate: 3600, // 1 hour
      expire: 604800, // 1 week
    },
  },
};

export default nextConfig;
```

`next dev`, `next build` and `next typegen` generate typed overloads of
`cacheLife` from this config, so your editor autocompletes `'catalog'` and
`'editorial'` and shows their values.

```ts file="lib/catalog-data.ts"
import { cacheLife, cacheTag } from 'next/cache';

export type CatalogItem = { sku: string; name: string; priceCents: number };

export async function getCatalogItems(): Promise<CatalogItem[]> {
  'use cache';
  cacheLife('catalog');
  cacheTag('catalog');

  const response = await fetch('https://api.example.com/catalog');
  return response.json();
}
```

The [caching example app](../../examples/nextjs/caching/README.md) uses the same
`catalog` profile.

### Choose the lifetime from the data

A draft or missing record should not be cached as long as a published one:

```ts file="lib/posts.ts"
import { cacheLife, cacheTag } from 'next/cache';

type Post = { slug: string; title: string; revalidateSeconds?: number };

export async function getPost(slug: string): Promise<Post | null> {
  'use cache';
  cacheTag(`post:${slug}`);

  const response = await fetch(`https://cms.example.com/posts/${encodeURIComponent(slug)}`);
  if (!response.ok) {
    // Not published yet: check again soon.
    cacheLife('minutes');
    return null;
  }

  const post: Post = await response.json();
  // Let the CMS decide, with an hour as the fallback.
  cacheLife({ revalidate: post.revalidateSeconds ?? 3600 });
  return post;
}
```

### Long lifetime plus a tag for CMS content

Content that changes only when someone edits it does not need a timer. Use
`cacheLife('max')` with a tag, and have the CMS webhook call `revalidateTag`
when content changes. The entry stays in the static shell, and nothing refreshes
content that did not change. The webhook side is on
[Revalidation](./revalidation.md).

## Common mistakes

**Omitting `cacheLife`.** The `default` profile applies, and nested caches can
shorten it without you noticing.

**Using a custom profile name that is not in `next.config.ts`.** The generated
types reject it. Declare the profile in the config first.

**Setting `expire` lower than `revalidate`.** Next.js raises an error for that
configuration.

**Using `seconds` for data you expected in the static shell.** Its one-minute
`expire` makes it a dynamic hole, so it needs a `<Suspense>` boundary.

**Expecting `stale` to set a `Cache-Control` header.** It controls the Next.js
client router's cache, not HTTP caching.

**Calling `cacheLife` or `cacheTag` outside a cached scope**, for example at the
top of a module. It throws.

**Building a tag from untrusted input without a limit.** Tags over 256
characters are skipped with only a console warning, so that entry can never be
invalidated by that name.

## Related topics

- [use cache](./use-cache.md): the scope in which `cacheLife` and `cacheTag`
  are called.
- [Revalidation](./revalidation.md): the functions that act on the tags you set
  here.
- [The caching model](./caching-model.md): how `stale`, `revalidate` and
  `expire` map to the browser, server and prerendered stores.
- [Caching (React)](../data-fetching/caching.md): `Cache-Control` and
  stale-while-revalidate at the HTTP layer, which `cacheLife` does not set.
- [Next.js config reference](../nextjs-reference/next-config.md): where
  `cacheLife` sits among the other top-level options.
