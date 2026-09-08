---
title: Built-in components and APIs
description: React 19's built-in components, its DOM behaviors, and every top-level API that is not a hook.
group: reference
order: 20
status: current
since: "19.2"
shape: reference
---

Three lists: the components React exports, the DOM elements React gives special
behavior to, and the top-level functions that are neither components nor hooks.
Anything not on these lists is not part of React 19's stable public surface.

## Built-in components

### `<Fragment>` — group nodes without a wrapper element

| Prop | Type | Notes |
|---|---|---|
| `children` | `ReactNode` | The nodes to group. |
| `key` | `string \| number` | Only usable on the explicit `<Fragment>` form, never on `<>`. |

Returns several elements from one component without adding a `<div>` to the DOM.
The shorthand `<>...</>` is identical except that it accepts no props, so a
fragment inside a `map` that needs a `key` must be written out in full.

```tsx
import { Fragment } from 'react';

type Term = { id: string; word: string; definition: string };

export default function Glossary({ terms }: { terms: Term[] }) {
  return (
    <dl>
      {terms.map((term) => (
        <Fragment key={term.id}>
          <dt>{term.word}</dt>
          <dd>{term.definition}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
```

Covered properly in [JSX](../core-concepts/jsx.md) and
[Lists and keys](../core-concepts/lists-and-keys.md).

### `<StrictMode>` — extra development-only checks

`StrictMode` accepts no props other than `children`.

| Prop | Type | Notes |
|---|---|---|
| `children` | `ReactNode` | The subtree to check. Usually the whole app. |

In development it makes React:

- re-render your components an extra time, to surface impure render logic
- re-run Effects an extra time (setup → cleanup → setup), to surface missing
  cleanup
- re-run ref callbacks an extra time, to surface missing ref cleanup
- warn about deprecated APIs

None of this happens in the production build, and none of it is a bug to be
worked around — if double invocation breaks your component, the component was
already broken. Covered in [Strict Mode](../core-concepts/strict-mode.md).

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function Dashboard() {
  return <h1>Dashboard</h1>;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Dashboard />
    </StrictMode>
  );
}
```

### `<Suspense>` — show a fallback while children load

| Prop | Type | Notes |
|---|---|---|
| `children` | `ReactNode` | The real UI. If it suspends, the fallback shows instead. |
| `fallback` | `ReactNode` | The placeholder. A skeleton beats a spinner. |

Suspense activates for: code loaded with `lazy`, a promise read with `use`,
stylesheets loaded through `<link rel="stylesheet" precedence>`, and HTML still
streaming from the server.

> [!WARNING]
> Suspense does **not** detect data fetched inside an Effect or an event handler.
> A component that fetches in `useEffect` and calls `setState` never suspends —
> the fallback never appears at all.

Boundary reveals are batched: React reveals content at most once every 300ms, so
boundaries that resolve close together appear together instead of flashing in one
at a time. In **19.2** this batching also applies to SSR reveals.

Covered in [Suspense](../data-fetching/suspense.md) and
[Code splitting](../performance/code-splitting.md).

### `<Profiler>` — measure render cost programmatically

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | Identifies this subtree in the callback. |
| `onRender` | `function` | Called after every commit inside the subtree. |

`onRender` receives, in order:

| Parameter | Type | Meaning |
|---|---|---|
| `id` | `string` | The `id` prop of the tree that committed. |
| `phase` | `"mount" \| "update" \| "nested-update"` | Whether this was a first mount or a re-render. |
| `actualDuration` | `number` (ms) | Time spent rendering this tree for this commit. |
| `baseDuration` | `number` (ms) | Estimated time to render the whole subtree with no memoization. |
| `startTime` | `number` | When React began this update. |
| `commitTime` | `number` | When React committed this update. |

```jsx
import { Profiler } from 'react';

function ProductList() {
  return (
    <ul>
      <li>Wireless keyboard</li>
      <li>Standing desk</li>
    </ul>
  );
}

export default function Storefront() {
  return (
    <Profiler
      id="ProductList"
      onRender={(id, phase, actualDuration) => {
        console.log(id, phase, actualDuration);
      }}
    >
      <ProductList />
    </Profiler>
  );
}
```

Profiling adds overhead, so keep it out of hot paths in production. Covered in
[Profiling](../performance/profiling.md), alongside the Performance Tracks that
19.2 added to Chrome DevTools.

### `<Activity>` — hide UI without unmounting it

Added in **19.2**.

| Prop | Type | Notes |
|---|---|---|
| `children` | `ReactNode` | The UI to hide and restore. |
| `mode` | `'visible' \| 'hidden'` | Defaults to `'visible'` when omitted. |

With `mode="hidden"` React hides the children with `display: none`, destroys
their Effects and cleans up subscriptions, but **keeps their state**. The
children may still re-render at a lower priority in response to new props.
Switching back to `'visible'` restores the state and re-creates the Effects.

```text
<Activity mode={isOpen ? 'visible' : 'hidden'}>
  <FilterPanel />
