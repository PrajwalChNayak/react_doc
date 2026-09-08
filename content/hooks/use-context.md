---
title: useContext
description: Read a value provided higher up the tree without passing it through props.
group: hooks
order: 70
status: current
related: [state-management/context, hooks/use, state-management/choosing-an-approach]
---

## Overview

`useContext` reads the value of the nearest matching provider above the
component in the tree.

```text
const value = useContext(SomeContext)
```

- `SomeContext` — a context created with `createContext(defaultValue)`.
- Returns the `value` of the closest `<SomeContext>` above this component. If
  there is no provider above it, you get the `defaultValue` passed to
  `createContext`.

In React 19 the context object **is** the provider component:

```jsx
import { createContext, useContext } from 'react';

const ThemeContext = createContext('light');

function ThemedButton() {
  const theme = useContext(ThemeContext);
  return <button className={`btn btn--${theme}`}>Save</button>;
}

export default function App() {
  return (
    <ThemeContext value="dark">
      <ThemedButton />
    </ThemeContext>
  );
}
```

> [!DEPRECATED]
> Before React 19 you rendered `<ThemeContext.Provider value={...}>`. That still
> works in 19, but it is deprecated: render `<ThemeContext>` directly instead. A
> codemod handles the migration — `npx codemod@latest react/19/migration-recipe`.

```jsx legacy
// React 18 and earlier, and deprecated in React 19. Do not write new code like this.
import { createContext, useContext } from 'react';

const ThemeContext = createContext('light');

function ThemedButton() {
  const theme = useContext(ThemeContext);
  return <button className={`btn btn--${theme}`}>Save</button>;
}

export default function App() {
  return (
    <ThemeContext.Provider value="dark">
      <ThemedButton />
    </ThemeContext.Provider>
  );
}
```

## Why it exists

Props flow down one level at a time. When a value is needed by something ten
levels deep — the current theme, the signed-in user, the interface language, a
router — every component in between has to accept and forward a prop it does not
use. That is prop drilling, and it makes intermediate components harder to
reuse and harder to change.

Context is a way to say "this value is available to everything in this subtree".
The provider marks the boundary; any descendant reads it directly, no matter how
deep.

The trade is explicitness. A component reading context has a dependency you
cannot see at its call site. That is why context suits values that are genuinely
ambient — and suits ordinary application data much less well.

## When to use it

- **Themes and appearance**: light or dark, density, brand.
- **The authenticated user** and permissions.
- **Locale and formatting** preferences.
- **A router's current location**, which is what every routing library uses
  context for.
- **A design system's implicit configuration** — the current form's `id` prefix,
  a disabled state shared by a group of inputs.
- **A reducer's `dispatch`**, which is stable and therefore free to share widely.
  See [reducers and context](../state-management/reducers-and-context.md).

The shared trait: the value is read by many components, changes rarely, and is
genuinely about "where in the tree am I".

## When not to use it

- **As a general state manager.** Context is a transport mechanism, not a store.
  It has no selectors, so every consumer re-renders on every change, and no way
  to subscribe to part of a value. For frequently changing application state,
  read [choosing an approach](../state-management/choosing-an-approach.md).
- **For values that change many times a second** — cursor position, scroll
  offset, an animation frame, a text input's value. Every consumer re-renders on
  each change.
- **To avoid passing two props.** Prop drilling through one or two levels is
  cheaper and clearer than a context.
- **For server data.** A cache belongs in a data library. See
  [data fetching](../data-fetching/overview.md).
- **When composition solves it.** Passing `children` or an element as a prop
  often removes the intermediate props entirely, with no context at all. See
  [composition](../patterns/composition.md).
- **For an external store.** If the source of truth lives outside React, use
  [`useSyncExternalStore`](./use-sync-external-store.md); it lets components
  subscribe to precisely what they read.

## Basic example

```jsx live
import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext('light');

function Toolbar() {
  // Any depth, no props threaded through.
  return (
    <div>
      <ThemedButton label="Save" />
      <ThemedButton label="Cancel" />
    </div>
  );
}

function ThemedButton({ label }) {
  const theme = useContext(ThemeContext);
  return (
    <button
      style={{
        background: theme === 'dark' ? '#222' : '#eee',
        color: theme === 'dark' ? '#fff' : '#111',
        border: '1px solid #888',
        marginRight: 8,
      }}
    >
      {label}
    </button>
  );
}

export default function App() {
  const [theme, setTheme] = useState('light');
  return (
    <ThemeContext value={theme}>
      <Toolbar />
      <p>
        <button onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
          Switch to {theme === 'light' ? 'dark' : 'light'}
        </button>
      </p>
    </ThemeContext>
  );
}
```

