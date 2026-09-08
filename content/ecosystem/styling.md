---
title: Styling
description: CSS Modules, Tailwind, CSS-in-JS and the style prop, with an honest account of what to pick and why.
group: ecosystem
order: 20
status: current
related: [patterns/document-metadata, ecosystem/build-tooling, server-react/server-components]
---

## Overview

React has no styling system. It gives you two props — `className` and `style` —
and the browser does the rest. Every named approach below is a third-party
project or a plain web platform feature, not part of React.

There are five real options, and they are not equally good:

1. **Plain CSS and CSS Modules** — the platform, with scoping.
2. **Tailwind** — utility classes generated at build time.
3. **Runtime CSS-in-JS** — styled-components, Emotion. In decline, for reasons
   worth understanding.
4. **Zero-runtime CSS-in-JS** — vanilla-extract, Linaria, StyleX. The same
   authoring experience, compiled to a static `.css` file.
5. **The `style` prop** — for values you cannot know until runtime.

The recommendation, stated up front: **use CSS Modules or Tailwind, put your
design tokens in CSS custom properties, and reach for the `style` prop only for
genuinely dynamic values.** If you want typed styles co-located with components,
use a zero-runtime library rather than a runtime one.

## Why it exists

CSS has one global namespace. In a codebase with four hundred components, a
selector written for a card in one feature will eventually restyle a card in
another, and nobody will notice for six weeks.

Every option on this page is an answer to that one problem, and they differ in
where they solve it:

- **CSS Modules** rewrite class names at build time so `.title` becomes
  `Invoice_title__a3f9`.
- **Tailwind** avoids inventing names at all — you compose from a fixed
  vocabulary of utilities.
- **CSS-in-JS** ties the style to the component object itself, so an unused
  component takes its CSS with it when you delete it.

The second problem is **dynamic** styling: a progress bar whose width is 63%, a
chart series colored by data. No static class can express that, which is what
the `style` prop is for.

## When to use it

| Situation | Reach for |
|---|---|
| A component's own layout and appearance | CSS Modules, or Tailwind utilities |
| A design system with tokens shared across apps | CSS custom properties, defined once |
| A value computed at runtime (width, transform, color from data) | The `style` prop |
| Themes, including dark mode | CSS custom properties plus a `data-theme` attribute |
| A third-party widget you must restyle from outside | Plain CSS with a scoped ancestor selector |
| Styles that must ship from a Server Component | Anything that compiles to a static `.css` file |

## When not to use it

**Do not use the `style` prop for static styles.** React sets them on every
element instance instead of once in a stylesheet, they cannot use media queries,
pseudo-classes or `:hover`, and they beat every class in specificity — which is
exactly the fight you do not want later.

**Do not adopt runtime CSS-in-JS in a new application**, especially one using
Server Components. See below.

**Do not build a theme with a React context that passes color strings into
`style` props.** Every consumer re-renders on a theme change, and none of it
works before hydration. CSS custom properties change the whole document with one
attribute flip and no React render at all.

## Basic example

CSS Modules: a normal CSS file whose class names the bundler makes unique. No
runtime, no dependency, supported out of the box by Vite, Next.js and Parcel.

```css
/* InvoiceCard.module.css */
.card {
  display: grid;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
.reference { font-weight: 600; color: var(--color-text); }
.overdue { color: var(--color-danger); }
```

```jsx static="Requires a bundler to compile the CSS Module into scoped class names."
import styles from './InvoiceCard.module.css';

export default function InvoiceCard({ invoice }) {
  const isOverdue = invoice.dueInDays < 0;

  return (
    <article className={styles.card}>
      <span className={styles.reference}>{invoice.reference}</span>
      <span className={isOverdue ? styles.overdue : undefined}>
        {isOverdue ? `${-invoice.dueInDays} days overdue` : 'On time'}
      </span>
      {/* Genuinely dynamic: this number is not knowable at build time. */}
      <div
        role="progressbar"
        aria-valuenow={invoice.percentPaid}
        style={{ width: `${invoice.percentPaid}%`, height: 4 }}
      />
    </article>
  );
}
```

