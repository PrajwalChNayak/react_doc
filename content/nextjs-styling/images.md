---
title: Images
description: Serve responsive, lazy-loaded images with next/image, configure the Image Optimization API safely, and understand the 16.0 defaults and the 2026 image advisories.
group: nextjs-styling
order: 20
status: current
since: "16.0"
related: [nextjs-styling/css-and-tailwind, nextjs-styling/fonts, nextjs-security/security-advisories, performance/overview]
---

## Overview

`next/image` exports an `<Image>` component that renders an `<img>` with three
things added: a `srcset` of resized variants, native lazy loading, and reserved
space so the page does not jump when the image arrives.

The resized variants come from the **Image Optimization API**, an endpoint at
`/_next/image` that your Next.js server runs. It downloads the source image,
resizes and re-encodes it with `sharp`, caches the result on disk, and serves
it. That endpoint is what makes `next/image` useful, and it is also the part of
this page with security consequences: it is a public URL that makes your server
fetch and decode images.

> [!WARNING]
> **Upgrade to `next@16.3.3` or later (pin `16.3.5`).** The August 2026 security
> release fixed an unauthenticated remote code execution in the Image
> Optimization API, reachable when Next.js optimizes an attacker-controlled
> **AVIF** image (GHSA-2xp9-vwfh-vxw4 / GHSA-g89c-p67h-r497, a `libheif` bug
> reached through `sharp`). Versions `>= 10.0.0 < 15.5.24` and
> `>= 16.0.0 < 16.3.3` are affected. **The patched releases disable AVIF
> optimization** until an upstream fix ships. See
> [Security advisories](../nextjs-security/security-advisories.md).

## Why it exists

Images are usually the heaviest bytes on a page and the most common Largest
Contentful Paint element. A plain `<img src="/hero.jpg">` gets three things wrong
by default: it sends a desktop-sized file to a phone, it downloads images the
user never scrolls to, and it has no size until it loads, so text below it
shifts (Cumulative Layout Shift).

Fixing that by hand means generating several widths per image, writing `srcset`
and `sizes`, choosing formats, and setting `width`/`height` everywhere.
`next/image` does the generation on demand and writes the attributes for you.

## When to use it

- Content images whose size you know, or whose container you control: product
  photos, avatars, article images, hero images.
- Images stored in `public/`, imported into a component, or hosted on a remote
  origin you control and can allowlist.
- Any image that might be the LCP element, where the right size and an early
  request matter.

## When not to use it

- **SVGs and tiny icons.** A vector format does not benefit from resizing, and
  Next.js does not optimize SVG by default. `next/image` serves a `src` ending in
  `.svg` unoptimized automatically.
- **Animated GIFs.** Next.js detects animated images and serves them unoptimized.
- **Images that need the request's credentials.** The default loader does not
  forward headers when it fetches `src`, so an image behind authentication fails.
  Set `unoptimized` for those.
