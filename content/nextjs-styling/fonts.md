---
title: Fonts
description: Load Google Fonts and local font files with next/font, self-hosted at build time, with metric-adjusted fallbacks that prevent layout shift.
group: nextjs-styling
order: 30
status: current
related: [nextjs-styling/css-and-tailwind, nextjs-styling/images, nextjs-performance/images-and-fonts, patterns/document-metadata]
---

## Overview

`next/font` loads web fonts for you. You call a font function once, and it gives
you a class name, a style object and optionally a CSS variable. At build time
Next.js downloads the font files, serves them from your own domain with the rest
of your static assets, writes the `@font-face` rules, and generates a fallback
font adjusted to the web font's metrics.

There are two entry points:

| Import | For | Key option |
|---|---|---|
| `next/font/google` | Any Google Font, one named export per family (`Inter`, `Roboto_Mono`, `Geist`) | `subsets` |
| `next/font/local` | Font files in your repository | `src` |

## Why it exists

Web fonts cause two visible problems. The first is **layout shift**: text renders
in a fallback font, the web font arrives with different metrics, and every line
reflows. The second is **a slow, third-party request**: a `<link>` to
`fonts.googleapis.com` means a DNS lookup, a connection, a CSS file, and then the
font files, all from another origin, and the visitor's browser tells Google which
page they are on.

`next/font` addresses both at build time. Self-hosting removes the extra origin,
so **no request goes to Google from the browser**. The generated fallback font
is adjusted to the web font's metrics, so text occupies nearly the same space
before and after the swap, and Cumulative Layout Shift stays low.

## When to use it

- Every web font in an App Router app, Google or custom.
- Brand fonts delivered as `.woff2` files, through `next/font/local`.
- Fonts you want to reference from Tailwind CSS or CSS Modules, through the
  `variable` option.

## When not to use it

- **System font stacks.** `font-family: system-ui, sans-serif` downloads nothing.
  If that is your design, there is nothing for `next/font` to do.
- **Icon fonts with thousands of glyphs.** Subsetting and preloading are designed
  for text. Prefer SVG icons.
- **As a way to load five families "just in case".** Every family is a download.
  The Next.js docs recommend using multiple fonts conservatively.

## Basic example

This is what `create-next-app` generates: two variable Google Fonts, exposed as
CSS variables on `<html>`.

```tsx file="app/layout.tsx"
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Acme Dashboard',
  description: 'Orders, inventory and payouts in one place.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
```

`Geist` and `Geist_Mono` are variable fonts, so no `weight` is needed: every
weight is in one file. Family names with spaces use underscores in the import
(`Geist Mono` becomes `Geist_Mono`).

Then point Tailwind's font tokens at the variables, so `font-sans` and
`font-mono` use them:

```css file="app/globals.css"
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

Without Tailwind, apply a font directly with its class name:
`<html className={geistSans.className}>`.

## How it works

### Build time, not request time

When you run `next build`, each font function call becomes:

1. Font files downloaded (Google) or copied (local) into the build output, served
   from your origin.
2. An `@font-face` rule, with `font-display: swap` unless you change `display`.
3. A fallback `@font-face` whose metrics are adjusted to match, controlled by
   `adjustFontFallback`.
4. A generated class name and, if you set `variable`, a class that declares the
   CSS custom property.
5. A `<link rel="preload">` for the font files, on the routes that use the font.

**Each call hosts one instance of the font.** Calling `Inter()` in five files
creates five instances. Define each font once and import the object where you
need it.

### Three ways to apply a font

The object a font function returns has three things you can use:

| Property | Use it for |
|---|---|
| `className` | Apply the font to an element and its descendants |
| `style` | An inline style object, including `style.fontFamily` with the fallbacks |
| `variable` | A class that defines the CSS variable you named, for use in stylesheets |

`variable` is the most flexible, because CSS decides where the font applies. Put
the variable classes on `<html>` or `<body>`, then reference `var(--font-...)`
anywhere.

### Preloading follows the file that calls the font

A font is preloaded only on routes where it is used, based on where you call or
import it:

| Font used in | Preloaded on |
|---|---|
| The root layout | Every route |
| A nested layout | Every route under that layout |
| A page | That page's route only |

This is why a display font used on one marketing page belongs in that page, not
the root layout: other routes would otherwise preload a file they never use.

### Subsets

Google Fonts are automatically subset. `subsets` names the subsets to
**preload**, such as `['latin']`. Leaving `subsets` out while `preload` is `true`
(the default) produces a warning, because Next.js cannot tell which files to
preload. `subsets` applies to `next/font/google` only.

## Server and client implications

The font function runs at build time, and its output is plain class names and CSS.
The returned object works the same in Server and Client Components. Keep font
definitions in a shared module and import them from either kind of component.

## Common patterns

### A non-variable Google Font

A static font has one file per weight and style, so you must list the ones you
use:

```ts file="app/fonts.ts"
import { Roboto, Roboto_Mono } from 'next/font/google';

