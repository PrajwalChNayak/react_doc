---
title: Adapters
description: The stable Adapters API that lets a deployment platform read and reshape the Next.js build output through adapterPath.
group: nextjs-deployment
order: 40
status: current
since: "16.2"
related: [nextjs-deployment/managed-platforms, nextjs-deployment/build-output, nextjs-deployment/caching-and-cdn, server-react/static-generation]
---

## Overview

An **adapter** is a module that Next.js loads during the build. It can adjust
the Next.js config before the build and, once the build finishes, receives a
structured description of everything that was produced: pages, Route Handlers,
prerenders, static files and the full routing table. A platform uses that
description to deploy the app onto its own infrastructure.

The Adapters API became **stable in Next.js 16.2**. You enable an adapter with
`adapterPath` in `next.config` or the `NEXT_ADAPTER_PATH` environment variable.

| Part | Name | When it runs |
|---|---|---|
| Config hook | `modifyConfig(config, { phase, nextVersion, projectDir })` | Any CLI command that loads `next.config` |
| Output hook | `onBuildComplete({ routing, outputs, projectDir, repoRoot, distDir, config, nextVersion, buildId })` | After `next build` finishes |
| Type | `NextAdapter` from `next` | Compile time |

Most application developers never write an adapter. You meet one when your
hosting platform sets `NEXT_ADAPTER_PATH` for you.

## Why it exists

Before a public API, every host that was not a plain Node.js server had to
reverse-engineer the files in `.next/`, which change between releases. Each
Next.js upgrade could break a platform's integration.

The Adapters API makes that contract explicit. The bundled docs state that
there are no private hooks: Vercel's adapter uses the same public API as any
other. Adapters that are open source and run the Next.js compatibility test
suite can be listed as **verified adapters**.

## When to use it

- **You build a deployment platform** or an internal platform team's deploy
  pipeline and need to map routes to functions, static storage and a CDN.
- **You need build metadata** such as a list of prerendered routes, a route
  manifest for monitoring, or a validation step that fails the build when an
  output breaks a rule.
- **You want PPR at CDN latency.** The adapter output includes each partially
  prerendered route's shell and `postponedState`.

## When not to use it

- **You run `next start` or a Docker image.** The Node.js server already handles
  every feature. No adapter is needed.
- **You only want runtime cache storage.** That is `cacheHandler` and
  `cacheHandlers`, not an adapter. The adapter API is build-time only.
- **You want to change request handling at runtime.** Use `proxy.ts`, headers,
  rewrites, or Route Handlers in the app.

## Basic example

An adapter that writes a report of the build output. It is plain JavaScript so
Next.js can load it without a compile step:

```js file="adapters/build-report.js"
const { writeFile } = require('node:fs/promises');
const path = require('node:path');

/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'build-report',

  async onBuildComplete({ outputs, distDir, buildId, nextVersion }) {
    const report = {
      buildId,
      nextVersion,
      appPages: outputs.appPages.map((page) => page.pathname),
      appRoutes: outputs.appRoutes.map((route) => route.pathname),
      prerenders: outputs.prerenders.map((prerender) => prerender.pathname),
      staticFiles: outputs.staticFiles.length,
    };

    await writeFile(path.join(distDir, 'build-report.json'), JSON.stringify(report, null, 2));
  },
};

module.exports = adapter;
```

Point `adapterPath` at it:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  adapterPath: require.resolve('./adapters/build-report.js'),
};