</Activity>
```

This is what you want instead of `{isOpen && <FilterPanel />}` when unmounting
would throw away scroll position, form input or a fetched list. Covered in
[Activity](../performance/activity.md).

## DOM behaviors that act like components

React 19 gives four ordinary HTML elements behavior that used to require a
library. These are not React exports — you write the plain tag.

### `<form action>`

Pass a **function** to `action` and React runs it as an Action: in a Transition,
with `FormData` as its only argument, and with every uncontrolled field reset
after it succeeds. The HTTP method is always POST when `action` is a function,
whatever `method` says. A `<button>`, `<input type="submit">` or
`<input type="image">` can override it with `formAction`.

```tsx
export default function SearchForm() {
  async function search(formData: FormData) {
    const query = formData.get('query');
    console.log(query);
  }

  return (
    <form action={search}>
      <input name="query" />
      <button type="submit">Search</button>
    </form>
  );
}
```

Pass a **string** and the form behaves exactly like plain HTML. Covered in
[Forms and Actions](../patterns/forms-and-actions.md).

### `<title>`, `<meta>`, `<link>` hoisting

Render these anywhere in the tree and React moves the real DOM node into
`<head>`. You no longer need a helmet library for per-page metadata.

```text
<title>Acme: Contact us</title>
<meta name="description" content="How to reach the Acme support team." />
<link rel="canonical" href="https://example.com/contact" />
```

> [!WARNING]
> Render one `<title>` at a time. If two components render a `<title>`
> simultaneously React puts both in the head, and what browsers and search
> engines do then is undefined.

Hoisting is skipped when the element carries `itemProp`, `onLoad` or `onError`,
and for stylesheets that have no `precedence`. Covered in
[Document metadata](../patterns/document-metadata.md).

### `<link rel="stylesheet" precedence>`

`precedence` is what opts a stylesheet into React's handling. It does three
things: it ranks the `<link>` against other stylesheets in `<head>` (values
discovered earlier rank lower, so later ones win), it deduplicates by `href`, and
it makes the rendering component **suspend** until the sheet has loaded — so
content never paints unstyled.

```text
<link rel="stylesheet" href="/checkout.css" precedence="default" />
<link rel="stylesheet" href="/checkout-theme.css" precedence="high" />
```

### `<script async>` deduplication

Give a `<script>` both `src` and `async={true}` and React hoists it to `<head>`
and deduplicates it by `src`. Several components can render the same third-party
script and only one `<script>` element ends up in the DOM.

```text
<script async src="https://example.com/map-api.js" />
```

React ignores prop changes after the script has rendered, and may leave the
element in the DOM after the component unmounts. Both are deliberate.

## Top-level APIs

### From `react`

| API | Signature | What it does |
|---|---|---|
| `createElement` | `createElement(type, props, ...children)` | Creates an element. JSX compiles to something equivalent; write JSX. |
| `cloneElement` | `cloneElement(element, props, ...children)` | Copies an element with merged props. Rare, and fragile. |
| `isValidElement` | `isValidElement(value)` | Reports whether a value is a React element. |
| `Children` | `Children.map / forEach / count / only / toArray` | Traverses the opaque `children` prop. **Discouraged.** |
| `lazy` | `lazy(load)` | Defers loading a component's code until it first renders. |
| `memo` | `memo(Component, arePropsEqual?)` | Skips a re-render when props are shallowly equal by `Object.is`. |
| `startTransition` | `startTransition(action)` | Marks updates non-urgent, without the pending flag `useTransition` gives you. |
| `act` | `act(async () => { ... })` | Flushes renders and effects in tests. Imported from `react` since **19.0**. |
| `cache` | `cache(fn)` | Memoizes a data fetch or computation. **Server Components only.** |
| `cacheSignal` | `cacheSignal()` | Returns an `AbortSignal` for the current `cache()` lifetime. **Server Components only**, added **19.2**. |
| `createContext` | `createContext(defaultValue)` | Creates a context. In 19 the context object itself renders as the provider. |
| `captureOwnerStack` | `captureOwnerStack()` | Returns the current Owner Stack as a string. Development builds only. |

Notes on the sharp edges:

- **`Children` is discouraged.** React's own pitfall reads: "Using `Children` is
  uncommon and can lead to fragile code." The recommended alternatives are
  exposing multiple components (`<RowList><Row/></RowList>`), accepting an array
  of objects as a prop, or taking a render prop. See
  [Composition](../patterns/composition.md).
- **`cache` and `cacheSignal` do nothing useful in Client Components.**
  `cacheSignal()` returns `null` there, and a `cache`d function called outside a
  component still runs but neither reads nor writes the cache. See
  [Caching](../data-fetching/caching.md).
- **`createContext` in 19:** render `<ThemeContext value={theme}>` directly. The
  `.Provider` sub-component still works but is no longer the way to write it.
- **`startTransition` vs `useTransition`:** use the standalone function when you
  have no component to hold the pending flag, for example inside a store or a
  router.

### From `react-dom`

| API | Signature | What it does |
|---|---|---|
| `createPortal` | `createPortal(children, domNode, key?)` | Renders children into a different DOM node while keeping them in the React tree. |
| `flushSync` | `flushSync(callback)` | Forces React to apply the updates in `callback` and update the DOM synchronously. |
| `preload` | `preload(href, options)` | Fetches a stylesheet, font, image or script you expect to need. |
| `preinit` | `preinit(href, options)` | Fetches **and evaluates** a script, or fetches and inserts a stylesheet. |
| `preconnect` | `preconnect(href)` | Opens a connection to a server you expect to request from. |
| `prefetchDNS` | `prefetchDNS(href)` | Resolves the DNS name of a server you expect to connect to. |
| `preloadModule` | `preloadModule(href, options)` | Fetches an ESM module you expect to use. |
| `preinitModule` | `preinitModule(href, options)` | Fetches and evaluates an ESM module. |

`flushSync` opts out of batching and out of concurrent rendering for the duration
of the callback. It hurts performance and can force a component to render before
it is ready — use it only when a browser API needs the DOM updated before the
next line runs, such as before `print()` or before setting selection.

The four resource APIs are hints to the browser, not guarantees. See
[Code splitting](../performance/code-splitting.md) and
[Portals](../patterns/portals.md).

### From `react-dom/client`

| API | Signature | What it does |
|---|---|---|
| `createRoot` | `createRoot(domNode, options?)` | Creates a root that renders React into a browser DOM node. |
| `hydrateRoot` | `hydrateRoot(domNode, reactNode, options?)` | Attaches React to server-rendered HTML in a DOM node. |

Both accept the same options, several of which are new in **19.0**:

| Option | Since | What it does |
|---|---|---|
| `onCaughtError` | 19.0 | Runs when an Error Boundary catches an error. |
| `onUncaughtError` | 19.0 | Runs when an error reaches the root uncaught. |
| `onRecoverableError` | | Runs when React recovers automatically, for example from a hydration mismatch. |
| `identifierPrefix` | | Prefixes every `useId` value. Must match between server and client. |

A root also exposes `root.render(node)` and `root.unmount()`. See
[SSR and hydration](../server-react/ssr-and-hydration.md) and
[Error boundaries](../patterns/error-boundaries.md).

## Deprecated

> [!DEPRECATED]
> `forwardRef` still works in React 19, but it is no longer necessary: since
> **19.0**, `ref` is an ordinary prop on function components. React's own
> reference says it "will be deprecated in a future release." Write
> `function TextField({ ref }) { ... }` and pass `ref` through like any other
> prop. The codemod `npx codemod@latest react/19/migration-recipe` rewrites
> existing call sites for you.

> [!DEPRECATED]
> Rendering a context through its `.Provider` property is deprecated in **19.0**.
> Render the context object itself: `<ThemeContext value={theme}>`.

See [Deprecated APIs](../migration/deprecated-apis.md) for the full list, and
[Removed APIs](../migration/removed-apis.md) for what no longer exists at all.

## Common mistakes

- **Putting a `key` on `<>`.** The shorthand takes no props. Write
  `<Fragment key={id}>`.
- **Expecting `<Suspense>` to catch an Effect's fetch.** It cannot. Move the read
  to `use()` or to a Suspense-enabled data library.
- **Rendering `<title>` in two components at once.** Both end up in `<head>` and
  the result is undefined.
- **Omitting `precedence` on a stylesheet `<link>`.** Without it React does not
  hoist the sheet, does not deduplicate it, and does not suspend for it.
- **Dropping `async` from a hoisted `<script>`.** Deduplication requires both
  `src` and `async={true}`; React will not move a synchronous script.
- **Using `<Activity mode="hidden">` and expecting Effects to keep running.**
  They are torn down. Keep a subscription alive by hoisting it above the
  `<Activity>`.
- **Calling `cache()` outside a component.** The function still runs; the cache is
  never consulted.
- **Reaching for `Children.map` to inspect or clone children.** Pass data as a
  prop or take a render prop instead.
- **Wrapping an event handler in `flushSync` to "make state update now."** It
  works, and it costs you concurrent rendering for that update. Almost always the
  wrong tool.

## Related topics

- [Hooks reference](./hooks-reference.md) — the other half of React's public API.
- [Cheat sheet](./cheat-sheet.md) — these signatures next to the JSX, prop and
  TypeScript rules.
- [Strict Mode](../core-concepts/strict-mode.md) — what the double invocation is
  actually checking for.
- [Document metadata](../patterns/document-metadata.md) — hoisted `<title>`,
  `<meta>` and stylesheet precedence in practice.
- [Forms and Actions](../patterns/forms-and-actions.md) — `<form action>` with
  `useActionState` and `useFormStatus`.
- [Removed APIs](../migration/removed-apis.md) — what React 19 deleted, and the
  replacement for each.
