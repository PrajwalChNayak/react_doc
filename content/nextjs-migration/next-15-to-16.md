---
title: Next.js 15 to 16
description: The complete upgrade runbook from Next.js 15 to 16.3, with codemods, every removal and behavior change, and the security floor.
group: nextjs-migration
order: 10
status: current
since: "16.0"
related: [nextjs-migration/next-16-2-to-16-3, nextjs-migration/middleware-to-proxy, nextjs-migration/pre-16-caching-model, migration/react-18-to-19]
shape: reference
---

## Overview

Next.js 16.0 finished several transitions that 15.x started. Synchronous
request APIs are gone, Turbopack is the default bundler, `middleware.ts` became
`proxy.ts`, caching became opt-in through Cache Components, and a list of
long-deprecated features was removed.

Do not stop at 16.0. Upgrade straight to the current release and work through
this page in order:

1. Check the version requirements.
2. Run the upgrade codemod, then the targeted codemods.
3. Fix the removals.
4. Review the behavior changes that do not throw errors.
5. Replace deprecated APIs.
6. Read [Next.js 16.2 to 16.3](./next-16-2-to-16-3.md) for the changes that
   landed after 16.0.

> [!WARNING]
> **Upgrade straight to `next@16.3.3` or later, and pin `16.3.5`.** Every 16.x
> release below 16.3.3 is affected by two Critical advisories from the August
> 2026 Security Release: an unauthenticated RCE in the Image Optimization API
> through AVIF images (GHSA-2xp9-vwfh-vxw4 / GHSA-g89c-p67h-r497), and
> CVE-2026-75604, an unauthenticated RCE on Windows-hosted servers in apps that
> use both routers without Cache Components. There is no workaround for the
> second one. Stopping at 16.0, 16.1 or 16.2 leaves an app exploitable.

The React side of the upgrade is a separate job. If you are also moving a
Pages Router app from React 18, follow [React 18 to 19](../migration/react-18-to-19.md).

## Version requirements

| Requirement | Next.js 16 | Why it changed |
|---|---|---|
| Node.js | **>= 20.9.0**. Node.js 18 is no longer supported. | Node.js 18 reached end of life. |
| TypeScript | **>= 5.1** | Needed for the generated route types. 16.3 can also type-check with TypeScript 7. |
| Browsers | Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+ | Lets Next.js ship modern CSS and JavaScript without polyfills. |
| React (Pages Router) | `react` / `react-dom` from your `package.json`, peer range `^18.2.0 \|\| ^19.0.0` | The App Router ignores this version. It uses the React Canary build vendored inside `next`. |

Check before you start:

```bash
node --version
npx tsc --version
```

## Step 1: Run the codemods

Start from a clean working tree and commit after each command, so every diff is
reviewable on its own.

```bash
npx @next/codemod@canary upgrade latest
```

The `upgrade` codemod installs the latest `next`, `react` and `react-dom`, and
offers the version 16 transforms. According to the upgrade guide, it can:

- move `experimental.turbopack` to the top-level `turbopack` option,
- migrate `next lint` to the ESLint CLI,
- rename `middleware` to `proxy`,
- remove the `unstable_` prefix from stabilized APIs,
- remove the `experimental_ppr` route segment config.

It does **not** run every migration. Run the ones that apply to your app
individually:

| Codemod | What it fixes |
|---|---|
| `npx @next/codemod@canary next-async-request-api .` | Synchronous `params`, `searchParams`, `cookies()`, `headers()` and `draftMode()` left over from the 15.x compatibility period. |
| `npx @next/codemod@latest middleware-to-proxy .` | Renames the file, the export, and the `middleware`-named config flags. See [Middleware to proxy](./middleware-to-proxy.md). |
| `npx @next/codemod@latest remove-unstable-prefix .` | `unstable_cacheLife` / `unstable_cacheTag` imports. |
| `npx @next/codemod@latest remove-experimental-ppr .` | `export const experimental_ppr = true` in pages and layouts. |
| `npx @next/codemod@canary next-lint-to-eslint-cli .` | Replaces `next lint` scripts with `eslint .` and writes `eslint.config.mjs`. |

Then pin the versions you actually ship:

```bash
npm install --save-exact next@16.3.5 eslint-config-next@16.3.5
```

