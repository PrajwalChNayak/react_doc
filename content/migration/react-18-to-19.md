---
title: React 18 to 19
description: The upgrade runbook in order, with the codemods, the security floor, and the behavior changes that are not API removals.
group: migration
order: 10
status: current
since: "19.2"
related: [migration/removed-apis, migration/deprecated-apis, migration/legacy-codebases, getting-started/installation]
shape: reference
---

## Overview

Upgrading to React 19 is six steps, and the order matters. Most upgrades that go
badly went badly because someone installed React 19 first and then tried to read
the resulting pile of errors.

1. Get to the latest React 18 and fix every warning.
2. Run the codemods.
3. Install `react@19.2.8` and `react-dom@19.2.8` plus matching types.
4. Fix removed APIs.
5. Fix deprecations.
6. Adopt the new APIs — incrementally, after the app is green.

The work splits cleanly. Steps 1 and 2 are mechanical and reversible. Step 3 is
one commit. Steps 4 and 5 are the actual migration. Step 6 is a series of
independent improvements you can spread over months.

> [!WARNING]
> React 19 has a security floor. Install **`>= 19.2.4`**, and prefer the current
> `19.2.8`. Four advisories affecting React Server Components — CVE-2025-55183,
> CVE-2025-55184, CVE-2025-67779 and CVE-2026-23864 — were fixed in
> **19.0.4 / 19.1.5 / 19.2.4**. The earlier patches in 19.0.3 / 19.1.4 / 19.2.3
> were **incomplete**, so "we already patched" is not the same as "we are
> patched". An earlier round (CVE-2025-55182, CVSS 10.0, remote code execution)
> was fixed in 19.0.1 / 19.1.2 / 19.2.1.
>
> An app that never renders React on a server with an RSC-capable bundler is not
> affected by these, but there is no reason to sit below the floor.

## Step 1 — Get to the latest React 18 first

Upgrade to the newest 18.x release and run your app, your tests, and your build
with the console open.

React 18 warns about almost everything React 19 removes. Every one of those
warnings is a React 19 error waiting to happen, and you get them one component
at a time with a stack trace attached instead of all at once after a version
bump.

Do not skip this because "we have no warnings". Check with a build that actually
surfaces them:

```bash
npm run dev
npm test -- --silent=false
```

Fix, in this order:

- Anything mentioning a removed API (step 4 lists them).
- Anything mentioning `UNSAFE_` lifecycle methods.
- Anything mentioning an outdated JSX transform.
- Everything else.

> [!TIP]
> Land step 1 as its own pull request on React 18 and ship it. It is safe on its
> own, and it makes the React 19 diff small enough to review.

## Step 2 — Run the codemods

Two commands. Run them on a clean working tree, one at a time, and commit each
separately so you can read what changed.

```bash
npx codemod@latest react/19/migration-recipe
```

The recipe bundles the source transforms: `replace-reactdom-render`,
`replace-string-ref`, `replace-act-import`, `replace-use-form-state` and
`prop-types-typescript`.

```bash
npx types-react-codemod@latest preset-19 ./path-to-app
```

The types preset updates TypeScript for the React 19 type definitions. Two of
its transforms are worth knowing by name because they produce the most diff:

| Transform | What it fixes |
|---|---|
| `no-implicit-ref-callback-return` | Ref callbacks with an implicit return, which React 19 now treats as a cleanup function. |
| `refobject-defaults` | `useRef` calls and `RefObject` types under the new mutable-ref typings. |
| `react-element-default-any-props` | Code that reads props off a `ReactElement`, now typed `unknown` rather than `any`. |

Codemods are not a review. Read every hunk. They are conservative by design and
will leave anything ambiguous alone, which is exactly the code you need to look
at.

## Step 3 — Install React 19

:::tabs
== npm
```bash
npm install --save-exact react@19.2.8 react-dom@19.2.8
npm install --save-dev --save-exact @types/react@^19.0.0 @types/react-dom@^19.0.0
```
== pnpm
```bash
pnpm add --save-exact react@19.2.8 react-dom@19.2.8
pnpm add -D --save-exact @types/react@^19.0.0 @types/react-dom@^19.0.0
```
== yarn
```bash
yarn add --exact react@19.2.8 react-dom@19.2.8
yarn add --dev --exact @types/react@^19.0.0 @types/react-dom@^19.0.0
```
:::