## How it works

**Lookup is by identity, upward.** React walks up from the reading component
until it finds a provider for that exact context object. Not by name — by
reference. If your bundler produces two copies of the module that calls
`createContext` (a symlinked package, a duplicated dependency), providing and
reading will use different objects and the lookup silently falls through to the
default value.

**The default value is used only when there is no provider above.** It is not a
fallback for `undefined`: if a provider passes `undefined`, consumers get
`undefined`.

**A provider does not affect the component that renders it.** `useContext` in
the same component that renders `<SomeContext>` reads whatever is *above* that
component, not the value it provides.

**Across re-renders.** When a provider re-renders with a `value` that differs
under `Object.is`, React re-renders every descendant that reads that context —
starting from the provider, and **regardless of `memo`**. Memoizing a component
in between does not stop context updates from reaching consumers below it. That
is deliberate: consumers must always see a fresh value.

**With StrictMode.** Nothing specific to context. The double render in
development will, however, make an unstable provider value more visible in the
profiler.

**With concurrent rendering.** Context values are read during render, from the
same tree React is currently rendering, so consumers cannot see a value from a
different point in time. This is why context does not suffer the tearing problems
that a hand-rolled subscription can — and why external stores need
[`useSyncExternalStore`](./use-sync-external-store.md) rather than a plain
listener.

### Reading context conditionally with `use()`

`useContext` obeys the [Rules of Hooks](./rules-of-hooks.md): top level only.
Since React 19.0, `use()` can read a context inside a condition or a loop.

```jsx
import { createContext, use } from 'react';

const ThemeContext = createContext('light');

export default function Divider({ decorated }) {
  if (decorated) {
    const theme = use(ThemeContext); // allowed: use() is not a hook
    return <hr className={`rule rule--${theme}`} />;
  }
  return <hr />;
}
```

See [use](./use.md) for its full rules.

## Common patterns

### The object literal trap

This is the most common context performance bug.

```jsx
import { createContext, useState } from 'react';

const SessionContext = createContext({ userName: '', signOut: () => {} });

export default function SessionProviderSlow({ children }) {
  const [userName, setUserName] = useState('ada');

  // A brand-new object on every render of this component, so every consumer
  // re-renders even when userName has not changed.
  return (
    <SessionContext value={{ userName, signOut: () => setUserName('') }}>
      {children}
    </SessionContext>
  );
}
```

`{ userName, signOut }` is a fresh object each render. `Object.is` says it
changed, so every consumer in the subtree re-renders — including on renders
caused by something unrelated in the parent.

Two fixes, in order of preference.

**Provide values that do not need memoizing.** A string, a number, or a stable
`dispatch` never has this problem. Splitting one object context into two
contexts is often the whole fix.

**Memoize the value** when it must be an object:

```jsx
import { createContext, useState, useMemo, useCallback } from 'react';

const SessionContext = createContext({ userName: '', signOut: () => {} });

export default function SessionProvider({ children }) {
  const [userName, setUserName] = useState('ada');

  const signOut = useCallback(() => setUserName(''), []);
  const value = useMemo(() => ({ userName, signOut }), [userName, signOut]);

  return <SessionContext value={value}>{children}</SessionContext>;
}
```

> [!NOTE]
> The [React Compiler](../performance/react-compiler.md) memoizes provider values
> like this one automatically. On a compiled codebase you can write the object
> literal and let the compiler handle it — but check that the compiler is
> actually enabled for that file before relying on it.

### Split state from dispatch

If the value is "some state plus a way to change it", two contexts are better
than one. Components that only dispatch never re-render when the state changes.

```jsx live
import { createContext, useContext, useReducer } from 'react';

const initialCart = ['Keyboard'];

const CartContext = createContext(initialCart);
// A default that complains is better than one that silently does nothing.
const CartDispatchContext = createContext((action) => {
  console.warn('Cart dispatch called with no provider above:', action);
});

function cartReducer(items, action) {
  switch (action.type) {
    case 'added':
      return [...items, action.name];
    case 'cleared':
      return [];
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

function AddButton({ name }) {
  // Reads only dispatch, which never changes: this never re-renders
  // because of a cart update.
  const dispatch = useContext(CartDispatchContext);
  return <button onClick={() => dispatch({ type: 'added', name })}>Add {name}</button>;
}

function CartSummary() {
  const items = useContext(CartContext);
  return (
    <p>
      {items.length} item(s): {items.length > 0 ? items.join(', ') : 'none'}
    </p>
  );
}

export default function Store() {
  const [items, dispatch] = useReducer(cartReducer, initialCart);
  return (
    <CartContext value={items}>
      <CartDispatchContext value={dispatch}>
        <AddButton name="Keyboard" />{' '}
        <AddButton name="Monitor" />{' '}
        <button onClick={() => dispatch({ type: 'cleared' })}>Clear</button>
        <CartSummary />
      </CartDispatchContext>
    </CartContext>
  );
}
```

