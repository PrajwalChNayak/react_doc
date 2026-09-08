---
title: Build tooling
description: Vite, the frameworks, TypeScript, ESLint, the React Compiler, and a production build checklist.
group: ecosystem
order: 50
status: current
related: [performance/react-compiler, getting-started/installation, server-react/overview]
---

## Overview

React is a library. It has no build system, no dev server, no bundler and no
opinion about your `tsconfig.json`. Everything on this page is a third-party
project.

There are two shapes a React application comes in, and picking between them is
the first real decision:

- **A single-page app built by Vite.** You own an `index.html` and a client
  bundle. Deploy it to any static host. No Server Components.
- **A framework.** Next.js, React Router in framework mode, TanStack Start, or
  Expo for native. The framework owns routing, the build, and — if it supports
  them — Server Components.

**Vite is the default for the first.** If you are not sure which shape you want
and you are not building something server-rendered, start with Vite; moving to a
framework later is a real migration but a possible one.

## Why it exists

Browsers load ES modules, but they do not understand JSX, they do not resolve
`import { useState } from 'react'` to a file on disk, and they will not
hot-reload your component while preserving its state.

A build tool exists to do four things:

1. **Transform** JSX and TypeScript into JavaScript the browser runs.
2. **Resolve** bare module specifiers to files in `node_modules`.
3. **Serve** a dev server with fast, state-preserving hot module replacement.
4. **Bundle** for production: split code, hash filenames, minify, tree-shake.

Vite splits those in two. In development it serves your source over native ESM
and transforms each file on demand, so startup does not scale with project size.
For production it bundles, because hundreds of unbundled requests over a network
is a different problem than over localhost.

## When to use it

**Use Vite** when you are building a client-rendered application: an internal
dashboard, an admin panel, an editor, an app behind a login, anything deployed
as static files to a CDN.

**Use a framework** when you need server rendering, streaming, Server
Components, SEO on public pages, or file-based routing with data loading built
in.

**Use Expo** when the target is iOS and Android.

## When not to use it

**Do not configure a bundler by hand.** Webpack, Rollup and esbuild are all
excellent and all wrong to configure yourself in 2026. The reason to reach for a
raw bundler is a constraint — an existing monolith, a strange deployment target
— not a preference.

**Do not add a framework to get one feature.** Adopting Next.js to render one
marketing page server-side is a large commitment for a small win. Prerender the
page instead.

**Do not start a new project on Create React App.** See the callout below.

## Basic example

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
npm run dev
```

`--template react` gives the JavaScript version. Vite 8 requires Node.js 20.19+
or 22.12+.

The generated `vite.config.ts` is three lines, and the React plugin is the only
React-specific piece:

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

There are two React plugins and the difference is the transform:

| Plugin | Transform | Choose it when |
|---|---|---|
| `@vitejs/plugin-react` | Babel | You need Babel plugins — including the React Compiler |
| `@vitejs/plugin-react-swc` | SWC (Rust) | You want the fastest dev transform and no Babel plugins |

Start with `@vitejs/plugin-react`. Its Babel step is what the React Compiler
hooks into, and you will want the compiler.

Pin React to a patched version:

:::tabs
== npm
```bash
npm install react@19.2.8 react-dom@19.2.8
```
== pnpm
```bash
pnpm add react@19.2.8 react-dom@19.2.8
```
== yarn
```bash
yarn add react@19.2.8 react-dom@19.2.8
```
:::

> [!WARNING]
> Anything below **19.2.4** (or 19.0.4 / 19.1.5 on those lines) is missing fixes
> for the Server Components advisories, including a CVSS 10.0 remote code
> execution. Apps that never render React on a server with an RSC-capable
> bundler are not affected, but there is no reason to sit below the floor.

## How it works

### The frameworks

| | Next.js | React Router (framework mode) | TanStack Start | Expo |
|---|---|---|---|---|
| Create | `npx create-next-app@latest` | `npx create-react-router@latest` | via the TanStack Start docs | `npx create-expo-app@latest` |
| Routing | File system (App Router) | File conventions over React Router | TanStack Router, type-safe | Expo Router, file based |
| Build | Turbopack / SWC | Vite | Vite | Metro |
| **Server Components** | **Yes** — full implementation | **Experimental**, explicitly subject to breaking changes in minor and patch releases | Not part of the current model | Not part of the current model |
| Server functions | Yes | Yes (actions) | Yes (`createServerFn`) | Via API routes |
| Static export | Yes | Yes (SPA / prerender modes) | Yes | Web export |
| Target | Web | Web | Web | iOS, Android, web |
| Maturity | Stable, largest ecosystem | Stable | Release candidate | Stable |

If Server Components are the reason you are choosing a framework, that table has
one row that matters. **Next.js is the only one of the four with a stable RSC
implementation today.** React Router ships RSC support but labels it
experimental and warns that it can break in a patch release — fine for a
prototype, not for a product you have to keep running.

> [!LEGACY]
> **Create React App is deprecated.** react.dev announced its sunset in February
> 2025, and `create-react-app` now prints a deprecation warning telling you to
> pick a framework instead. It does not receive updates and does not support
> React 19's server features.
>
> Migrating an existing CRA app has two paths, and react.dev links a guide for
> each:
>
> - **To a framework**, if you want SSR or Server Components: Next.js, React
>   Router, or Expo.
> - **To a build tool**, if you want to stay a client-rendered SPA: Vite,
>   Parcel, or Rsbuild.
>
> The Vite path is the smallest move for most CRA apps. Roughly: replace
> `react-scripts` with `vite` and `@vitejs/plugin-react`, move `public/index.html`
> to the project root and add `<script type="module" src="/src/index.jsx">`,
> rename any file containing JSX to `.jsx` or `.tsx`, and rename `REACT_APP_*`
> environment variables to `VITE_*` read through `import.meta.env`.

### Wiring the React Compiler

The React Compiler (v1.0, released 7 October 2025) memoizes your components at
build time. It is a Babel plugin, which is why the Babel-based Vite plugin is
the better default.

```bash
npm install -D babel-plugin-react-compiler@latest
```

:::tabs
== Vite
```js
// vite.config.js
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
});
```
== Next.js
```js
// next.config.js — Next.js runs the compiler through its own SWC pipeline,
// applying it only to files that contain JSX or hooks.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
};