> [!NOTE]
> The upgrade codemod runs non-interactively and accepts every default when
> stdin is not a TTY, for example in CI or when an AI coding agent runs it. Pass
> `--yes` to get the same behavior from a terminal.

Codemods are not a review. They skip anything ambiguous, and that is exactly the
code you need to read.

## Step 2: Fix the removals

### Synchronous request APIs

Next.js 15 made `params`, `searchParams`, `cookies()`, `headers()` and
`draftMode()` asynchronous but kept a temporary synchronous fallback. **16.0
removed the fallback.** Async access lets Next.js prerender everything up to the
first request-time read, instead of treating the whole route as dynamic the
moment one value is touched.

:::tabs
== Before (Next.js 15)
```tsx legacy file="app/blog/[slug]/page.tsx"
// Next.js 15 compatibility mode. Throws in Next.js 16.
import { cookies } from 'next/headers';

export default function BlogPostPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { preview?: string };
}) {
  const theme = cookies().get('theme')?.value ?? 'light';
  return <h1 data-theme={theme}>{params.slug}</h1>;
}
```
== After (Next.js 16.3)
```tsx file="app/blog/[slug]/page.tsx"
import { cookies } from 'next/headers';

export default async function BlogPostPage(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const { preview } = await props.searchParams;
  const theme = (await cookies()).get('theme')?.value ?? 'light';

  return (
    <article data-theme={theme}>
      <h1>{slug}</h1>
      {preview === '1' ? <p>Preview mode</p> : null}
    </article>
  );
}
```
:::

`PageProps`, `LayoutProps` and `RouteContext` are global types generated by
`next dev`, `next build` or `next typegen` (available since 15.5). They type
`params` from the real folder names, so a typo in a segment name becomes a type
error. See [Typed routes](../nextjs-routing/typed-routes.md).

The same change reaches the metadata image routes. The default export of
`opengraph-image`, `twitter-image`, `icon` and `apple-icon` now receives `params`
as a Promise, and the `id` produced by `generateImageMetadata` is a Promise too.
`generateImageMetadata` itself still receives synchronous `params`.

:::tabs
== Before (Next.js 15)
```tsx legacy file="app/blog/[slug]/opengraph-image.tsx"
import { ImageResponse } from 'next/og';

export default function OpengraphImage({ params }: { params: { slug: string } }) {
  return new ImageResponse(<div>{params.slug}</div>, { width: 1200, height: 630 });
}
```
== After (Next.js 16.3)
```tsx file="app/blog/[slug]/opengraph-image.tsx"
import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return new ImageResponse(<div style={{ fontSize: 64 }}>{slug}</div>, size);
}
```
:::

`sitemap` receives the `id` from `generateSitemaps` as a `Promise<string>`:

```ts file="app/products/sitemap.ts"
import type { MetadataRoute } from 'next';

export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }];
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const page = Number(await id);
  const start = page * 50000;
  return [{ url: `https://example.com/products?offset=${start}` }];
}
```

### Partial Prerendering flags

`experimental.ppr`, the `experimental_ppr` route segment export,
`experimental.dynamicIO` and `experimental.useCache` are **removed**. Partial
Prerendering is now part of Cache Components, enabled with one top-level flag.

:::tabs
== Before (Next.js 15)
```ts legacy file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: 'incremental',
    dynamicIO: true,
  },
};

