---
title: Bundle analysis
description: Find what each route ships to the browser with next experimental-analyze, then shrink it with better client boundaries and lazy loading.
group: nextjs-performance
order: 30
status: current
since: "16.1"
related: [nextjs-performance/turbopack, performance/code-splitting, nextjs-rendering/client-components, server-react/directives]
---

## Overview

In the App Router, only Client Components and what they import ship JavaScript
to the browser. So a large client bundle almost always has one of three causes:
a `"use client"` boundary placed too high, a heavy library used for work that
could run on the server, or a heavy component loaded before anyone needs it.

Next.js 16.1 added a bundle analyzer built on Turbopack's module graph:

```bash
npx next experimental-analyze
```

It opens an interactive treemap of every route's client and server modules and
shows the import chain that pulled each module in.

> [!WARNING]
> **Experimental.** `next experimental-analyze` was added in 16.1 and is still
> experimental in 16.3. Its UI, options and output format can change between
> releases.

## Why it exists

Next.js 16.0 removed the JavaScript bundle-size columns from the `next build`
output. The old webpack-based `@next/bundle-analyzer` plugin does not work with
Turbopack builds: under Turbopack it prints a warning and generates no report.

The new analyzer also answers the question the old treemap could not: *why* is
this module here. It traces imports across the server-to-client boundary and
through dynamic imports, so you can find the one Server Component that passes a
heavy module into a Client Component.

## When to use it

- A route's LCP or INP is poor and field data points at script cost.
- A dependency upgrade or a new feature noticeably grew the client JavaScript.
- Before and after moving a `"use client"` boundary or adding `next/dynamic`, to
  prove the change moved bytes.
- Server cold starts are slow and you suspect a large server bundle.

## When not to use it

Do not use it as a first step when the problem is on the server. A slow TTFB is a
data or rendering problem. See [Performance in Next.js](./overview.md).

Do not chase small modules. Splitting a few kilobytes into its own chunk adds a
request and a loading state, and can make the route feel slower.

## Basic example

Run the analyzer from the project root:

```bash
npx next experimental-analyze
```

It analyzes the app with Turbopack, does **not** produce a deployable build, and
serves the UI on port 4000 by default. In the UI you can:

- filter by route, by environment (client or server) and by type (JavaScript,
  CSS, JSON), or search for a file;
- click a module to see its size and its full import chain.

To save the result instead of serving it, for sharing or for a before/after
comparison:

```bash
npx next experimental-analyze --output
cp -r .next/diagnostics/analyze ./analyze-before-refactor
```

| Option | What it does |
|---|---|
| `[directory]` | Analyze an app in another directory |
| `-o`, `--output` | Write static files to `.next/diagnostics/analyze` without starting the server |
| `--port <port>` | Serve the UI on another port (default 4000) |
| `--profile` | Enable React production profiling |
| `--no-mangling` | Disable name mangling, for debugging |

> [!NOTE]
> Still on webpack? `@next/bundle-analyzer` (16.3.5) remains a webpack plugin.
> Wrap your config with it and run `next build --webpack`, because under
> Turbopack it skips the report.

## How it works

### Read the client view per route

Switch to the client environment and select one route. Large rectangles are
large modules. For each one, open the import chain and find the first file in
your own code. That file is where the fix goes.

### Move the `"use client"` boundary down

`"use client"` marks an entry point into the client bundle: the file and
everything it imports become client code. A directive at the top of a layout or a
page puts the whole subtree in the bundle.

Keep the page a Server Component and move the directive to the smallest
interactive piece:

```tsx file="app/articles/[slug]/like-button.tsx"
'use client';

import { useState } from 'react';

export function LikeButton({ initialLikes }: { initialLikes: number }) {
  const [likes, setLikes] = useState(initialLikes);
  return <button onClick={() => setLikes(likes + 1)}>Like ({likes})</button>;
}
```

```tsx file="app/articles/[slug]/page.tsx"
import { getArticle } from '@/lib/articles';
import { LikeButton } from './like-button';

export default async function ArticlePage({ params }: PageProps<'/articles/[slug]'>) {
  const { slug } = await params;
  const article = await getArticle(slug);

  return (
    <article>
      <h1>{article.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: article.html }} />
      <LikeButton initialLikes={article.likes} />
    </article>
  );
}
```

The article body renders on the server. Only `LikeButton` and `useState` reach
the browser. See [Client Components](../nextjs-rendering/client-components.md)
for the Next.js rules and [Directives](../server-react/directives.md) for the
React model.

### Run data-to-UI libraries on the server

Syntax highlighters, Markdown parsers, date and chart formatting libraries turn
data into markup. If the result needs no browser API or interaction, do the work
in a Server Component and ship only the HTML:

```tsx file="app/docs/[slug]/code-sample.tsx"
import { codeToHtml } from 'shiki';

export async function CodeSample({ code, lang }: { code: string; lang: string }) {
  // Shiki runs on the server and never enters the client bundle.
  const html = await codeToHtml(code, { lang, theme: 'github-dark' });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

`dangerouslySetInnerHTML` is only safe with HTML you trust. Keep the input to
content you control, such as your own documentation.

## Common patterns

### Lazy load heavy Client Components with `next/dynamic`

`next/dynamic` combines `React.lazy` and Suspense. Use it for heavy components
that are not needed on first paint: a chart behind a tab, an editor in a modal.

```tsx file="app/dashboard/revenue-panel.tsx"
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const RevenueChart = dynamic(() => import('./revenue-chart'), {
  ssr: false,
  loading: () => <p>Loading chart…</p>,
});

export function RevenuePanel() {
  const [showChart, setShowChart] = useState(false);

  return (
    <section>
      <button onClick={() => setShowChart(true)}>Show revenue chart</button>
      {showChart && <RevenueChart />}
    </section>
  );
}
```

The chart's code downloads only when `showChart` becomes true. Two rules decide
whether this works:

- **Call `dynamic()` from a Client Component.** When a Server Component
  dynamically imports a Client Component, Next.js does not currently split it
  into a separate chunk.
- **`ssr: false` is only allowed in Client Components.** In a Server Component it
  is an error.

The React side (why `lazy` must be at module scope, where Suspense boundaries go)
is in [Code splitting](../performance/code-splitting.md).

### Load a library on interaction

For a library used only inside an event handler, import it there:

```tsx file="app/team/member-search.tsx"
'use client';

import { useState } from 'react';

const members = ['Ana Lima', 'Dev Patel', 'Mei Chen', 'Sam Okafor'];

export function MemberSearch() {
  const [results, setResults] = useState<string[]>(members);

  return (
    <div>
      <input
        type="search"
        aria-label="Search members"
        onChange={async (event) => {
          const query = event.currentTarget.value;
          // fuse.js downloads the first time someone types.
          const { default: Fuse } = await import('fuse.js');
          const fuse = new Fuse(members);
          setResults(query ? fuse.search(query).map((result: { item: string }) => result.item) : members);
        }}
      />
      <ul>
        {results.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Barrel files and icon libraries

A package that re-exports hundreds of modules from one entry point can bloat
bundles and slow compiles. Turbopack analyzes these imports and optimizes them
automatically. Under webpack, list such packages in
`experimental.optimizePackageImports`. Common libraries such as `lucide-react`,
`date-fns`, `lodash-es` and `@mui/icons-material` are already optimized by
default.

> [!WARNING]
> **Experimental.** `experimental.optimizePackageImports` is an experimental
> config key. With the default Turbopack bundler you do not need it.

### Keep server-only dependencies out of the server bundle

Packages imported by Server Components and Route Handlers are bundled by default.
A dependency that relies on Node.js-specific behavior, such as native addons, can
be left to native `require` with the stable `serverExternalPackages` option:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@acme/pdf-renderer'],
};

export default nextConfig;
```

This changes the server bundle only. It does nothing for client bundle size.
Next.js already externalizes a list of common packages, including `sharp`,
`@prisma/client`, `pg` and `bcrypt`. Since 16.1, Turbopack also externalizes
their transitive dependencies correctly.

## Common mistakes

- **Putting `"use client"` in `layout.tsx` for one interactive widget.** Every
  component the layout imports becomes client code. Extract the widget.
- **Wrapping a Client Component with `next/dynamic` inside a Server Component**
  and expecting a separate chunk. Do the dynamic import in a Client Component.
- **Using `ssr: false` to hide a hydration mismatch.** It skips server HTML for
  that component, which delays its content and can hurt LCP. Fix the mismatch.
- **Adding `@next/bundle-analyzer` to a Turbopack app.** It produces no report
  under Turbopack. Use `next experimental-analyze`.
- **Reading `serverExternalPackages` as a client-size fix.** It only affects how
  server code loads the package.
- **Splitting everything.** Many tiny chunks add requests and loading states.
  Split what is large and not needed for first paint.

## Related topics

- [Code splitting](../performance/code-splitting.md) — `lazy`, Suspense and
  where to split, the React model behind `next/dynamic`.
- [Client Components](../nextjs-rendering/client-components.md) — the Next.js
  rules for placing the client boundary.
- [Directives](../server-react/directives.md) — what `"use client"` means as a
  React module boundary.
- [Turbopack](./turbopack.md) — the bundler the analyzer is built on.
- [Core Web Vitals](./core-web-vitals.md) — confirm that fewer bytes moved LCP
  and INP for real users.