export const roboto = Roboto({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
});

export const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
});
```

Every weight and style you list is another file. Prefer a variable font when the
family offers one. For variable Google Fonts, `axes` adds axes beyond weight,
for example `axes: ['slnt']` for Inter's slant.

### A local brand font

`src` is resolved relative to the file that calls `localFont`. A single variable
file with a weight range:

```ts file="app/fonts.ts"
import localFont from 'next/font/local';

export const brandSans = localFont({
  src: './fonts/brand-sans-variable.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-brand-sans',
});
```

A family shipped as separate static files takes an array:

```ts file="app/fonts.ts"
import localFont from 'next/font/local';

export const brandSerif = localFont({
  src: [
    { path: './fonts/brand-serif-regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/brand-serif-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/brand-serif-bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-brand-serif',
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: 'Times New Roman',
});
```

For `next/font/local`, `adjustFontFallback` is `'Arial'` (the default),
`'Times New Roman'`, or `false`. Choose the one closest in shape to your font, so
the metric adjustment has less to correct. `declarations` adds extra `@font-face`
descriptors, such as `{ prop: 'ascent-override', value: '90%' }`.

### A font for one route

Import the definition in the page that needs it, so only that route preloads it:

```tsx file="app/launch/page.tsx"
import { Playfair_Display } from 'next/font/google';

const display = Playfair_Display({ subsets: ['latin'] });

export default function LaunchPage() {
  return (
    <main>
      <h1 className={display.className}>Introducing Acme Payouts</h1>
      <p>Same-day settlement in 40 countries.</p>
    </main>
  );
}
```

### Fonts in CSS Modules

With `variable` set on a parent element, a CSS Module can pick the font and add
its own weight and style:

```css file="app/components/pull-quote.module.css"
.quote {
  font-family: var(--font-brand-serif);
  font-style: italic;
  font-weight: 400;
}
```

The variable class has to be on an ancestor, typically `<html>` in the root
layout, or `var(--font-brand-serif)` resolves to nothing.

### Opting a font out of preloading

`preload: false` keeps a font available without a `<link rel="preload">`. Use it
for a font that appears only below the fold or after an interaction, where an
early download competes with the LCP image for bandwidth.

## Common mistakes

**Calling the same font function in several files.** Each call creates another
hosted instance. Define fonts once in a module such as `app/fonts.ts` and import
the objects.

**Forgetting `subsets` on a Google Font.** Next.js warns, because with
`preload` on it cannot know which subset files to preload.

**Omitting `weight` for a non-variable font.** Static families need the weights
listed. Variable fonts do not.

**Using `Roboto Mono` as the import name.** Multi-word families use underscores:
`Roboto_Mono`.

**Setting `variable` but never applying `font.variable`.** The custom property is
declared by that class. Without it on an ancestor, `var(--font-...)` is empty and
the browser's default font appears.

**Keeping a `<link>` to `fonts.googleapis.com` as well.** The page then downloads
the family twice, once from Google, and loses the privacy benefit.

**Loading every font in the root layout.** A font used on one page is then
preloaded on every route.

**Pointing Tailwind at the family name instead of the variable.** In
`@theme inline`, reference `var(--font-geist-sans)`, not `"Geist"`. The variable
carries the self-hosted family and its adjusted fallback.

## Related topics

- [CSS and Tailwind CSS](./css-and-tailwind.md): the global stylesheet and
  `@theme inline` block the font variables plug into.
- [Images](./images.md): the other main source of layout shift that Next.js
  handles.
- [Images and fonts performance](../nextjs-performance/images-and-fonts.md):
  measuring what fonts cost in LCP and CLS.
- [Document metadata](../patterns/document-metadata.md): React's `preload()`
  resource hints, which `next/font` emits for you.
- [Styling](../ecosystem/styling.md): design tokens as CSS custom properties, the
  same idea `variable` builds on.
