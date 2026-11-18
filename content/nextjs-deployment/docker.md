---
title: Docker
description: Package a Next.js 16 app as a small, non-root container image with standalone output and a multi-stage Dockerfile.
group: nextjs-deployment
order: 30
status: current
related: [nextjs-deployment/build-output, nextjs-deployment/self-hosting, nextjs-deployment/environment-configuration, server-react/ssr-and-hydration]
---

## Overview

A Docker image is the most common way to self-host Next.js. The bundled docs
state that Docker deployments support all Next.js features, because the
container runs the same Node.js server as `next start`.

The official `with-docker` example in the Next.js repository uses three stages:

| Stage | Base | Does | Ends up in the final image |
|---|---|---|---|
| `dependencies` | `node:<version>-slim` | Installs `node_modules` from the lockfile | No |
| `builder` | same | Runs `next build` with `output: 'standalone'` | Only the copied output |
| `runner` | same | Runs `node server.js` as the `node` user | Yes |

The final image contains `.next/standalone`, `.next/static` and `public`.
Source code, dev dependencies and the build cache stay behind in earlier stages.

## Why it exists

A naive image copies the whole project, installs every dependency and runs
`next build` in the final layer. It ships your source, your dev tooling and often
your `.env` file, and it weighs hundreds of megabytes more than it needs to.

Standalone output solves the size problem: Next.js traces which files the server
actually loads. A multi-stage build solves the leakage problem: only the traced
output crosses into the image you run.

## When to use it

- **Kubernetes, ECS, Cloud Run-style services or any container host.**
- **One artifact for every environment.** Build the image once and promote it
  from staging to production with different runtime variables.
- **Reproducible builds.** The lockfile install and the pinned Node.js base image
  make the build independent of the CI machine.

## When not to use it

- **Local development on macOS or Windows.** The bundled docs recommend running
  `npm run dev` directly there, for better performance.
- **A static export.** An nginx or static file host serves `out/` without a
  Node.js runtime. The Next.js repo has a separate `with-docker-export-output`
  example for that.
- **Your platform builds Next.js itself** through an adapter. Shipping a
  container would bypass what the platform optimizes.

## Basic example

Turn on standalone output:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

Keep secrets and local artifacts out of the build context:

```text file=".dockerignore"
.git
.next
node_modules
npm-debug.log*
.env
.env*.local
```

Then the Dockerfile. It follows the official `with-docker` example, trimmed to
npm:

