---
title: Context
description: Pass a value to an entire subtree without threading it through every component in between.
group: state-management
order: 20
status: current
since: "19.0"
related: [hooks/use-context, hooks/use, state-management/reducers-and-context]
---

## Overview

Context lets a component provide a value to everything below it in the tree, and
lets any descendant read that value without receiving it as a prop. You create a
context with `createContext`, render it as a provider, and read it with
`useContext` or `use`. Since **React 19.0** the context object itself is the
provider: you render `<ThemeContext value={theme}>` directly.

```jsx
import { createContext, useContext } from 'react';

const ThemeContext = createContext('light');

function Toolbar() {
  const theme = useContext(ThemeContext);
  return <div className={theme}>Toolbar</div>;
}

export default function App() {
  return (
    <ThemeContext value="dark">
      <Toolbar />
    </ThemeContext>
  );
}
```

> [!DEPRECATED]
> Before React 19 the provider was a separate `.Provider` component, shown
> below. It still works in 19, but do not write new code this way — render the
> context object itself.

```jsx legacy
import { createContext } from 'react';

const ThemeContext = createContext('light');

// React 18 style. Deprecated in React 19 — render <ThemeContext> instead.
export default function App() {
  return <ThemeContext.Provider value="dark">Content</ThemeContext.Provider>;
}
```

A codemod rewrites existing providers across a codebase:

```bash
npx codemod@latest react/19/migration-recipe
```

## Why it exists

Props are explicit, which is a feature until the value is needed by a hundred
components in twelve subtrees. Threading `currentUser` through every layout,
page and panel means every intermediate component takes a prop it never reads.

Context is **dependency injection**. A provider says "everything under here runs
with this value"; a consumer says "give me whatever the nearest provider has".
Neither knows about the other, and that is the whole feature.

> [!WARNING]
> Context is a transport mechanism, not a state manager. It does not store
> anything, it does not batch, it has no selectors, and it has no devtools. The
> state still lives in a `useState` or `useReducer` somewhere; context only
> decides who can see it.

## When to use it

Use context for values that are **wide** and **rarely change**:

- Theme, color scheme, design tokens.
- Locale and translation functions.
- The authenticated user and session.
- A router's current location (routers do this internally).
- A form's or a compound component's internal wiring — `<Tabs>` telling its
  `<Tab>` children which one is selected.

That last case is the most under-used one. A context scoped to one component
family is excellent — the provider is rendered by `<Tabs>`, the consumers are
its own children, and the "global state" objection does not apply.

## When not to use it

**To avoid two levels of props.** Try [lifting state up](./lifting-state-up.md)
and [composition](../patterns/composition.md) first: passing `children` deletes
most prop drilling with no indirection at all.

**For high-frequency state.** Mouse position, scroll offset, the contents of a
text input — every consumer re-renders on every change, and you cannot opt out
of part of the value.

**For server data.** Caching a fetch response in context gives you no
revalidation, no deduplication, and no request cancellation. See
[Choosing an approach](./choosing-an-approach.md).

**As a global variable.** A context holding fifteen unrelated fields re-renders
every consumer whenever any of the fifteen changes.

## Basic example

The default value, a custom hook that throws when the provider is missing, and a
memoized value — the three things a production context almost always has.

```jsx live
import { createContext, useContext, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

function useTheme() {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return theme;
}

function ThemeProvider({ children }) {
  const [mode, setMode] = useState('light');

  const value = useMemo(
    () => ({
      mode,
      toggle: () => setMode((current) => (current === 'light' ? 'dark' : 'light')),
    }),
    [mode],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

function Card() {
  const { mode, toggle } = useTheme();
  const dark = mode === 'dark';
  const style = {
    padding: 16,
    borderRadius: 8,
    background: dark ? '#1f2933' : '#f5f7fa',
    color: dark ? '#f5f7fa' : '#1f2933',
  };

  return (
    <div style={style}>
      <p>Current mode: {mode}</p>
      <button onClick={toggle}>Toggle theme</button>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Card />
    </ThemeProvider>
  );
}
```

