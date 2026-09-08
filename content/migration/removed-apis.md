---
title: Removed APIs
description: Every API React 19 deleted, what replaces it, which codemod handles it, and what the failure looks like.
group: migration
order: 20
status: legacy
since: "19.0"
related: [migration/react-18-to-19, migration/deprecated-apis, migration/legacy-codebases, migration/legacy-archive]
shape: reference
---

React 19.0 removed a set of APIs that had been deprecated and warning for years,
some of them since 2018. Everything here has a documented replacement — nothing
was removed without one.

This page is the reference for step 4 of
[the upgrade runbook](./react-18-to-19.md). Work top to bottom; the entries are
ordered roughly by how often they appear in real codebases.

> [!LEGACY]
> Every code block below tagged `legacy` shows **pre-React-19 code that no
> longer works**. It is here so you can recognize it in your own repository, not
> to copy.

## The table

| Removed in 19.0 | Replacement | Codemod |
|---|---|---|
| `propTypes` | TypeScript, or nothing | `react/prop-types-typescript` |
| `defaultProps` on function components | ES default parameters | `react/prop-types-typescript` |
| Legacy context: `contextTypes`, `getChildContext` | `createContext` | none |
| String refs: `ref="input"` | ref object or ref callback | `react/19/replace-string-ref` |
| Module pattern factories | a function that returns JSX | none |
| `React.createFactory` | JSX | none |
| `ReactDOM.render` | `createRoot(container).render(...)` | `react/19/replace-reactdom-render` |
| `ReactDOM.hydrate` | `hydrateRoot(container, element)` | `react/19/replace-reactdom-render` |
| `unmountComponentAtNode` | `root.unmount()` | `react/19/replace-reactdom-render` |
| `ReactDOM.findDOMNode` | a ref to the node | none |
| `react-dom/test-utils` | `act` from `"react"` | `react/19/replace-act-import` |
| `react-test-renderer/shallow` | `react-shallow-renderer` package | none |
| `unstable_flushControlled` | none | none |
| `unstable_createEventHandle` | none | none |
| `unstable_renderSubtreeIntoContainer` | none | none |
| `unstable_runWithPriority` | none | none |
| UMD builds | an ESM CDN such as `esm.sh` | none |

Most of the codemods run together:

```bash
npx codemod@latest react/19/migration-recipe
```

`defaultProps` on **class** components is not on this list. It still works.

## `propTypes`

Runtime prop validation. React 19 no longer reads the property.

**What the failure looks like:** nothing. The assignment is silently ignored and
your validation stops running. No error, no warning, no crash — which is why a
codebase can ship for months before noticing a whole class of bad props is no
longer being caught.

:::tabs
== Before (React 18)
```jsx legacy
import PropTypes from 'prop-types';

function InvoiceRow({ amount, currency }) {
  return <td>{currency} {amount.toFixed(2)}</td>;
}

InvoiceRow.propTypes = {
  amount: PropTypes.number.isRequired,
  currency: PropTypes.string.isRequired,
};
```
== After (React 19)
```tsx
interface InvoiceRowProps {
  amount: number;
  currency: string;
}

export function InvoiceRow({ amount, currency }: InvoiceRowProps) {
  return <td>{currency} {amount.toFixed(2)}</td>;
}
```
:::

If you are not on TypeScript, validate at the boundary where untrusted data
enters the app — the fetch response — rather than at every component. That is
where the bad data actually comes from, and it is a check that survives the
build.

**Codemod:** `npx codemod@latest react/prop-types-typescript`, included in the
migration recipe.

## `defaultProps` on function components

React 19 no longer applies `defaultProps` to function components. Class
components are unaffected.

**What the failure looks like:** the prop arrives as `undefined`. Depending on
the component that is a blank render, `NaN` in a calculation, or a
`Cannot read properties of undefined` at the first property access.

:::tabs
== Before (React 18)
```jsx legacy
function Pagination({ page, pageSize }) {
  return <span>Rows {(page - 1) * pageSize + 1}</span>;
}

Pagination.defaultProps = { page: 1, pageSize: 25 };
```
== After (React 19)
```jsx
export function Pagination({ page = 1, pageSize = 25 }) {
  return <span>Rows {(page - 1) * pageSize + 1}</span>;
}
```
:::

Default parameters are better than the old mechanism in one important way: they
are visible at the top of the component, next to the prop they belong to,
instead of in a separate assignment further down the file.