- **Arbitrary user-supplied URLs.** Allowlisting "any host" turns your server into
  a public image proxy. Send those through a dedicated image service with a
  [custom loader](#custom-loaders-and-unoptimized), or do not optimize them.

## Basic example

A local image in `public/` needs explicit `width` and `height`. They are the
image's intrinsic size in pixels and are used for the **aspect ratio**, not the
rendered size, which CSS controls.

```tsx file="app/team/page.tsx"
import Image from 'next/image';

export default function TeamPage() {
  return (
    <Image
      src="/team/amara-okafor.jpg"
      alt="Amara Okafor, head of design"
      width={640}
      height={800}
      className="h-auto w-64 rounded-lg"
    />
  );
}
```

A **static import** is better when the file lives in the repository. Next.js
reads the dimensions at build time, generates a `blurDataURL` for JPG, PNG, WebP
and AVIF files, and fingerprints the URL so the browser can cache it forever.

```tsx file="app/page.tsx"
import Image from 'next/image';
import heroImage from './hero.jpg';

export default function HomePage() {
  return (
    <Image
      src={heroImage}
      alt="Warehouse shelves stacked with parcels"
      placeholder="blur"
      preload
      sizes="100vw"
      className="h-auto w-full"
    />
  );
}
```

`preload` asks Next.js to insert a `<link rel="preload">` for this image in the
`<head>`, so the browser starts downloading it before it reaches the `<img>`. Use
it only when one image is the LCP element on every viewport. The Next.js docs
recommend `loading="eager"` or `fetchPriority="high"` in most other cases, and
`preload` should not be combined with either.

> [!DEPRECATED]
> The `priority` prop is deprecated since Next.js 16.0 in favor of `preload`. Do
> not use `priority` in new code.

## How it works

### Sizing: `width`/`height`, `fill`, and `sizes`

You must give Next.js the aspect ratio one of three ways:

| You know… | Use | Why |
|---|---|---|
| The file, at build time | A static import | Dimensions and blur placeholder come from the file |
| The intrinsic dimensions | `width` and `height` | Required for remote images and string paths |
| Neither, but the container has a size | `fill` | The image fills its positioned parent |

`fill` makes the `<img>` `position: absolute`, so the parent **must** be
`position: relative`, `fixed` or `absolute`. Control cropping with `object-fit`.

```tsx file="components/product-tile.tsx"
import Image from 'next/image';

type Product = { name: string; imageUrl: string };

export function ProductTile({ product }: { product: Product }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-md">
      <Image
        src={product.imageUrl}
        alt={product.name}
        fill
        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
        className="object-cover"
      />
    </div>
  );
}
```

`sizes` tells the browser how wide the image will be at each breakpoint, before
layout. It changes what Next.js generates:

- **Without `sizes`**, Next.js emits a small density-based `srcset` (`1x`, `2x`),
  suitable for fixed-size images.
- **With `sizes`**, it emits a width-based `srcset` (`640w`, `750w`, …) from
  `deviceSizes` and `imageSizes`.

If you use `fill` or CSS-responsive width without `sizes`, the browser assumes
`100vw` and may download a far larger file than it needs.

### What the Image Optimization API does

Each `srcset` entry is a URL such as `/_next/image?url=%2Fhero.jpg&w=828&q=75`.
On a request, the server:

1. Checks `url` against `localPatterns` or `remotePatterns`, and `q` against
   `qualities`. A request that does not match gets `400 Bad Request`.
2. Fetches the source, following up to `maximumRedirects` redirects and reading up
   to `maximumResponseBody` bytes.
3. Picks an output format from the request's `Accept` header and `images.formats`
   (default `['image/webp']`), then resizes and encodes it.
4. Caches the result under `<distDir>/cache/images` for at least `minimumCacheTTL`
   seconds, or longer if the upstream `Cache-Control` says so.

The allowlists in step 1 exist because every accepted combination of URL and
quality is CPU work and disk space an anonymous visitor can make your server
spend.

### The 16.0 default changes

Next.js 16.0 tightened the defaults. These are the image changes most likely to
affect an upgrade:

| Option | Before 16.0 | 16.0 and later | Why it changed |
|---|---|---|---|
| `images.minimumCacheTTL` | `60` seconds | `14400` seconds (4 hours) | Upstreams without `Cache-Control` caused revalidation every minute |
| `images.qualities` | Any quality allowed | `[75]` | Unrestricted qualities let anyone request many variants |
| `images.imageSizes` | Included `16` | `[32, 48, 64, 96, 128, 256, 384]` | Few sites serve 16px images, and it shortened every `srcset` |
| `images.maximumRedirects` | Unlimited | `3` | Bounds how far a remote fetch can be redirected |
| `images.dangerouslyAllowLocalIP` | (did not exist) | `false`: local IP addresses are blocked | Stops the optimizer being used to reach your internal network |
| Local `src` with a query string | Allowed | Requires a matching `images.localPatterns` entry with `search` | Prevents enumeration through query strings |
| `preload` prop | (did not exist) | Added; `priority` deprecated | Names the behavior for what it does |

A `quality` prop outside `qualities` is coerced to the closest allowed value, and
development logs a warning. A direct request to `/_next/image` with an unlisted
quality gets `400`.

## Server and client implications

`<Image>` works in Server Components, which is where most images should be
rendered. Props that take a **function** are different: `onLoad`, `onError` and
`loader` cannot be serialized from a Server Component, so a component passing them
must be a Client Component. See [Directives](../server-react/directives.md).

`getImageProps()` returns the props `<Image>` would put on the `<img>` without
rendering it, which is useful for `<picture>` art direction. It cannot be used with
`placeholder`, because nothing would remove the placeholder.

## Caching implications

- Optimized images are cached for `max(minimumCacheTTL, upstream max-age)`. There
  is **no API to invalidate one**. To replace an image, change its `src`, which a
  static import does automatically through the fingerprinted URL.
- The disk cache uses up to 50% of the free disk space measured at startup unless
  you set `images.maximumDiskCacheSize` (bytes, `0` disables it). On a small
  container disk, set it.
- Each output format is cached separately, so listing more than one format in
  `images.formats` increases cache storage.
- If a proxy or CDN sits in front of a self-hosted server, it must forward the
  `Accept` header, or every browser receives the same format.

## Common patterns

### Remote images with `remotePatterns`

A remote `src` must match an entry in `images.remotePatterns`. Be as specific as
the host allows: protocol, hostname, pathname **and** `search`.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.example-shop.com',
        port: '',
        pathname: '/products/**',
        search: '',
      },
      // Shorthand, supported since 15.3: a URL object with a path wildcard.
      new URL('https://avatars.example-shop.com/users/**'),
    ],
  },
};

