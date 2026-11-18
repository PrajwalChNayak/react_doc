---
title: CLI reference
description: Every next command and flag in Next.js 16.3, plus create-next-app and the codemod CLI.
group: nextjs-reference
order: 30
status: current
since: "16.3"
related: [nextjs-getting-started/dev-and-build, nextjs-getting-started/installation, nextjs-reference/next-config, nextjs-performance/bundle-analysis]
shape: reference
---

Flags verified against the bundled `06-cli` docs and the `next` binary in
`next@16.3.5`. Run any command through your package manager: `npx next …`,
`pnpm next …`. With `npm run`, put `--` before flags so npm forwards them:
`npm run dev -- --port 4000`.

## `next` commands

| Command | Purpose | Since |
|---|---|---|
| `next dev` | Development server with Fast Refresh, error overlay and DevTools. | |
| `next build` | Production build. Prints each route as static (`○`) or dynamic (`ƒ`). | |
| `next start` | Serves a production build. Run `next build` first. | |
| `next info` | Prints OS, binaries, package versions and config for bug reports. | |
| `next typegen` | Generates route types (`PageProps`, `LayoutProps`, `RouteContext`, `next/root-params`) and `next-env.d.ts` without building. | 15.5 |
| `next upgrade` | Upgrades Next.js in the current project. | 16.1 |
| `next experimental-analyze` | Turbopack bundle analyzer. Produces no build. | 16.1 |
| `next telemetry` | Enables or disables anonymous telemetry. | |
| `next -v`, `next -h` | Version, help. | |

`next lint` was **removed in 16.0**. Run `eslint .` (or Biome) directly; the
`next-lint-to-eslint-cli` codemod rewrites the script.

## `next dev`

| Flag | Meaning |
|---|---|
| `[directory]` | Project directory. Defaults to the current one. |
| `-p, --port <port>` | Port. Default `3000`, or `PORT`. `PORT` cannot come from `.env`. |
| `-H, --hostname <hostname>` | Hostname. Default `0.0.0.0`. |
| `--webpack` | Use webpack instead of Turbopack, the default since 16.0. |
| `--turbopack`, `--turbo` | Force Turbopack. Redundant since 16.0. |
| `--inspect [[host:]port]` | Attach the Node.js inspector to server code (16.1). |
| `--experimental-https` | Serve over HTTPS with a self-signed `mkcert` certificate. |
| `--experimental-https-key <path>`, `--experimental-https-cert <path>`, `--experimental-https-ca <path>` | Use your own certificate files. |
| `--experimental-upload-trace <traceUrl>` | Report part of the debug trace to a URL. |
| `--experimental-cpu-prof` | Write V8 CPU profiles to `.next-profiles/` on exit. |

Since 16.0, `next dev` writes to `.next/dev`, so it can run while `next build`
runs, and a lockfile stops a second `next dev` on the same project. In 16.3 it
also maintains a version-matched block in `AGENTS.md` pointing coding agents at
`node_modules/next/dist/docs/`.

## `next build`

| Flag | Meaning |
|---|---|
| `[directory]` | Project directory. |
| `--webpack` | Build with webpack. Required if you keep a custom `webpack` config. |
| `--turbopack`, `--turbo` | Force Turbopack. With a `webpack` config present, builds with Turbopack and ignores that config. |
| `-d, --debug` | Verbose output, including rewrites, redirects and headers. |
| `--profile` | React production profiling. |
| `--no-mangling` | Disable name mangling. Debugging only. |
| `--experimental-app-only` | Build only App Router routes. |
| `--experimental-build-mode [mode]` | `compile` or `generate`. |
| `--debug-prerender` | Unminified server code, server source maps, and continue past the first prerender error. Never deploy the result. |
| `--debug-build-paths=<patterns>` | Build only matching route files. Comma-separated, globs allowed, `!` excludes. |
| `--experimental-cpu-prof` | CPU profiles to `.next-profiles/`. |

```bash
next build --debug-build-paths="app/blog/**/page.tsx,!app/admin/**"
```

Since 16.0 the build no longer runs a linter and no longer prints `size` or
`First Load JS`. Since 16.3 it reads and writes the Turbopack filesystem cache in
`.next/cache`. Type checking runs the project's `tsc` CLI, so TypeScript 7 works.

## `next start`

| Flag | Meaning |
|---|---|
| `[directory]` | Project directory. |
| `-p, --port <port>` | Port. Default `3000`, or `PORT`. |
| `-H, --hostname <hostname>` | Hostname. Default `0.0.0.0`. |
| `--inspect [[host:]port]` | Attach the Node.js inspector to the production server (16.2). |
| `--keepAliveTimeout <ms>` | Keep-alive timeout. Set it higher than your load balancer's. |
| `--experimental-cpu-prof` | CPU profiles to `.next-profiles/`. |

```bash
next start --keepAliveTimeout 70000
```

## `next typegen`

| Flag | Meaning |
|---|---|
| `[directory]` | Project directory, for example `./apps/web`. |

Writes to `.next/types` (or `.next/dev/types`) and creates `next-env.d.ts`. It
loads `next.config` in the production build phase, so the config's environment
variables must be available. Use it wherever you type-check without building:

```bash
next typegen && tsc --noEmit
```

## `next info`, `next telemetry`, `next upgrade`

