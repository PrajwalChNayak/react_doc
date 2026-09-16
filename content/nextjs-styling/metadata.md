---
title: Metadata
description: Define titles, descriptions, Open Graph tags, the viewport, favicons, robots.txt and sitemaps with the Next.js Metadata API and metadata file conventions.
group: nextjs-styling
order: 40
status: current
related: [patterns/document-metadata, nextjs-styling/open-graph-images, nextjs-routing/dynamic-segments, data-fetching/caching]
---

## Overview

The Metadata API lets a layout or page describe the document `<head>` as data.
You export a `metadata` object, or a `generateMetadata` function when the values
depend on the route or on fetched data, and Next.js renders the `<title>`,
`<meta>` and `<link>` tags.

It has three parts:

| Part | Where | Use it for |
|---|---|---|
| `metadata` / `generateMetadata` | `layout.tsx`, `page.tsx` | Title, description, Open Graph, canonical URLs, robots directives |
| `viewport` / `generateViewport` | `layout.tsx`, `page.tsx` | `theme-color`, `color-scheme`, viewport scale |
| Metadata files | Special files in `app/` | `favicon.ico`, `icon`, `apple-icon`, `opengraph-image`, `robots.txt`, `sitemap.xml`, `manifest` |

Two tags are always added, even when a route defines nothing:
`<meta charset="utf-8" />` and
`<meta name="viewport" content="width=device-width, initial-scale=1" />`.

## Why it exists

React 19 already lets any component render `<title>` and `<meta>` and hoists them
into `<head>`. That is covered in
[Document metadata](../patterns/document-metadata.md). It has no **merge rules**:
two components that render a title produce two titles.

A framework has information React does not: the route hierarchy. Next.js
evaluates metadata from the root layout down to the page and merges the results,
so a layout sets defaults and a page overrides only what it knows. Resolving it at
the routing layer also lets Next.js put metadata in the initial HTML for crawlers
that do not run JavaScript, prerender it at build time, and generate tags from
files such as `opengraph-image.png` with the right type and dimensions.

**In an App Router app, prefer the Metadata API over rendering `<title>` and
`<meta>` yourself.** Keep React's tags for elements the Metadata API does not
cover.

## When to use it

- Every route's title and description.
- Site-wide defaults, such as a title template, `metadataBase` and Open Graph site
  name, in the root layout.
- Per-item metadata for dynamic routes, from the same data the page renders.
- Crawl rules and sitemaps generated from your database, through `robots.ts` and
  `sitemap.ts`.

## When not to use it

- **In a Client Component.** `metadata` and `generateMetadata` are supported only
  in Server Components, because they must resolve on the server before the page
  renders. Keep `page.tsx` a Server Component and move the interactive part into
  a child Client Component.
- **For tags the API does not support.** `<base>`, `<noscript>` and
  `<meta http-equiv>` are not built in. Render the first two in the layout or page;
  set HTTP headers for the third.
- **For stylesheets, scripts and resource hints.** Import CSS, use `next/script`,
  and call React's `preload()` / `preconnect()` / `prefetchDNS()`. `next/font` and
  `next/image` already emit their own hints.
- **For viewport or theme color.** `themeColor`, `colorScheme` and `viewport`
  inside `metadata` are deprecated since Next.js 14. Use the `viewport` export.

## Basic example

A root layout that sets site-wide defaults:

```tsx file="app/layout.tsx"
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://acme.com'),
  title: {
    template: '%s | Acme',
    default: 'Acme',
  },
  description: 'Invoices, payouts and reporting for small businesses.',
  openGraph: {
    siteName: 'Acme',
    type: 'website',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

A page that fills in the template:

```tsx file="app/pricing/page.tsx"
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Plans for teams of every size. Cancel any time.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return <h1>Pricing</h1>;
}
```

The rendered head contains `<title>Pricing | Acme</title>` and a canonical link to
`https://acme.com/pricing`, because `metadataBase` turns the relative path into an
absolute URL.

## How it works

### Title templates

`title.template` applies to **child** segments, never to the segment that
defines it:

| Defined in | Field | Effect |
|---|---|---|
| layout | `title.template` | Wraps titles from child layouts and pages. Requires `title.default`. |
| layout | `title.default` | Fallback for children that set no title |
| page or layout | `title` (string) | This route's title, wrapped by the nearest parent template |
| page or layout | `title.absolute` | This route's title, ignoring parent templates |
| page | `title.template` | No effect: a page has no children |

### Ordering and shallow merging

Metadata is evaluated from the root layout down to the page, and the objects are
**shallowly merged**. A later segment's key replaces an earlier one completely.

That matters for nested objects. If the root layout sets
`openGraph: { siteName, type, images }` and a page sets
`openGraph: { title }`, the page's `openGraph` has **only** a title. Share nested
fields by exporting them from a module and spreading them:

```ts file="app/shared-metadata.ts"
export const sharedOpenGraph = {
  siteName: 'Acme',
  type: 'website',
  locale: 'en_US',
} as const;
```

```tsx file="app/about/page.tsx"
import type { Metadata } from 'next';
import { sharedOpenGraph } from '../shared-metadata';

export const metadata: Metadata = {
  title: 'About',
  openGraph: {
    ...sharedOpenGraph,
    title: 'About Acme',
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
```

Metadata **files** take priority over the `metadata` object and
`generateMetadata`. An `opengraph-image.png` in a segment overrides
`openGraph.images` from code.

### `generateMetadata`

Use `generateMetadata` when metadata depends on route params or data. It receives
the same props as the page, with `params` and `searchParams` as **Promises**, and a
second argument, `parent`, a Promise of the metadata resolved from parent
segments.

```tsx file="app/blog/[slug]/page.tsx"
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/posts';

export async function generateMetadata(
  { params }: PageProps<'/blog/[slug]'>,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const parentImages = (await parent).openGraph?.images ?? [];

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      publishedTime: post.publishedAt,
      images: parentImages,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.excerpt}</p>
    </article>
  );
}
```

Rules to remember:

- A segment exports **either** `metadata` **or** `generateMetadata`, not both.
- `searchParams` is available only in `page.tsx`.
- `notFound()` and `redirect()` work inside `generateMetadata`.
- `fetch` calls with the same arguments are memoized across `generateMetadata`,
  layouts, pages and Server Components within a request. For a database client,
  wrap the loader in React's `cache` so the page and its metadata share one query.
  See [React-level caching](../data-fetching/caching.md).

```ts file="lib/posts.ts"
import { cache } from 'react';
import { db } from '@/lib/db';

export type Post = { slug: string; title: string; excerpt: string; publishedAt: string };

export const getPost = cache(async (slug: string): Promise<Post | undefined> => {
  return db.post.findUnique({ where: { slug } });
});
```

### Streaming metadata

For a page rendered at request time, Next.js does not hold the whole response
until `generateMetadata` resolves. It sends the UI first and appends the metadata
tags to the `<body>` when they are ready. The Next.js team reports that bots that
execute JavaScript and inspect the full DOM, such as Googlebot, read that
correctly.

**HTML-limited bots** that do not run JavaScript get blocking metadata in `<head>`
instead. Next.js detects them from the `User-Agent` header, using a default list
that includes Bingbot, Twitterbot, Slackbot and several Google crawlers.
Prerendered pages are unaffected: their metadata is resolved at build time and is
already in the HTML.

You can replace the bot list with `htmlLimitedBots`. A pattern that matches every
user agent turns streaming metadata off:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  htmlLimitedBots: /.*/,
};