### The default value, and the bug it hides

`createContext(defaultValue)` supplies the value when a consumer has **no
matching provider above it**. It is a last-resort fallback: static, and never
changing.

That makes a plausible-looking default dangerous. Write
`createContext({ user: null, login: () => {} })`, forget the provider, and
nothing throws — components render as if nobody is signed in and you debug the
wrong thing for an hour.

Prefer `createContext(null)` plus a custom hook that throws, so the failure is a
clear error naming the missing provider at the component that needed it. Give a
real default only when the context is genuinely optional and the fallback is
genuinely correct — a theme defaulting to `'light'` qualifies.

## How it works

React walks up from the consumer to the nearest provider of that context object
and returns its `value`. There is no matching by name or by shape — the identity
of the context object is what matters, so every file must import the same
module. Nesting is allowed: an inner provider shadows an outer one for its own
subtree, which is how per-section themes and per-form scopes work.

### Reading with `use`

Since **19.0**, `use(Context)` reads context and — unlike `useContext` — may be
called conditionally, including after an early return.

```jsx
import { use, createContext } from 'react';

const ThemeContext = createContext('light');

export default function Heading({ children }) {
  if (children == null) return null;

  // useContext could not be called here: it is after a conditional return.
  const theme = use(ThemeContext);
  return <h1 className={theme}>{children}</h1>;
}
```

`use` is still render-only. It is not an escape hatch for reading context inside
an event handler or an Effect. Details in [`use`](../hooks/use.md).

### The re-render model

This is the part that decides whether context works for you:

> [!NOTE]
> Every component that reads a context re-renders whenever the provider's
> `value` changes identity, compared with `Object.is`. Not when a field inside
> it changes — when the identity changes.

Three consequences follow.

**1. An inline object re-renders everything, always.** A fresh object literal has
a new identity on every render of the provider, so every consumer re-renders on
every parent render — even when nothing the consumer reads has changed.

```jsx
import { createContext, useState } from 'react';

const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 🔴 New object identity on every render: every consumer re-renders.
  return <AuthContext value={{ user, setUser }}>{children}</AuthContext>;
}
```

The fix is to give the value a stable identity:

```jsx
import { createContext, useMemo, useState } from 'react';

const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // ✅ Identity changes only when `user` changes.
  const value = useMemo(() => ({ user, setUser }), [user]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
```

> [!NOTE]
> The [React Compiler](../performance/react-compiler.md) memoizes values like
> this automatically in projects that enable it. Write the `useMemo` anyway
> unless the compiler is on: a context provider is one of the few places where
> the memoization is load-bearing rather than speculative.

**2. `memo` does not stop it.** `memo` compares props. Context is not a prop, so
a memoized component still re-renders when a context it reads changes. Wrapping
consumers in `memo` to fix context re-renders does nothing.

**3. There is no selector.** You cannot subscribe to `value.user.name` and
ignore the rest. `useContext` returns the whole value, and any change to its
identity notifies you. Every workaround people invent — passing selector
functions, storing a subscribable object in the context — is a re-implementation
of an [external store](./external-stores.md), which is the tool designed for it.

### Two escapes from the re-render problem

**Split the context** so that parts changing on different schedules live in
different contexts, and consumers subscribe only to what they need. **Split
value from actions**: setters and dispatch functions are stable for the lifetime
of the component, so a context holding only actions never changes identity and
its consumers never re-render. That is the shape described in
[Reducers and context](./reducers-and-context.md).

## Common patterns

### One module per context

Export the provider component and the custom hook; keep the context object
private to the module, so nothing can read it without the validating hook.

### Compose providers by nesting, not by merging

Five focused contexts nest into a slightly deeper tree, which costs nothing at
runtime. One merged mega-context costs a re-render of every consumer on every
change. If the nesting bothers you, collect it in an `AppProviders` component.

### Scope a context to a component family

`<Tabs>`, `<Accordion>`, `<Menu>` and `<Form>` can render a provider that only
their own children consume. This gives compound components a clean API without
any global state.

