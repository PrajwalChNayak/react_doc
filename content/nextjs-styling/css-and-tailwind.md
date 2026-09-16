---
title: CSS and Tailwind CSS
description: Global CSS, CSS Modules, Tailwind CSS v4, Sass and CSS-in-JS in the App Router, and how Next.js orders stylesheets in production.
group: nextjs-styling
order: 10
status: current
related: [ecosystem/styling, nextjs-styling/fonts, nextjs-styling/images, server-react/directives]
---

## Overview

Next.js compiles CSS for you. There is no loader to configure: you `import` a
stylesheet from a layout, page or component, and the bundler (Turbopack by
default) extracts it into static `.css` files that load with the route.

This page covers what Next.js adds to styling: where global CSS goes, how CSS
Modules and Tailwind CSS v4 are wired in a new app, what Sass needs, why most
CSS-in-JS libraries need extra setup under Server Components, and how import
order decides which rule wins in production. Choosing between the approaches
is a React-level question, answered in [Styling](../ecosystem/styling.md).

This group also covers the other things Next.js puts in front of the user before
any of your JavaScript runs:

- [Images](./images.md): `next/image`, the Image Optimization API and its 16.0
  defaults.
- [Fonts](./fonts.md): `next/font`, self-hosted with no layout shift.
- [Metadata](./metadata.md): the Metadata API, `robots.ts` and `sitemap.ts`.
- [Open Graph images](./open-graph-images.md): `opengraph-image.tsx` and
  `ImageResponse`.

| Approach | File | Works in Server Components | Scope |
|---|---|---|---|
| Global CSS | `app/globals.css`, imported in the root layout | Yes | Whole document |
| CSS Modules | `*.module.css` | Yes | Component |
| Tailwind CSS v4 | `@import "tailwindcss"` in `app/globals.css` | Yes | Utility classes |
| Sass | `*.scss`, `*.module.scss` | Yes | Global or component |
| Runtime CSS-in-JS | a library plus a style registry | No, Client Components only | Component |

## Why it exists

Styles are the part of a page most likely to break because of the *build*
rather than the code. A stylesheet has one global cascade, and the order in
which files land in it decides which rule wins. In a single-page app that order
is roughly the order your entry file imports things.

In the App Router there is no single entry file. Every route has its own
layouts, pages and Server Components, and Next.js code-splits CSS per route so a
page downloads only what it uses. Built-in CSS support exists so that the
framework, which knows the route tree, is the one that decides how CSS is split,
ordered, minified and linked, instead of every app assembling that by hand.

## When to use it

- **Global CSS** for resets, CSS custom properties (design tokens) and Tailwind's
  base import. Things that truly apply to every route.
- **CSS Modules** for component styles written as plain CSS. Class names are
  made unique at build time, so two components can both use `.title`.
- **Tailwind CSS** when you want utilities instead of named classes. It is the
  default in `create-next-app`.
- **Sass** when an existing design system is written in it.

## When not to use it

