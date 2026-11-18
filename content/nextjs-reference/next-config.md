---
title: next.config reference
description: The next.config options that matter in Next.js 16.3, with types, defaults and whether each is current, opt-in, experimental or deprecated.
group: nextjs-reference
order: 20
status: current
since: "16.3"
related: [nextjs-reference/file-conventions, nextjs-reference/cli, nextjs-getting-started/typescript, nextjs-data-caching/caching-model]
shape: reference
---

Types and defaults below were read from the `NextConfig` type and the default
config shipped in `next@16.3.5`, and cross-checked against the bundled docs. This
is not every option. It is the set you are likely to set, plus the ones people
still set from memory and should not.

**Labels.** *Current*: stable, top-level. *Opt-in*: stable behavior behind a flag
you set on purpose. *Experimental*: the key lives under `experimental` and may
change. Several stable behaviors are **tuned** through an `experimental.*` key;
there the label describes the key, not the behavior. *Deprecated*: still read,
do not use.

## The config file

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  typedRoutes: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.example.com' }],
  },
  cacheLife: {
    editorial: { stale: 300, revalidate: 900, expire: 86400 },
  },
  async redirects() {
    return [{ source: '/docs/old', destination: '/docs', permanent: true }];
  },
};

export default nextConfig;
```

`next.config.ts`, `next.config.js` and `next.config.mjs` are supported;
`.cjs` and `.cts` are not. The default export may also be a function
`(phase, { defaultConfig }) => config`, sync or async. In 16.0 the config loads
once in `next dev`, so `process.argv.includes('dev')` is `false` there; use
`phase` or `process.env.NODE_ENV`.

## Rendering and caching

| Option | Type | Default | Label | What it does |
|---|---|---|---|---|
| `cacheComponents` | `boolean` | `false` | Opt-in (16.0) | Enables `"use cache"`, `cacheLife`, `cacheTag` and Partial Prerendering. Data is dynamic unless cached. Requires the Node.js runtime. Replaces the removed `experimental.dynamicIO`, `experimental.useCache` and `experimental.ppr`. |
| `partialPrefetching` | `boolean` | `false` | **Opt-in (16.3)** | Instant Navigations: one App Shell prefetch per route. **Requires `cacheComponents`**, or config validation throws. Slated to become the default in a future major. |
| `cacheLife` | `Record<string, { stale?, revalidate?, expire? }>` | built-in profiles | Current | Custom profiles, or overrides of `default`, `seconds`, `minutes`, `hours`, `days`, `weeks`, `max`. Values in seconds. |
| `cacheHandlers` | `{ default?, remote?, static?, [name]: string }` | in-memory | Current | Module paths for `"use cache"` storage. Most apps need none. |
| `cacheHandler` | `string` | filesystem | Current | Custom handler for the Previous Model's ISR and Data Cache. |
| `cacheMaxMemorySize` | `number` (bytes) | `52428800` (50 MB) | Current | `0` disables the in-memory cache. |
| `expireTime` | `number` (seconds) | `31536000` | Current | `stale-while-revalidate` expiry sent to CDNs for ISR pages. |
| `reactCompiler` | `boolean \| { compilationMode, … }` | off | Current (stable in 16.0) | Runs the React Compiler through Babel. Needs `babel-plugin-react-compiler`. Replaces the removed `experimental.reactCompiler`. |
| `reactStrictMode` | `boolean` | on for the App Router | Current | Only needed to turn Strict Mode on for `pages/` or off everywhere. |
| `experimental.staleTimes` | `{ dynamic, static }` (seconds) | `{ dynamic: 0, static: 300 }` | Experimental | Client cache reuse times for page segments. |

## Routing and requests

| Option | Type | Default | Label | What it does |
|---|---|---|---|---|
| `typedRoutes` | `boolean` | `false` | Current (top-level) | Type-checks `<Link href>` and `router.push` against real routes. TypeScript only. |
| `redirects` | `async () => Redirect[]` | | Current | Runs before `proxy.ts`. |
| `rewrites` | `async () => Rewrite[] \| { beforeFiles, afterFiles, fallback }` | | Current | |
| `headers` | `async () => Header[]` | | Current | Runs first, before redirects. |
| `basePath` | `string` | `''` | Current | Serve the app under a sub-path. |
| `trailingSlash` | `boolean` | `false` | Current | |
| `skipProxyUrlNormalize` | `boolean` | `false` | Current (16.0) | Proxy sees the raw request URL and internal navigation headers. |
| `skipMiddlewareUrlNormalize` | `boolean` | | **Deprecated** (16.0) | Old name of `skipProxyUrlNormalize`. Setting both throws. |
| `skipTrailingSlashRedirect` | `boolean` | `false` | Current | Handle trailing slashes yourself in proxy. |
| `experimental.proxyClientMaxBodySize` | `string \| number` | `10485760` (10 MB) | Experimental | Max request body the proxy buffers. Was `experimental.middlewareClientMaxBodySize`. |
| `experimental.serverActions` | `{ bodySizeLimit, allowedOrigins }` | 1 MB, same origin | Experimental key | Server Actions are stable; these limits live under `experimental`. |
| `experimental.authInterrupts` | `boolean` | `false` | Experimental | Enables `forbidden()`, `unauthorized()` and their files. |
| `experimental.globalNotFound` | `boolean` | `false` | Experimental | Enables `app/global-not-found.tsx`. |
| `experimental.prefetchInlining` | `boolean \| { maxSize, maxBundleSize }` | `true` | Experimental key | Bundles small prefetch responses. The behavior is permanent and on by default in 16.3; the key tunes it. |
| `experimental.useOffline` | `boolean` | `false` | Experimental (16.3) | Retries navigations, prefetches and Server Actions after connectivity returns; powers `useOffline` from `next/offline`. |
| `experimental.exposeTestingApiInProductionBuild` | `boolean` | | Experimental | Needed to run `@next/playwright`'s `instant()` against `next start`. Not for user-facing deployments. |

## Build, bundling and TypeScript

| Option | Type | Default | Label | What it does |
|---|---|---|---|---|
| `turbopack` | `TurbopackOptions` (`resolveAlias`, `rules`, `root`, `resolveExtensions`, `debugIds`, …) | | Current (16.0) | Turbopack config. Was `experimental.turbopack`. Turbopack is the default bundler; `--webpack` opts out. |
| `webpack` | `(config, context) => config` | | Current | Only used with `--webpack`. Its presence makes a plain `next build` fail on purpose. |
| `experimental.turbopackFileSystemCacheForDev` | `boolean` | `true` | Experimental key | Disk cache for `next dev`, on by default since 16.1. |
| `experimental.turbopackFileSystemCacheForBuild` | `boolean` | `true` | Experimental key | Disk cache for `next build`, on by default since 16.3. Set `false` if CI never restores `.next/cache`. |
| `experimental.turbopackMemoryEviction` | `false \| 'auto' \| 'full'` | `'auto'` | Experimental (16.3) | Drops in-memory data already persisted to disk during `next dev`. |
| `experimental.turbopackRustReactCompiler` | `boolean` | | Experimental (16.3) | Native Rust React Compiler. Requires `reactCompiler`; Turbopack only. |
| `experimental.useTypeScriptCli` | `boolean` | `true` | Experimental | `next build` type-checks with the project's `tsc` CLI, which makes TypeScript 7 work. `false` uses the compiler API and fails with TypeScript 7. |
| `experimental.cssChunking` | `boolean \| 'strict' \| 'graph'` | `true` | Experimental | CSS chunk merging strategy. `'graph'` is Turbopack only; `false` and `'strict'` are webpack only. |
| `typescript` | `{ ignoreBuildErrors?, tsconfigPath? }` | `{ ignoreBuildErrors: false }` | Current | `ignoreBuildErrors` also skips the CLI checker. |
| `transpilePackages` | `string[]` | | Current | Compile workspace or `node_modules` packages that ship TypeScript or JSX. |
| `serverExternalPackages` | `string[]` | none (plus a built-in list) | Current | Leave these to Node.js `require` in server bundles. Cannot overlap `transpilePackages`. |
| `output` | `'standalone' \| 'export'` | `undefined` | Current | `standalone` for containers; `export` for static hosting (no `"use cache"`, no proxy). |
| `distDir` | `string` | `'.next'` | Current | |
| `pageExtensions` | `string[]` | `['tsx', 'ts', 'jsx', 'js']` | Current | Also renames `proxy.ts` (for example `proxy.page.ts`). |
| `productionBrowserSourceMaps` | `boolean` | `false` | Current | |
| `compiler` | `{ removeConsole, styledComponents, emotion, define, … }` | | Current | SWC transforms. |
| `adapterPath` | `string` | | Current (stable in 16.2) | Deployment adapter module. Also `NEXT_ADAPTER_PATH`. |
| `deploymentId` | `string` | | Current | Skew protection identifier. |
| `assetPrefix` | `string` | `''` | Current | CDN prefix for static assets. |
| `outputFileTracingRoot` / `…Includes` / `…Excludes` | | | Current | Control file tracing for `standalone`. |

## Images

All under `images`.

| Option | Type | Default (16.x) | Label | Notes |
|---|---|---|---|---|
| `remotePatterns` | `Array<URL \| { protocol, hostname, port, pathname, search }>` | `[]` | Current | The only way to allow remote images. |
| `localPatterns` | `Array<{ pathname, search }>` | `undefined` | Current | **Required** for a local `src` with a query string since 16.0. |
| `qualities` | `number[]` | `[75]` | Current | Was "any quality" before 16.0. |
| `minimumCacheTTL` | `number` (seconds) | `14400` | Current | Was 60 before 16.0. |
| `imageSizes` | `number[]` | `[32, 48, 64, 96, 128, 256, 384]` | Current | `16` removed in 16.0. |
| `deviceSizes` | `number[]` | `[640, 750, 828, 1080, 1200, 1920, 2048, 3840]` | Current | |
| `formats` | `string[]` | `['image/webp']` | Current | AVIF optimization is disabled by the 16.3.3 security patch. |
| `maximumRedirects` | `number` | `3` | Current | Was unlimited before 16.0. |
| `dangerouslyAllowLocalIP` | `boolean` | `false` | Current | Local IP upstreams blocked since 16.0. SSRF risk. |
| `dangerouslyAllowSVG` | `boolean` | `false` | Current | |
| `unoptimized` | `boolean` | `false` | Current | |
| `domains` | `string[]` | `[]` | **Deprecated** | Use `remotePatterns` instead. |

## Development

| Option | Type | Default | Label | Notes |
|---|---|---|---|---|
| `allowedDevOrigins` | `string[]` | | Current | Extra origins allowed to load dev-only assets, for example a tunnel. |
| `devIndicators` | `false \| { position }` | `{ position: 'bottom-left' }` | Current | `appIsrStatus`, `buildActivity` and `buildActivityPosition` were removed in 16.0. |
| `logging` | `false \| { fetches, incomingRequests, serverFunctions, browserToTerminal }` | Server Function logs on | Current | Terminal logging in dev. |

## Removed or renamed

Setting these does nothing useful in 16.3, or fails.

| Old option | Status | Replacement |
|---|---|---|
| `experimental.ppr`, `experimental.dynamicIO`, `experimental.useCache` | Removed in 16.0 | `cacheComponents` |
| `experimental.turbopack` | Removed in 16.0 | `turbopack` |
| `experimental.reactCompiler` | Removed in 16.0 | `reactCompiler` |
| `experimental.typedRoutes` | Stable | `typedRoutes` |
| `serverRuntimeConfig`, `publicRuntimeConfig` | Removed in 16.0 | Environment variables |
| `eslint` | Removed in 16.0 with `next lint` | `eslint.config.mjs` |
| `amp` | Removed in 16.0 | none |
| `skipMiddlewareUrlNormalize` | Deprecated in 16.0 | `skipProxyUrlNormalize` |
| `experimental.middlewareClientMaxBodySize` | Renamed in 16.0 | `experimental.proxyClientMaxBodySize` |
| `images.domains` | Deprecated | `images.remotePatterns` |

`experimental.ppr` still exists in the TypeScript type, so the compiler will not
flag it. It has no effect. See [Next.js 15 to 16](../nextjs-migration/next-15-to-16.md).

## Common mistakes

- **Setting `partialPrefetching` without `cacheComponents`.** The config fails
  validation.
- **Putting `partialPrefetching` or `typedRoutes` under `experimental`.** Both are
  top-level.
- **Putting `serverActions.bodySizeLimit` at the top level.** In 16.3.5 it lives
  under `experimental.serverActions`.
- **Reading an `experimental.*` key as "this feature is experimental".** The
  Turbopack filesystem caches and prefetch inlining are on by default; only their
  tuning keys are experimental.
- **Leaving a plugin's `webpack` hook in place and wondering why `next build`
  fails.** Turbopack is the default; pass `--webpack` or migrate the hook.
- **Using `images.domains`.** It is deprecated and cannot restrict protocol or
  path. Use `remotePatterns`.
- **Checking `process.argv` for `dev` in the config.** Since 16.0 it is `false`
  under `next dev`.

## Related topics

- [File conventions reference](./file-conventions.md) — which files depend on
  which flags.
- [CLI reference](./cli.md) — flags such as `--webpack` that override config.
- [TypeScript in Next.js](../nextjs-getting-started/typescript.md) — `typedRoutes`,
  `typescript` options and TypeScript 7.
- [The caching model](../nextjs-data-caching/caching-model.md) — what
  `cacheComponents` changes.
- [React Compiler](../performance/react-compiler.md) — what `reactCompiler`
  turns on.