Pin exactly. A caret range on React is how a team ends up with four different
patch levels across three lockfiles.

```json
{
  "dependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8"
  }
}
```

Then check for duplicates. A single stray React 18 copy hoisted under a
dependency produces "invalid hook call" errors that look like your bug:

```bash
npm ls react react-dom
```

If a library pins React 18 in its `peerDependencies` and has no React 19
release, that is a blocker to resolve before you continue — not something to
paper over with `--legacy-peer-deps`.

> [!NOTE]
> `@types/react` and `@types/react-dom` are versioned independently of React
> itself. Install the 19 line; the numbers will not match `19.2.8`.

## Step 4 — Fix removed APIs

React 19 deleted a long list of APIs that had been warning for years. Each one
has a documented replacement.

> [!LEGACY]
> Removed in **19.0**, with the replacement for each:
>
> - `propTypes` — TypeScript, or nothing.
> - `defaultProps` on function components — ES default parameters.
> - Legacy context, `contextTypes` and `getChildContext` — `createContext`.
> - String refs, `ref="input"` — a ref object or a ref callback.
> - Module pattern factories — a plain function that returns JSX.
> - `React.createFactory` — JSX.
> - `ReactDOM.render` — `createRoot(container).render(...)`.
> - `ReactDOM.hydrate` — `hydrateRoot(container, element)`.
> - `unmountComponentAtNode` — `root.unmount()`.
> - `ReactDOM.findDOMNode` — a ref to the node you want.
> - `react-dom/test-utils` — `act` now imports from `"react"`.
> - `react-test-renderer/shallow` — the `react-shallow-renderer` package.
> - `unstable_flushControlled`, `unstable_createEventHandle`,
>   `unstable_renderSubtreeIntoContainer`, `unstable_runWithPriority` — gone,
>   with no drop-in replacement.
> - UMD builds — an ESM CDN such as `esm.sh`.
>
> [Removed APIs](./removed-apis.md) has a before/after for every entry, what the
> failure looks like, and which codemod handles it.

The failures are not uniform. Some throw immediately, some silently do nothing.
The silent ones are the dangerous ones — a component that quietly loses its
prop defaults renders `undefined` rather than crashing.

## Step 5 — Fix deprecations

These still work in React 19. Nothing breaks if you postpone them, and it is
reasonable to postpone them until the app is green.

> [!DEPRECATED]
> Discouraged as of **19.0**, with removal signalled for a future major:
>
> - `forwardRef` — `ref` is an ordinary prop on function components now.
> - `<Context.Provider>` — render `<Context>` directly.
> - `element.ref` — read `element.props.ref`.
> - `react-test-renderer` — use `@testing-library/react`.
>
> [Deprecated APIs](./deprecated-apis.md) covers what each migration buys you
> and what actually breaks if you do nothing.

## Step 6 — Behavior changes that are not API removals

This is the part that catches teams who read only the removal list. None of
these are API changes; all of them can change what your app or your test suite
does.

### Errors are no longer double-logged

Before React 19, an error that reached React was reported and then re-thrown, so
you saw it twice in development — once from React and once from the browser's
own uncaught-error handling. React 19 stops re-throwing.

The new routing:

- **Uncaught** — an error no error boundary caught goes to `window.reportError`.
- **Caught** — an error an error boundary caught goes to `console.error`.

If your error reporting was wired to `window.onerror` or a global `unhandledrejection`
listener and relied on React re-throwing, it will now miss caught errors. Wire
the root options instead:

```tsx
import { createRoot } from 'react-dom/client';

function App() {
  return <h1>Dashboard</h1>;
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container, {
  onUncaughtError: (error, errorInfo) => {
    reportToService({ level: 'fatal', error, stack: errorInfo.componentStack });
  },
  onCaughtError: (error, errorInfo) => {
    reportToService({ level: 'error', error, stack: errorInfo.componentStack });
  },
  onRecoverableError: (error, errorInfo) => {
    reportToService({ level: 'warn', error, stack: errorInfo.componentStack });
  },
}).render(<App />);

function reportToService(payload: unknown) {
  console.error(payload);
}
```

All three callbacks take `(error, errorInfo)`, and `errorInfo.componentStack` is
the component stack for the failure. `hydrateRoot` accepts the same three
options.

> [!NOTE]
> `onRecoverableError` existed before 19; `onUncaughtError` and `onCaughtError`
> are new in **19.0**. Adding all three is the cheapest way to keep production
> error reporting honest through the upgrade.

### `errorInfo.digest` is gone from `onRecoverableError`

If you already had an `onRecoverableError` handler, check it. The `digest`
property was removed from the `errorInfo` argument in 19.0.

```diff
  onRecoverableError: (error, errorInfo) => {
-   logger.warn(error.message, { digest: errorInfo.digest });
+   logger.warn(error.message, { componentStack: errorInfo.componentStack });
  },
```

In JavaScript this reads `undefined` and your logs quietly lose a field. In
TypeScript it is a compile error, which is the better outcome.

### `javascript:` URLs in `src` and `href` now throw

React 18 warned about `<a href="javascript:...">`. React 19 errors.

```diff
- <a href="javascript:void(0)" onClick={handleClick}>Details</a>
+ <button type="button" onClick={handleClick}>Details</button>
```

If the value comes from data rather than a literal, the fix is to validate the
scheme before rendering it — which is what the warning was asking for all along.

React 19 also warns on, and refuses to set, an empty-string `src` or `href`
(anchors excepted). An empty `src` makes the browser re-request the current
page, so this is a real bug being surfaced, not pedantry.

### The `useId` prefix changed in 19.2

`useId` generates opaque IDs. The generated prefix changed: React 19.0 produced
IDs starting `:r:`, the 19.1 line used `«r»`, and **19.2 settled on `_r_`**. The
reason is that the earlier characters were not valid in CSS selectors or in
`view-transition-name` values.

This is the change most likely to break something quietly, because nothing about
it is a compile error. Anything that hard-codes the old prefix breaks:

```diff
- const field = container.querySelector('[id^=":r"]');
+ const field = screen.getByLabelText('Email');
```

Search your repo for the literal prefixes before you upgrade:

```bash
grep -rn ':r:\|«r»' src/ tests/ e2e/
```

Three places to check:

- **Snapshot tests.** Every snapshot containing a generated ID needs
  regenerating. That is noise, not breakage, but it is a large diff.
- **CSS and selectors.** A stylesheet or `querySelector` targeting the old
  escaped ID silently stops matching.
- **End-to-end tests** that locate elements by generated ID.

> [!BEST-PRACTICE]
> Do not select elements by a `useId` value at all. It is an opaque, unstable
> string by design. Query by role, label, or an explicit `data-testid`. If you
> need a stable prefix for multiple React roots on one page, pass
> `identifierPrefix` to `createRoot`.

### The new JSX transform is required

React 19 requires the modern JSX transform. Features such as `ref` as a prop
depend on it. If a package or your own build still uses the classic transform,
React warns that an outdated JSX transform is in use and points at
`react.dev/link/new-jsx-transform`.

Any current toolchain — Vite, Next.js, a recent Babel or SWC preset — already
does this. The ones that do not are old ejected webpack configs.

### Hydration mismatches report one error with a diff

React 19 replaces the old cluster of separate hydration errors with a single
message containing a diff of server versus client output. Nothing to migrate;
your existing mismatches will look different, and better.

### StrictMode got quieter and stricter

In development double rendering, `useMemo` and `useCallback` now reuse the
results from the first render pass, so memoized values stop being computed
twice. Ref callbacks are now double-invoked on initial mount, simulating a
component being replaced by a Suspense fallback — which surfaces ref setup
without cleanup.

A codebase already clean under StrictMode should not notice. A codebase that is
not clean will notice, and the finding is real.