module.exports = nextConfig;
```
== Babel
```js
// babel.config.js
module.exports = {
  plugins: [
    'babel-plugin-react-compiler', // must run first!
    // ... other plugins
  ],
};
```
:::

The Vite wiring needs `@rolldown/plugin-babel` alongside the React plugin. Next
still needs `babel-plugin-react-compiler` installed even though it drives the
compiler from its own config.

> [!WARNING]
> Compiler tooling is still moving. Check
> [react.dev/learn/react-compiler/installation](https://react.dev/learn/react-compiler/installation)
> before copying a config from anywhere, this page included.

Turn on the `eslint-plugin-react-hooks` rules **before** the compiler. They
report the same violations with none of the build changes, and every one you fix
is a component the compiler can then optimize. See
[React Compiler](../performance/react-compiler.md) for which config to enable
and how to adopt it incrementally.

### TypeScript

Vite's `react-ts` template writes a working config. Two settings do the React
work, and one is a mistake people make when hand-rolling it:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

- `"jsx": "react-jsx"` uses the automatic runtime, so files with JSX do not need
  `import React from 'react'`. `"react"` is the pre-17 transform; do not use it.
- `"noEmit": true` because Vite does the transpiling. `tsc` is a type checker
  here, not a compiler — run `tsc --noEmit` in CI, since the dev server strips
  types without checking them.
- `"strict": true` from day one. Turning it on later in a large codebase is a
  project.
- `"moduleResolution": "bundler"` matches how Vite actually resolves imports,
  including `exports` maps.

Type your React version deliberately: `@types/react` and `@types/react-dom`
track the React major, and mixing React 19 with React 18 types produces
error messages that make no sense. See [TypeScript setup](../typescript/setup.md).

### ESLint flat config and Prettier

ESLint's flat config (`eslint.config.js`) is the format now. It is a plain array
of config objects, evaluated in order, with no `extends` chain to reason about.

```js
// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
    },
  },
);
```

The two rules that catch real bugs are `react-hooks/rules-of-hooks` and
`react-hooks/exhaustive-deps`. Do not disable `exhaustive-deps` to silence a
warning — the warning is almost always correct, and the fix is usually
[`useEffectEvent`](../hooks/use-effect-event.md) or deleting the Effect.

Prettier handles formatting; ESLint handles correctness. Keep them separate,
turn off ESLint's stylistic rules, and run Prettier in a pre-commit hook rather
than arguing about it in review.

### Environment variables

Vite exposes **only** variables prefixed `VITE_`, and reads them through
`import.meta.env` rather than `process.env` — there is no `process` in a
browser.

```bash
# .env.local — git-ignored
VITE_API_URL=https://api.example.com
VITE_SENTRY_DSN=https://public@sentry.example.com/1
```

```js
const apiUrl = import.meta.env.VITE_API_URL;

// Built in, always available:
import.meta.env.MODE;     // 'development' | 'production' | a custom mode
import.meta.env.PROD;     // boolean
import.meta.env.DEV;      // boolean
import.meta.env.BASE_URL; // the configured base path
import.meta.env.SSR;      // true when running on the server
```

Vite loads `.env`, `.env.local`, `.env.[mode]` and `.env.[mode].local`, with the
mode-specific files taking priority. The `.local` variants are git-ignored.

> [!WARNING]
> `VITE_*` values are **inlined into your bundle at build time**. Vite's own
> documentation says they should not contain sensitive information such as API
> keys. Anything secret belongs on a server or an edge function, never in a
> client build — the prefix is a guard against leaking by accident, not a
> security boundary.

Frameworks differ: Next.js uses `NEXT_PUBLIC_` for client-exposed variables and
leaves everything else server-only. The principle is identical.

### Source maps

Vite's `build.sourcemap` defaults to `false`. Turn it on so production stack
traces are readable:

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // true      -> emit .map files next to the bundle
    // 'hidden'  -> emit maps but no //# sourceMappingURL comment
    // 'inline'  -> embed as a data URI (large; avoid in production)
    sourcemap: 'hidden',
  },
});
```

