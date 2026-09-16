---
title: TypeScript in Next.js
description: next.config.ts, the generated PageProps, LayoutProps and RouteContext globals, typed routes, and TypeScript 7 in next build.
group: nextjs-getting-started
order: 50
status: current
since: "16.3"
related: [typescript/setup, nextjs-routing/typed-routes, nextjs-getting-started/dev-and-build, nextjs-routing/dynamic-segments]
---

## Overview

Next.js has TypeScript built in. `create-next-app` writes a `tsconfig.json`, and
adding a `.ts` or `.tsx` file to an existing project makes `next dev` install
the packages and write one for you. The minimum TypeScript version is **5.1**.

What Next.js adds on top of ordinary TypeScript is **types generated from your
routes**:

| Generated global | Types | Use it in |
|---|---|---|
| `PageProps<'/blog/[slug]'>` | `params` and `searchParams`, both Promises | `page.tsx` |
| `LayoutProps<'/dashboard'>` | `children`, `params`, and any parallel route slots | `layout.tsx` |
| `RouteContext<'/api/posts/[id]'>` | `params` as a Promise | `route.ts` handlers |

They need no import. `next dev`, `next build` and `next typegen` write them into
`.next/types` (or `.next/dev/types`), and `tsconfig.json` includes those
folders.

The React side of TypeScript (`@types/react`, `jsx`, `strict`, typing props and
hooks) is covered in [TypeScript setup](../typescript/setup.md). This page covers
only what Next.js adds.

## Why it exists

In Next.js the URL shape is defined by folder names, and `params` is a Promise.
Hand-writing `{ params: Promise<{ slug: string }> }` for every page duplicates
the folder structure in a type, and the two drift apart the first time someone
renames a folder. Generated types keep them in sync: rename `[slug]` to `[id]`
and every page that still reads `slug` fails to compile.

## When to use it

- Type every page, layout and Route Handler with the generated helpers.
- Write `next.config.ts` instead of `next.config.js` so config typos are compile
  errors.
- Turn on `typedRoutes` once the app has more than a handful of links.

## When not to use it

- Do not use `PageProps` in an ordinary component. It describes a route module's
  props, not arbitrary props. Pass the awaited values down instead.
- Do not hand-write `params` types when a generated helper exists. The
  hand-written form is where a synchronous `{ params: { slug: string } }`
  signature from an old tutorial slips in.

## Basic example

A dynamic page typed from its route literal:

```tsx file="app/blog/[slug]/page.tsx"
import { notFound } from 'next/navigation';

const posts = new Map([
  ['hello-next', { title: 'Hello, Next.js', body: 'Rendered on the server.' }],
]);

export default async function PostPage({ params, searchParams }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params;
  const { ref } = await searchParams;
  const post = posts.get(slug);

  if (!post) {
    notFound();
  }

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
      {typeof ref === 'string' && <p>Referred by {ref}</p>}
    </article>
  );
}
```

`slug` is typed `string`, because the folder is `[slug]`. A catch-all
`[...slug]` would type it as `string[]`. `searchParams` values are
`string | string[] | undefined`, because a query string can repeat a key or
omit it, which is why the example narrows `ref` before rendering it.

## How it works

### `tsconfig.json`

This is what `create-next-app` 16.3.5 writes:

```json file="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

Three entries are Next.js-specific:

- **`plugins: [{ "name": "next" }]`** loads the Next.js TypeScript plugin in your
  editor. It flags invalid route segment config values, misplaced `"use client"`
  directives, and client hooks such as `useState` used in Server Components. In
  VS Code, choose "TypeScript: Select TypeScript Version", then "Use Workspace
  Version" to enable it.
- **`.next/types/**/*.ts` and `.next/dev/types/**/*.ts`** pull in the generated
  route types from `next build` and `next dev` respectively.
- **`next-env.d.ts`** references Next.js's global types (image imports, CSS
  modules). It is regenerated on every run. Do not edit it, and add it to
  `.gitignore`. Put your own declarations in a separate `.d.ts` file listed in
  `include`.

`"noEmit": true` is correct: Next.js compiles TypeScript with its own compiler
(SWC under Turbopack) and uses TypeScript only to check types.

### `next.config.ts`

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
};

export default nextConfig;
```

Annotating with `NextConfig` turns a misspelled or removed option into a
compile error. Module resolution in `next.config.ts` is CommonJS by default. On
Node.js 22.18 and later, Node's native TypeScript support lets the config use
ESM features such as top-level `await`. Use `next.config.mts` for that in a
CommonJS project.

