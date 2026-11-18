# Contributing / Authoring Guide

This repository is a hand-built static documentation site for **React 19**,
with a separate **Next.js 16.3** area layered on top. Content is Markdown in
`content/`. `node scripts/build.mjs` generates `docs/`, which GitHub Pages
serves directly.

**Read this file in full before writing any content.** Every rule here is
enforced by `scripts/check.mjs` or `scripts/check-examples.mjs`. If you are
writing a **Next.js** page, sections 1–9 still apply, and
[section 10](#10-nextjs-sections) adds to them and overrides them where the two
differ.

---

## 1. Verified version facts (re-verified 2026-09-08)

These were checked against `https://registry.npmjs.org/react/latest`,
`react.dev/versions`, the React 19 and 19.2 release posts, and the React 19
upgrade guide. **Do not contradict them. Do not state a version number that is
not in this list.**

| Fact | Value |
|---|---|
| Latest stable `react` / `react-dom` | **19.2.8** |
| Latest minor line | 19.2 (19.2.0 released 1 October 2025) |
| React 19.0 released | 5 December 2024 |
| React 18.0 released | March 2022 |
| React Compiler v1.0 released | 7 October 2025 |
| `eslint-plugin-react-hooks` | **v7 (7.1.1)** — see the note below |

### `eslint-plugin-react-hooks` (re-verified 2026-09-08)

The React 19.2 release post announced **v6**, and that is still the correct
historical statement about 19.2. It is no longer the current release:

- Latest on npm is **7.1.1**.
- **6.0.0 was published by mistake and immediately deprecated and untagged.** The
  real 6.x line is **6.1.0**, which required Node 18+ and made flat config the
  default.
- **v7 removed the `recommended-legacy` and `flat/recommended` configs.** There
  are now two: `recommended` (all recommended rules) and `recommended-latest`
  (recommended plus the experimental compiler rules).
- **In v7 the React Compiler powered rules are on by default**, where in v6 they
  were opt-in.

So: recommend **v7**, use `reactHooks.configs.recommended` in flat config, and do
not tell readers to extend `plugin:react-hooks/recommended-legacy` — it does not
exist any more. Mention v6 only when describing what shipped alongside React
19.2.

### Security floor

React Server Components had two rounds of advisories:

- CVE-2025-55182 (CVSS 10.0, RCE) — fixed in 19.0.1 / 19.1.2 / 19.2.1
- CVE-2025-55183, CVE-2025-55184, CVE-2025-67779, CVE-2026-23864 — fixed in
  **19.0.4 / 19.1.5 / 19.2.4**. The patches in 19.0.3 / 19.1.4 / 19.2.3 were
  incomplete.

**Always recommend `>= 19.2.4`, and pin examples to `19.2.8`.** Never write
"upgrade to 19.2.1" as sufficient. Apps that never render React on a server with
an RSC-capable bundler are not affected, but state the floor anyway.

### React 19.3 (found 2026-09-16, not yet reflected in the React sections)

`react@19.3.0` was published on **9 September 2026**, the day after the table
above was verified. The React 19.3 post makes `<ViewTransition>`,
`addTransitionType`, Fragment Refs, the `browser` API, and Trusted Types support
stable, and lets Server Components render `<Context>` directly. **The React
sections of this site still document 19.2** and have not been updated. Until
they are, do not describe any of these as part of React 19.2. The Next.js
sections follow the labelling rule in section 10.1.

### Added in React 19.0

Actions (async transitions with automatic pending/error/optimistic handling) ·
`useActionState` (replaced `ReactDOM.useFormState`) · `useFormStatus` ·
`useOptimistic` · `use()` (reads promises and context during render, callable
conditionally) · `ref` as a regular prop on function components · ref callbacks
may return a cleanup function · `<Context>` renders directly as a provider ·
document metadata (`<title>`, `<meta>`, `<link>` hoisted to `<head>`) ·
stylesheets with a `precedence` prop · async `<script>` deduplication ·
`preload()`, `preinit()`, `preconnect()`, `prefetchDNS()` · `useDeferredValue`
accepts an `initialValue` · root options `onCaughtError`, `onUncaughtError`,
`onRecoverableError` · Server Components and Server Functions (`"use client"` /
`"use server"`) · `prerender()` and `prerenderToNodeStream()`.

### Added in React 19.2

`<Activity />` with `visible` / `hidden` modes · `useEffectEvent` ·
`cacheSignal()` (Server Components only) · Performance Tracks in Chrome DevTools
(Scheduler and Components tracks) · `prerender()` can return a `postponed` state
(partial pre-rendering) · `resume()`, `resumeToPipeableStream()`,
`resumeAndPrerender()`, `resumeAndPrerenderToNodeStream()` ·
`renderToReadableStream()` and `prerender()` available on Node (Web Streams) ·
SSR Suspense boundary reveals are batched · `eslint-plugin-react-hooks` v6 (now
superseded by v7 — see the note above) ·
`useId` prefix changed from `:r:` to `_r_`.

### REMOVED in React 19 — never present as current guidance

`propTypes` · `defaultProps` on function components (use default parameters) ·
legacy context (`contextTypes` / `getChildContext`) · string refs
(`ref="input"`) · module pattern factories · `React.createFactory` ·
`ReactDOM.render` (use `createRoot(...).render()`) · `ReactDOM.hydrate` (use
`hydrateRoot()`) · `unmountComponentAtNode` (use `root.unmount()`) ·
`ReactDOM.findDOMNode` (use refs) · `react-dom/test-utils` (`act` now imports
from `"react"`) · `react-test-renderer/shallow` (use the
`react-shallow-renderer` package) · `unstable_flushControlled` ·
`unstable_createEventHandle` · `unstable_renderSubtreeIntoContainer` ·
`unstable_runWithPriority` · UMD builds (use an ESM CDN such as `esm.sh`).

These strings may appear **only** in a page whose front matter sets
`status: legacy` or `status: deprecated`, or inside a `> [!DEPRECATED]` /
`> [!LEGACY]` callout, or in a fenced block tagged `legacy`.
`scripts/check.mjs` greps for every one of them and fails the build otherwise.

### DEPRECATED in React 19 — still work, must be labelled, never the default

`forwardRef` (unnecessary — `ref` is a prop) · `<Context.Provider>` (render
`<Context>`) · `element.ref` (read `element.props.ref`) · `react-test-renderer`
(use `@testing-library/react`).

### Migration codemods (exact commands)

```bash
npx codemod@latest react/19/migration-recipe
```

```bash
npx types-react-codemod@latest preset-19 ./path-to-app
```

### Source of truth

`react.dev`. **Never invent a hook, prop, component, option or behaviour.** If
you cannot verify something, leave it out and report it as a gap instead of
guessing.

---

## 2. File layout and naming

```
content/<group-slug>/<page-slug>.md
```

- `kebab-case` only. `use-effect.md`, `server-components.md`, `error-boundaries.md`.
- Never `test.md`, `new.md`, `notes-final.md`, `index.md`, `temp.md`.
- One concept per file. One hook per file.
- The URL derives from the path: `content/hooks/use-effect.md` becomes
  `docs/hooks/use-effect.html`.

Group slugs (fixed — do not invent new ones):

| Slug | Sidebar title |
|---|---|
| `getting-started` | Getting Started |
| `core-concepts` | Core Concepts |
| `hooks` | Hooks |
| `state-management` | State Management |
| `data-fetching` | Data Fetching |
| `performance` | Performance |
| `server-react` | Server React |
| `patterns` | Patterns |
| `typescript` | TypeScript |
| `accessibility` | Accessibility |
| `testing` | Testing |
| `ecosystem` | Ecosystem |
| `migration` | Migration |
| `reference` | Reference |

---

## 3. Front matter (required on every page)

```
---
title: useEffect
description: Synchronize a component with an external system.
group: hooks
order: 40
status: current
since: "19.0"
related: [hooks/use-state, hooks/use-effect-event]
---
```

| Key | Required | Notes |
|---|---|---|
| `title` | yes | Plain text, no trailing punctuation. Becomes the `<h1>` — **do not also write an `#` heading in the body.** |
| `description` | yes | One sentence ending with a period. Used for the subtitle, `<meta name="description">` and search. |
| `group` | yes | Exactly one slug from the table above. |
| `order` | yes | Integer. Sidebar order within the group. Leave gaps of 10. |
| `status` | yes | `current`, `legacy` or `deprecated`. |
| `since` | no | React version that introduced or last changed the API, e.g. `"19.2"`. Rendered as a badge. |
| `related` | no | Inline list of page paths without extension. Feeds "Related topics" if the section is omitted. |
| `shape` | no | Set to `reference` on cheat-sheet / reference pages to opt out of the standard section shape. |

The parser is a **minimal YAML subset**: `key: value`, quoted or bare scalars,
and inline `[a, b, c]` lists. No nesting, no block lists, no multi-line strings.

---

## 4. Page shape (enforced)

Every page uses these `##` sections, in this order. Omit one only if it
genuinely does not apply — except the last two, which are **mandatory**.

```
## Overview
## Why it exists
## When to use it
## When not to use it
## Basic example
## How it works
## Common patterns
## Advanced example
## Common mistakes      <- required
## Related topics       <- required, must be last
```

`scripts/check.mjs` fails if `## Common mistakes` or `## Related topics` is
missing, or if `## Related topics` is not the final `##` heading.

Pages with `shape: reference` only need the two required sections.

### Writing rules

- Explain **why**, not just what. Every API gets a reason for existing.
- Short paragraphs — three sentences is a good ceiling. No filler, no
  "in this section we will explore".
- Be opinionated where React is opinionated: overusing Effects, unnecessary
  memoization (and what the React Compiler now does for you), derived state.
- For every concept cover: what it does · why it exists · when to use ·
  **when not to** · behavior across re-renders · interaction with StrictMode
  double-invoking · interaction with concurrent rendering · common mistakes.
- Use comparison tables where they earn their place: `useMemo` vs `useCallback`,
  state vs ref, `useEffect` vs `useEffectEvent`, context vs external store,
  Server vs Client Component, controlled vs uncontrolled, `<Activity>` vs
  conditional rendering.
- Second person ("you"), present tense, American spelling.
- Never write "simply", "just", "obviously", "easy".

---

## 5. Callouts

Exactly six types. GitHub-alert syntax:

```
> [!NOTE]
> Neutral information the reader would otherwise miss.

> [!TIP]
> A shortcut or ergonomic improvement.

> [!BEST-PRACTICE]
> What we recommend you actually do.

> [!WARNING]
> Something that will bite you: a footgun, a correctness trap.

> [!DEPRECATED]
> Still works in React 19, but do not write new code this way. Say what to use
> instead and which version deprecated it.

> [!LEGACY]
> Pre-React-19 material, kept for maintaining old code. Say which version.
```

Every line of a callout is prefixed with `> `. A lone `>` line separates
paragraphs inside one callout.

`DEPRECATED` and `LEGACY` callouts unlock the removed/deprecated API grep for
their own block only.

### Version labelling

Whenever behavior differs from React 18, say so and name the version. Never
present a React 18 idiom as current without noting the difference:

```
> [!NOTE]
> Before React 19 this required `forwardRef`. Since **19.0**, `ref` is an
> ordinary prop on function components.
```

---

## 6. Tabs

````
:::tabs
== npm
```bash
npm install react@19.2.8 react-dom@19.2.8
```
== pnpm
```bash
pnpm add react@19.2.8 react-dom@19.2.8
```
:::
````

- `:::tabs` opens, `:::` alone closes.
- `== Label` starts a tab. Labels are plain text.
- Tabs may contain any Markdown, including fenced code.

---

## 7. Code blocks

### Plain code

````
```jsx
import { useState } from 'react';
```
````

Languages the highlighter knows: `jsx`, `tsx`, `js`, `ts`, `json`, `bash`,
`html`, `css`, `diff`, `text`.

### Live examples

Add `live` to the info string. The block renders as a **Preview / Code** tab
pair; the preview runs in a sandboxed iframe loading React 19.2.8 from `esm.sh`,
created lazily on first view.

````
```jsx live
import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>;
}
```
````

**Requirements for a `live` block:**

- A **default export** of a component taking no props.
- Self-contained: no imports other than from `react`, `react-dom`,
  `react-dom/client`, or `react/jsx-runtime`.
- No network access, no `localStorage`, no timer left uncleared.
- JSX only. **`tsx` blocks cannot be live** — the iframe has no TypeScript
  compiler. Write the live version in JSX and the typed version as a separate
  plain `tsx` block.

If an example cannot run safely or self-containedly (Server Components, SSR,
build config, anything needing a server or bundler), keep it static and give the
reason:

````
```jsx static="Runs on the server — no browser preview is possible."
````

Do **not** fake a preview.

### Legacy code

A block that deliberately shows a removed or deprecated API must be tagged
`legacy`, which exempts it from the API grep:

````
```jsx legacy
// React 18 and earlier. Removed in React 19.
import { render } from 'react-dom';
render(<App />, document.getElementById('root'));
```
````

Pair it with the current form immediately after, or inside a `:::tabs` block
labelled `Before (React 18)` / `After (React 19)`.

### Correctness rules — type-checked, not proofread

`scripts/check-examples.mjs` extracts **every** `jsx` / `tsx` block and compiles
it against the real `react` and `@types/react` for 19.2.8. It will catch you.

- **Include imports.** Every block that uses `useState` imports `useState`.
  Blocks compile in isolation.
- Function components and hooks by default. Class components appear **only** in
  `migration`, `patterns/error-boundaries` (where a class is still required),
  and legacy pages — always labelled.
- `ref` as a prop. **Not** `forwardRef`.
- `<Context>`. **Not** `<Context.Provider>`.
- `createRoot` / `hydrateRoot`. **Never** `ReactDOM.render`.
- `import { act } from 'react'`. **Not** `react-dom/test-utils`.
- Copy-pasteable and realistic. No `foo` / `bar`. Name things like real code.
- Show progression where it helps: basic, then with state, then with data, then
  production-shaped.
- Deliberately incomplete fragments (a signature, a type snippet, a partial
  diff) use `text` or `diff`, not `jsx`/`tsx`. If a `jsx`/`tsx` block genuinely
  cannot compile in isolation, add a reason:
  `` ```tsx nocheck="Illustrative signature only." ``
  Use `nocheck` sparingly — every use is counted and reported.
- Imports from packages other than `react` / `react-dom` (for example
  `@testing-library/react`, `react-router`) are fine: the harness stubs unknown
  modules rather than failing. Do not add `nocheck` for those.

---

## 8. Links and anchors

- **Relative links only.** The site must work from a repo subpath such as
  `https://user.github.io/react_doc/`. Never write a root-absolute `/path`.
- Link to another page by content path without the extension being rewritten by
  you: `[useEffect](../hooks/use-effect.md)` — the build rewrites `.md` to
  `.html`.
- Anchors are GitHub-style slugs of the heading text: `## When not to use it`
  becomes `#when-not-to-use-it`.
- `scripts/check.mjs` resolves every internal link **and every anchor**. A link
  to a heading that does not exist fails the build.
- External links get `rel="noopener noreferrer"` automatically. Prefer
  `react.dev` over blog posts.

### "Related topics"

Three to six links, each with a short reason:

```
## Related topics

- [useState](./use-state.md) — for state that changes in response to events.
- [useSyncExternalStore](./use-sync-external-store.md) — subscribe to a store
  outside React without an Effect.
```

Every page must be reachable from at least one other page's body or from the
learning path. `scripts/check.mjs` reports orphans.

---

## 9. Tone and scope reminders

- Preserve useful ideas from the archived docs in `legacy/`. Improve them; do
  not discard them.
- Prefer correctness over completeness. A missing section is fine; an invented
  API is not.
- If you are unsure whether an API exists, **it does not**. Leave it out.

---

## 10. Next.js sections

The Next.js area documents **what Next.js adds on top of React**. It never
re-explains a React concept. Hooks, components, Server Components *as a React
concept*, Server Functions, Actions, `useActionState`, `useOptimistic`, Suspense,
error boundaries, and `<Activity>` are explained in the React sections. A Next.js
page explains the framework behavior and **links to the React page** for the
underlying idea.

### 10.1 Verified Next.js facts (re-verified 2026-09-16)

Sources: `https://registry.npmjs.org/next`, the nextjs.org blog posts for 16.0,
16.1, 16.2 and 16.3, the July and August 2026 security releases, the GitHub
advisory database, and the documentation **bundled inside
`node_modules/next/dist/docs/`** (456 files that ship with `next@16.3.5`).

> **Your primary reference is `node_modules/next/dist/docs/01-app/`.** It is the
> official documentation for exactly the version this site targets. Read the
> relevant file before you write about an API. Do not write Next.js from memory.
> Most of what you remember is Next.js 13–15, and most of it is now wrong.

| Fact | Value |
|---|---|
| Latest stable `next` | **16.3.5** (published 11 September 2026) |
| Release line | 16.0 (21 Oct 2025) · 16.1 (18 Dec 2025) · 16.2 (18 Mar 2026) · 16.3 (3 Aug 2026) |
| Pin examples to | `next@16.3.5`, `eslint-config-next@16.3.5`, `@next/playwright@16.3.5` |
| Node.js | **>= 20.9.0** (`engines` in `next/package.json`) |
| TypeScript | >= 5.1. 16.3 can use TypeScript 7 for `next build` type checking (`typescript@^7`) |
| Browsers | Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+ |
| Create an app | `npx create-next-app@latest`: App Router, TypeScript, Tailwind CSS and ESLint by default |
| Upgrade | `npx @next/codemod@canary upgrade latest` |
| `react` peer range of `next` | `^18.2.0 \|\| ^19.0.0`. Only the Pages Router uses it; the App Router uses its own vendored React. |

#### Security floor: `next >= 16.3.3`

**August 2026 Security Release (25 August 2026).** Two **Critical** vulnerabilities:

| Advisory | Issue | Affected | Patched |
|---|---|---|---|
| GHSA-2xp9-vwfh-vxw4 / GHSA-g89c-p67h-r497 | Unauthenticated RCE in the Image Optimization API when optimizing an attacker-controlled **AVIF** image (a `libheif` bug reached through `sharp`). The patch **disables AVIF optimization** until an upstream fix ships. | `>= 10.0.0 < 15.5.24`, `>= 16.0.0 < 16.3.3` | 15.5.24, 16.3.3 |
| CVE-2026-75604 / GHSA-p293-qw3h-jr36 (CVSS 9.0) | Unauthenticated RCE on **Windows-hosted** servers, in apps that use both the Pages Router and the App Router **without** Cache Components. Linux and macOS are not affected. No workaround. | `>= 13.4.0 < 15.5.24`, `>= 16.0.0 < 16.3.3` | 15.5.24, 16.3.3 |

GHSA-g89c-p67h-r497 is listed in the nextjs.org post, but the GitHub advisory API
returned 404 for it on 2026-09-16. Cite it as the post does. Do not invent
details for it.

**July 2026 Security Release (20 July 2026).** Patched in 16.2.11 and 15.5.21
(and in 16.3.0). It fixed nine issues, including DoS through Server Actions
(CVE-2026-64641), a proxy/middleware **bypass** with Turbopack and a single
`i18n` locale (CVE-2026-64642), SSRF and open redirect in `rewrites()` /
`redirects()` with request-controlled hostnames (CVE-2026-64645), SSRF in Server
Actions on custom servers (CVE-2026-64649), and disclosure of Server Function
endpoint IDs (CVE-2026-64643).

**React Server Components advisories (December 2025 onward)** are in section 1:
React `>= 19.2.4`. The App Router vendors its own React, so **upgrading `next` is
what patches an App Router app**. Upgrading `react` in `package.json` does not.

**Rule:** the minimum safe version is **`next@16.3.3`**. State it on the
installation, deployment, and security-advisories pages. Recommend and pin
**16.3.5**. Never present any 16.x below 16.3.3 as safe.

#### React version relationship

- `next@16.3.5` vendors **`19.3.0-canary-cbb046ab-20260731`** (see
  `node_modules/next/dist/compiled/react/cjs/react.production.js`). **App Router
  apps run a React Canary build.** Only the Pages Router uses the React version
  in the app's `package.json`.
- The React sections of this site document **React 19.2 stable**.
- React 19.3.0 (9 Sep 2026) made `<ViewTransition>`, `addTransitionType`,
  Fragment Refs (`<Fragment ref>`), `browser`, and Trusted Types stable.

**Labelling rule.** When a Next.js page uses a React API that is not in React
19.2, you must:

1. tag the code block `canary`, and
2. within two lines of the mention, in prose or a `> [!NOTE]`, say three things:
   it comes from the React Canary build the App Router ships, it is stable in
   React 19.3, and it is **not available in React 19.2**. Use exactly that
   framing.

`scripts/check.mjs` fails on `ViewTransition`, `addTransitionType`,
`transitionTypes`, `experimental_taint*` or `unstable_ViewTransition` in an
untagged code block, or in prose without "Canary" nearby.
`experimental_taint*` APIs are Canary/experimental only. They are not in 19.3
stable.

#### Next.js 16.0: the changes that invalidate most tutorials

| Topic | Current (16.x) | Never write (outside migration pages) |
|---|---|---|
| Request interception | `proxy.ts` at the project root (or `src/`), exporting `proxy` (named) or a default function. It runs on the **Node.js runtime**. | `middleware.ts` as current guidance. It still works for Edge but is **Deprecated**. |
| Bundler | Turbopack is the default for `next dev` and `next build`. Opt out with `--webpack`. | `--turbopack` / `--turbo` as something you need to add |
| Caching | **Cache Components**: `cacheComponents: true` + `"use cache"`. Caching is **opt-in**. Dynamic code runs at request time by default. | `experimental.ppr`, `export const experimental_ppr`, `experimental.dynamicIO` (all **removed**; `dynamicIO` became `cacheComponents`). Note: `experimental.ppr` is still in the TypeScript type, so the compiler will not catch it. The grep does. |
| Request APIs | `params` and `searchParams` are **Promises**. `cookies()`, `headers()`, `draftMode()` are **async**. Always `await` them. | Synchronous access of any of these |
| Tag revalidation | `revalidateTag('posts', 'max')`: the second argument is a `cacheLife` profile name or `{ expire: number }` | `revalidateTag('posts')`: the single-argument form is deprecated, and **it is a type error** against 16.3.5 |
| Read-your-writes | `updateTag(tag)` from `next/cache`, **in Server Actions only** | — |
| Refresh uncached data | `refresh()` from `next/cache`, **in Server Actions only**. It does not touch the cache. | — |
| React Compiler | Stable: `reactCompiler: true` (top-level, **off** by default, uses Babel) | `experimental.reactCompiler` |
| Removed | AMP · `next lint` (use ESLint or Biome directly; `next build` no longer lints) · `serverRuntimeConfig` / `publicRuntimeConfig` (use env vars) · `devIndicators` sub-options `appIsrStatus`, `buildActivity`, `buildActivityPosition` · `unstable_rootParams()` · `experimental.turbopack` (now top-level `turbopack`) | any of these as current |
| Parallel routes | Every slot **requires** an explicit `default.tsx`. Builds fail without it. | omitting `default` |
| `next/image` defaults | `minimumCacheTTL` 14400 s (was 60) · `qualities` `[75]` · `16` removed from `imageSizes` · `maximumRedirects` 3 · local IPs blocked (`dangerouslyAllowLocalIP`) · local `src` with a query string needs `images.localPatterns` | `images.domains` (Deprecated, use `images.remotePatterns`) · `next/legacy/image` (Deprecated) |
| Smooth scroll | Opt in with `data-scroll-behavior="smooth"` on `<html>` | relying on automatic `scroll-behavior: smooth` |
| Metadata images | In the image function (`opengraph-image.tsx` default export), `params` and the `id` from `generateImageMetadata` are Promises. `generateImageMetadata` itself still receives `params` synchronously (version-16 upgrade guide). The stale-params grep flags an inline `{ params: { id: string } }` type, so annotate with a named type. | sync access inside the image function |
| Edge runtime | **Deprecated.** The 16.3.5 docs say: "The Edge Runtime is deprecated. Remove the `runtime` export from your route files." Node.js is the default. **Cache Components requires the Node.js runtime.** No release post names the version that deprecated it, so do not state one. | `export const runtime = 'edge'` as a recommendation. Label it Deprecated wherever it appears. |
| Route segment config | Under Cache Components the valid exports are `runtime` (`'nodejs'`), `maxDuration`, `preferredRegion` (its string/array forms are marked **deprecated** in the 16.3.5 docs), and the Cache-Components-only `instant` and `prefetch` exports (see `03-api-reference/03-file-conventions/02-route-segment-config/`). | `export const dynamic`, `revalidate`, `fetchCache`, `dynamicParams`. All four are removed when `cacheComponents` is on and belong to the "Previous Model". |

#### Next.js 16.1

Turbopack filesystem cache for `next dev` became stable and on by default. It
added the experimental Bundle Analyzer (`next experimental-analyze`) and
`next dev --inspect`.

#### Next.js 16.2

Adapters API stable (`adapterPath` in `next.config`) · `next start --inspect` ·
`<Link transitionTypes={['slide']}>` (App Router only, React Canary label) ·
Server Function execution logs in the dev terminal · hydration diff labels
(`+ Client` / `- Server`) · `ImageResponse` default font is now **Geist Sans**
(was Noto Sans) and it renders faster · `create-next-app` writes `AGENTS.md`.
16.2 also shipped `unstable_catchError()` and the `unstable_retry()` prop as
Experimental. **Both names are superseded in 16.3.** They may appear only on
migration pages.

#### Next.js 16.3

- **`catchError` from `next/error` (stable).** `catchError(Fallback)` returns a
  component. `Fallback` receives `(props, { error, reset, retry })`. **`error` is
  typed `unknown`**, so narrow it (`error instanceof Error`) before reading
  `.message`. The 16.3 blog post's `error.message` does not type-check. It must
  be used from a Client Component. It does not swallow `notFound()` / `redirect()`.
- **`retry` prop on `error.tsx` / `global-error.tsx` (stable in 16.3.0).**
  `retry()` re-fetches and re-renders the segment, including Server Components.
  Prefer it over `reset()`, which only clears client error state.
- **Root params:** `import { lang } from 'next/root-params'`, then
  `await lang()`. The exports are generated from the dynamic segments **above the
  root layout**. Supported in Server Components and inside `use cache` scopes.
  **Not** supported in Route Handlers (planned), Server Actions, or Client
  Components. Segment names must be valid identifiers (`[post-slug]` fails).
- **Typed route props:** the globals `PageProps<'/[lang]/posts/[slug]'>`,
  `LayoutProps<'/[lang]'>` and `RouteContext<'/api/items/[id]'>` are generated by
  `next dev`, `next build` or `next typegen`. They need no import.
- **Turbopack `import.meta.glob`** (Vite-compatible).
- Dev memory eviction and the filesystem cache are on by default. The filesystem
  cache now also applies to `next build`.
- Native Node.js streams in App Router SSR (up to 22% more requests under load
  in Vercel's benchmark).
- Prefetch payloads below a size threshold are bundled automatically.
- `next dev` writes a version-matched `AGENTS.md` block pointing at
  `node_modules/next/dist/docs/`.
- **Instant Navigations: Opt-in.** Enable with `cacheComponents: true` **and**
  top-level `partialPrefetching: true` (not under `experimental`). The suite is
  Partial Prefetching, improved ISR (a page not prerendered at build serves an
  instant shell on the first visit, then upgrades in the background), Instant
  Insights and the Navigation Inspector in the Next.js DevTools, and the
  `instant()` Playwright helper from `@next/playwright`. **Say these behaviors
  are slated to become the default in a future major.** Never call them default.
- **Experimental:** Rust React Compiler (`reactCompiler: true` +
  `experimental.turbopackRustReactCompiler: true`), and network resilience
  (`experimental.useOffline: true` + `import { useOffline } from 'next/offline'`).
- `instant()` against a production build (`next start`) requires
  `experimental.exposeTestingApiInProductionBuild: true`. The
  `@next/playwright` README itself calls `instant()` "Experimental. This API is
  not yet stable". Say so in one sentence next to the Opt-in label.
- `serverActions` options (`bodySizeLimit`, `allowedOrigins`) live under
  **`experimental`** in the 16.3.5 docs and types. `proxy.ts` cannot run on the
  Edge runtime at all. Only the deprecated `middleware.ts` can.
- `typedRoutes` is a stable top-level `next.config` option (Link `href` checking).
- `io()` from `next/cache` (16.3.0) marks request-time work under Cache
  Components. The 16.3 docs prefer it over `connection()` there. Read
  `04-functions/io.md` before using it.
- Still experimental in 16.3 (verify in the bundled docs before mentioning):
  `experimental.cachedNavigations`, `experimental.appNewScrollHandler`,
  `experimental.authInterrupts` (needed for `forbidden()` / `unauthorized()`).

#### Other exact import locations (verified by compiling against 16.3.5)

- `connection`, `after`, `NextRequest`, `NextResponse`, `ImageResponse`,
  `userAgent` come from `next/server`. **`connection` is not in `next/headers`.**
  `ImageResponse` is also exported from `next/og`.
- `cookies`, `headers`, `draftMode` come from `next/headers`.
- `notFound`, `redirect`, `permanentRedirect`, `forbidden`, `unauthorized`,
  `unstable_rethrow`, `useRouter`, `usePathname`, `useSearchParams`, `useParams`
  come from `next/navigation`.
- `revalidatePath`, `revalidateTag`, `updateTag`, `refresh`, `cacheLife`,
  `cacheTag` come from `next/cache`.
- Built-in `cacheLife` profiles: `default`, `seconds`, `minutes`, `hours`, `days`,
  `weeks`, `max`. Custom profiles go under top-level `cacheLife` in `next.config`.

#### Ecosystem versions (npm, 2026-09-16). Pin to these, labelled as listed

| Package | Latest **stable** | Notes |
|---|---|---|
| `zod` | 4.6.5 | Zod 4 API (`z.email()`, `z.url()`, `error` param). `safeParse` / `z.flattenError`. |
| `drizzle-orm` / `drizzle-kit` | 0.45.2 / 0.31.10 | 1.0 is **beta**. Do not document it. |
| `prisma` / `@prisma/client` | **7.10.0** | npm `latest` for `prisma` is **8.0.0-rc.15, a release candidate. Document 7.10.0.** Prisma 7 uses driver adapters (`@prisma/adapter-pg` 7.10.0) and `prisma.config.ts`. Verify on prisma.io before writing. |
| `pg` | 8.23.0 | |
| `@neondatabase/serverless` | 1.1.0 | |
| `better-auth` | 1.7.5 | peer `next ^14 \|\| ^15 \|\| ^16` |
| `next-auth` | 4.24.15 stable. **v5 (Auth.js) is still `5.0.0-beta.32`** | Label Auth.js v5 as beta. Do not present it as stable. |
| `@auth/core` | 0.41.3 | |
| `jose` | 6.2.12 | The official Next.js auth guide uses it for stateless sessions |
| `server-only` | 0.0.1 | |
| `@tanstack/react-query` | 5.103.0 | |
| `next-intl` | 4.14.5 | peer `next ^16` |
| `@next/playwright` | 16.3.5 | `instant()` |
| `@playwright/test` | 1.63.0 | `next` peer `^1.51.1` |
| `vitest` | 5.0.1 | |
| `@testing-library/react` | 16.3.3 | |
| `@vitejs/plugin-react` | 6.1.1 | |
| `tailwindcss` / `@tailwindcss/postcss` | 4.3.3 | |
| `@vercel/og` | 1.0.2 | In Next.js, use `ImageResponse` from `next/og`. `@vercel/og` is not needed. |
| `eslint` / `eslint-config-next` | 10.10.0 / 16.3.5 | |
| `file-type` | 22.1.0 | magic-byte content sniffing for uploads |

If a package or API is not in this file and you cannot verify it in
`node_modules/next/dist/docs/`, on nextjs.org, or on the package's own docs,
**leave it out** and list it under "Unverified" in your report.

### 10.2 Groups, slugs and the page manifest

Next.js groups follow the normal layout (`content/<group>/<page>.md`). Every
Next.js group slug starts with `nextjs-`. That prefix is how the generator, the
checks and the harness recognize framework pages. **Do not create pages outside
this manifest without updating it.** Cross-group links may point at any page in
the manifest, **but only at the page, never at an anchor**, because the target
may be written concurrently. Links to React pages may use anchors, since those
pages already exist.

| Group slug | Title | Pages (slug · order) |
|---|---|---|
| `nextjs-getting-started` | Getting Started | `introduction` 10 · `installation` 20 · `project-structure` 30 · `dev-and-build` 40 · `typescript` 50 · `ai-agents` 60 · `learning-path` 70 |
| `nextjs-routing` | Routing | `file-conventions` 10 · `pages-and-layouts` 20 · `dynamic-segments` 30 · `typed-routes` 40 · `route-groups` 50 · `parallel-routes` 60 · `intercepting-routes` 70 · `linking-and-navigation` 80 · `redirects` 90 · `root-params` 100 · `internationalization` 110 |
| `nextjs-rendering` | Rendering | `server-components` 10 · `client-components` 20 · `composition-patterns` 30 · `streaming` 40 · `static-and-dynamic-rendering` 50 · `prerendering` 60 · `react-canary` 70 |
| `nextjs-data-caching` | Data and Caching | `caching-model` 10 · `use-cache` 20 · `cache-life-and-tags` 30 · `revalidation` 40 · `request-memoization` 50 · `fetching-data` 60 · `isr` 70 |
| `nextjs-instant-navigations` | Instant Navigations | `overview` 10 · `partial-prefetching` 20 · `link-prefetching` 30 · `devtools` 40 |
| `nextjs-mutations` | Mutations | `server-actions` 10 · `forms` 20 · `revalidating-after-mutations` 30 · `optimistic-updates` 40 · `error-handling` 50 · `progressive-enhancement` 60 |
| `nextjs-backend` | Backend Features | `route-handlers` 10 · `proxy` 20 · `runtimes` 30 · `environment-variables` 40 · `webhooks` 50 · `file-uploads` 60 · `streaming-responses` 70 · `background-work` 80 |
| `nextjs-databases` | Databases and ORMs | `overview` 10 · `connection-pooling` 20 · `prisma` 30 · `drizzle` 40 · `edge-runtime` 50 · `migrations-in-deployment` 60 |
| `nextjs-auth` | Authentication and Authorization | `overview` 10 · `sessions` 20 · `auth-libraries` 30 · `data-access-layer` 40 · `protecting-routes` 50 · `role-based-access` 60 |
| `nextjs-errors` | Errors and Loading UI | `error-boundaries` 10 · `catch-error` 20 · `not-found-and-redirect` 30 · `loading-ui` 40 |
| `nextjs-styling` | Styling, Images, Fonts and Metadata | `css-and-tailwind` 10 · `images` 20 · `fonts` 30 · `metadata` 40 · `open-graph-images` 50 |
| `nextjs-performance` | Performance | `overview` 10 · `turbopack` 20 · `bundle-analysis` 30 · `react-compiler` 40 · `images-and-fonts` 50 · `prefetching-cost` 60 · `dev-memory-and-caching` 70 · `core-web-vitals` 80 |
| `nextjs-security` | Security | `overview` 10 · `server-actions-authorization` 20 · `proxy-is-not-authorization` 30 · `environment-variable-leaks` 40 · `idor` 50 · `sql-injection` 60 · `open-redirects` 70 · `input-validation` 80 · `cors` 90 · `file-uploads` 100 · `security-advisories` 110 |
| `nextjs-testing` | Testing | `overview` 10 · `unit-testing-components` 20 · `testing-server-components` 30 · `testing-server-actions` 40 · `playwright` 50 · `instant-navigation-tests` 60 |
| `nextjs-deployment` | Deployment | `build-output` 10 · `self-hosting` 20 · `docker` 30 · `adapters` 40 · `managed-platforms` 50 · `environment-configuration` 60 · `caching-and-cdn` 70 · `debugging-production` 80 · `checklist` 90 |
| `nextjs-migration` | Migration | `next-15-to-16` 10 · `next-16-2-to-16-3` 20 · `pages-to-app-router` 30 · `middleware-to-proxy` 40 · `pre-16-caching-model` 50 |
| `nextjs-reference` | Reference | `file-conventions` 10 · `next-config` 20 · `cli` 30 · `cheat-sheet` 40 · `troubleshooting` 50 |

Link syntax from a Next.js page: `[Server Actions](../nextjs-mutations/server-actions.md)`
for a Next.js page, and `[useActionState](../hooks/use-action-state.md)` for a React page.

**Which React page to link** for the underlying concept:

| Concept | React page |
|---|---|
| Server Components (the React model) | `server-react/server-components.md` |
| `"use client"` / `"use server"` | `server-react/directives.md` |
| Server Functions | `server-react/server-functions.md` |
| SSR, hydration | `server-react/ssr-and-hydration.md` |
| Streaming | `server-react/streaming.md` |
| Static generation / `prerender` | `server-react/static-generation.md` |
| Suspense | `data-fetching/suspense.md` |
| `use()` with promises | `data-fetching/use-with-promises.md` |
| React-level caching (`cache`) | `data-fetching/caching.md` |
| Forms and Actions | `patterns/forms-and-actions.md` |
| `useActionState` / `useFormStatus` / `useOptimistic` / `useTransition` | `hooks/use-action-state.md` / `hooks/use-form-status.md` / `hooks/use-optimistic.md` / `hooks/use-transition.md` |
| Error boundaries | `patterns/error-boundaries.md` |
| Document metadata | `patterns/document-metadata.md` |
| Context | `state-management/context.md` |
| Composition / children | `patterns/composition.md` |
| React Compiler | `performance/react-compiler.md` |
| Code splitting / `lazy` | `performance/code-splitting.md` |
| Profiling | `performance/profiling.md` |
| Testing Library setup | `testing/setup.md`, `testing/testing-library.md` |
| TypeScript setup | `typescript/setup.md` |
| Styling libraries | `ecosystem/styling.md` |
| Data libraries | `ecosystem/data-libraries.md` |

### 10.3 Front matter for Next.js pages

```
---
title: Route Handlers
description: Build HTTP endpoints inside the App Router with Web Request and Response.
group: nextjs-backend
order: 10
status: current
since: "16.0"
related: [nextjs-backend/proxy, server-react/server-functions]
---
```

- `status`: `current` · `opt-in` · `experimental` · `legacy` · `deprecated`.
  `opt-in` and `experimental` are valid **only** in `nextjs-*` groups. Use
  `opt-in` for a page whose subject is Instant Navigations or Partial
  Prefetching. Use `experimental` for a page whose subject is experimental.
- `since` on a Next.js page is a **Next.js** version (`"16.0"`, `"16.3"`) and
  renders as "Next.js 16.3+". Use the version that introduced the API or last
  changed it incompatibly. Omit it for concepts that predate 16.
- Every Next.js page automatically gets a **"Next.js"** framework badge and a
  **"Targets Next.js 16.3"** badge. You do not write these, but the page body
  must still be unmistakably about Next.js.
- `legacy` / `deprecated` page status is allowed only in `nextjs-migration`.

### 10.4 Page shape for Next.js pages

Use these `##` headings in this order. Omit a section that does not apply,
**except the last two**.

```
## Overview
## Why it exists
## When to use it
## When not to use it
## Basic example
## How it works
## Server and client implications      (where relevant)
## Caching implications                (where relevant)
## Common patterns
## Security considerations             (where relevant)
## Common mistakes                     <- required
## Related topics                      <- required, last
```

`Related topics` must include **at least one React page** whenever the page
builds on a React concept. `check.mjs` warns if a Next.js page links no React
page at all.

**Security pages (`nextjs-security`, except `overview` and
`security-advisories`) additionally require** these four `##` sections, in
this order, before `## Common mistakes`:

```
## The threat
## Exploit
## Fix
## Verify the fix
```

"Exploit" shows the vulnerable code in a block tagged `vulnerable`, plus a
concrete request that exploits it (a `bash` block with `curl`, or a Playwright
snippet). "Fix" shows the corrected code. "Verify the fix" shows a runnable
check: a test, a `curl` that now fails with the expected status, or a build-time
error.

### 10.5 Code blocks on Next.js pages

**Every code block shows its file path.** In Next.js the location of a file is
part of the API:

````
```tsx file="app/[lang]/posts/[slug]/page.tsx"
````

- `file="..."` is **required** on every `tsx`, `ts`, `jsx`, `js`, `json` and
  `css` block in a `nextjs-*` group. It renders as the filename label in the code
  header. Use paths relative to the project root: `app/...`, `proxy.ts`,
  `next.config.ts`, `lib/dal.ts`, `e2e/checkout.spec.ts`. For `.env` files, use
  `text file=".env.local"`. For terminal commands, use `bash` with no `file`.
- **No `live` blocks** on Next.js pages. Next.js needs a server, and this site
  does not fake previews. Point to the runnable app in `examples/nextjs/` instead.
- `vulnerable`: deliberately insecure code. It renders with a red "Vulnerable —
  do not copy" badge and is still type-checked. Always follow it with the fixed
  version.
- `canary`: uses a React API not in React 19.2 (see 10.1). Type-checked with
  `react/canary` types.
- `legacy`: pre-16 code. **Allowed only in `nextjs-migration`.** Skipped by the
  harness.
- `nocheck="reason"`: as in section 7, sparingly. Every use is reported.
- Tabs: use `:::tabs` for TypeScript/JavaScript or npm/pnpm/yarn/bun **only where
  they add value** (installation commands, `next.config` in both forms). TypeScript
  is the default. Most blocks should be `tsx` / `ts` only.

#### The Next.js type-check harness

`scripts/check-examples.mjs` compiles every `ts`/`tsx` block in a `nextjs-*` group
against the **real `next@16.3.5`** installed in the repo root, in strict mode:

- `next`, `next/*`, `server-only`, `zod`, `drizzle-orm`, `@next/playwright` and
  `@playwright/test` resolve to **real types**. Each of these **fails**: an
  invented export, a sync `cookies().get()`, a single-argument
  `revalidateTag()`, a missing `await` on `params`, or reading `.message` on
  `catchError`'s `unknown` error.
- The harness collects the `file=` path of every block, builds a route skeleton
  from them, and runs **`next typegen`**. `PageProps<'/…'>`, `LayoutProps`,
  `RouteContext` and `next/root-params` exports are **the genuine generated
  types**. So a `PageProps<'/shop/[id]'>` block must have its `file=` under a
  route that actually has that shape (`app/shop/[id]/page.tsx`), or it fails.
  `next/root-params` exports exist only for dynamic segments above a root
  layout. A block that imports `lang` needs a sibling block (on any Next.js page)
  whose `file=` is `app/[lang]/layout.tsx`.
- **The skeleton is shared by every page.** Two blocks may use the same route with
  the same parameter names, but `app/store/[id]` on one page and
  `app/store/[slug]` on another make `next typegen` fail for everyone. Before
  adding a dynamic route, run
  `grep -rhoE 'file="(src/)?app/[^"]*"' content/nextjs-*` and reuse the
  existing parameter name at that path, or choose a distinct path.
- Other third-party packages (`@prisma/client`, `better-auth`, `pg`, …) and
  relative imports (`@/lib/db`, `./actions`) are stubbed as `any`, as in section 7.
  The `@/` alias maps to the project root.
- Run it for your own group without disturbing anyone else:

  ```bash
  EXAMPLES_WORKDIR=.examples-work-nextjs-routing node scripts/check-examples.mjs --filter nextjs-routing/
  ```

  In PowerShell: `$env:EXAMPLES_WORKDIR='.examples-work-nextjs-routing'; node scripts/check-examples.mjs --filter nextjs-routing/`

### 10.6 Stale-API grep (Next.js groups, outside `nextjs-migration`)

`scripts/check.mjs` fails a Next.js page that contains any of the following in
an untagged code block, or in prose without a removal/deprecation/migration
framing nearby:

`middleware.ts` / `export function middleware` as current guidance ·
synchronous `params.x` / `searchParams.x` / `cookies().` / `headers().` /
`draftMode().` · `experimental.ppr` / `ppr:` in config · `experimental_ppr` ·
`dynamicIO` · `serverRuntimeConfig` · `publicRuntimeConfig` · `next lint` ·
`images.domains` / `domains:` in config · `next/legacy/image` ·
single-argument `revalidateTag(` · `unstable_rootParams` · `unstable_catchError` ·
`unstable_retry` · `useAmp` · `getServerSideProps` / `getStaticProps` /
`getStaticPaths` / `getInitialProps` (Pages Router) · `experimental.reactCompiler`
· `export const dynamic` / `export const revalidate` / `export const fetchCache`
route segment config (pre-Cache-Components model) · `unstable_cache` /
`unstable_noStore` · `next: { revalidate` fetch options.

Prose that names a removed thing in order to say it is removed is fine, for
example "`next lint` was removed in 16.0, run ESLint directly". The prose
heuristic accepts it. In code it is never fine outside a `legacy` block on a
migration page.

### 10.7 Version labels in prose

Use these callouts for labels, one per feature, at first mention on the page:

| Label | Callout |
|---|---|
| Current | no callout needed |
| Opt-in | `> [!NOTE]` whose first line starts with `**Opt-in (16.3).**` |
| Experimental | `> [!WARNING]` whose first line starts with `**Experimental.**`, naming the flag |
| Deprecated | `> [!DEPRECATED]` |
| Legacy | `> [!LEGACY]` (migration pages only) |

### 10.8 Runnable example apps

Runnable apps live in `examples/nextjs/<app>/`. The directory is an npm
workspace (`examples/nextjs/package.json`), so one `npm install` serves every
app, and each app still has its own `package.json` and `README.md`.

- `package.json`: `"private": true`, exact pins from 10.1 (`next` `16.3.5`,
  `react`/`react-dom` `19.2.8`, `@types/react` `^19.2.0`, `typescript` `^5.9.0`,
  `@types/node` `^20`). Scripts: `dev` (`next dev`), `build` (`next build`),
  `start` (`next start`), `typecheck` (`next typegen && tsc --noEmit`), plus
  `test` / `test:e2e` where there are tests.
- `README.md`: what the app demonstrates, which doc pages it backs (relative
  links into `content/`), exact commands from a fresh clone, required env vars
  with a committed `.env.example`, and what needs external services (a
  database).
- `tsconfig.json` as `create-next-app` generates it (`"paths": { "@/*": ["./*"] }`).
- Commit no secrets, only `.env.example`.
- Doc pages reference an app with a relative link:
  `[the routing example](../../examples/nextjs/routing/README.md)`.

**Subagents do not run `npm run build`, `npm run verify` or `next build`.** The
site build and every example build run once, sequentially, at the end.
`node scripts/check.mjs` (read-only) and the filtered harness command in 10.5
are safe to run while writing.