export default nextConfig;
```

In `hostname` and `pathname`, `*` matches one segment or subdomain and `**`
matches any number at the end of a path or the start of a hostname. **Omitting
`protocol`, `port`, `pathname` or `search` implies `**`**, which allows more than
you probably meant. `search: ''` means "no query string at all".

> [!DEPRECATED]
> `images.domains` is deprecated (since Next.js 14) and should not appear in new
> config. It cannot restrict protocol, port, path or query string, so on a shared
> host it allows other tenants' images too. Use `images.remotePatterns` instead.

> [!DEPRECATED]
> `next/legacy/image` is deprecated in Next.js 16. Import `Image` from
> `next/image`.

### Local images with `localPatterns`

`localPatterns` restricts which paths under your own origin may be optimized.
Since 16.0 it is **required** for a local `src` that carries a query string, such
as a cache-busting `?v=2`:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: '/assets/images/**',
        search: '?v=2',
      },
    ],
  },
};

export default nextConfig;
```

Omitting `search` allows every query string, which lets a visitor mint unlimited
distinct cache entries for the same file.

### Allowing more qualities

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    qualities: [50, 75, 90],
  },
};

export default nextConfig;
```

Add only values you use. Each one is another variant per image and width.

### Optimizing images on a private network

When Next.js runs in a VPC with split-horizon DNS, an image host can resolve to a
private IP address, and the optimizer answers `400`. `dangerouslyAllowLocalIP:
true` lifts the block, and with it the protection against server-side request
forgery (SSRF) into your internal network. Enable it only when every
`remotePatterns` entry is a host you control.

### Custom loaders and `unoptimized`

A **loader** moves optimization off your server. It is a function that turns
`{ src, width, quality }` into a URL on an image service. Configure it once with
`loaderFile`:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.js',
  },
};

export default nextConfig;
```