```text file="Dockerfile"
# syntax=docker/dockerfile:1
# Any Node.js LTS release that satisfies next's engines field (>= 20.9.0).
# Pin an exact version and update it regularly.
ARG NODE_VERSION=24.13.0-slim

# ---- 1. Install dependencies ----
FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---- 2. Build ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# Only NEXT_PUBLIC_ values and other build-time inputs belong here.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN npm run build

# ---- 3. Run ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder --chown=node:node /app/public ./public

# The server writes prerender and image caches here at runtime.
RUN mkdir .next && chown node:node .next

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run it, passing server-only configuration at run time:

```bash
docker build --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com -t shop-web:1.4.0 .
docker run --rm -p 3000:3000 -e DATABASE_URL="$DATABASE_URL" shop-web:1.4.0
```

## How it works

### Why three stages

Docker caches each layer until its inputs change. Copying only
`package.json` and the lockfile before `npm ci` means dependency installation is
reused on every build where you changed only application code. The build stage
then copies the source, and the runner stage copies only the output.

### What standalone output contains

`.next/standalone` holds a minimal `server.js`, the traced server code, and only
the parts of `node_modules` the server loads. It deliberately omits `public` and
`.next/static`, because you might serve them from a CDN. The Dockerfile copies
them in so the container is self-sufficient.

`server.js` reads `PORT` and `HOSTNAME`. The official example sets
`HOSTNAME="0.0.0.0"` so the server listens on every interface in the container,
not only on loopback, which the published port could not reach.

### Non-root user

The official Node.js images include a `node` user. The runner stage copies files
with `--chown=node:node`, creates a writable `.next` directory for runtime cache
files, and switches with `USER node`. If the process is compromised, it does not
have root in the container.

### Build time versus run time

`next build` inlines every `NEXT_PUBLIC_` variable into the client JavaScript.
Those must exist as build arguments, and changing them means rebuilding the
image. Everything else, including database URLs and API keys, should be passed
with `-e` or your orchestrator's secret mechanism when the container starts.
[Environment configuration](./environment-configuration.md) explains how to
read them at request time.

### Node.js version

`next@16.3.5` declares `"node": ">=20.9.0"` in its `engines` field. The official
example pins a `24.x` slim LTS image at the time of writing. Any current LTS
release above the floor works; pin an exact tag so rebuilds are reproducible, and
update it as part of routine maintenance.

## Caching implications

- **The build cache is not in the image.** `.next/cache` stays in the builder
  stage. To speed up rebuilds, add a cache mount to the build step:
  `RUN --mount=type=cache,target=/app/.next/cache npm run build`. The official
  example notes that this also keeps cached fetch responses from the build out of
  the final image.
- **Runtime caches start empty in every new container** and are lost when it
  stops. With more than one replica, configure shared cache handlers as described
  in [Self-hosting](./self-hosting.md).
- **Static assets are content-hashed**, so a CDN in front of the container can
  cache `/_next/static/` indefinitely.

## Common patterns

### Slim or Alpine

The example's README recommends `-slim` images for compatibility with npm
packages that ship native binaries, `sharp` among them. Alpine images are
smaller, but use musl instead of glibc, which some native packages do not
support. Measure before you switch.

### Check the image size

```bash
docker image ls shop-web
docker run --rm shop-web:1.4.0 du -sh /app/node_modules /app/.next
```

If `node_modules` inside the image is large, a dependency is probably being
traced because of a dynamic `require` or `fs` read. Use
`outputFileTracingExcludes` in `next.config.ts` for files that are traced but
never needed.

### Confirm the Next.js version inside the image

The version that matters is the one in the image, not the one in your
`package.json` range:

```bash
docker run --rm shop-web:1.4.0 node -p "require('next/package.json').version"
```

The output must be `16.3.3` or higher. See the
[Deployment checklist](./checklist.md).

### Debug a running container

Pass `--inspect=0.0.0.0` only in a debugging session, and publish the inspector
port only to your own machine. See
[Debugging production](./debugging-production.md).

## Security considerations

- **Never `COPY .env` into an image.** Anything in a layer can be extracted, even
  if a later layer deletes it. Exclude `.env*` in `.dockerignore`.
- **`NEXT_PUBLIC_` build arguments are public.** Their values end up in client
  JavaScript. Do not pass secrets as build arguments.
- **Run as `node`, not root.**
- **Rebuild when the base image or `next` gets a security release.** A pinned tag
  does not patch itself.

## Common mistakes

**Forgetting `output: 'standalone'`.** The `COPY` of `.next/standalone` fails,
because the folder does not exist.

**Not copying `.next/static` and `public`.** The server starts, but pages load
without CSS, JavaScript or images.

**Setting `DATABASE_URL` as a build argument.** It is only available at build
time, and may be baked into prerendered output. Pass it at run time.

**Expecting `docker run -e NEXT_PUBLIC_API_URL=...` to change the browser
bundle.** It was inlined during the build. Rebuild, or read the value on the
server.

**Running `next dev` in the production container.** It is slower, compiles on
demand and exposes development-only behavior.
## Related topics

- [Build output](./build-output.md): what standalone output contains and how it
  is traced.
- [Self-hosting](./self-hosting.md): proxies, shared caches and version skew
  once the container runs.
- [Environment configuration](./environment-configuration.md): one image,
  several environments.
- [Deployment checklist](./checklist.md): verify the running version and
  configuration.
- [SSR and hydration (React)](../server-react/ssr-and-hydration.md): what the
  server in the container is doing on each request.