export default nextConfig;
```

Or, without touching the config, the way a platform does it:

```bash
NEXT_ADAPTER_PATH="$PWD/adapters/build-report.js" npm run build
```

## How it works

### `modifyConfig`

Called for any CLI command that loads the config, with the current `phase`.
Return the config, changed or not. Check the phase so a change meant for
production builds does not leak into `next dev`.

### `onBuildComplete`

Called once after the build. The most important fields:

- **`outputs`**, grouped by type:

  | Field | Contains |
  |---|---|
  | `appPages` | App Router pages (pathnames include `.rsc` variants) |
  | `appRoutes` | Route Handlers and metadata routes |
  | `prerenders` | Static prerenders and ISR entries, with `fallback` data |
  | `staticFiles` | Static assets and fully static pages |
  | `pages`, `pagesApi` | Pages Router pages and API routes |
  | `middleware` | The request interception function, if present |

  Each function output carries `filePath`, `runtime`, the traced `assets` it
  needs, and `config` such as `maxDuration`. With `output: 'export'`, only
  `staticFiles` is populated.

- **`routing`**: the processed routing table in phases (`beforeMiddleware`,
  `beforeFiles`, `afterFiles`, `dynamicRoutes`, `onMatch`, `fallback`), ready to
  compile into a platform's routing config. The `@next/routing` package can
  resolve requests against it with the same matching rules as Next.js.

- **`buildId`**, **`distDir`**, **`projectDir`**, **`repoRoot`**, and the final
  **`config`** after `modifyConfig`.

### Build time versus run time

The adapter only runs during the build. At request time, the platform invokes
the entrypoints listed in `outputs` through a `handler(req, res, ctx)` interface.
The Next.js handler still does the rendering, streaming and caching. Cache
storage across instances goes through `cacheHandler` (server cache and ISR) and
`cacheHandlers` (`"use cache"`). Together, the adapter and those two interfaces
are the whole platform integration surface.

### Partial prerendering in an adapter

For partially prerendered routes, each entry in `outputs.prerenders` has a
`fallback.filePath` (the shell) and `fallback.postponedState`. A platform can
store both, serve the shell from its CDN, then resume the dynamic part by calling
the handler with a `POST`, the `next-resume: 1` header, and the postponed state as
the body. Shell and postponed state must always be stored and replaced together.
React's `prerender` and `resume` are the mechanism underneath; see
[Static generation](../server-react/static-generation.md).

### Immutable static assets (16.3)

Since **16.3**, an adapter can opt in to immutable static assets by setting
`config.supportsImmutableAssets` in `modifyConfig`. Next.js then emits
content-addressed files under `/_next/static/immutable/`, requested **without**
the `?dpl=` deployment query parameter, so browsers and CDNs keep them across
deployments. In `onBuildComplete`, `outputs.staticFiles[].immutableHash` tells
the adapter which files are immutable. The platform must never change or delete
such a file while any live deployment still uses it.

App developers only set `supportsImmutableAssets: false` to opt out when
troubleshooting. The config reference warns that turning it on without platform
support can break deployments.

### Testing an adapter

Next.js ships a compatibility test harness. The adapter provides three scripts,
pointed to by `NEXT_TEST_DEPLOY_SCRIPT_PATH`, `NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH`
and `NEXT_TEST_CLEANUP_SCRIPT_PATH`. The deploy script builds and deploys an
isolated test app and prints only its URL to stdout. The logs script must print
`BUILD_ID:`, `DEPLOYMENT_ID:` and `NEXT_SUPPORTS_IMMUTABLE_ASSETS:` lines.
Passing this suite is what the docs call functional fidelity.

## Caching implications

- **Adapters see cache lifetimes, not cache storage.** Prerender fallbacks carry
  `initialRevalidate` and `initialExpiration`. Where entries are stored at run
  time is decided by the cache handlers the platform configures.
- **Revalidation must reach every copy.** If the platform puts shells in a CDN or
  KV store, it has to update them when Next.js regenerates an entry. The handler
  context's `requestMeta.onCacheEntryV2` callback is how an adapter observes new
  entries.

## Common patterns

### Modify the config for production builds only

```js file="adapters/platform-adapter.js"
/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'acme-platform',

  async modifyConfig(config, { phase }) {
    if (phase !== 'phase-production-build') return config;

    return {
      ...config,
      // Opt in to immutable assets unless the app opted out.
      supportsImmutableAssets: config.supportsImmutableAssets ?? true,
    };
  },

  async onBuildComplete({ outputs }) {
    for (const file of outputs.staticFiles) {
      if (file.immutableHash) {
        // Upload once, shared across deployments, at file.pathname.
      } else {
        // Upload scoped to this deployment.
      }
    }
  },
};

module.exports = adapter;
```

### Fail the build on a rule

`onBuildComplete` can throw. A platform team can reject builds that, for
example, still contain routes on the deprecated Edge runtime:

```ts file="adapters/policy.ts"
import type { NextAdapter } from 'next';

const adapter: NextAdapter = {
  name: 'runtime-policy',

  onBuildComplete({ outputs }) {
    const edgeRoutes = [...outputs.appPages, ...outputs.appRoutes]
      .filter((output) => output.runtime === 'edge')
      .map((output) => output.pathname);

    if (edgeRoutes.length > 0) {
      throw new Error(`Edge runtime is deprecated. Move these routes to Node.js: ${edgeRoutes.join(', ')}`);
    }
  },
};

export default adapter;
```

Written in TypeScript, the adapter has to be compiled to JavaScript before
`adapterPath` or `NEXT_ADAPTER_PATH` can point at it. The adapter test harness
example points at a built `dist/index.js` for the same reason.

## Common mistakes

**Writing an adapter to run a Node.js server.** `next start` already does that.
Adapters are for platforms that split the app across their own primitives.

**Parsing files in `.next/` instead of reading `outputs`.** The file layout is
internal. `outputs` and `routing` are the contract.

**Altering `postponedState`.** Treat it as opaque. A shell paired with the wrong
postponed state renders incorrect dynamic content.

**Enabling `supportsImmutableAssets` in an app** whose host has not implemented
it. Assets are requested from paths the platform does not serve.

**Assuming an adapter handles runtime caching.** Configure `cacheHandler` and
`cacheHandlers` for that.

**Trusting "supports Next.js" without the test suite.** Ask whether the platform
runs the compatibility tests. See [Managed platforms](./managed-platforms.md).

## Related topics

- [Managed platforms](./managed-platforms.md): verified adapters and what to ask a
  host.
- [Build output](./build-output.md): the output modes and route table the adapter
  receives.
- [Caching and CDNs](./caching-and-cdn.md): the headers and variants a platform's
  CDN must respect.
- [Self-hosting](./self-hosting.md): `cacheHandler`, `cacheHandlers` and
  `deploymentId` on your own servers.
- [Static generation (React)](../server-react/static-generation.md): the
  `prerender` and `resume` model behind partial prerendering.
