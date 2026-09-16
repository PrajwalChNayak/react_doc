---
title: Installation
description: Create a Next.js 16.3 app with create-next-app or by hand, on a version above the security floor.
group: nextjs-getting-started
order: 20
status: current
related: [nextjs-getting-started/project-structure, nextjs-getting-started/dev-and-build, nextjs-security/security-advisories, getting-started/installation]
---

## Overview

There are two ways to start a Next.js app: run `create-next-app`, which asks a
few questions and writes a working project, or install `next`, `react` and
`react-dom` yourself and add two files. Both end in the same place.

This page targets **Next.js 16.3**. Pin **`next@16.3.5`**.

> [!WARNING]
> **The minimum safe version is `next@16.3.3`.** The August 2026 security
> release (25 August 2026) fixed two **Critical** remote code execution
> vulnerabilities: one in the Image Optimization API when optimizing an
> attacker-controlled AVIF image, and one on Windows-hosted servers in apps that
> use both routers without Cache Components. Every 16.x release below 16.3.3 is
> affected. Install **16.3.5**, and see
> [Security advisories](../nextjs-security/security-advisories.md) for the full
> list.

## Why it exists

A Next.js project has more moving parts than a React SPA: a framework version,
a vendored React build, a TypeScript plugin, generated route types, and a set of
files whose names are part of the API. `create-next-app` writes a combination
that is known to work together, so your first error is in your own code rather
than in your setup.

## When to use it

- **`create-next-app`** for every new project. Its defaults are the ones the
  Next.js docs assume.
- **Manual installation** when you are adding Next.js to an existing repository
  or a monorepo, or when you want to see exactly which files a Next.js app needs.

## When not to use it

- Do not create a new app to upgrade an old one. Run the upgrade tooling in the
  existing project instead (see Common patterns below).
- Do not use either path if a plain React SPA fits better. The
  [React installation page](../getting-started/installation.md) covers Vite.

## Basic example

### System requirements

| Requirement | Value |
|---|---|
| Node.js | **20.9.0 or later** (the `engines` field of `next`) |
| Operating system | macOS, Windows (including WSL), Linux |
| TypeScript | 5.1 or later |
| Browsers | Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+, with no configuration |

### With `create-next-app`

:::tabs
== npm
```bash
npx create-next-app@latest my-app --yes
cd my-app
npm run dev
```
== pnpm
```bash
pnpm create next-app@latest my-app --yes
cd my-app
pnpm dev
```
== yarn
```bash
yarn create next-app@latest my-app --yes
cd my-app
yarn dev
```
== bun
```bash
bun create next-app@latest my-app --yes
cd my-app
bun dev
```
:::

Open `http://localhost:3000`. `--yes` skips the prompts and uses your saved
preferences or the defaults: **TypeScript, ESLint, Tailwind CSS, the App
Router, Turbopack, the `@/*` import alias, and an `AGENTS.md`** (with a
`CLAUDE.md` that references it). Check the installed version afterward:

```bash
npx next --version
```

If it prints anything below 16.3.3, pin the patched release:

```bash
npm install next@16.3.5
```

### Without `--yes`

Without `--yes`, the CLI asks whether to use the recommended defaults. Choosing
to customize walks you through TypeScript, the linter (ESLint, Biome or none),
the React Compiler, Tailwind CSS, a `src/` directory, the App Router, the import
alias, and `AGENTS.md`.

The same choices are available as flags:

| Flag | Effect |
|---|---|
| `--ts` / `--js` | TypeScript (default) or JavaScript |
| `--tailwind` / `--no-tailwind` | Tailwind CSS on (default) or off |
| `--eslint` / `--biome` / `--no-linter` | Choose the linter |
| `--react-compiler` | Enable the React Compiler |
| `--app` | App Router project |
| `--src-dir` | Put `app/` inside `src/` |
| `--import-alias "@/*"` | Set the import alias |
| `--empty` | Start from an empty project |
| `--api` | A project with only Route Handlers |
| `--webpack` | Use webpack instead of Turbopack in the generated scripts |
| `--no-agents-md` | Skip `AGENTS.md` and `CLAUDE.md` |
| `--use-npm` / `--use-pnpm` / `--use-yarn` / `--use-bun` | Choose the package manager |
| `--skip-install` / `--disable-git` | Skip installing dependencies or initializing git |
| `-e`, `--example` | Start from an official example or a public GitHub repository |

A lean TypeScript app with no Tailwind CSS and no linter:

```bash
npx create-next-app@latest my-app --ts --app --no-tailwind --no-linter --empty
```