### Layouts and Route Handlers

```tsx file="app/dashboard/layout.tsx"
export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return (
    <div>
      <nav aria-label="Dashboard">Dashboard</nav>
      <section>{children}</section>
    </div>
  );
}
```

If the folder had `app/dashboard/@analytics/`, `LayoutProps<'/dashboard'>` would
also include a typed `analytics` slot.

```ts file="app/api/posts/[id]/route.ts"
import type { NextRequest } from 'next/server';

export async function GET(_request: NextRequest, context: RouteContext<'/api/posts/[id]'>) {
  const { id } = await context.params;
  return Response.json({ id });
}
```

### Typed routes

With `typedRoutes: true`, Next.js generates the set of valid URLs, and TypeScript
checks `href` on `next/link` plus `push`, `replace` and `prefetch` on the App
Router's `useRouter()`. Literal strings and template literals over dynamic
segments are checked. A string built at runtime needs an explicit `as Route`
cast, which marks the one place the compiler cannot help:

```tsx file="app/_components/post-links.tsx"
'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function PostLinks({ slug, section }: { slug: string; section: string }) {
  const router = useRouter();

  return (
    <nav>
      <Link href="/blog">All posts</Link>
      <Link href={`/blog/${slug}`}>This post</Link>
      <button type="button" onClick={() => router.push(('/' + section) as Route)}>
        Open section
      </button>
    </nav>
  );
}
```

`typedRoutes` is a stable top-level option. See
[Typed routes](../nextjs-routing/typed-routes.md) for wrapping `Link` in your own
components.

### Type checking in `next build`

`next build` fails on type errors. In Next.js 16.3 it type-checks by running the
**project-local `tsc` CLI** instead of loading TypeScript's JavaScript API. That
is what makes **TypeScript 7** usable for builds, since TypeScript 7 does not
provide the JavaScript compiler API:

```bash
npm install -D typescript@^7
```

No configuration is needed. Diagnostics are printed as `tsc` prints them,
without Next.js-specific code frames, and the whole project selected by your
`tsconfig.json` is checked, including test files.

> [!WARNING]
> **Experimental.** `experimental.useTypeScriptCli` (default `true`) switches
> back to TypeScript's JavaScript API when set to `false`. With TypeScript 7
> installed, `next build` then exits, because that API does not exist. Leave it
> at the default unless you need the older error formatting on TypeScript 5 or 6.

## Common patterns

### Type-check in CI without building

The generated types must exist before `tsc` runs:

```json file="package.json"
{
  "scripts": {
    "typecheck": "next typegen && tsc --noEmit"
  }
}
```

### A stricter editor, a looser build

`typescript.tsconfigPath` points `next dev`, `next build` and `next typegen` at a
different config, for example one that relaxes a rule for monorepo dependencies
during a migration:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: 'tsconfig.build.json',
  },
};

export default nextConfig;
```

Your editor still reads `tsconfig.json`, so it keeps showing the strict errors.

## Common mistakes

- **Typing `params` as a plain object.** In Next.js 16, `params` and
  `searchParams` are Promises. A synchronous signature fails the build. Use the
  generated helper and `await` it.
- **Using a route literal that does not match the file's location.**
  `PageProps<'/blog/[id]'>` in `app/blog/[slug]/page.tsx` is a type error. The
  literal is the folder path under `app/`, without route groups.
- **Running `tsc --noEmit` before the types exist.** On a fresh clone `PageProps`
  is undefined until `next typegen`, `next dev` or `next build` has run.
- **Editing or committing `next-env.d.ts`.** It is regenerated on every run.
- **Setting `typescript.ignoreBuildErrors: true` to get a deploy out.** It skips
  type checking entirely. If you must, run `tsc` as a separate CI step.
- **Using `experimental.typedRoutes`.** The option is stable and top-level:
  `typedRoutes: true`. The `experimental` form is deprecated.

## Related topics

- [TypeScript setup](../typescript/setup.md) — `@types/react` 19, compiler
  options, and the React type changes Next.js inherits.
- [Typed routes](../nextjs-routing/typed-routes.md) — typed links in depth,
  including generic `Link` wrappers.
- [Dynamic segments](../nextjs-routing/dynamic-segments.md) — how folder names
  become the `params` types shown here.
- [Dev and build](./dev-and-build.md) — `next typegen` and the output
  directories the types are written to.
- [Typing props](../typescript/typing-props.md) — typing the components your
  pages pass awaited values to.
