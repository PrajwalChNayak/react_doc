---
title: Images and fonts performance
description: Use next/image and next/font to improve LCP and prevent layout shift, and avoid the settings that quietly make pages slower.
group: nextjs-performance
order: 50
status: current
since: "16.0"
related: [nextjs-styling/images, nextjs-styling/fonts, nextjs-performance/core-web-vitals, performance/overview]
---

## Overview

Images and fonts decide two of the three Core Web Vitals on most content pages.
The largest element in the viewport is usually an image or a block of text, so
its load time is the **LCP**. An image without reserved space, or a font that
swaps to different metrics, moves content and adds to **CLS**.

`next/image` and `next/font` handle most of this for you. This page covers the
performance decisions they leave to you: which image to preload, what `sizes`
to pass, and which font options change what the browser downloads. Setup and
configuration are in [Images](../nextjs-styling/images.md) and
[Fonts](../nextjs-styling/fonts.md).

## Why it exists

A plain `<img>` downloads the full-size file on every device, loads eagerly even
far below the fold, and reserves no space unless you add dimensions. A font from
a third-party stylesheet costs extra connections and renders fallback text with
different metrics, so lines reflow when the web font arrives.

`next/image` resizes and re-encodes images on demand, generates a `srcset`,
lazy loads by default, and requires dimensions (or `fill`) so space is reserved.
`next/font` downloads font files at build time, self-hosts them with your static
assets, and generates a size-adjusted fallback font so the swap does not shift
the layout.

## When to use it

- Any page whose LCP element is an image: product pages, articles with a hero,
  landing pages.
- Any layout that uses web fonts.
- Responsive images whose rendered width changes with the viewport.

## When not to use it

- **Icons and small SVGs.** Inline them or import them as components. The image
  optimizer adds a request and processing for no gain.
- **Images already optimized and served from an image CDN.** Configure a
  `loader` for that CDN, or set `unoptimized`, instead of optimizing twice.
- **System font stacks.** If you do not need a web font, no font loader is
  faster than any font loader.

## Basic example

A hero image that is the LCP element, with a responsive grid below it:

```tsx file="app/page.tsx"
import Image from 'next/image';
import heroImage from './hero.jpg';

const products = [
  { id: 'trail-runner', name: 'Trail Runner', image: '/products/trail-runner.jpg' },
  { id: 'city-walker', name: 'City Walker', image: '/products/city-walker.jpg' },
];

export default function HomePage() {
  return (
    <main>
      {/* The LCP element: fetch it at high priority, and never lazy load it. */}
      <Image
        src={heroImage}
        alt="Runners on a mountain trail at sunrise"
        placeholder="blur"
        fetchPriority="high"
        loading="eager"
        sizes="100vw"
      />

      <ul className="product-grid">
        {products.map((product) => (
          <li key={product.id} style={{ position: 'relative', aspectRatio: '4 / 3' }}>
            {/* Below the fold: lazy by default. `sizes` matches the CSS grid. */}
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
```

The static import gives Next.js the width, height and a blur placeholder at
build time, and the file is served with a content hash so it can be cached
forever. The grid images use `fill` inside a parent with a fixed aspect ratio,
which reserves their space.

## How it works

### `sizes` decides which file downloads

Without `sizes`, Next.js generates a small `srcset` (1x, 2x) suited to
fixed-size images, and a `fill` image is assumed to be as wide as the viewport.
On a three-column grid that means every phone and laptop downloads images about
three times wider than needed.

With `sizes`, Next.js generates a full width-based `srcset` from `deviceSizes`
and `imageSizes`, and the browser picks the smallest file that covers the slot.
Write `sizes` to match your CSS breakpoints. It is a hint to the browser, so a
wrong value wastes bytes or looks blurry but does not break layout.

### Prioritizing the LCP image

Images are lazy loaded by default, which is right for everything except the image
the user sees first. For that one image, you have three props:

| Prop | Effect | Use when |
|---|---|---|
| `fetchPriority="high"` | The browser fetches it ahead of other images | The usual choice for a single hero image |
| `loading="eager"` | Loads immediately regardless of position | Combined with the above for an above-the-fold image |
| `preload` | Adds a `<link rel="preload">` in `<head>` so the fetch starts before the `<img>` is parsed | The image is certainly the LCP element on every viewport |

The Next.js docs recommend `loading="eager"` or `fetchPriority="high"` over
`preload` in most cases. Do not use `preload` when different images can be the
LCP element at different viewport sizes, or together with `loading` or
`fetchPriority`.

