---
title: Installation
description: Start a new React 19 app, add React to an existing page, and set up linting and DevTools.
group: getting-started
order: 20
status: current
related: [getting-started/introduction, getting-started/your-first-component, ecosystem/build-tooling]
---

## Overview

There are three ways to get React 19 running, in decreasing order of how much is
decided for you:

1. **A framework** — Next.js or React Router. You get routing, data loading,
   server rendering, and Server Components without wiring them yourself.
2. **A build tool** — Vite. You get a fast dev server and a bundler, and you own
   everything above that.
3. **A script tag on an existing page** — for adding an interactive widget to a
   site you are not rewriting.

Whichever you pick, pin these versions:

```json
{
  "dependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0"
  }
}
```

> [!WARNING]
> **`react-dom` must be `>= 19.2.4`.** React Server Components had two rounds of
> security advisories. CVE-2025-55182 (CVSS 10.0, remote code execution) was
> fixed in 19.0.1 / 19.1.2 / 19.2.1, but a second set — CVE-2025-55183,
> CVE-2025-55184, CVE-2025-67779 and CVE-2026-23864 — was only fully fixed in
> **19.0.4 / 19.1.5 / 19.2.4**. The patches in 19.0.3 / 19.1.4 / 19.2.3 were
> incomplete.
>
> Apps that never render React on a server with an RSC-capable bundler are not
> affected, but there is no reason to sit below the floor. Install 19.2.8.

## When to use it

Use a **framework** if your app has more than a handful of routes, needs SEO or
server rendering, reads from a database, or is likely to want Server Components.
Routing and data loading are the two things every app eventually needs and the two
things that are unpleasant to retrofit.

:::tabs
== Next.js
```bash
npx create-next-app@latest
```
== React Router
```bash
npx create-react-router@latest
```
:::

Both are React-team-recommended and both fully support React 19. See
[Routing](../ecosystem/routing.md) for how they differ.

## When not to use it

Skip the framework when you are building something that is not a site: an
internal tool behind a login, an embedded dashboard, a design-system playground,
a desktop app shell. There is no SEO to win and no server to render on, and Vite
will get out of your way.

Be clear-eyed about the trade. Choosing Vite alone means server rendering, static
generation, data loading conventions, and Server Components become your problem
if you ever need them.

## Basic example

Create a Vite app with the TypeScript React template:

:::tabs
== npm
```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
npm install react@19.2.8 react-dom@19.2.8
npm run dev
```
== pnpm
```bash
pnpm create vite my-app --template react-ts
cd my-app
pnpm install
pnpm add react@19.2.8 react-dom@19.2.8
pnpm dev
```
== yarn
```bash
yarn create vite my-app --template react-ts
cd my-app
yarn install
yarn add react@19.2.8 react-dom@19.2.8
yarn dev
```
== bun
```bash
bun create vite my-app --template react-ts
cd my-app
bun install
bun add react@19.2.8 react-dom@19.2.8
bun dev
```
:::

Use `--template react` instead of `react-ts` for plain JavaScript. TypeScript is
worth the small extra effort — see [TypeScript setup](../typescript/setup.md).

Add the matching type packages:

:::tabs
== npm
```bash
npm install -D @types/react@^19.2.0 @types/react-dom@^19.2.0
```
== pnpm
```bash
pnpm add -D @types/react@^19.2.0 @types/react-dom@^19.2.0
```
== yarn
```bash
yarn add -D @types/react@^19.2.0 @types/react-dom@^19.2.0
```
== bun
```bash
bun add -d @types/react@^19.2.0 @types/react-dom@^19.2.0
```
:::

> [!WARNING]
> `@types/react` is versioned independently of `react`, but the major must match.
> A React 19 app with `@types/react@18` produces type errors that look like React
> bugs — most visibly around `ref` being a prop and around the removal of the
> implicit `children` prop. If you are upgrading an existing app, run
> `npx types-react-codemod@latest preset-19 ./src`.

Check that it worked by replacing the body of your `App` component:

```jsx live
import { useState } from 'react';

export default function App() {
  const [clicks, setClicks] = useState(0);

  return (
    <main style={{ fontFamily: 'system-ui' }}>
      <h1>React is running</h1>
      <button onClick={() => setClicks((n) => n + 1)}>
        Clicked {clicks} {clicks === 1 ? 'time' : 'times'}
      </button>
    </main>
  );
}
```

## How it works

### The entry point

One file connects your component tree to a DOM node. In a Vite app that is
`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <h1>Hello from React 19</h1>;
}

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing #root element in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

In a real app `App` lives in its own file and is imported. Three details matter:

- **`createRoot` comes from `react-dom/client`**, not `react-dom`. This is the
  concurrent root, and it is the only root API in React 19.
- **`container` is narrowed before use.** `getElementById` returns
  `HTMLElement | null`, and `createRoot` will not accept `null`.
- **`<StrictMode>` wraps the tree in development.** It costs nothing in
  production builds.

> [!NOTE]
> React 18 and earlier also had a second, legacy root API. In React 19
> `createRoot` and `hydrateRoot` are the only options. If you are porting an old
> app, [Removed APIs](../migration/removed-apis.md) lists the replacements.

### What StrictMode does

In development, `<StrictMode>` deliberately double-invokes component functions,
initializers, and Effects (mount, unmount, mount again). It is looking for two
classes of bug: impure render logic, and Effects that do not clean up after
themselves.

If your app breaks under StrictMode, the app has the bug, not StrictMode. Read
[StrictMode](../core-concepts/strict-mode.md) before you consider removing it.

### The root options

`createRoot` takes an options object for error reporting, which is worth wiring
to your logging service:

```tsx
import { createRoot } from 'react-dom/client';