### Give actions a stable identity

Wrap callbacks in `useCallback`, or define them inside a `useMemo` with an empty
dependency array when they only use the functional form of a setter. Identity
that never changes is what makes the split-context pattern pay off.

## Advanced example

Two contexts over one piece of state. `CountDisplay` reads the value and
re-renders when it changes. `ActionBar` reads only the actions, which never
change identity, so its render count stays put.

```jsx live
import { createContext, useContext, useMemo, useRef, useState } from 'react';

const CounterValueContext = createContext(null);
const CounterActionsContext = createContext(null);

function CounterProvider({ children }) {
  const [count, setCount] = useState(0);

  // No dependencies: these callbacks are created once and keep their identity.
  const actions = useMemo(
    () => ({
      increment: () => setCount((current) => current + 1),
      reset: () => setCount(0),
    }),
    [],
  );

  return (
    <CounterActionsContext value={actions}>
      <CounterValueContext value={count}>{children}</CounterValueContext>
    </CounterActionsContext>
  );
}

function useRenderCount() {
  const renders = useRef(0);
  renders.current += 1;
  return renders.current;
}

function CountDisplay() {
  const count = useContext(CounterValueContext);
  const renders = useRenderCount();
  return (
    <p>
      Count: <strong>{count}</strong> — rendered {renders} times
    </p>
  );
}

function ActionBar() {
  const actions = useContext(CounterActionsContext);
  const renders = useRenderCount();
  return (
    <p>
      <button onClick={actions.increment}>Increment</button>{' '}
      <button onClick={actions.reset}>Reset</button> — rendered {renders} times
    </p>
  );
}

export default function App() {
  return (
    <CounterProvider>
      <CountDisplay />
      <ActionBar />
    </CounterProvider>
  );
}
```

Two mechanisms keep `ActionBar` still, and both matter. Its element is created
in `App`, which does not re-render, so `CounterProvider` re-rendering produces no
new element for it. And it subscribes only to the actions context, whose value
identity never changes. Break either — read the value context in `ActionBar`, or
move its JSX inside `CounterProvider` — and the render count starts climbing.

> [!NOTE]
> In development, [StrictMode](../core-concepts/strict-mode.md) double-invokes
> component functions, so a render counter kept in a ref can advance by two at a
> time. Compare the two numbers to each other, not to your expectation.

## Common mistakes

**An inline object as the value.** `value={{ user, setUser }}` re-renders every
consumer on every provider render. Memoize it, or split it.

**No provider, no error.** A friendly default value turns a missing provider
into silently wrong behavior. Default to `null` and throw from a custom hook.

**Two copies of the context object.** Two modules each calling `createContext`
for "the same" context produce two independent contexts, and consumers of one
never see providers of the other. A duplicated module instance from a bundler
misconfiguration causes the same symptom.

**Putting fast-changing state in context.** Input values, scroll position and
pointer coordinates in a widely consumed context make the whole tree render at
input speed — and `memo` will not save you, because it compares props and
context is not a prop.

**One context for the entire app.** Every consumer becomes a subscriber to every
field. Split by change frequency, not by feature tidiness.

**Reading context outside render.** `useContext` obeys the
[rules of hooks](../hooks/rules-of-hooks.md), and `use` is render-only. Read
during render and close over the value in your handler.

**Expecting a selector.** There is none. If you need "re-render only when
`cart.itemCount` changes", you need an [external store](./external-stores.md).

## Related topics

- [useContext](../hooks/use-context.md) — the hook's full reference and caveats.
- [use](../hooks/use.md) — read context conditionally, and read promises.
- [Reducers and context](./reducers-and-context.md) — the state/dispatch split
  that makes context viable for real app state.
- [External stores](./external-stores.md) — what to use when you need selectors.
- [Composition](../patterns/composition.md) — the prop-drilling fix people skip
  on the way to context.
- [Choosing an approach](./choosing-an-approach.md) — where context sits.