> [!WARNING]
> Default parameters apply when the prop is `undefined`, not when it is `null`.
> `defaultProps` behaved the same way, so this is not a change — but it is the
> most common bug people blame on the migration.

## Legacy context

The pre-16.3 context API: `contextTypes` on the consumer, `childContextTypes`
and `getChildContext` on the provider.

**What the failure looks like:** the context value is never delivered. The
consumer reads an empty object.

:::tabs
== Before (React 18)
```jsx legacy
import PropTypes from 'prop-types';
import { Component } from 'react';

class ThemeProvider extends Component {
  getChildContext() {
    return { theme: 'dark' };
  }
  render() {
    return this.props.children;
  }
}
ThemeProvider.childContextTypes = { theme: PropTypes.string };

class Button extends Component {
  render() {
    return <button className={this.context.theme}>Save</button>;
  }
}
Button.contextTypes = { theme: PropTypes.string };
```
== After (React 19)
```jsx
import { createContext, useContext } from 'react';

const ThemeContext = createContext('light');

function Button() {
  const theme = useContext(ThemeContext);
  return <button className={theme}>Save</button>;
}

export function Toolbar() {
  return (
    <ThemeContext value="dark">
      <Button />
    </ThemeContext>
  );
}
```
:::

There is no codemod. The shapes are too different — the old API passed a bag of
keys, the modern one passes one value per context object. Splitting one legacy
context into several `createContext` calls is usually the right conversion.

See [Context](../state-management/context.md).

## String refs

`ref="input"`, read back through `this.refs.input`.

**What the failure looks like:** React 19 errors when it encounters a string
ref. This one is loud.

:::tabs
== Before (React 18)
```jsx legacy
import { Component } from 'react';

class SearchField extends Component {
  componentDidMount() {
    this.refs.input.focus();
  }
  render() {
    return <input ref="input" />;
  }
}
```
== After (React 19)
```jsx
import { useEffect, useRef } from 'react';

export function SearchField() {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return <input ref={inputRef} />;
}
```
:::

If the component must stay a class, the codemod converts to a ref callback
storing the node on the instance rather than to a hook.

**Codemod:** `npx codemod@latest react/19/replace-string-ref`.

## Module pattern factories

A component that returned an object with a `render` method. React used to detect
this and treat the function as a factory.

**What the failure looks like:** React calls your function and tries to use the
returned object as JSX, producing an invalid-element-type error.

:::tabs
== Before (React 18)
```jsx legacy
function StatusBadge() {
  return {
    render() {
      return <span className="badge">Online</span>;
    },
  };
}
```
== After (React 19)
```jsx
export function StatusBadge() {
  return <span className="badge">Online</span>;
}
```
:::

There is no codemod. The pattern is rare enough that a repository-wide search
for `return {` followed by `render()` finds all of them in a few minutes.

## `React.createFactory`

A helper that pre-bound a component type so you could call it without JSX. It
predates JSX being universal.

:::tabs
== Before (React 18)
```jsx legacy
import { createFactory } from 'react';

const button = createFactory('button');

function Toolbar() {
  return button({ type: 'button' }, 'Save');
}
```
== After (React 19)
```jsx
export function Toolbar() {
  return <button type="button">Save</button>;
}
```
:::

**What the failure looks like:** `createFactory` is `undefined`, so the call
throws `TypeError: ... is not a function` at module evaluation.

If you genuinely cannot use JSX — a build with no compile step —
`createElement` is still available and is what the factory was wrapping.

## `ReactDOM.render`

The legacy root API. It is the single most common blocker in an old codebase,
because it is in the entry file of every app written before React 18.

**What the failure looks like:** the named import resolves to `undefined` and
the call throws a `TypeError`. Your app renders nothing at all.

:::tabs
== Before (React 18)
```jsx legacy
import { render } from 'react-dom';
import App from './App';

render(<App />, document.getElementById('root'));
```
== After (React 19)
```jsx
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(<App />);
```
:::

Three things change, not one:

- The import moves from `react-dom` to **`react-dom/client`**.
- You create a root **once** and call `render` on it. Re-rendering means calling
  `root.render(...)` again on the same root, not creating a second one.
- The root is concurrent. Automatic batching, transitions and Suspense behave
  as documented rather than as they did under the legacy root.