export default nextConfig;
```
== After (Next.js 16.3)
```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```
:::

> [!WARNING]
> `cacheComponents` is not a rename you can flip blindly. It changes the caching
> model: route segment exports such as `dynamic` and `revalidate` start failing,
> and uncached data outside `<Suspense>` is reported. If you were not actively
> using `dynamicIO`, delete the old flags and adopt Cache Components as a
> separate project. See [The pre-16 caching model](./pre-16-caching-model.md).
> The upgrade guide also notes that PPR in 16 works differently from the 15.x
> canaries, so apps relying on canary PPR should plan that move explicitly.

### Removed features

| Removed | Use instead | Why |
|---|---|---|
| AMP (`useAmp`, `next/amp`, `export const config = { amp: true }`, the `amp` config) | Standard pages. The built-in optimizations cover most of what AMP was for. | Adoption declined and it complicated the framework. |
| `next lint` | ESLint or Biome directly. `next build` no longer lints. | Linting belongs to your linter's CLI and config, not the build. |
| The `eslint` option in `next.config` | `eslint.config.mjs` | Same reason. |
| `serverRuntimeConfig` / `publicRuntimeConfig` and `getConfig()` | Environment variables. `NEXT_PUBLIC_` for client values. | Runtime config only worked with the Pages Router's render model. |
| `devIndicators.appIsrStatus`, `buildActivity`, `buildActivityPosition` | `devIndicators.position` | The indicator was redesigned in 15.2. |
| `experimental.dynamicIO`, `experimental.useCache` | `cacheComponents: true` | Unified into one flag. |
| `unstable_rootParams()` | `next/root-params` | See [Root params](../nextjs-routing/root-params.md). |
| `experimental.turbopack` | Top-level `turbopack` | Turbopack is stable. |
| `experimental.reactCompiler` | Top-level `reactCompiler` (off by default) | The React Compiler reached 1.0. |
| `size` and `First Load JS` columns in `next build` output | Lighthouse or real-user Core Web Vitals | The numbers were inaccurate for Server Components. |

Runtime config is the one removal with a code-shaped replacement:

:::tabs
== Before (Next.js 15)
```js legacy file="next.config.js"
module.exports = {
  serverRuntimeConfig: { dbUrl: process.env.DATABASE_URL },
  publicRuntimeConfig: { apiUrl: '/api' },
};
```
== After (Next.js 16.3)
```text file=".env.local"
DATABASE_URL="postgres://localhost:5432/app"
NEXT_PUBLIC_API_URL="/api"
```
:::

Read server values from `process.env` in server code. If a value must be read
at request time rather than inlined at build time, call `connection()` first:

```tsx file="app/status/page.tsx"
import { Suspense } from 'react';
import { connection } from 'next/server';

async function RegionBadge() {
  await connection();
  const region = process.env.DEPLOY_REGION ?? 'unknown';
  return <p>Serving from {region}</p>;
}

export default function StatusPage() {
  return (
    <main>
      <h1>Status</h1>
      <Suspense fallback={<p>Checking region…</p>}>
        <RegionBadge />
      </Suspense>
    </main>
  );
}
```

### Parallel route slots need `default.tsx`

Every parallel route slot now **requires** an explicit `default` file, and the
build fails without one. Previously Next.js silently rendered nothing for an
unmatched slot, which hid routing bugs.

```tsx file="app/dashboard/@analytics/default.tsx"
export default function AnalyticsDefault() {
  return null;
}
```

Call `notFound()` from `next/navigation` instead of returning `null` if an
unmatched slot should 404. See [Parallel routes](../nextjs-routing/parallel-routes.md).

## Step 3: Review behavior changes

These do not throw errors, which is why they are easy to miss.

### Turbopack is the default bundler

`next dev` and `next build` use Turbopack. Remove `--turbopack` and `--turbo`
from your scripts. They still work, but they are redundant.

:::tabs
== Before (Next.js 15)
```json legacy file="package.json"
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```
== After (Next.js 16.3)
```json file="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint ."
  }
}
```
:::

If a custom `webpack` function is present, including one added by a plugin,
`next build` **fails** rather than silently ignoring it. You have three options:
migrate the config to Turbopack options, build with `next build --webpack`, or
run `next build --turbopack` to ignore the webpack config deliberately.

:::tabs
== Before (Next.js 15)
```ts legacy file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    turbopack: {
      resolveAlias: { '~*': '*' },
    },
  },
};

export default nextConfig;
```
== After (Next.js 16.3)
```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: { '~*': '*' },
  },
};

export default nextConfig;
```
:::

Turbopack does not support the Sass `~` prefix for `node_modules` imports.
Write `@import 'bootstrap/dist/css/bootstrap.min.css'`, or keep the alias shown
above.

### `revalidateTag` needs a second argument

The single-argument form is **deprecated and a type error**. The second argument
is a `cacheLife` profile name or `{ expire: number }`, and it makes the
stale-while-revalidate behavior explicit. When the user must see their own
write immediately, use `updateTag` in a Server Action instead.

:::tabs
== Before (Next.js 15)
```ts legacy file="app/posts/actions.ts"
'use server';

import { revalidateTag } from 'next/cache';

