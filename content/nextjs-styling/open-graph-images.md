---
title: Open Graph images
description: Add share images with opengraph-image and twitter-image files, and generate them from JSX with ImageResponse from next/og.
group: nextjs-styling
order: 50
status: current
since: "16.0"
related: [nextjs-styling/metadata, nextjs-styling/images, nextjs-backend/route-handlers, patterns/document-metadata]
---

## Overview

An Open Graph image is the picture a chat app or social network shows when
someone shares your link. Next.js gives you two file conventions for it,
`opengraph-image` and `twitter-image`, and `ImageResponse` to draw one from JSX.

Place a file in a route segment and Next.js serves it and writes the tags:

| File | What it is | Tags written |
|---|---|---|
| `opengraph-image.jpg` / `.jpeg` / `.png` / `.gif` | A static image | `og:image`, `og:image:type`, `og:image:width`, `og:image:height` |
| `twitter-image.jpg` / `.jpeg` / `.png` / `.gif` | A static image | `twitter:image`, plus type, width and height |
| `opengraph-image.alt.txt` / `twitter-image.alt.txt` | Alt text for the static image | `og:image:alt` / `twitter:image:alt` |
| `opengraph-image.tsx` / `twitter-image.tsx` (or `.ts`, `.js`) | Code that returns an image | The same tags, from the file's `alt`, `size` and `contentType` exports |

The image in the most specific segment wins, so `app/blog/[slug]/opengraph-image.tsx`
overrides `app/opengraph-image.png` for blog posts.

## Why it exists

Share images are metadata that has to be **an image at a stable URL with known
dimensions**. Doing that by hand means designing an image per page, uploading it
somewhere, and keeping `openGraph.images` in sync with the file. For a blog or a
store, that is one image per record, and the records change.

The file convention removes the sync problem: the file's location is the route,
and Next.js reads the type and size itself. `ImageResponse` removes the design
problem for dynamic content: you describe the card in JSX once, and Next.js
renders a PNG per post from its data.

## When to use it

- A site-wide default card: a static `app/opengraph-image.png`.
- A section with its own card: a static file deeper in `app/`, such as
  `app/docs/opengraph-image.png`.
- One card per record: `opengraph-image.tsx` in a dynamic segment, drawing the
  title and author from data.
- App icons generated from code: `icon.tsx` and `apple-icon.tsx` use the same
  `ImageResponse` API.

## When not to use it

- **When a designer supplies each image.** Upload the files and use static
  `opengraph-image.png` files or `openGraph.images` in [Metadata](./metadata.md).
- **For images shown on the page itself.** `ImageResponse` produces a PNG response,
  not a responsive image. Use [`next/image`](./images.md).
- **For complex layouts.** The renderer supports flexbox and a subset of CSS.
  `display: grid` does not work. A card that needs grid, filters or arbitrary web
  fonts is easier as a designed static file.

> [!NOTE]
> You do not need the `@vercel/og` package in a Next.js app. `ImageResponse` from
> `next/og` is built in, and uses `@vercel/og`, Satori and Resvg internally.

## Basic example

A static site-wide card needs no code. Add `app/opengraph-image.png` (1200 x 630 is
the conventional size) and `app/opengraph-image.alt.txt` containing
`Acme: invoices and payouts for small businesses`.

To draw the card instead, export an image function:

```tsx file="app/opengraph-image.tsx"
import { ImageResponse } from 'next/og';

export const alt = 'Acme: invoices and payouts for small businesses';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#0a0a0a',
          color: '#fafafa',
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700 }}>Acme</div>
        <div style={{ fontSize: 36, color: '#a3a3a3', marginTop: 16 }}>
          Invoices and payouts for small businesses
        </div>
      </div>
    ),
    { ...size },
  );
}
```

`alt`, `size` and `contentType` become the `og:image:alt`, width, height and type
tags. Spreading `size` into the options keeps the rendered image and the tags in
agreement.

## How it works

### `ImageResponse`

`new ImageResponse(element, options)` renders JSX to a PNG and returns it as a
`Response`. The options:

| Option | Default | Notes |
|---|---|---|
| `width`, `height` | `1200`, `630` | Pixel size of the image |
| `fonts` | Geist Sans | Array of `{ name, data, weight, style }`. `data` is the font file's bytes |
| `emoji` | `'twemoji'` | Also `'blobmoji'`, `'noto'`, `'openmoji'` |
| `debug` | `false` | Draws layout boxes, for debugging |
| `status`, `statusText`, `headers` | `200` | Passed to the HTTP response |

The JSX is not rendered by React DOM or a browser. Satori converts it to SVG, and
Resvg rasterizes the SVG. That explains the constraints:

- **Layout is flexbox.** Every element with more than one child needs
  `display: 'flex'`. Absolute positioning works; `display: 'grid'` does not.
- **Only a subset of CSS is supported.** Satori's documentation lists it. Styles
  go in the `style` prop; there is no stylesheet, Tailwind or CSS Module.
- **Fonts must be `ttf`, `otf` or `woff`.** `woff2` is not supported. `ttf` and
  `otf` parse fastest.
- **The bundle is limited to 500 KB**, including your JSX, CSS, fonts, images
  and other assets. Read large assets at runtime rather than importing them.

> [!NOTE]
> Since Next.js **16.2**, the default font is **Geist Sans** (it was Noto Sans),
> and `ImageResponse` renders faster. A card that relied on the old default font
> renders with different metrics after upgrading. Pass `fonts` explicitly if the
> exact typeface matters.

### Static by default

A generated image is a special Route Handler. It is **generated at build time and
cached** unless it uses a request-time API or uncached data. For a card that only
depends on the site name, that means the image is rendered once per build and
served as a static file.

### Size limits for static files

