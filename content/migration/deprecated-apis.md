---
title: Deprecated APIs
description: What still works in React 19 but must not appear in new code, and what migrating each one actually buys you.
group: migration
order: 30
status: deprecated
since: "19.0"
related: [migration/react-18-to-19, migration/removed-apis, hooks/use-ref, state-management/context]
shape: reference
---

Four APIs survived React 19 but should not appear in code you write today. They
are not on the [removed list](./removed-apis.md) — your app still runs, your
build still passes, and in three of the four cases nothing even warns.

That makes them easy to postpone, and postponing them is a defensible choice
during an upgrade. What is not defensible is writing new code with them, because
every one of them has a replacement that is shorter and clearer.

> [!DEPRECATED]
> Everything on this page still works in React 19. Fixing it is a cleanup, not a
> repair. Do it after [the upgrade](./react-18-to-19.md) is green, a directory at
> a time.

## The table

| API | Replacement | Since | Warns today? | Codemod |
|---|---|---|---|---|
| `forwardRef` | `ref` as an ordinary prop | 19.0 | No | Promised, not in the published recipe |
| `<Context.Provider>` | render `<Context>` directly | 19.0 | No | Promised, not in the published recipe |
| `element.ref` | `element.props.ref` | 19.0 | **Yes** | None |
| `react-test-renderer` | `@testing-library/react` | 19.0 | **Yes** | None |

Two of these are documented as *future* deprecations rather than current ones.
React's own reference page for the ref wrapper states that it is no longer
necessary and that it will be deprecated in a future release; the React 19
announcement says the same about the provider component. Treat both as settled:
the replacement exists, the direction is public, and the code you write now will
outlive the deprecation.

## `forwardRef`

### Why it was deprecated

Before React 19, `ref` was not a prop. React stripped it out of the props object
on its way through, so a function component could never see it. `forwardRef`
existed to hand the stripped-out ref back through a second argument.

Since **19.0** `ref` is a regular prop on function components. The wrapper has
nothing left to do.

### The mechanical replacement

:::tabs
== Before (React 18)
```jsx legacy
import { forwardRef } from 'react';

const TextField = forwardRef(function TextField({ label }, ref) {
  return (
    <label>
      {label} <input ref={ref} />
    </label>
  );
});
```
== After (React 19)
```jsx
export function TextField({ label, ref }) {
  return (
    <label>
      {label} <input ref={ref} />
    </label>
  );
}
```
:::

In TypeScript, `ref` becomes a normal optional prop with a `Ref<T>` type:

```tsx
import type { Ref } from 'react';

interface TextFieldProps {
  label: string;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, ref }: TextFieldProps) {
  return (
    <label>
      {label} <input ref={ref} />
    </label>
  );
}
```

The call site does not change at all. That is the point — this is a change
inside the component, invisible to every consumer.

### What it buys you

- One less wrapper in the React DevTools tree, and one less anonymous
  `ForwardRef` entry to squint at.
- A component you can name normally, memoize normally, and give default props
  to normally.
- Generic components that actually work. Typing a generic component wrapped in
  the old helper required a cast or a module augmentation; as a plain prop the
  generic parameter flows through. See
  [Generic components](../typescript/generic-components.md).

### What breaks if you do nothing

Nothing, today. The wrapper works in 19.2.8 and does not warn. It is scheduled
for removal in a future major, so the cost of waiting is that the eventual
codemod runs over a larger codebase.

> [!NOTE]
> A component using the wrapper and a component taking `ref` as a prop are
> interchangeable from the outside. You can convert one component at a time,
> in any order, with no coordination.

## `<Context.Provider>`

### Why it was deprecated

`createContext` returns an object that was only ever useful through two
properties: `.Provider` and `.Consumer`. Since **19.0** the context object is
itself a valid component, so the `.Provider` indirection is redundant.

### The mechanical replacement

:::tabs
== Before (React 18)
```jsx legacy
import { createContext, useState } from 'react';

const ThemeContext = createContext('light');

function Layout({ children }) {
  const [theme, setTheme] = useState('dark');
  return (
    <ThemeContext.Provider value={theme}>
      <button onClick={() => setTheme('light')}>Light</button>
      {children}
    </ThemeContext.Provider>
  );
}
```
== After (React 19)
```jsx
import { createContext, useState } from 'react';

const ThemeContext = createContext('light');

export function Layout({ children }) {
  const [theme, setTheme] = useState('dark');
  return (
    <ThemeContext value={theme}>
      <button onClick={() => setTheme('light')}>Light</button>
      {children}
    </ThemeContext>
  );
}
```
:::

Delete `.Provider` from the opening and closing tags. Nothing else moves.

### What it buys you

- Shorter, less noisy providers, which matters when an app root nests six of
  them.
- Consistency with how you read the value: `useContext(ThemeContext)` and
  `use(ThemeContext)` both take the context object, and now so does the JSX.

### What breaks if you do nothing

Nothing. It works and does not warn. React's own documentation now describes the
`.Provider` form as what you use "in older versions of React".

`Context.Consumer` is in the same position: still functional, and superseded by
[`useContext`](../hooks/use-context.md) or [`use`](../hooks/use.md) for anything
written this decade.

> [!TIP]
> This is the one deprecation worth doing during the upgrade rather than after.
> It is a find-and-replace with no behavior change, and it removes the last
> reason to look up which form a file uses.

## `element.ref`

### Why it was deprecated

A JSX element is an object, and code that inspects children — a design-system
component cloning its children to inject props, for instance — sometimes read
`element.ref` off it.

Now that `ref` is a prop, it lives in `element.props` like every other prop.
Keeping a top-level `element.ref` alias would mean two sources of truth.

### The mechanical replacement