export async function publishPost() {
  revalidateTag('posts');
}
```
== After (Next.js 16.3)
```ts file="app/posts/actions.ts"
'use server';

import { refresh, revalidateTag, updateTag } from 'next/cache';

export async function publishPost(postId: string) {
  // Readers can see the old list while it regenerates in the background.
  revalidateTag('posts', 'max');
  // The author sees their own post on the next request.
  updateTag(`post-${postId}`);
}

export async function markNotificationsRead() {
  // Re-render uncached data on the client without touching any cache.
  refresh();
}
```
:::

`updateTag` and `refresh` are new in 16.0 and work only in Server Actions. See
[Revalidation](../nextjs-data-caching/revalidation.md).

### `cacheLife` and `cacheTag` are stable

:::tabs
== Before (Next.js 15)
```ts legacy file="lib/products.ts"
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from 'next/cache';
```
== After (Next.js 16.3)
```ts file="lib/products.ts"
import { cacheLife, cacheTag } from 'next/cache';

type Product = { id: string; name: string };

export async function getFeaturedProducts(): Promise<Product[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('products');

  const response = await fetch('https://api.example.com/products?featured=true');
  return response.json();
}
```
:::

### `next/image` defaults

The defaults moved toward lower cost and fewer attack surfaces.

| Setting | Next.js 15 | Next.js 16 | Why |
|---|---|---|---|
| `images.minimumCacheTTL` | 60 s | **14400 s** (4 hours) | Upstreams without `Cache-Control` caused re-optimization every minute. |
| `images.qualities` | any quality | **`[75]`** | Other `quality` props are coerced to the closest allowed value. |
| `images.imageSizes` | included `16` | `16` removed | Rarely used, and it bloated `srcset`. |
| `images.maximumRedirects` | unlimited | **3** | Bounds redirect chains. |
| Local IP upstreams | allowed | **blocked**; opt in with `dangerouslyAllowLocalIP` | SSRF protection. |
| Local `src` with a query string | allowed | requires `images.localPatterns` with `search` | Prevents enumeration attacks. |

:::tabs
== Before (Next.js 15)
```js legacy file="next.config.js"
module.exports = {
  images: {
    domains: ['cdn.example.com'],
  },
};
```
== After (Next.js 16.3)
```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.example.com' }],
    localPatterns: [{ pathname: '/assets/**', search: '?v=1' }],
    qualities: [60, 75, 90],
  },
};

export default nextConfig;
```
:::

After the August 2026 security release, AVIF optimization is disabled in
16.3.3 and later until an upstream fix ships. See
[Troubleshooting](../nextjs-reference/troubleshooting.md).

### Smooth scrolling

Next.js 15 temporarily overrode a global `scroll-behavior: smooth` during
navigations. 16.0 no longer does that by default, because the override was
expensive on every navigation. Opt back in on `<html>`:

```tsx file="app/layout.tsx"
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
```

### Everything else that changed quietly

- **`next dev` and `next build` can run at the same time.** Dev output moved to
  `.next/dev`, and a lockfile prevents two instances of the same command on one
  project.
- **The config file loads once in dev.** `process.argv.includes('dev')` inside
  `next.config` is now `false` during `next dev`. Check
  `process.env.NODE_ENV === 'development'` or the config `phase` instead.
- **Prefetching was rebuilt.** Shared layouts are downloaded once and only
  missing segments are fetched. Expect more, smaller prefetch requests. No code
  changes are needed.
- **ESLint flat config** is the default for `@next/eslint-plugin-next`.
- **`sass-loader` v16** supports the modern Sass API.
- **Build Adapters** shipped as an alpha under `experimental.adapterPath` and
  became the stable top-level `adapterPath` in 16.2.

## Step 4: Replace deprecated APIs

Deprecated APIs still run in 16.3. Replace them now, before a future major
removes them.

> [!DEPRECATED]
> **`middleware.ts`** and the `middleware` export are deprecated since 16.0.
> Rename to `proxy.ts` and `proxy`. `proxy` always runs on the Node.js runtime;
> keep `middleware.ts` only if you still need the Edge runtime there. Full guide:
> [Middleware to proxy](./middleware-to-proxy.md).

:::tabs
== Before (Next.js 15)
```ts legacy file="middleware.ts"
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (!request.cookies.has('session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*'] };
```
== After (Next.js 16.3)
```ts file="proxy.ts"
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (!request.cookies.has('session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*'] };
```
:::

> [!DEPRECATED]
> **The Edge runtime.** The bundled 16.3.5 docs say to remove the `runtime`
> export from route files. Cache Components requires the Node.js runtime, which
> is the default.

:::tabs
== Before (Next.js 15)
```ts legacy file="app/api/geo/route.ts"
export const runtime = 'edge';