export default nextConfig;
```

Specifying `htmlLimitedBots` **replaces** the default list rather than adding to
it, and blocking on metadata for every request raises time to first byte. Leave
the default unless a crawler you care about is missing.

### `viewport` and `generateViewport`

Viewport settings have their own export, because unlike metadata they affect the
first paint and **cannot be streamed**.

```tsx file="app/layout.tsx"
import type { Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`generateViewport` is the dynamic form, with the same props as the layout or page.
As with metadata, a segment exports one or the other. You rarely need `width` or
`initialScale`: the default viewport tag is already correct.

## Server and client implications

`metadata`, `generateMetadata`, `viewport` and `generateViewport` exist only in
Server Component files, because they must resolve on the server before the page
renders. A `page.tsx` marked `"use client"` cannot export them. The fix is
structural: keep the route file on the server and render a Client Component from it. See
[Server Components](../server-react/server-components.md) for the underlying model.

## Caching implications

With Cache Components enabled, `generateMetadata` follows the same rules as any
component:

- If it reads runtime data (`cookies()`, `headers()`, `params`, `searchParams`)
  or fetches uncached data, it defers to request time.
- If **other parts of the page also defer** to request time, the static shell is
  prerendered and metadata streams in with the deferred content.
- If the page is **otherwise fully prerenderable**, Next.js raises an error that
  names the page or layout, because streaming metadata into an otherwise static
  page is rarely intended.

When the metadata depends on external data but not on the request, cache it:

```tsx file="app/page.tsx"
import type { Metadata } from 'next';
import { getSiteSettings } from '@/lib/site-settings';

export async function generateMetadata(): Promise<Metadata> {
  'use cache';
  const settings = await getSiteSettings();
  return {
    title: settings.homeTitle,
    description: settings.homeDescription,
  };
}

export default function HomePage() {
  return <h1>Welcome</h1>;
}
```

Return values of a `'use cache'` function must be serializable, so return
`metadataBase` as a string rather than a `URL` object there.

`generateViewport` works the same way, except that viewport cannot stream. If it
reads runtime data, the route must block until it resolves. See
[`use cache`](../nextjs-data-caching/use-cache.md) for the directive itself.

## Common patterns

### Favicons and app icons

Put image files in `app/` and Next.js writes the `<link>` tags, including `type`
and `sizes`:

| File | Formats | Where |
|---|---|---|
| `favicon.ico` | `.ico` | Only the root of `app/` |
| `icon` | `.ico`, `.jpg`, `.jpeg`, `.png`, `.svg` | Any segment |
| `apple-icon` | `.jpg`, `.jpeg`, `.png` | Any segment |

Number the files (`icon1.png`, `icon2.png`) to provide several. To generate an
icon from code, use `icon.tsx` with `ImageResponse`, as described in
[Open Graph images](./open-graph-images.md).

### `robots.ts`

A `robots.ts` file in the root of `app/` returns the rules, and Next.js serves
`/robots.txt`:

```ts file="app/robots.ts"
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/dashboard/', '/api/'] },
    ],
    sitemap: 'https://acme.com/sitemap.xml',
  };
}
```

A rule can also carry non-standard directives through `other` (added in 16.3.0),
passed through verbatim.

> [!WARNING]
> `robots.txt` is a request to well-behaved crawlers, not access control. Anyone
> can read it, and listing `/admin/` there advertises the path. Protect private
> routes with authorization.

### `sitemap.ts`

A `sitemap.ts` file returns an array of URL entries, and Next.js serves
`/sitemap.xml`:

```ts file="app/sitemap.ts"
import type { MetadataRoute } from 'next';
import { listPublishedPosts } from '@/lib/posts';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts: { slug: string; updatedAt: string }[] = await listPublishedPosts();

  return [
    { url: 'https://acme.com', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://acme.com/pricing', changeFrequency: 'monthly', priority: 0.8 },
    ...posts.map((post) => ({
      url: `https://acme.com/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
```

`robots.ts`, `sitemap.ts`, `manifest.ts` and the image files are special Route
Handlers that are **cached by default** unless they use a request-time API. If you
run [`proxy.ts`](../nextjs-backend/proxy.md), the Next.js docs recommend
excluding the metadata files in its matcher.

### Structured data (JSON-LD)

The Metadata API has no JSON-LD field. The Next.js recommendation is a plain
`<script type="application/ld+json">` rendered in the page. **Escape `<`**, because
`JSON.stringify` does not, and a product name containing `</script>` would
otherwise break out of the tag:

```tsx file="app/products/[id]/page.tsx"
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/products';

export default async function ProductPage({ params }: PageProps<'/products/[id]'>) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.imageUrl,
    description: product.description,
  };

  return (
    <section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <h1>{product.name}</h1>
    </section>
  );
}
```

Use a native `<script>` here, not `next/script`: JSON-LD is data, not code to
execute.

## Common mistakes

**Exporting `metadata` from a `"use client"` page.** Metadata exports are Server
Component only. Keep the page on the server.

**Exporting both `metadata` and `generateMetadata` from one file.** A segment
gets one or the other.

**Reading `params.slug` without awaiting.** `params` is a Promise in
`generateMetadata`, as in the page. Write `const { slug } = await params`.

**Expecting a nested object to merge.** A page's `openGraph` replaces the layout's
entirely. Spread shared fields back in.

**Defining `title.template` without `title.default`.** The template needs a
default, and it never applies to the segment that defines it.

**Relative URLs without `metadataBase`.** A relative `openGraph.images` or
`alternates.canonical` without `metadataBase` is a build error. Set it in the root
layout.

**Putting `themeColor` in `metadata`.** Deprecated since 14. Use the `viewport`
export.

**Also rendering `<title>` in the component tree.** That gives one tag two
sources with no merge rule between them. Pick the Metadata API.

**Fetching the same record twice without memoization.** A database call in both
`generateMetadata` and the page runs twice unless the loader is wrapped in
`cache`.

**Unescaped JSON-LD.** `JSON.stringify` output inside a `<script>` is an XSS
vector when it contains user-controlled strings. Replace `<` with `<`.

## Related topics

- [Document metadata](../patterns/document-metadata.md): React 19's own
  `<title>` / `<meta>` hoisting, and why a framework's API wins when you have one.
- [Open Graph images](./open-graph-images.md): `opengraph-image.tsx` and
  `ImageResponse` for generated share images.
- [Dynamic segments](../nextjs-routing/dynamic-segments.md): where the `params`
  Promise that `generateMetadata` receives comes from.
- [React-level caching](../data-fetching/caching.md): `cache()` to share one query
  between the page and its metadata.
- [`use cache`](../nextjs-data-caching/use-cache.md): caching `generateMetadata`
  under Cache Components.
- [Server Components](../server-react/server-components.md): why metadata exports
  must live in server files.