- **Do not import global CSS from deep inside the tree** to style one component.
  Global rules imported by one route are not removed when the user navigates
  away (see [How it works](#how-it-works)), so they leak into the next route. Use
  a CSS Module.
- **Do not start a new App Router project on runtime CSS-in-JS.** It works only in
  Client Components and needs a registry wired into the root layout. See
  [CSS-in-JS](#css-in-js-and-server-components) below.
- **Do not use `style={{ ... }}` for static styles.** The reasons are React's,
  not Next.js's, and are in [Styling](../ecosystem/styling.md).

## Basic example

A new app created with `npx create-next-app@latest` uses Tailwind CSS v4. The
setup is three files.

Install the packages (`create-next-app` does this for you):

```bash
npm install -D tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3
```

Register the PostCSS plugin. Tailwind v4 runs as a single PostCSS plugin, so
there is no `tailwind.config.js` and no `autoprefixer` to add:

```js file="postcss.config.mjs"
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

Import Tailwind once, in the global stylesheet:

```css file="app/globals.css"
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

/* Expose the tokens as Tailwind utilities: bg-background, text-foreground. */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

Import that stylesheet in the root layout, so every route gets it:

```tsx file="app/layout.tsx"
import './globals.css';

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
```

`LayoutProps<'/'>` is a global type generated by `next dev`, `next build` or
`next typegen`. It needs no import.

Utilities now work in any Server or Client Component:

```tsx file="app/page.tsx"
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Quarterly report</h1>
      <p className="text-foreground/70">Revenue grew in every region.</p>
    </main>
  );
}
```

> [!NOTE]
> Tailwind CSS v4 targets modern browsers. If you must support older ones, the
> Next.js documentation keeps a separate Tailwind CSS v3 setup guide, which uses
> `tailwind.config.js`, `postcss` and `autoprefixer`. Do not mix the two setups
> in one project.

## How it works

### Global CSS

A plain `.css` import is global. Import it in `app/layout.tsx` and it applies to
every route. You *can* import global CSS from any layout, page or component under
`app/`, but Next.js integrates stylesheets through React's own stylesheet support
so that CSS loads before the Suspense boundary that needs it is revealed. A side
effect is that **stylesheets are not removed as you navigate between routes**.
A global rule imported only by `/pricing` stays in the document after the user
moves to `/docs`.

That is why the recommendation is narrow: keep global CSS for resets, tokens and
Tailwind's import, and use CSS Modules or utilities for everything else.

Stylesheets published by packages are imported the same way, from anywhere in
`app/`:

```tsx file="app/dashboard/layout.tsx"
import 'bootstrap/dist/css/bootstrap.css';

export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return <section className="container">{children}</section>;
}
```

### CSS Modules

A file ending in `.module.css` is a CSS Module. Next.js rewrites each class to a
unique name and gives you an object that maps the name you wrote to the one it
generated.

```css file="app/invoices/invoice-card.module.css"
.card {
  display: grid;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 8px;
}

.overdue {
  color: #b91c1c;
}
```

```tsx file="app/invoices/invoice-card.tsx"
import styles from './invoice-card.module.css';

type Invoice = { reference: string; dueInDays: number };

export function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const isOverdue = invoice.dueInDays < 0;

  return (
    <article className={styles.card}>
      <strong>{invoice.reference}</strong>
      <span className={isOverdue ? styles.overdue : undefined}>
        {isOverdue ? `${-invoice.dueInDays} days overdue` : 'On time'}
      </span>
    </article>
  );
}
```

`InvoiceCard` has no `"use client"` directive. CSS Modules are resolved at build
time, so a Server Component can use them and ship no JavaScript for its styles.

### Ordering and merging in production

In a production build, Next.js concatenates, minifies and code-splits CSS into
many `.css` files, so each route loads close to only the CSS it needs. **The
order of your CSS follows the order of your imports.**

```tsx file="app/checkout/page.tsx"
import { BaseButton } from './base-button';
import styles from './checkout.module.css';

export default function CheckoutPage() {
  return <BaseButton className={styles.primary}>Pay now</BaseButton>;
}
```

`BaseButton` is imported first, so its module's CSS (`base-button.module.css`)
comes before `checkout.module.css`. When both set `background` with the same
specificity, the checkout rule wins, which is what you want from a page
customizing a shared component. Swap the two imports and the base button's rule
wins instead.

Three consequences follow:

- An ESLint rule or formatter that **auto-sorts imports can change your cascade**.
  The Next.js docs recommend turning off `sort-imports`-style rules for this
  reason.
- **Development and production can order CSS differently.** `next dev` applies
  CSS updates instantly with Fast Refresh and does not chunk the same way. Check
  the final order with `next build` and `next start`.
- In production, CSS **still loads with JavaScript disabled**. In development it
  needs JavaScript, because Fast Refresh injects it.

> [!WARNING]
> **Experimental.** `experimental.cssChunking` controls how CSS is merged into
> chunks. The default, `true`, merges using import order and works with both
> Turbopack and webpack. `'graph'` is Turbopack-only, and `'strict'` and `false`
> are webpack-only. Leave the default unless you have measured a problem.

## Server and client implications

Every approach that compiles to a static `.css` file works identically in Server
and Client Components: global CSS, CSS Modules, Tailwind, Sass, and zero-runtime
libraries such as vanilla-extract and StyleX.

A library that generates CSS **while components render** needs hooks, context
and a browser runtime, and Server Components have none of those. The React side
of that argument, including why one styled component can pull a whole subtree
across the client boundary, is in [Styling](../ecosystem/styling.md) and
[Directives](../server-react/directives.md).

### CSS-in-JS and Server Components

Next.js lists these libraries as supported **in Client Components**: ant-design,
chakra-ui, `@fluentui/react-components`, kuma-ui, `@mui/material`, `@mui/joy`,
pandacss, styled-jsx, styled-components, stylex, tamagui, tss-react and
vanilla-extract. Emotion support was still in progress when the 16.3.5 docs were
published.

A runtime library needs a **style registry** so that CSS generated during the
server render is written into the HTML before the content that uses it. The
pattern has three parts: a registry that collects rules during a render, the
`useServerInsertedHTML` hook from `next/navigation` to flush them into the
stream, and a Client Component that wraps the app in the root layout.

For styled-components 6, enable the compiler transform:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compiler: {
    styledComponents: true,
  },
};

export default nextConfig;
```

Then create the registry:

```tsx file="lib/styled-components-registry.tsx"
'use client';

import { useState, type ReactNode } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

export default function StyledComponentsRegistry({ children }: { children: ReactNode }) {
  // Create the sheet once per request, not on every render.
  const [sheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = sheet.getStyleElement();
    sheet.instance.clearTag();
    return <>{styles}</>;
  });

  // In the browser, styled-components injects styles itself.
  if (typeof window !== 'undefined') return <>{children}</>;

  return <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>;
}
```

```tsx file="app/layout.tsx"
import StyledComponentsRegistry from '@/lib/styled-components-registry';

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
      </body>
    </html>
  );
}
```

The registry is a Client Component, but `children` can still be Server
Components passed through it. What cannot be a Server Component is any component
that calls `styled(...)` itself. During streaming, styles from each chunk are
appended as it is flushed.

## Common patterns

### Sass

Next.js supports `.scss` and `.sass` files, and `.module.scss` / `.module.sass`
for CSS Modules, once you install the compiler:

```bash
npm install -D sass
```

Options for the Sass compiler go under `sassOptions`. `additionalData` prepends
source to every Sass file, which is how you share variables without importing
them everywhere:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  sassOptions: {
    additionalData: `@use "styles/tokens" as tokens;`,
  },
};

export default nextConfig;
```