**Codemod:** `npx codemod@latest react/19/replace-reactdom-render`.

## `ReactDOM.hydrate`

The server-rendering counterpart of `ReactDOM.render`.

:::tabs
== Before (React 18)
```jsx legacy
import { hydrate } from 'react-dom';
import App from './App';

hydrate(<App />, document.getElementById('root'));
```
== After (React 19)
```jsx
import { hydrateRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

hydrateRoot(container, <App />);
```
:::

Note the argument order flips: the container comes first for `hydrateRoot`.
`hydrateRoot` returns a root, so you can call `root.render(...)` on it later, and
it accepts the same `onUncaughtError` / `onCaughtError` / `onRecoverableError`
options as `createRoot`.

**Codemod:** `react/19/replace-reactdom-render`.

## `unmountComponentAtNode`

Tearing down a tree by pointing at its container.

:::tabs
== Before (React 18)
```jsx legacy
import { unmountComponentAtNode } from 'react-dom';

unmountComponentAtNode(document.getElementById('widget'));
```
== After (React 19)
```jsx
import { createRoot } from 'react-dom/client';

const container = document.getElementById('widget');
if (!container) throw new Error('Missing #widget element');

const root = createRoot(container);
root.render(<p>Mounted</p>);

// Later, when the host page tears the widget down:
root.unmount();
```
:::

The consequence is that **you must keep a reference to the root**. Code that
mounted React into a container owned by another framework and unmounted it by
container lookup needs somewhere to store that root — a module-level `Map` keyed
by element is the usual answer.

After `root.unmount()` the root is dead; calling `render` on it again throws.

**Codemod:** `react/19/replace-reactdom-render` handles the simple cases.

## `ReactDOM.findDOMNode`

Given a component instance, walk to its DOM node. It was an escape hatch that
broke encapsulation, and it never worked with fragments or with components that
returned `null`.

**What the failure looks like:** `findDOMNode` is `undefined`, so the call
throws.

:::tabs
== Before (React 18)
```jsx legacy
import { Component } from 'react';
import { findDOMNode } from 'react-dom';

class AutoSelect extends Component {
  componentDidMount() {
    findDOMNode(this).select();
  }
  render() {
    return <input defaultValue="Order #4182" />;
  }
}
```
== After (React 19)
```jsx
import { useEffect, useRef } from 'react';

export function AutoSelect() {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return <input ref={inputRef} defaultValue="Order #4182" />;
}
```
:::

There is no codemod, because there is no mechanical translation: the fix is to
attach a ref at the element you actually wanted, which requires knowing which
element that was.

When the node belongs to a **child** component you do not control, pass a ref
down as a prop — since 19.0 that works on function components with no wrapper.
See [Refs and the DOM](../patterns/refs-and-dom.md).

## `react-dom/test-utils`

`act` moved to the `react` package. The other exports of `react-dom/test-utils`
were removed and now throw when called.

**What the failure looks like:** either an import error, or an explicit error
telling you the function was removed.

:::tabs
== Before (React 18)
```jsx legacy
import { act } from 'react-dom/test-utils';

await act(async () => {
  root.render(<Checkout />);
});
```
== After (React 19)
```jsx
import { act } from 'react';

export async function renderCheckout(root, Checkout) {
  await act(async () => {
    root.render(<Checkout />);
  });
}
```
:::

The other helpers — the simulated-event utilities in particular — have no direct
replacement and should not get one. Dispatch real events through
`@testing-library/user-event`, which is what those helpers were badly
approximating.

**Codemod:** `npx codemod@latest react/19/replace-act-import`.

See [act and async tests](../testing/act-and-async.md).

## `react-test-renderer/shallow`

Shallow rendering, moved out of React itself.

```bash
npm install --save-dev react-shallow-renderer
```

```diff
- import ShallowRenderer from 'react-test-renderer/shallow';
+ import ShallowRenderer from 'react-shallow-renderer';
```

The import swap keeps an existing suite compiling, and that is all it is for.
Shallow rendering asserts on the element tree your component returned rather
than on anything a user could observe, so the tests break whenever you refactor
and pass whenever the app is broken in a way the DOM would have shown.

> [!BEST-PRACTICE]
> Treat the package swap as a stopgap, and rewrite the tests against
> [`@testing-library/react`](../testing/testing-library.md). The parent package,
> `react-test-renderer`, is separately
> [deprecated](./deprecated-apis.md) in React 19.