| Command | Flags |
|---|---|
| `next info` | `--verbose` collects more detail. |
| `next telemetry` | `--enable`, `--disable`. |
| `next upgrade` | `[directory]`, `--revision <revision>` (`latest`, `canary`, or a version; defaults to your current channel), `--verbose`. |

## `next experimental-analyze`

> [!WARNING]
> **Experimental.** `next experimental-analyze` (16.1) is an experimental command.
> Its flags and output format may change.

| Flag | Meaning |
|---|---|
| `[directory]` | Project directory. |
| `-o, --output` | Write the analysis to `.next/diagnostics/analyze` instead of serving it. |
| `--port <port>` | Analyzer UI port. Default `4000`. |
| `--profile` | React production profiling. |
| `--no-mangling` | Disable mangling. |

```bash
npx next experimental-analyze --output
cp -r .next/diagnostics/analyze ./analyze-before-refactor
```

See [Bundle analysis](../nextjs-performance/bundle-analysis.md).

## Node.js options

Pass Node.js flags through `NODE_OPTIONS`:

```bash
NODE_OPTIONS='--throw-deprecation' next build
```

For debugging, prefer `next dev --inspect` and `next start --inspect`. For other
commands, the binary tells you to use `NODE_OPTIONS='--inspect'` instead.

## `create-next-app`

```bash
npx create-next-app@latest my-app
```

The recommended defaults are TypeScript, ESLint, Tailwind CSS, the App Router and
`AGENTS.md`. Check the installed `next` version afterwards: it must be at least
**16.3.3**, the security floor, and 16.3.5 is current.

| Flag | Meaning |
|---|---|
| `--ts`, `--typescript` | TypeScript (default). |
| `--js`, `--javascript` | JavaScript. |
| `--tailwind` | Tailwind CSS (default). |
| `--eslint` | ESLint config. |
| `--biome` | Biome config. |
| `--no-linter` | No linter. |
| `--react-compiler` | Enable the React Compiler. |
| `--app` | App Router project. |
| `--api` | A project with only Route Handlers. |
| `--src-dir` | Put code under `src/`. |
| `--turbopack` | Turbopack in the generated scripts (default). |
| `--webpack` | Webpack in the generated scripts. |
| `--import-alias <alias>` | Import alias. Default `@/*`. |
| `--empty` | Empty project. |
| `--agents-md` | Include `AGENTS.md` and `CLAUDE.md` for coding agents (default). |
| `--use-npm`, `--use-pnpm`, `--use-yarn`, `--use-bun` | Package manager. |
| `-e, --example [name] [github-url]` | Start from an official example or a public GitHub repo. |
| `--example-path <path>` | Path inside the example repo. |
| `--skip-install` | Do not install packages. |
| `--disable-git` | Do not initialize git. |
| `--reset-preferences` | Forget stored answers. |
| `--yes` | Use saved preferences or defaults for every prompt. |
| `--no-*` | Negate a default, for example `--no-tailwind`. |

## `@next/codemod`

```bash
npx @next/codemod@canary upgrade latest
```

`upgrade [revision]` accepts `patch`, `minor` (the default), `major`, a dist tag
such as `latest` or `canary`, or a version. It takes `--verbose` and `-y, --yes`;
`--yes` is implied when stdin is not a TTY. Individual transforms run as
`npx @next/codemod <transform> <path>` with `--dry` and `--print`.

| Transform | Version | Does |
|---|---|---|
| `cache-components-instant-false` | 16.3 | Adds `export const instant = false` to pages, layouts and defaults. |
| `remove-partial-prefetch` | 16.3 | Removes `export const prefetch = 'partial'` after enabling `partialPrefetching`. |
| `middleware-to-proxy` | 16.0 | Renames the file, export and config flags. |
| `remove-unstable-prefix` | 16.0 | Drops `unstable_` from stabilized imports. |
| `remove-experimental-ppr` | 16.0 | Removes the `experimental_ppr` segment export. |
| `next-lint-to-eslint-cli` | 16.0 | Replaces `next lint` with the ESLint CLI. |
| `next-async-request-api` | 15.0 | Awaits `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()`. Not run by `upgrade`. |

Pass `./src/app` to the 16.3 transforms in a `src/` project; a wrong path reports
`0 ok` instead of failing. See [Next.js 15 to 16](../nextjs-migration/next-15-to-16.md).

## Common mistakes

- **`npm run dev --port 4000`.** npm swallows the flag. Use `npm run dev -- --port 4000`.
- **Keeping `--turbopack` in `build` scripts** while a plugin adds a `webpack`
  config. The flag makes Turbopack ignore that config silently.
- **Running `tsc --noEmit` in CI without `next typegen`.** `PageProps` and friends
  do not exist yet, so every page fails to type-check.
- **Deploying a `--debug-prerender` build.** It disables minification.
- **Scripting `next lint`.** The command was removed in 16.0.
- **Setting `PORT` in `.env`.** The server binds before `.env` is read.

## Related topics

- [Dev and build](../nextjs-getting-started/dev-and-build.md) — what `next dev`
  and `next build` do, beyond their flags.
- [Installation](../nextjs-getting-started/installation.md) — `create-next-app`
  in context, with the security floor.
- [next.config reference](./next-config.md) — options the CLI flags override.
- [Bundle analysis](../nextjs-performance/bundle-analysis.md) — reading
  `next experimental-analyze` output.
- [Troubleshooting](./troubleshooting.md) — errors these commands commonly print.