function App() {
  return <h1>Dashboard</h1>;
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container, {
  onUncaughtError: (error) => {
    console.error('Uncaught render error', error);
  },
  onCaughtError: (error) => {
    console.error('Error caught by a boundary', error);
  },
  onRecoverableError: (error) => {
    console.warn('React recovered from', error);
  },
}).render(<App />);
```

All three callbacks were added in React 19.0. See
[Error boundaries](../patterns/error-boundaries.md).

## Common patterns

### Adding React to an existing page

You do not need a build step to put a React component on a page you already have.
Use an import map pointing at an ESM CDN:

```html
<div id="likes-widget"></div>

<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@19.2.8",
      "react/": "https://esm.sh/react@19.2.8/",
      "react-dom": "https://esm.sh/react-dom@19.2.8",
      "react-dom/": "https://esm.sh/react-dom@19.2.8/"
    }
  }
</script>

<script type="module">
  import { createElement as h, useState } from 'react';
  import { createRoot } from 'react-dom/client';

  function LikeButton() {
    const [likes, setLikes] = useState(0);
    return h('button', { onClick: () => setLikes(likes + 1) }, `♥ ${likes}`);
  }

  createRoot(document.getElementById('likes-widget')).render(h(LikeButton));
</script>
```

There is no JSX here because the browser cannot compile it. For anything larger
than a single widget, add a build step.

> [!LEGACY]
> Pre-19 tutorials tell you to drop in two `<script src="...development.js">`
> tags from unpkg. Those UMD builds were **removed in React 19** and no longer
> exist for 19.x. Use an ESM CDN such as `esm.sh` with an import map, as above.

You can mount as many independent roots on one page as you like — one per widget.

### Linting with the Hooks plugin

The Rules of Hooks are not enforced by the runtime in any useful way. The linter
is what actually catches violations, so install it on day one.

:::tabs
== npm
```bash
npm install -D eslint eslint-plugin-react-hooks@^7
```
== pnpm
```bash
pnpm add -D eslint eslint-plugin-react-hooks@^7
```
== yarn
```bash
yarn add -D eslint eslint-plugin-react-hooks@^7
```
== bun
```bash
bun add -d eslint eslint-plugin-react-hooks@^7
```
:::

Version 7 is flat-config only. In `eslint.config.js`:

```js
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
  },
  reactHooks.configs.recommended,
];
```

`recommended` includes the React Compiler powered rules, which are on by default
in v7. `recommended-latest` adds the experimental ones on top.

> [!LEGACY]
> **If you are still on `.eslintrc`**, you cannot upgrade to v7 as-is. v6 offered
> a `plugin:react-hooks/recommended-legacy` preset for eslintrc; **v7 removed it**,
> along with `flat/recommended`. Migrate to `eslint.config.js` first, or stay on
> `eslint-plugin-react-hooks@^6.1`. (6.0.0 itself was published by mistake and
> untagged — 6.1.0 is the real 6.x release.)

Two rules matter: `react-hooks/rules-of-hooks` (never conditional, never in a
loop, only in components or custom hooks) and
`react-hooks/exhaustive-deps` (your dependency arrays are honest). Treat
`exhaustive-deps` as an error, not a warning — see
[Rules of Hooks](../hooks/rules-of-hooks.md).

### React DevTools

Install the React Developer Tools browser extension for Chrome, Firefox, or Edge.
It adds two panels:

- **Components** — inspect the tree, read and edit props, state, hooks and
  context live, and see why a component re-rendered.
- **Profiler** — record an interaction and see what rendered, how long it took,
  and what triggered it. This is the tool that tells you whether a performance
  problem is real. See [Profiling](../performance/profiling.md).

React 19.2 also adds **Performance Tracks** to Chrome DevTools' own performance
panel, showing React's Scheduler and Components work inline with browser
activity — no extension required.

## Common mistakes

- **Installing `react` and `react-dom` at different versions.** They are released
  in lockstep and must match exactly. A mismatch produces hook errors that look
  unrelated to versioning.
- **Leaving `react-dom` below 19.2.4.** The second round of RSC advisories was
  only fully fixed at 19.0.4 / 19.1.5 / 19.2.4. "We are on 19.2.1" is not
  sufficient.
- **Keeping `@types/react@18` after upgrading.** The major versions must match.
- **Importing `createRoot` from `react-dom`.** It lives in `react-dom/client`.
- **Deleting `<StrictMode>` to make a warning go away.** The warning is the
  point. Fix the impure render or the missing Effect cleanup.
- **Skipping the Hooks lint rules** and then spending an afternoon on a stale
  closure that the linter would have flagged in the editor.
- **Two copies of React in one bundle.** Usually caused by a linked local package
  with its own `react` in `dependencies` rather than `peerDependencies`. The
  symptom is "Invalid hook call" on a component with nothing wrong with it.

## Related topics

- [Introduction to React](./introduction.md) — what React is and how it thinks.
- [Your first component](./your-first-component.md) — the next step once the dev server runs.
- [TypeScript setup](../typescript/setup.md) — `tsconfig` options and typing the entry point.
- [Build tooling](../ecosystem/build-tooling.md) — Vite configuration in depth.
- [Routing](../ecosystem/routing.md) — choosing between Next.js and React Router.
- [React 18 to 19](../migration/react-18-to-19.md) — upgrading an existing app.
