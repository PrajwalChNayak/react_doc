# Contributing / Authoring Guide

This repository is a hand-built static documentation site for **React 19**.
Content is Markdown in `content/`. `node scripts/build.mjs` generates `docs/`,
which GitHub Pages serves directly.

**Read this file in full before writing any content.** Every rule here is
enforced by `scripts/check.mjs` or `scripts/check-examples.mjs`.

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
