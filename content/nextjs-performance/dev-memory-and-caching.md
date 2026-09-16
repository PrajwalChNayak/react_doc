---
title: Dev memory and build caching
description: How the Turbopack filesystem cache and memory eviction speed up next dev and next build in 16.3, and how to keep them working in CI.
group: nextjs-performance
order: 70
status: current
since: "16.3"
related: [nextjs-performance/turbopack, nextjs-getting-started/dev-and-build, nextjs-deployment/build-output, performance/profiling]
---

## Overview

Next.js 16.3 turns on three features by default that change how fast and how
large your dev server and builds are:

| Feature | Applies to | Default since | Where it writes |
|---|---|---|---|
| Filesystem cache for dev | `next dev` | 16.1 | `.next/dev/cache/turbopack` |
| Filesystem cache for build | `next build` | 16.3 | `.next/cache/turbopack` |
| Memory eviction | `next dev` | 16.3 | — (reloads evicted data from the dev cache) |

You do not configure any of them to get the benefit. You do need to know where
they write, because CI and container builds only get faster if `.next/cache`
survives between runs.

## Why it exists

Turbopack caches work down to the function level. Before the filesystem cache,
that cache lived only in memory: every dev server restart and every build started
cold, and a long dev session kept everything it had ever compiled in RAM.

Persisting the cache to disk fixes the restart cost. Once the data is on disk,
Turbopack can also drop it from memory and reload it on demand, which fixes the
memory growth. The Next.js team reported these results from Vercel's own apps:

- **Dev restarts (16.1).** First route compile on react.dev went from 3.7 s cold
  to 380 ms cached.
- **Dev memory (16.3).** Up to 90% less memory in long dev sessions. After
  compiling 50 routes of the vercel.com dashboard, memory went from 21.5 GB to
  2 GB.
- **Builds (16.3).** Some projects built up to 5.5× faster on CI with a warm
  cache (vercel.com/geist: 30 s cold, 5.5 s cached).

## When to use it

The defaults are right for almost every project. Read this page when:

- CI builds are no faster in 16.3 than before (the cache is not being restored).
- A Docker build never benefits from the build cache.
- You suspect a stale cache is causing a confusing dev or build error.
- The dev server still runs out of memory.

## When not to use it

Turn the **build** cache off when your build environment never preserves
`.next/cache`. Writing a cache that is never read costs time and disk for nothing:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // This environment starts every build from a clean checkout.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
```

Both cache options live under `experimental` even though the dev cache is stable.
`turbopackFileSystemCacheForDev` works the same way for `next dev`.

## Basic example

In GitHub Actions, restore and save `.next/cache` around the build. The key
changes when dependencies or source files change, and `restore-keys` falls back
to the most recent cache for the same lockfile:

```text file=".github/workflows/build.yml"
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx') }}
    restore-keys: |
      ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
- run: npm ci
- run: npm run build
```

Other providers follow the same rule: cache the `.next/cache` directory. GitLab
CI, CircleCI, Bitbucket Pipelines, Azure Pipelines and AWS CodeBuild all have a
cache setting that takes a path. Vercel configures this automatically. If CI does
not persist the cache, `next build` may warn with a "No Cache Detected" message.

## How it works

### Separate output for dev and build

Since 16.0, `next dev` writes to `.next/dev` and `next build` writes to `.next`.
That is what lets you run both at once in the same project, and it is why the
two caches live in different directories:

```text
.next/
├── cache/
│   ├── turbopack/     build cache (restore this in CI)
│   └── images/        optimized images from next/image
├── dev/
│   ├── cache/
│   │   └── turbopack/ dev cache
│   └── lock           the running dev server's PID, port and URL
└── ...                build output
```

A lockfile also prevents two `next dev` (or two `next build`) processes on the
same project. A second `next dev` prints the URL and PID of the one already
running instead of starting a duplicate.

### Memory eviction

After Turbopack writes a snapshot of its cache to disk, it can evict the
in-memory copies and reload them from disk when needed. The default mode,
`'auto'`, evicts once enough memory has been allocated since the last eviction to
make it worthwhile, using thresholds and memory-pressure feedback from the
operating system.

> [!WARNING]
> **Experimental.** The `experimental.turbopackMemoryEviction` option (16.3) is
> experimental and under active development. Its values are `'auto'` (default),
> `'full'` (evict everything after every snapshot) and `false` (never evict). It
> only has an effect in `next dev` with the dev filesystem cache enabled.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Lowest memory, more disk reads. Try this on memory-constrained machines.
    turbopackMemoryEviction: 'full',
  },
};

export default nextConfig;
```