`'hidden'` is usually right: your error tracker uploads the maps and resolves
traces, but browsers do not fetch them and casual visitors do not get your
source. Upload maps as part of the deploy and keep them out of the public
bundle.

## Common patterns

### Production build checklist

Run through this before the first real deploy, not after the first incident.

- **React is at 19.2.4 or above.** Pin 19.2.8. Check `react` and `react-dom`
  match exactly — a mismatched pair fails in confusing ways.
- **`tsc --noEmit` runs in CI.** The dev server does not type-check.
- **ESLint runs in CI**, with the React Hooks rules on and no blanket
  `eslint-disable` at the top of files.
- **Source maps are generated and uploaded** to your error tracker, and set to
  `'hidden'` if you do not want them public.
- **The bundle is inspected once.** A visualizer will find the 400 kB date
  library you imported for one function.
- **Routes are code-split.** See
  [Code splitting](../performance/code-splitting.md).
- **No secrets in `VITE_*` or `NEXT_PUBLIC_*`.** Grep the built output for one
  known token as a test.
- **StrictMode is on in development.** It double-invokes renders and Effects to
  surface impure code before your users do. See
  [StrictMode](../core-concepts/strict-mode.md).
- **The React Compiler is enabled**, or you have a specific reason it is not.
- **Assets are hashed and served with long cache headers**, and `index.html` is
  not cached.
- **Client-side routing has a server rewrite.** A static host must serve
  `index.html` for unknown paths or every deep link 404s on refresh.
- **An error boundary wraps the app**, with `onUncaughtError` and
  `onRecoverableError` reporting to your tracker. See
  [Error boundaries](../patterns/error-boundaries.md).

### Keep the toolchain boring

Every plugin you add is something that can break on the next major. A React
project needs a framework or Vite, the React plugin, TypeScript, ESLint and
Prettier. Justify anything beyond that individually.

### Upgrade React with the codemods

The migration recipe handles most of what React 19 removed:

```bash
npx codemod@latest react/19/migration-recipe
```

```bash
npx types-react-codemod@latest preset-19 ./path-to-app
```

See [React 18 to 19](../migration/react-18-to-19.md).

## Advanced example

A `package.json` scripts block that makes the checklist enforceable rather than
aspirational:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "ci": "npm run lint && npm run format:check && npm run build && npm test"
  }
}
```

Two decisions are encoded here. `build` type-checks first, so a type error fails
the build rather than shipping. And `ci` is a single command a developer can run
locally and get exactly what the pipeline runs — the cheapest way to stop "it
passes on my machine".

## Common mistakes

**Starting a new project on Create React App.** It is deprecated, unmaintained,
and does not support React 19's server features.

**Assuming Vite type-checks.** It strips types with esbuild and never reads your
`tsconfig` for errors. Without `tsc --noEmit` in CI, type errors ship.

**Putting secrets in `VITE_*` variables.** They are inlined into the bundle.
Anyone can read them with view-source.

**Using `process.env` in browser code under Vite.** There is no `process`. It is
`import.meta.env`.

**Shipping without source maps.** Every production error becomes a stack trace
through minified names, and you will spend an afternoon reconstructing one bug
you could have read directly.

**Deploying an SPA without a rewrite rule.** The app works until someone
refreshes on `/invoices/42`, which the static host has never heard of.

**Mixing `@types/react` majors.** React 19 with React 18 types produces type
errors that describe nothing real.

**Disabling `react-hooks/exhaustive-deps` project-wide.** The rule is right far
more often than it is wrong, and switching it off hides the stale-closure bugs
it exists to find.

**Adding Babel plugins to `@vitejs/plugin-react-swc`.** It does not run Babel.
Use the Babel-based plugin if you need one — including for the React Compiler.

**Hand-writing a Webpack config for a greenfield app.** You will spend a week
rebuilding what `npm create vite` gives you in ten seconds, and you will own it
forever.

## Related topics

- [React Compiler](../performance/react-compiler.md) — what the build-time
  optimizer does, and how to adopt it without a big-bang switch.
- [Installation](../getting-started/installation.md) — getting React itself into
  a project, and the version floor.
- [Server React overview](../server-react/overview.md) — what a framework buys
  you that a bundler cannot.
- [TypeScript setup](../typescript/setup.md) — the compiler options React
  projects actually depend on.
- [Code splitting](../performance/code-splitting.md) — turning one bundle into
  several at the right boundaries.
- [React 18 to 19](../migration/react-18-to-19.md) — the codemods and the
  removals to expect on the way up.