## How it works

### Manual installation

Install the three runtime packages and the TypeScript types:

:::tabs
== npm
```bash
npm install next@16.3.5 react@19.2.8 react-dom@19.2.8
npm install --save-dev typescript @types/react@^19.2.0 @types/react-dom@^19.2.0 @types/node@^20
```
== pnpm
```bash
pnpm add next@16.3.5 react@19.2.8 react-dom@19.2.8
pnpm add -D typescript @types/react@^19.2.0 @types/react-dom@^19.2.0 @types/node@^20
```
== yarn
```bash
yarn add next@16.3.5 react@19.2.8 react-dom@19.2.8
yarn add -D typescript @types/react@^19.2.0 @types/react-dom@^19.2.0 @types/node@^20
```
== bun
```bash
bun add next@16.3.5 react@19.2.8 react-dom@19.2.8
bun add -D typescript @types/react@^19.2.0 @types/react-dom@^19.2.0 @types/node@^20
```
:::

Add the scripts. Next.js 16 removed the `next lint` command, so the lint script
calls ESLint directly:

```json file="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  }
}
```

Create the root layout. It is required, and it must render `<html>` and
`<body>`, because Next.js does not generate a document for you:

```tsx file="app/layout.tsx"
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create the home page:

```tsx file="app/page.tsx"
export default function HomePage() {
  return <h1>Hello, Next.js!</h1>;
}
```

Run `npm run dev`. On the first run with a `.tsx` file, Next.js writes a
`tsconfig.json` with its recommended options and generates `next-env.d.ts`.
If you forget the root layout, `next dev` creates one.

> [!NOTE]
> `create-next-app` types the root layout as `LayoutProps<'/'>`, a global type
> Next.js generates from your routes. The explicit `{ children: ReactNode }`
> form above works before any types have been generated. See
> [TypeScript](./typescript.md).

### Why `react` is still in `package.json`

The App Router renders with the **React Canary build vendored inside `next`**
(`19.3.0-canary-cbb046ab-20260731` in 16.3.5), not the `react` package you
installed. You still declare `react` and `react-dom` because tooling, type
definitions and third-party libraries resolve them, and because the legacy
Pages Router does use your installed version. The practical consequence:
**upgrading `next` is what patches React in an App Router app.** See
[React Canary in Next.js](../nextjs-rendering/react-canary.md).

## Common patterns

### Upgrade an existing app

Upgrade with the Next.js CLI, which also updates the documentation bundled in
`node_modules/next/dist/docs/`:

```bash
npx next upgrade
```

Or run the codemod-driven upgrade, which applies the breaking-change codemods as
it goes:

```bash
npx @next/codemod@canary upgrade latest
```

Either way, confirm the result is at least 16.3.3.

### Pin exact versions in CI

A caret range such as `^16.3.0` lets a fresh install resolve 16.3.0, which is
below the security floor. Pin the exact patch and commit the lockfile:

```json file="package.json"
{
  "dependencies": {
    "next": "16.3.5",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  }
}
```

### Start from the minimal example

[The minimal example app](../../examples/nextjs/minimal/README.md) is the
manual installation above plus one dynamic route, with exact commands to run it.

## Common mistakes

- **Staying on an unpatched 16.x.** Anything below 16.3.3 is exposed to the
  August 2026 critical advisories. Pin 16.3.5.
- **Upgrading only `react` to fix a React Server Components advisory.** App
  Router apps use the React bundled in `next`. Upgrade `next`.
- **Running an old Node.js.** Next.js 16 declares Node.js 20.9.0 or later in its
  `engines` field. Check `node --version` before debugging anything else.
- **Adding `--turbopack` to scripts.** Turbopack is already the default for
  `next dev` and `next build`. See [Dev and build](./dev-and-build.md).
- **Expecting `next build` to lint.** Since 16.0 it does not. Run `eslint` (or
  Biome) as its own script.
- **Committing `next-env.d.ts`.** It is generated. Add it to `.gitignore`, as
  `create-next-app` does.

## Related topics

- [Project structure](./project-structure.md) — what each file
  `create-next-app` wrote is for.
- [Dev and build](./dev-and-build.md) — what `next dev`, `next build` and
  `next start` do.
- [Security advisories](../nextjs-security/security-advisories.md) — the
  advisories behind the 16.3.3 floor.
- [React installation](../getting-started/installation.md) — the React 19.2
  setup, including when a framework is the wrong choice.
- [TypeScript setup](../typescript/setup.md) — the React type packages and
  compiler options Next.js builds on.