Note the split. Everything expressible as a rule lives in the stylesheet;
`width` lives in the `style` prop because it comes from data. That is the line
to hold.

## How it works

### The `style` prop has React-specific rules

It takes an object, not a string, and React normalizes it in three ways that
catch people out:

- **camelCase property names.** `backgroundColor`, not `background-color`.
- **Numbers get `px` appended** — `width: 100` becomes `width: 100px` — *unless*
  the property is one React knows is unitless. `opacity`, `zIndex`, `lineHeight`,
  `fontWeight`, `order`, `flexGrow`, `zoom` and the SVG opacity properties are on
  that list, so `lineHeight: 1.5` stays `1.5`.
- **Vendor prefixes keep their capitalization**, except `ms`: `WebkitTransform`
  and `MozAppearance` are capitalized, `msFlexGrow` is not.

React's own guidance is to use `style` "only for dynamic styles where you don't
know the style values ahead of time" and `className` otherwise.

```jsx live
import { useState } from 'react';

export default function ScoreMeter() {
  const [score, setScore] = useState(64);

  return (
    <section>
      <label htmlFor="score">Score: {score}</label>{' '}
      <input
        id="score"
        type="range"
        min="0"
        max="100"
        value={score}
        onChange={(event) => setScore(Number(event.target.value))}
      />
      <div
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        // height and marginTop are numbers: React appends "px".
        // width is a string: passed through untouched.
        style={{ height: 12, marginTop: 12, width: '100%', background: '#e2e8f0' }}
      >
        <div
          style={{
            width: `${score}%`,
            height: '100%',
            background: score < 40 ? '#dc2626' : '#0f766e',
            transition: 'width 120ms linear',
            opacity: 0.9, // Unitless: stays 0.9, not "0.9px".
          }}
        />
      </div>
    </section>
  );
}
```

### Why runtime CSS-in-JS is in decline

styled-components and Emotion generate CSS **while the component renders**. The
mechanism is the problem:

1. `styled.div` returns a React component.
2. When it renders, it serializes its props into a CSS string, hashes it into a
   class name, and inserts the rule into a `<style>` element.
3. Insertion happens through React hooks and a React context holding the
   stylesheet registry.

Steps 2 and 3 need hooks, context and a JavaScript runtime in the browser.
**Server Components have none of those.** They run once on the server, never
re-render, cannot call hooks, and ship no JavaScript. So every component built
with `styled` must be marked `"use client"` — and because the directive applies
to everything imported below it, one styled button can drag an entire page's
worth of components across the client boundary. See
[Directives](../server-react/directives.md).

The second cost is per-render work. Serializing props to CSS, hashing, and
inserting rules is real time on every render of every styled element, and it
lands hardest on the long lists where you least want it. It also splits the
critical path: the browser cannot start parsing your CSS until the JavaScript
that produces it has downloaded and run.

> [!WARNING]
> None of this means styled-components is broken or that you must rewrite a
> working application. It means the *architecture* has a ceiling: it cannot
> participate in Server Components, and it makes styles depend on your JS
> bundle. For a new application in 2026, choose something that compiles to a
> `.css` file.

### Zero-runtime alternatives

These keep the authoring experience — styles in TypeScript, co-located with the
component, typed and refactorable — and delete the runtime by extracting CSS at
build time. The output is a static `.css` file and plain class name strings, so
Server Components work.

| Library | Package | Idea |
|---|---|---|
| vanilla-extract | `@vanilla-extract/css` | Write styles in `.css.ts` files; `style()` returns a class name |
| Linaria | `@linaria/core` | Tagged templates that look like styled-components, extracted at build |
| StyleX | `@stylexjs/stylex` | Atomic style objects merged deterministically, from Meta |

The trade-off is that a compile-time system cannot depend on runtime values, so
truly dynamic styling still goes through CSS custom properties or the `style`
prop. That is the same discipline plain CSS asks for.

### Stylesheets rendered from components

React 19 lets a component render `<link rel="stylesheet">` and have React hoist
it into `<head>`, deduplicate it, and order it — as long as you give it a
`precedence`.