## The `unstable_` APIs

Four internal APIs were removed with no replacement:

| Removed | What it was |
|---|---|
| `unstable_flushControlled` | forced a synchronous flush of a scoped update |
| `unstable_createEventHandle` | attached a React event listener imperatively to a DOM node |
| `unstable_renderSubtreeIntoContainer` | rendered a subtree into another container, carrying legacy context across |
| `unstable_runWithPriority` | ran a callback at a chosen scheduler priority |

**What the failure looks like:** the import is `undefined` and the call throws.

They were prefixed `unstable_` precisely so that this day could come without a
deprecation cycle. If your code calls one, it is almost certainly through a
library rather than directly — check your dependency tree before rewriting
anything:

```bash
grep -rn "unstable_" node_modules --include=*.js -l | head
```

The closest current equivalents, none of them drop-in:

- `unstable_flushControlled` — `flushSync` from `react-dom`, used sparingly.
- `unstable_createEventHandle` — a plain `addEventListener` in an Effect or a
  ref callback with a cleanup function.
- `unstable_renderSubtreeIntoContainer` — a
  [portal](../patterns/portals.md), or a second root.
- `unstable_runWithPriority` — [`useTransition`](../hooks/use-transition.md) for
  lowering priority, or `flushSync` for raising it.

## UMD builds

React 19 ships no UMD bundle. There is no `react.production.min.js` global build
to drop in with a `<script>` tag.

**What the failure looks like:** a 404 from your CDN, or `React is not defined`
if you copied a build from an old project.

:::tabs
== Before (React 18)
```html
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script>
  ReactDOM.render(React.createElement(App), document.getElementById('root'));
</script>
```
== After (React 19)
```html
<script type="module">
  import { createElement } from 'https://esm.sh/react@19.2.8';
  import { createRoot } from 'https://esm.sh/react-dom@19.2.8/client';

  function App() {
    return createElement('h1', null, 'Hello from React 19');
  }

  const root = createRoot(document.getElementById('root'));
  root.render(createElement(App));
</script>
```
:::

An ESM CDN such as `esm.sh` serves the modern build directly to the browser.
`type="module"` is required, and there is no global `React` — you import what
you need.

> [!NOTE]
> Pin the version in the URL. `https://esm.sh/react@19.2.8` is reproducible;
> `https://esm.sh/react` is whatever shipped this morning.

For anything beyond a sprinkle of interactivity on a server-rendered page, use a
build step. See [Installation](../getting-started/installation.md).

## Common mistakes

**Assuming a silent removal is a non-removal.** `propTypes` and function-component
`defaultProps` do not error — they stop working. Grep for them explicitly rather
than waiting for a crash.

**Running the codemods and shipping the diff unread.** They skip anything
ambiguous by design, and the skipped call sites are the ones that need a human.

**Creating a new root on every render.** The most common bad conversion of the
legacy render API is calling `createRoot(container).render(...)` inside a
function that runs more than once. Create the root once, keep it, and call
`render` on it.

**Losing the root reference.** Code that used to unmount by container lookup has
nothing to call `unmount()` on after the conversion. Store roots in a `Map`
keyed by container element.

**Swapping the shallow renderer package and calling the migration done.** The
tests still assert on element trees. That is the actual problem; the import was
a symptom.

**Reaching for `flushSync` everywhere** after losing `unstable_flushControlled`.
Synchronous flushes defeat concurrent rendering. Use one only when a browser API
must observe the DOM before the next line runs.

**Copying a React 18 UMD snippet from a blog post.** There is no React 19
equivalent. The answer is an ESM CDN or a bundler, not an older React.

**Treating class components as removed.** They are not on this page. They work
in React 19. See [Legacy codebases](./legacy-codebases.md).

## Related topics

- [React 18 to 19](./react-18-to-19.md) — the runbook these fixes belong to, and
  the behavior changes that are not removals.
- [Deprecated APIs](./deprecated-apis.md) — the things that still work but must
  not appear in new code.
- [Legacy codebases](./legacy-codebases.md) — converting classes, and
  incremental strategy for an app too large to rewrite.
- [Installation](../getting-started/installation.md) — what a correct React 19
  entry point looks like.
- [Legacy archive](./legacy-archive.md) — the previous documentation, including
  the pages that taught the APIs on this list.