A static `twitter-image` file must not exceed 5 MB, and a static `opengraph-image`
file must not exceed 8 MB. A larger file **fails the build**, because the platforms
reject images over those limits and the share card would silently disappear.

## Server and client implications

`opengraph-image.tsx` runs only on the server. The JSX inside `ImageResponse` is
not a Server Component or a Client Component: hooks, context, event handlers and
`"use client"` components do not apply. Treat it as a template that happens to use
JSX syntax, and pass everything it needs as values.

Because it runs on the server, it can read files with `node:fs` and query your
database directly.

## Caching implications

- A card that reads `params` for a dynamic segment, or fetches data, is rendered
  per request unless the data is cached. Under Cache Components, put the data
  lookup in a `'use cache'` function so the card is not regenerated on every
  crawler hit. See [`use cache`](../nextjs-data-caching/use-cache.md).
- Metadata image files are served with hashes in production, so a new image gets a
  new URL. Social platforms cache aggressively on their side, so a changed image
  may still take time to appear in previews.
- Read fonts and logos **once at module scope**. They do not depend on the
  request, and reading them inside the function repeats the work for every image.

## Common patterns

### A card per blog post

In a dynamic segment the image function receives `params` as a **Promise** (since
16.0). Await it.

```tsx file="app/blog/[slug]/opengraph-image.tsx"
import { ImageResponse } from 'next/og';
import { getPost } from '@/lib/posts';

export const alt = 'Acme blog post';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function PostImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #111827, #1e3a8a)',
          color: 'white',
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.7 }}>acme.com/blog</div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
          {post?.title ?? 'Acme blog'}
        </div>
        <div style={{ fontSize: 28 }}>{post?.author ?? 'The Acme team'}</div>
      </div>
    ),
    { ...size },
  );
}
```

The exported `alt` is static. When alt text must come from data, set
`openGraph.images` in `generateMetadata` instead, pointing at a Route Handler
that returns the `ImageResponse`.

### A custom font and a local logo

Read assets once, at module scope, relative to the project root with
`process.cwd()`:

```tsx file="app/opengraph-image.tsx"
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'Acme';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const interSemiBold = await readFile(join(process.cwd(), 'assets/Inter-SemiBold.ttf'));
const logoData = await readFile(join(process.cwd(), 'assets/logo.png'), 'base64');
const logoSrc = `data:image/png;base64,${logoData}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 32,
          padding: 80,
          background: 'white',
          fontFamily: 'Inter',
        }}
      >
        <img src={logoSrc} width={120} height={120} alt="" />
        <div style={{ fontSize: 72 }}>Acme</div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Inter', data: interSemiBold, style: 'normal', weight: 600 }],
    },
  );
}
```

The font file is `.ttf`, not `.woff2`, because the renderer does not read
`woff2`. The `name` in `fonts` is what `fontFamily` refers to.

### Several images from one file

`generateImageMetadata` returns one entry per image, each with a required `id`.
The image function receives that `id` as a **Promise** (since 16.0):

```tsx file="app/icon.tsx"
import { ImageResponse } from 'next/og';

export function generateImageMetadata() {
  return [
    { id: 'small', contentType: 'image/png', size: { width: 48, height: 48 } },
    { id: 'large', contentType: 'image/png', size: { width: 192, height: 192 } },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const iconId = await id;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1e3a8a',
          color: 'white',
          fontSize: iconId === 'small' ? 28 : 112,
          borderRadius: iconId === 'small' ? 8 : 32,
        }}
      >
        A
      </div>
    ),
  );
}
```

`generateImageMetadata` itself still receives `params` synchronously. Only the
image function's props became Promises in 16.0.

### An image from a Route Handler

`ImageResponse` is a `Response`, so a Route Handler can return one. Use this when
the image needs query parameters, which the file convention does not receive:

```tsx file="app/api/og/route.tsx"
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get('title')?.slice(0, 100) ?? 'Acme';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 64,
          background: 'white',
        }}
      >
        {title}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
```

Cap the length of any text taken from the URL, as above. Every request renders a
new image, so an unbounded parameter is an easy way to make your server do
expensive work. See [Route Handlers](../nextjs-backend/route-handlers.md).

## Common mistakes

**Installing `@vercel/og`.** Import `ImageResponse` from `next/og`; the package is
already included.

**Reading `params.slug` directly.** Since 16.0, `params` in an image function is a
Promise. Write `const { slug } = await params`.

**Using the `id` from `generateImageMetadata` as a string.** It arrives as a
Promise. Await it.

**A multi-child `<div>` without `display: 'flex'`.** The renderer requires an
explicit flex container.

**Using `display: 'grid'`, `className` or Tailwind.** Only inline styles and the
supported CSS subset work.

**Loading a `.woff2` font.** Use `ttf`, `otf` or `woff`.

**Reading the font file inside the image function.** It repeats the read for every
image. Read it at module scope.

**Exceeding 500 KB.** Large embedded fonts and images push the bundle over the
limit. Load them at runtime from disk.

**Relying on the default font's metrics across upgrades.** The default changed to
Geist Sans in 16.2. Pass the font you designed with.

**A `size` export that differs from the rendered size.** The tags then advertise
dimensions the image does not have. Spread `size` into the options.

## Related topics

- [Metadata](./metadata.md): the Metadata API these files plug into, including
  merge order and `metadataBase`.
- [Images](./images.md): optimizing images you display, as opposed to generating
  share cards.
- [Route Handlers](../nextjs-backend/route-handlers.md): returning an
  `ImageResponse` from a custom endpoint.
- [Document metadata](../patterns/document-metadata.md): React's own head tags,
  and why framework metadata is the better home for `og:image`.
- [Fonts](./fonts.md): `next/font` for page text; `ImageResponse` needs raw font
  bytes instead.