```jsx static="Hoisting into <head> is a document-level effect; a sandboxed preview cannot show it."
export default function DataGrid({ rows }) {
  return (
    <>
      {/* React moves this to <head>, even though it is rendered deep in the
          tree. Two components rendering the same href produce one <link>. */}
      <link rel="stylesheet" href="/styles/data-grid.css" precedence="default" />
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}><td>{row.label}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

Three behaviors matter:

- **Hoisting.** The `<link>` goes into `<head>` regardless of where it was
  rendered. `precedence` is what opts you into this — without it React leaves
  the element where it is.
- **Deduplication.** Ten components rendering the same `href` produce one
  `<link>`.
- **Ordering.** React ranks stylesheets by `precedence`, treating values it sees
  first as lower and later ones as higher. That is what makes the cascade
  predictable when the load order is not.

The component **suspends while the stylesheet loads**, so a lazily-loaded
feature cannot flash unstyled before its CSS arrives.

> [!NOTE]
> New in **19.0**. Before React 19 this needed a framework's own `<Head>`
> component or a library like `react-helmet`. See
> [Document metadata](../patterns/document-metadata.md), and use `preinit()` to
> start a stylesheet downloading before the component that needs it renders.

## Common patterns

### Tailwind

Tailwind v4 changed its setup story. There is no PostCSS chain to assemble and
no required `tailwind.config.js`: you add a bundler plugin and one `@import` in
your CSS.

```bash
npm install tailwindcss @tailwindcss/vite
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

```css
/* app.css */
@import "tailwindcss";

/* Design tokens live in CSS now. @theme both defines a custom property
   and generates the matching utilities (bg-brand-500, text-brand-500, …). */
@theme {
  --color-brand-500: oklch(0.62 0.15 250);
  --font-display: "Inter Variable", system-ui, sans-serif;
}
```

Tailwind's real advantage in React is not brevity — it is that you stop naming
things. Most `className="wrapper"` / `className="inner"` churn is naming work
with no payoff. The cost is unreadable class strings on complex elements;
extract a component, not a `@apply` rule, when that happens.

### CSS custom properties as the theming layer

Custom properties are the only theming mechanism that works everywhere: in CSS
Modules, in Tailwind's `@theme`, in vanilla-extract, in the `style` prop, in
third-party components you do not control, and before React has hydrated.

```css
/* tokens.css */
:root {
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --color-border: #e2e8f0;
}

/* 1. Follow the OS by default. */
@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: #0f172a;
    --color-text: #e2e8f0;
    --color-border: #1e293b;
  }
}

/* 2. Let an explicit user choice win, in both directions. */
:root[data-theme='dark'] {
  --color-surface: #0f172a;
  --color-text: #e2e8f0;
  --color-border: #1e293b;
}
:root[data-theme='light'] {
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --color-border: #e2e8f0;
}
```

Three states, not two: `light`, `dark`, and *unset*, which means "follow the
system". A toggle that only flips between light and dark takes away the user's
ability to say "whatever my OS says". Give them all three.

> [!BEST-PRACTICE]
> Set the theme attribute on `document.documentElement`, not on a React-rendered
> wrapper. It has to be applied before first paint — a `<script>` in `<head>`
> that reads the stored preference — or the page flashes the wrong theme while
> your bundle downloads. React state cannot win that race.

### A theme toggle, end to end

```jsx live
import { useState } from 'react';

// In a real app this lives in a stylesheet, not a string.
const tokens = `
  .theme-demo {
    --surface: #ffffff; --text: #0f172a; --border: #cbd5e1; --accent: #0f766e;
  }
  .theme-demo[data-theme='dark'] {
    --surface: #0f172a; --text: #e2e8f0; --border: #334155; --accent: #5eead4;
  }
  .theme-demo .panel {
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-radius: 8px; padding: 16px;
  }
  .theme-demo .panel strong { color: var(--accent); }
`;

export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  return (
    <div className="theme-demo" data-theme={theme}>
      <style>{tokens}</style>
      <div className="panel">
        <p>
          Not one color here is set from JavaScript. Flipping one attribute
          restyles every descendant, including <strong>accented text</strong>.
        </p>
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          Switch to {theme === 'light' ? 'dark' : 'light'}
        </button>
      </div>
    </div>
  );
}
```