### Wrap the context in a custom hook

Export a hook, not the context object. It gives you one place for the "you
forgot the provider" error, and it lets you change the implementation later
without touching consumers.

```jsx
import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(
  /** @type {{ userName: string, signOut: () => void } | null} */ (null)
);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (auth === null) {
    throw new Error('useAuth must be called inside <AuthProvider>');
  }
  return auth;
}

export default function AuthProvider({ children }) {
  const [userName, setUserName] = useState('ada');
  const value = { userName, signOut: () => setUserName('') };
  return <AuthContext value={value}>{children}</AuthContext>;
}
```

A `null` default plus this check turns "the value is mysteriously empty" into a
clear error naming the missing provider.

> [!BEST-PRACTICE]
> Keep contexts small and single-purpose. One context per concern —
> `ThemeContext`, `AuthContext`, `LocaleContext` — re-renders far less than one
> `AppStateContext` holding all three.

## Advanced example

Providers nest, and the nearest one wins. That is what makes context useful for
scoped overrides rather than only for globals.

```jsx live
import { createContext, useContext, useState } from 'react';

const DensityContext = createContext('comfortable');

function Row({ label }) {
  const density = useContext(DensityContext);
  return (
    <div
      style={{
        padding: density === 'compact' ? '2px 6px' : '10px 6px',
        borderBottom: '1px solid #ccc',
      }}
    >
      {label} <small>({density})</small>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section style={{ border: '1px solid #999', marginBottom: 12 }}>
      <h3 style={{ margin: 4 }}>{title}</h3>
      {children}
    </section>
  );
}

export default function Settings() {
  const [density, setDensity] = useState('comfortable');

  return (
    <DensityContext value={density}>
      <button
        onClick={() =>
          setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))
        }
      >
        Toggle page density (now {density})
      </button>

      <Panel title="Follows the page">
        <Row label="Notifications" />
        <Row label="Privacy" />
      </Panel>

      {/* A nested provider overrides the value for its subtree only. */}
      <DensityContext value="compact">
        <Panel title="Always compact">
          <Row label="Advanced" />
          <Row label="Danger zone" />
        </Panel>
      </DensityContext>
    </DensityContext>
  );
}
```

Nothing between `Settings` and `Row` knows that density exists. Each `Row` reads
the closest provider above itself.

## Common mistakes

**Rendering a provider and expecting to read it in the same component.** The
lookup starts above the component that calls `useContext`. Move the read into a
child.

**A fresh object as the value on every render.** Every consumer re-renders,
forever. Memoize the value, split the context, or rely on the compiler.

**Assuming `memo` blocks context updates.** It does not. A memoized component
still re-renders when a context it reads changes.

**Using the default value as a fallback for a missing provider.** It works, but
it hides configuration bugs. Prefer `null` plus a custom hook that throws.

**One giant `AppContext`.** Any change re-renders every consumer of every field
in it.

**Treating context as a state manager.** No selectors, no partial subscriptions,
no devtools. When the value changes often, you need
[an external store](../state-management/external-stores.md).

**Putting a rapidly changing value in context.** A controlled input's value or a
mouse position will re-render the entire subtree on every event.

**Reading context in a condition with `useContext`.** That breaks the Rules of
Hooks. Use `use()` if the read must be conditional.

**Two copies of the context module.** Duplicated packages or symlinked
workspaces produce two distinct context objects, and the read silently falls back
to the default.

## Related topics

- [Context](../state-management/context.md) — designing providers for an application.
- [Reducers and context](../state-management/reducers-and-context.md) — sharing a reducer's state and dispatch.
- [use](./use.md) — reading context conditionally, since React 19.0.
- [useSyncExternalStore](./use-sync-external-store.md) — subscribing to a store outside React.
- [Choosing an approach](../state-management/choosing-an-approach.md) — where context stops being enough.
- [Composition](../patterns/composition.md) — the pattern that removes many contexts entirely.