:::tabs
== Before (React 18)
```jsx legacy
function hasRef(element) {
  return element.ref != null;
}
```
== After (React 19)
```jsx
export function hasRef(element) {
  return element.props.ref != null;
}
```
:::

The same applies when you clone. `cloneElement(child, { ref })` sets it through
props, which is now the only place it lives.

### What it buys you

Correctness rather than convenience. This is the one entry on the page that
actively warns, so leaving it produces console noise on every access — and in a
component that renders in a list, that is a console full of duplicates.

### What breaks if you do nothing

React logs a deprecation warning each time you read the property. The read still
returns the ref. The failure mode is noise now and a `undefined` read after the
eventual removal, which will be silent — so fix these while the warning is still
pointing at them.

> [!WARNING]
> In TypeScript this migration has a second half. React 19 types the props of a
> `ReactElement` as `unknown` rather than `any`, so `element.props.ref` no
> longer type-checks without narrowing. Run
> `npx types-react-codemod@latest react-element-default-any-props ./src` to
> restore the old looseness as a stopgap, then narrow properly.

## `react-test-renderer`

### Why it was deprecated

It renders a component tree to a plain JavaScript object rather than to a DOM.
That made sense when jsdom was slow and React Native had no other option. It
means your tests assert on React's internal tree shape instead of on anything a
user can perceive, so they break on refactors and pass on real bugs.

React 19 also switched the package to concurrent rendering, so even its output
is no longer the thing older suites were written against.

### The mechanical replacement

There is not one, and that is the honest answer. The testing model is different,
not the API.

:::tabs
== Before (React 18)
```jsx legacy
import TestRenderer from 'react-test-renderer';
import { PriceTag } from './PriceTag';

const tree = TestRenderer.create(<PriceTag amount={1250} currency="USD" />);
const text = tree.root.findByType('span').children[0];
expect(text).toBe('USD 12.50');
```
== After (React 19)
```jsx
import { render, screen } from '@testing-library/react';
import { PriceTag } from './PriceTag';

test('formats the amount in the given currency', () => {
  render(<PriceTag amount={1250} currency="USD" />);
  expect(screen.getByText('USD 12.50')).toBeInTheDocument();
});
```
:::

The rewrite is usually smaller than it looks, because most `findByType` queries
were standing in for "the thing the user reads", which is exactly what a
role or text query expresses directly.

For React Native, `@testing-library/react-native` is the equivalent.

### What it buys you

- Tests that survive a refactor. Renaming a wrapper element does not change what
  a user sees, so it should not change the test.
- Tests that catch real regressions. An element rendered but hidden, or
  unreachable by keyboard, fails a role query and passes a tree query.
- One fewer deprecated dependency, and no console warning in every test run.

### What breaks if you do nothing

React 19 logs a deprecation warning. Your suite still runs. Since the package
moved to concurrent rendering in 19, some timing-sensitive tests will need `act`
wrapping they did not need before — imported from `"react"` now, not from the
removed test utilities module.

See [Testing Library](../testing/testing-library.md) and
[act and async tests](../testing/act-and-async.md).

## Doing the migration

An order that keeps each step reviewable:

1. **`<Context.Provider>` → `<Context>`.** Find-and-replace, no behavior change,
   do it during the upgrade.
2. **`element.ref` → `element.props.ref`.** Small, and it silences a real
   warning. The compiler finds them for you in TypeScript.
3. **The ref wrapper.** Convert opportunistically — every component you were
   going to touch anyway. Do not open a pull request that converts four hundred
   components at once; nobody can review it.
4. **`react-test-renderer`.** The largest job, because it is a rewrite rather
   than a replacement. Convert per test file, starting with the suite that
   breaks most often. That suite is breaking because it asserts on structure.

> [!BEST-PRACTICE]
> Add lint rules once a category is clean so it stays clean. A codebase that
> converts everything and then merges a pull request reintroducing the old form
> has spent the effort and kept the problem.

## Common mistakes

**Treating "still works" as "still fine".** These are the APIs the next major
removes. Every new component written with them is future migration work
committed today.

**Converting the ref wrapper and forgetting the types.** Removing the wrapper in
a `.tsx` file leaves a component whose props interface has no `ref`. Add
`ref?: Ref<HTMLInputElement>` — or the appropriate element type — or the call
site stops type-checking.

**Adding `ref` to a props type as `any`.** It has a real type. `Ref<T>` accepts a
ref object, a ref callback, or `null`, and using it means the wrong element type
is caught at the call site.

**Renaming the component while removing the wrapper.** Two changes in one diff,
and the review cannot tell a rename from a behavior change. Separate commits.

**Swapping `react-test-renderer` for the shallow renderer package.** That is a
sideways move to a package with the same structural-assertion problem. See
[Removed APIs](./removed-apis.md).

**Silencing the `element.ref` warning with a console filter.** The warning is
the only thing telling you where the reads are. After the removal they become
silent `undefined` reads.

**Assuming a codemod exists for all four.** Only the types transform for element
props ships in the published preset today. The other three are hand work, which
is an argument for doing them incrementally rather than saving them up.

## Related topics

- [Removed APIs](./removed-apis.md) — what React 19 actually deleted, and why
  this page is the shorter list.
- [React 18 to 19](./react-18-to-19.md) — where these fit in the upgrade order.
- [useRef](../hooks/use-ref.md) — refs as props, ref callbacks, and cleanup
  functions.
- [Context](../state-management/context.md) — the current provider form in
  context, and when a context is the wrong tool.
- [Testing Library](../testing/testing-library.md) — the replacement testing
  model, not just the replacement package.
- [Legacy codebases](./legacy-codebases.md) — sequencing this work in an app too
  large to convert at once.