### Conditional class names

You do not need a library for this — `clsx` and `classnames` are twenty lines
each. What matters is never building class strings with `+` or a template
literal, which silently produces `"card undefined"` when a value is falsy.
Collect the candidates in an array, then
`.filter(Boolean).join(' ')`.

## Advanced example

### Comparison

| | Plain CSS / Modules | Tailwind | Runtime CSS-in-JS | Zero-runtime CSS-in-JS | `style` prop |
|---|---|---|---|---|---|
| Runtime cost | None | None | Serialize + hash + inject on every render | None | Per-element, per-render object |
| Server Components | Works | Works | No — requires `"use client"` | Works | Works |
| Dynamic theming | CSS custom properties | CSS custom properties via `@theme` | Props into a JS theme object | CSS custom properties | Direct, but no media or pseudo selectors |
| Type safety | None on class names | Editor plugin only | Types on props, not on CSS | Full — styles are typed values | `CSSProperties` |
| Dead code removal | Manual | Automatic — unused utilities are never generated | Automatic — deleting the component deletes the CSS | Automatic | N/A |
| Media queries and `:hover` | Yes | Yes | Yes | Yes | **No** |
| Learning curve | Lowest | Medium — a vocabulary to learn | Low to write, high to debug | Medium | Lowest |
| Best for | Almost everything | Application UI built fast by a team | Existing apps already on it | Design systems that want typed tokens | Runtime values only |

### Opinion, with reasons

- **Default to CSS Modules.** Zero runtime, zero dependency, scoping solved,
  devtools show real CSS, and it behaves identically in a Server Component, a
  Client Component and a test.
- **Choose Tailwind when a team ships a lot of UI.** Its value is consistency by
  construction: nobody invents a new spacing value at 11pm. Accept noisy markup
  and factor components when it gets bad.
- **Choose a zero-runtime library when styles must be typed and shared**, such
  as a design system published as a package.
- **Choose runtime CSS-in-JS only for an app already built on it.** Migrating a
  large one is rarely the best use of a quarter; starting a new one there is a
  decision you will revisit.
- **Do not mix four of these in one codebase.** The failure mode is not
  performance — it is that nobody can predict which rule wins.

## Common mistakes

**Using the `style` prop for static styles.** No pseudo-classes, no media
queries, highest specificity, repeated on every element. Use a class.

**Writing `style={{ fontSize: '16' }}` or `{{ 'background-color': red }}`.** A
unitless string is invalid CSS and is dropped silently; a hyphenated key does
nothing. Pass the number `16` and let React add `px`, and write
`backgroundColor`.

**Building class strings with `+` and template literals.** `` `card ${cls}` ``
where `cls` is `undefined` renders `class="card undefined"`. Filter falsy values.

**Theming through React context.** Every consumer re-renders, nothing applies
before hydration, and third-party components never get the values. Use custom
properties.

**Flashing the wrong theme on load.** If the theme attribute is set by a React
effect, the first paint uses the default. Set it in an inline script in `<head>`.

**A two-state dark mode toggle.** Light and dark with no "system" option means
you have overridden the user's OS preference forever.

**Rendering `<link rel="stylesheet">` without `precedence`.** React leaves it
where it is instead of hoisting, deduplicating and ordering it.

**Reaching for CSS-in-JS to get dynamic styles.** A static class plus one
`style` prop for the value that actually varies does the same job with no
runtime and no client boundary.

## Related topics

- [Document metadata](../patterns/document-metadata.md) — the same React 19
  hoisting behavior for `<title>`, `<meta>` and `<link>`.
- [Server Components](../server-react/server-components.md) — why a styling
  choice is now an architecture choice.
- [Directives](../server-react/directives.md) — how `"use client"` spreads, and
  why a styled button can pull a page across the boundary.
- [Build tooling](./build-tooling.md) — where the CSS plugins are configured.
- [Semantics](../accessibility/semantics.md) — styling a `<div>` to look like a
  button is not the same as using a button.