export async function GET(request: Request) {
  return Response.json({ url: request.url });
}
```
== After (Next.js 16.3)
```ts file="app/api/geo/route.ts"
export async function GET(request: Request) {
  return Response.json({ url: request.url });
}
```
:::

> [!DEPRECATED]
> **`images.domains`** is deprecated. Use `images.remotePatterns`, which can
> restrict protocol, port and pathname as well as the hostname.

> [!DEPRECATED]
> **`next/legacy/image`** is deprecated. Import `Image` from `next/image`.

> [!DEPRECATED]
> **Single-argument `revalidateTag(tag)`** is deprecated and fails type checking.
> Pass a profile: `revalidateTag(tag, 'max')`.

> [!DEPRECATED]
> **`skipMiddlewareUrlNormalize`** is deprecated. It still works with a warning;
> use `skipProxyUrlNormalize`. Setting both throws.

## Step 5: React 19.2 and the Canary build

The App Router in Next.js 16 runs the **React Canary build vendored inside
`next`**, not the `react` version in your `package.json`. `next@16.3.5` ships
`19.3.0-canary-cbb046ab-20260731`. That has two consequences:

- **Upgrading `next` is what patches React Server Components** in an App Router
  app. Bumping `react` alone changes nothing for those routes.
- Some React APIs available in the App Router are not in React 19.2 stable. This
  site labels them wherever they appear. See
  [React Canary in Next.js](../nextjs-rendering/react-canary.md).

The React 19.2 features themselves (`<Activity>`, `useEffectEvent`,
`cacheSignal`) work in both routers once you are on React 19. Pages Router apps
still resolve `react` from `package.json`, so pin `react@19.2.8` and
`react-dom@19.2.8` there and follow [React 18 to 19](../migration/react-18-to-19.md).

## Step 6: Verify

```bash
npx next typegen
npx tsc --noEmit
npx next build
npx next info
```

`next typegen` must run before `tsc`, because `PageProps` and the other route
types only exist after it generates them. Then confirm the installed version is
at or above the floor:

```bash
npm ls next
```

## Common mistakes

- **Stopping at 16.0.** Every 16.x below 16.3.3 carries two Critical RCE
  advisories. Go straight to 16.3.5.
- **Assuming the `upgrade` codemod did everything.** It does not run
  `next-async-request-api`. Leftover synchronous `params` access fails at
  runtime, not always at compile time.
- **Renaming `dynamicIO` to `cacheComponents` and shipping.** The flag changes the
  caching model and can surface build errors across the app. Adopt it on purpose.
- **Keeping `next build --turbopack` in scripts to "force" Turbopack while a
  plugin injects a `webpack` config.** That flag ignores the webpack config, so
  whatever the plugin did silently stops happening. Decide per plugin.
- **Upgrading `react` to patch the RSC advisories in an App Router app.** Only
  upgrading `next` changes the vendored React.
- **Forgetting `default.tsx` in a slot** that only one layout renders. The build
  fails on the route you did not touch.
- **Leaving `revalidateTag('posts')` in JavaScript files.** TypeScript catches
  it; `.js` files do not. Search for it.

## Related topics

- [Next.js 16.2 to 16.3](./next-16-2-to-16-3.md) — the renames and opt-ins that
  landed after 16.0.
- [Middleware to proxy](./middleware-to-proxy.md) — the full rename, including the
  config flags.
- [The pre-16 caching model](./pre-16-caching-model.md) — how to map `fetch`
  options and segment config onto Cache Components.
- [Pages Router to App Router](./pages-to-app-router.md) — if the upgrade is also
  a router migration.
- [React 18 to 19](../migration/react-18-to-19.md) — the React half of the
  upgrade for Pages Router code.
- [Troubleshooting](../nextjs-reference/troubleshooting.md) — the errors you are
  most likely to hit after upgrading.