Turning the dev filesystem cache off also turns eviction off, because there is
nothing on disk to reload from. That is a large memory regression for a long
session.

## Common patterns

### Clear a cache you suspect

When you need to rule out a stale cache, stop the dev server and delete only the
cache you suspect:

```bash
# Dev cache only
rm -rf .next/dev/cache/turbopack

# Build cache only
rm -rf .next/cache/turbopack

# Everything Next.js generated, including build output
rm -rf .next
```

The next run is cold and slower. If the problem persists after a cold run, the
cache was not the cause.

### Keep the cache in Docker builds

A container build starts from a clean layer, so `.next/cache` is not carried over
unless you cache or mount it explicitly. Use your builder's cache mount for
`/app/.next/cache` (or wherever the app is built). Without it, set
`turbopackFileSystemCacheForBuild: false`.

### Investigate memory that is still high

- **Record a Turbopack trace:** `next dev --internal-trace` writes
  `.next-profiles/trace-turbopack.bin`. Open it with
  `npx next internal trace .next-profiles/trace-turbopack.bin`.
- **Inspect the heap:** `next dev --inspect` (16.1) attaches the Node.js
  inspector to the process running your code. Take heap snapshots in Chrome
  DevTools.
- **Debug a build:** `next build --experimental-debug-memory-usage` prints heap
  and garbage-collection statistics during the build and takes heap snapshots
  when memory nears the limit.
- **Reduce the module graph.** Icon libraries and barrel files can add tens of
  thousands of modules. See [Bundle analysis](./bundle-analysis.md).

### Local environment issues are often the real cause

The Next.js local development guide lists causes outside Next.js: antivirus
scanning the project folder (on Windows, add a Defender exclusion or use a Dev
Drive), project files mounted into Docker Desktop from the host, and on WSL 2,
keeping the project on the Windows drive instead of the Linux filesystem.

## Common mistakes

- **Caching all of `.next` instead of `.next/cache` in CI.** The build output is
  regenerated on every build, so caching it only adds upload and restore time.
- **Assuming a fresh CI runner uses the build cache.** It is only as warm as the
  last restore. Check that the restore step actually hits.
- **Deleting all of `.next` as a habit.** Every run becomes a cold start, which
  throws away the main 16.1–16.3 speedups.
- **Disabling the dev filesystem cache to "save disk".** Memory eviction depends
  on it, so dev memory grows again.
- **Debugging memory in a container with files mounted from the host.** File
  watching through Docker Desktop's file sharing is slow and unreliable. Run
  `next dev` on the host.
- **Setting `turbopackFileSystemCacheForBuild: false` on a CI that does cache
  `.next/cache`.** You give up warm builds for nothing.

## Related topics

- [Turbopack](./turbopack.md) — the bundler whose work these caches store.
- [Dev and build](../nextjs-getting-started/dev-and-build.md) — what `next dev`
  and `next build` do and how they differ.
- [Build output](../nextjs-deployment/build-output.md) — what else lives in
  `.next` after a build.
- [Bundle analysis](./bundle-analysis.md) — shrink the module graph that dev
  and build have to process.
- [Profiling](../performance/profiling.md) — heap snapshots and the Memory panel
  for leaks in your own code.