```js file="lib/image-loader.js"
'use client';

/** @param {import('next/image').ImageLoaderProps} props */
export default function imageLoader({ src, width, quality }) {
  const url = new URL(`https://images.example-shop.com${src}`);
  url.searchParams.set('width', String(width));
  url.searchParams.set('quality', String(quality ?? 75));
  url.searchParams.set('format', 'auto');
  return url.href;
}
```

The file is marked `'use client'` because a function has to reach the browser to
build URLs there. With a custom loader, `/_next/image` is no longer involved, so
the attack surface below moves to the image service.

`unoptimized` serves `src` as-is: no resizing, no format change, no request to
`/_next/image`. Set it per image (`<Image unoptimized />`) for SVGs, tiny icons
and authenticated images, or for the whole app with `images: { unoptimized: true }` in
`next.config.ts`.

## Security considerations

The Image Optimization API is a public, unauthenticated endpoint that makes your
server fetch a URL and decode what comes back with native code. Treat it like any
other server-side request feature.

> [!WARNING]
> **AVIF remote code execution (August 2026).** An attacker who can get Next.js to
> optimize an AVIF image they control can run code on your server. That includes
> an image on any host your `remotePatterns` allow, such as a user-upload bucket.
> Upgrade to **`next@16.3.3` or later** (or `15.5.24` on 15.5). The patched
> releases **disable AVIF optimization** until the upstream `libheif` fix
> propagates, so do not plan around AVIF output from `/_next/image` even if
> `images.formats` lists `'image/avif'`. Details and affected ranges are in
> [Security advisories](../nextjs-security/security-advisories.md).

**SVG denial of service (July 2026, CVE-2026-64644, medium severity).** When you
self-host with the default loader and have configured remote images, a remote
image with malicious content could exhaust CPU in `/_next/image`. It is fixed in
16.2.11, 15.5.21 and 16.3.0, so any version at the 16.3.3 floor includes it. The
lesson outlives the patch: **every host in `remotePatterns` is a host whose
content your server will decode.**

Hardening, in order of impact:

1. **Run `next@16.3.5`.** Nothing else on this list fixes a decoder bug.
2. **Allowlist narrowly.** Exact `hostname`, a `pathname` prefix, `search: ''`.
   Never allow a host where untrusted users can upload files unless you have to,
   and never `hostname: '**'`.
3. **Keep `dangerouslyAllowSVG` off.** If you must enable it, also set
   `contentDispositionType: 'attachment'` (the default) and
   `contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"` so
   an SVG opened directly cannot run script.
4. **Bound the work.** Lower `maximumRedirects` (to `0` if your hosts do not
   redirect; redirect targets are *not* re-checked against `remotePatterns`), lower
   `maximumResponseBody` below its 50 MB default, and keep `qualities` short.
5. **Leave `dangerouslyAllowLocalIP` at `false`** unless you are on a private
   network and understand the SSRF risk.
6. **Move untrusted images off your server** with a custom loader, or serve them
   `unoptimized`.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.example-shop.com',
        pathname: '/products/**',
        search: '',
      },
    ],
    maximumRedirects: 0,
    maximumResponseBody: 5_000_000,
    maximumDiskCacheSize: 500_000_000,
    qualities: [75],
  },
};

export default nextConfig;
```

## Common mistakes

**Staying below `next@16.3.3`.** Every earlier 16.x release is exposed to the AVIF
remote code execution. Pin `16.3.5`.

**Using `images.domains`.** It is deprecated and cannot restrict paths or query
strings. Migrate to `remotePatterns`.

**`fill` without a positioned parent.** The image positions itself against some
ancestor far up the tree and covers the page. Give the parent `position:
relative`.

**`fill` or a responsive width without `sizes`.** The browser assumes the image is
as wide as the viewport and downloads the largest variant.

**Treating `width` and `height` as the display size.** They set the aspect ratio.
Size the element with CSS, and set `height: auto` when you change only the width.

**Using `priority` or `preload` on several images.** Preloading everything is
preloading nothing. Pick the single LCP image. When different viewports have
different LCP images, use `fetchPriority="high"` or `loading="eager"` instead.

**A local `src` with `?v=...` and no `localPatterns`.** Since 16.0 that returns
`400`.

**Expecting `quality={90}` to work after upgrading.** The default `qualities` is
`[75]`, so 90 is coerced to 75. Add 90 to `qualities`.

**Passing `onLoad` from a Server Component.** Functions cannot cross the server
boundary. Move the image into a Client Component.

**Wildcard hosts on shared storage.** `hostname: '**.amazonaws.com'` allows every
bucket on that service, including an attacker's.

## Related topics

- [Security advisories](../nextjs-security/security-advisories.md): the AVIF
  remote code execution and the other 2026 advisories, with affected ranges.
- [Images and fonts performance](../nextjs-performance/images-and-fonts.md):
  measuring LCP and CLS impact once images are wired correctly.
- [Fonts](./fonts.md): the other layout-shift source Next.js handles for you.
- [Open Graph images](./open-graph-images.md): generating share images with
  `ImageResponse` rather than optimizing existing ones.
- [Performance overview](../performance/overview.md): where images fit among
  Core Web Vitals and React-level performance work.
- [Directives](../server-react/directives.md): why `onLoad` and `loader` need a
  Client Component.