> [!DEPRECATED]
> The `priority` prop was deprecated in Next.js 16.0 in favor of `preload`, whose
> name describes what it does. Replace `priority` with `preload`, or better, with
> `fetchPriority="high"` as described above.

### Formats and the AVIF advisory

The default output format is WebP, chosen per request from the `Accept` header.
The Next.js docs still recommend WebP for most apps: AVIF files are smaller but
take longer to encode on the first request.

> [!WARNING]
> The August 2026 security release fixed a critical remote code execution
> vulnerability triggered by optimizing an attacker-controlled **AVIF** image.
> The patched versions (16.3.3 and later) **disable AVIF optimization** until an
> upstream fix ships. Do not plan around AVIF output from the optimizer, and do
> not stay on an unpatched version to keep it. See
> [Images](../nextjs-styling/images.md) and
> [Security advisories](../nextjs-security/security-advisories.md).

### Optimizer caching

Optimized images are cached on disk in `<distDir>/cache/images`. Since 16.0 the
default `minimumCacheTTL` is 14400 seconds (4 hours), and the default `qualities`
allowlist is `[75]`. Each extra format or quality you allow multiplies the
variants the server encodes and stores. There is no API to invalidate the image
cache, so prefer static imports, whose URLs change when the file changes.

### How `next/font` avoids layout shift

```tsx file="app/layout.tsx"
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

- **Self-hosting.** CSS and font files are downloaded at build time. The browser
  sends no request to Google, so there is no extra connection setup.
- **Size-adjusted fallback.** `adjustFontFallback` (on by default) generates a
  local fallback font adjusted to the web font's metrics, so text occupies the
  same space before and after the swap.
- **`display`** defaults to `'swap'`: text renders immediately in the fallback.
  `'optional'` avoids a late swap entirely on slow connections, at the cost of
  sometimes never showing the web font.
- **`subsets`** limits which subset files are preloaded. With `preload` on (the
  default) and no `subsets`, Next.js warns.
- **Variable fonts** need no `weight`. Loading a variable font instead of several
  static weights means one file instead of several.

## Common patterns

### Load fonts where they are used

A font is preloaded only on the routes that use it. A font called in the root
layout is preloaded on every route. One called in `app/blog/layout.tsx` is
preloaded only under `/blog`. Put display fonts used by one section in that
section's layout.

### Preload one image, not many

Preloading raises the priority of a request by lowering everything else. Several
preloaded images compete with each other and with CSS and fonts. Pick the single
LCP candidate.

### Local fonts

For a licensed font file, `next/font/local` gives the same self-hosting and
fallback adjustment:

```tsx file="app/fonts.ts"
import localFont from 'next/font/local';

export const brandFont = localFont({
  src: './fonts/brand-variable.woff2',
  display: 'swap',
  variable: '--font-brand',
});
```

Apply `brandFont.variable` on `<html>` and reference `var(--font-brand)` in CSS.

## Common mistakes

- **Leaving the hero image lazy.** The default `loading="lazy"` delays the LCP
  element. Give it `fetchPriority="high"` or `loading="eager"`.
- **`fill` without `sizes`.** The browser assumes `100vw` and downloads an image
  far larger than its slot.
- **`fill` in a parent with no size or position.** The parent must set
  `position` (`relative`, `fixed` or `absolute`) and have dimensions, or the
  image has no reserved box to fill.
- **Preloading every above-the-fold image.** Priority is relative. Preload the
  one LCP image.
- **Adding many `qualities` and formats "to be safe".** Each combination is
  encoded and cached separately, which costs CPU and disk on the server.
- **Loading a section-only font in the root layout.** It is then preloaded on
  every route, including the ones that never render it.
- **Staying below 16.3.3 to keep AVIF output.** The AVIF path is the vulnerable
  one. Upgrade.

## Related topics

- [Images](../nextjs-styling/images.md) — `next/image` setup, `remotePatterns`
  and the full configuration.
- [Fonts](../nextjs-styling/fonts.md) — `next/font` setup, multiple fonts and
  Tailwind CSS integration.
- [Core Web Vitals](./core-web-vitals.md) — measure LCP and CLS from real users
  to confirm the change.
- [Performance overview](../performance/overview.md) — how LCP, INP and CLS map
  to React-side levers.
- [Security advisories](../nextjs-security/security-advisories.md) — the AVIF
  image optimization vulnerability and the patched versions.