## What to adopt after you upgrade, in priority order

Do none of this in the upgrade pull request. Each item below is independently
valuable and independently revertible.

**1. Root error options.** Fifteen minutes, and it restores production error
reporting after the double-logging change. Covered above.

**2. `ref` as a prop.** Function components receive `ref` in props since 19.0,
so the old wrapper comes off as you touch each component. See
[Deprecated APIs](./deprecated-apis.md) and [useRef](../hooks/use-ref.md).

**3. Render the context object itself as the provider.** `<Theme value={theme}>`
rather than the older nested form. Mechanical, and it shortens every provider in
the app. See [Context](../state-management/context.md).

**4. Actions for forms.** [`useActionState`](../hooks/use-action-state.md),
[`useFormStatus`](../hooks/use-form-status.md) and
[`useOptimistic`](../hooks/use-optimistic.md) replace the pending/error/reset
state most form components hand-roll. Start with the single most complicated
form in the app. See [Forms and actions](../patterns/forms-and-actions.md).

**5. Document metadata.** Rendering `<title>` and `<meta>` from a component
removes an entire category of head-management dependency. See
[Document metadata](../patterns/document-metadata.md).

**6. The React Compiler.** It memoizes for you, and it is the reason to stop
hand-writing `useMemo`. Adopt it after the app is on 19 and lint-clean, not
during. See [React Compiler](../performance/react-compiler.md).

**7. `useEffectEvent` (19.2).** Removes the "I need this value but I do not want
it in the dependency array" ref dance. See
[useEffectEvent](../hooks/use-effect-event.md).

**8. `<Activity>` (19.2).** For tabs, routes, and anything you currently unmount
and remount while losing its state. See [Activity](../performance/activity.md).

**9. Server Components**, if and only if your framework supports them and you
have a data-fetching problem they solve. This is an architecture change, not an
upgrade step. See [Server React](../server-react/overview.md).

## Common mistakes

**Installing React 19 first.** Every warning React 18 would have given you
individually arrives at once, in production build output, without the
explanatory message. Step 1 exists for a reason.

**Stopping at a version below 19.2.4.** 19.2.1 fixed the first RSC advisory and
is widely quoted as "the patched version". It is not. 19.0.3, 19.1.4 and 19.2.3
were incomplete patches for the second round. The floor is 19.2.4.

**Running the codemods and not reading the diff.** They are conservative and
skip anything ambiguous. The skipped code is precisely what you must fix by
hand.

**Forgetting `types-react-codemod`.** The source codemod recipe does not touch
types. A TypeScript app that runs only the first command gets a wall of type
errors that look like a broken install.

**Assuming caught errors still reach `window.onerror`.** They do not, since
19.0. If nobody wires `onCaughtError`, error-boundary-caught failures stop
appearing in your monitoring and the dashboards look better than the app is.

**Hard-coding `useId` output.** Any test, selector or stylesheet matching `:r:`
broke in 19.2. It fails silently — the selector simply stops matching.

**Upgrading and adopting at once.** A pull request that bumps the version *and*
converts forms to Actions cannot be bisected when something regresses. Separate
commits, separate reviews.

**Leaving a duplicate React in the tree.** `npm ls react` before you debug
anything. Two copies of React produce hook errors that point at innocent
components.

**Treating class components as part of the upgrade.** They work in React 19 and
are not deprecated. Converting them is
[a separate project](./legacy-codebases.md).

## Related topics

- [Removed APIs](./removed-apis.md) — the before/after for everything step 4
  lists, with the codemod for each.
- [Deprecated APIs](./deprecated-apis.md) — what still works, and what migrating
  actually buys you.
- [Legacy codebases](./legacy-codebases.md) — strategy for a large old app,
  class components, and getting ready for the React Compiler.
- [Installation](../getting-started/installation.md) — a fresh React 19 setup,
  including the root options in context.
- [StrictMode](../core-concepts/strict-mode.md) — what the double-invoke is
  looking for before you turn it off.
- [Legacy archive](./legacy-archive.md) — the previous documentation, preserved
  with a banner on every page.