To use `sass-embedded` instead of the default `sass` package, set
`sassOptions.implementation` to `'sass-embedded'`.

### Design tokens shared by Tailwind and CSS Modules

Define tokens once as CSS custom properties in `app/globals.css`. Tailwind reads
them through `@theme inline`, and CSS Modules read them with `var()`. A token
change then reaches both without a rebuild of either system.

```css file="app/globals.css"
@import "tailwindcss";

:root {
  --brand: oklch(0.62 0.15 250);
  --border: #e5e5e5;
}

@theme inline {
  --color-brand: var(--brand);
}
```

`bg-brand` works in markup, and `border: 1px solid var(--border)` works in a
CSS Module. The same pattern connects fonts loaded by `next/font` to Tailwind;
see [Fonts](./fonts.md).

### Conditional classes

Build class strings from an array and filter out falsy values rather than
concatenating strings that may contain `undefined`:

```tsx file="components/status-badge.tsx"
import styles from './status-badge.module.css';

export function StatusBadge({ status }: { status: 'paid' | 'overdue' | 'draft' }) {
  const className = [styles.badge, status === 'overdue' && styles.danger]
    .filter(Boolean)
    .join(' ');

  return <span className={className}>{status}</span>;
}
```

## Common mistakes

**Importing global CSS from a page to style that page.** It is not removed on
navigation, so its rules apply to the next route too. Use a CSS Module.

**Letting a tool re-sort CSS imports.** Import order *is* cascade order in
production. An auto-sorter can silently change which rule wins.

**Trusting `next dev` for the final CSS order.** Development does not chunk CSS
the way a production build does. Verify with `next build`.

**Mixing Tailwind v3 instructions into a v4 project.** `@tailwind base;`,
`tailwind.config.js` content globs and `autoprefixer` belong to the v3 setup. In
v4 the whole setup is `@tailwindcss/postcss` plus `@import "tailwindcss"`.

**Forgetting `postcss.config.mjs`.** Without the `@tailwindcss/postcss` plugin,
`@import "tailwindcss"` is not processed and no utilities are generated.

**Calling `styled(...)` in a Server Component.** Runtime CSS-in-JS needs a
Client Component and a registry in the root layout.

**Writing a styled-components registry without `useServerInsertedHTML`.** The
server HTML then arrives unstyled and flashes once the client bundle runs.

## Related topics

- [Styling](../ecosystem/styling.md): choosing between CSS Modules, Tailwind and
  CSS-in-JS, and why runtime CSS-in-JS is in decline.
- [Directives](../server-react/directives.md): how `"use client"` spreads, which
  is the cost of a runtime styling library.
- [Fonts](./fonts.md): load fonts with `next/font` and expose them to Tailwind as
  CSS variables.
- [Images](./images.md): `next/image`, which is styled with `className` or
  `style` like any element.
- [Document metadata](../patterns/document-metadata.md): React 19's `<link
  rel="stylesheet" precedence>`, the mechanism underneath Next.js stylesheet
  loading.
