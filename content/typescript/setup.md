---
title: TypeScript setup
description: Configure TypeScript for React 19 and migrate the type-level breaking changes in @types/react 19.
group: typescript
order: 10
status: current
since: "19.0"
related: [typescript/typing-props, typescript/typing-hooks, getting-started/installation, migration/react-18-to-19]
---

## Overview

React ships no types of its own. The types live in the `@types/react` and
`@types/react-dom` packages on DefinitelyTyped, versioned to match the React
major. For React 19 you want both at `19.x`.

The compiler options that matter are small in number, and the version-specific
part of the work is not configuration at all — it is a handful of deliberate
breaking changes in `@types/react` 19 that fire the moment you upgrade.

## Why it exists

React's public API is almost entirely untyped JavaScript with an unusually
flexible surface: props are arbitrary objects, `children` can be almost
anything, and every DOM element has its own attribute set. TypeScript can model
all of that, but only if it knows which JSX factory you compile to and which
element namespace to check against. That is what `jsx` and `@types/react` supply.

## When to use it

Use TypeScript for any React codebase that more than one person touches. Props
are the seams between components, and props are exactly what TypeScript checks
best — most React bugs that survive to production are a component receiving a
shape it did not expect.

## When not to use it

A throwaway prototype or a single-file demo does not need a build step. If you
are learning React itself, learn it in JavaScript first — typing a component you
do not yet understand teaches you the type system, not React.

## Basic example

Install React and the matching types. Pin the runtime packages at `19.2.8` and
allow patch updates on the types.

:::tabs
== npm
```bash
npm install react@19.2.8 react-dom@19.2.8
npm install --save-dev typescript @types/react@^19.2.0 @types/react-dom@^19.2.0
```
== pnpm
```bash
pnpm add react@19.2.8 react-dom@19.2.8
pnpm add -D typescript @types/react@^19.2.0 @types/react-dom@^19.2.0
```
== yarn
```bash
yarn add react@19.2.8 react-dom@19.2.8
yarn add -D typescript @types/react@^19.2.0 @types/react-dom@^19.2.0
```
:::

A `tsconfig.json` for a bundled client app:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["react", "react-dom"]
  },
  "include": ["src"]
}
```

> [!WARNING]
> React Server Components had two rounds of security advisories. Resolve
> `react` and `react-dom` to **19.2.4 or later** — the 19.2.3 patch was
> incomplete. Pinning `19.2.8` as above satisfies that floor.

## How it works

| Option | Why it is set that way |
|---|---|
| `"jsx": "react-jsx"` | Compiles JSX to the automatic runtime. You no longer import `React` just to write JSX, and the `JSX` types are pulled from `react/jsx-runtime`. |
| `"lib"` | `DOM` gives you `HTMLInputElement`, `Element`, `EventTarget` — the element types every React event generic is parameterized by. Without it, `@types/react` falls back to empty stub interfaces and every DOM property access fails. |
| `"moduleResolution": "bundler"` | Matches how Vite, webpack and esbuild actually resolve. It reads the `exports` map in `@types/react`, which is how `react/jsx-runtime` and `react/canary` resolve at all. |
| `"strict": true` | Non-negotiable. Without `strictNullChecks`, `useRef<HTMLInputElement>(null)` reports `current` as always present and every ref you touch lies to you. |
| `"types"` | Restricts which `@types/*` packages are loaded globally. Listing them explicitly stops an unrelated transitive dependency's globals from leaking into your program. Omit the key to load all of them. |
| `"isolatedModules"` + `"verbatimModuleSyntax"` | Every bundler transpiles one file at a time. These two make TypeScript reject code that only works with whole-program knowledge, and force `import type` where you mean a type-only import. |
| `"skipLibCheck": true` | Skips checking `.d.ts` files you did not write. Almost always correct; a mismatched transitive `@types/react` is the one thing it hides, and the next section shows how to catch that directly. |

### One copy of `@types/react`, or nothing works

If two versions of `@types/react` end up in `node_modules`, JSX from one library
is not assignable to `ReactNode` from the other, and the errors are unreadable.

```bash
npm ls @types/react @types/react-dom
```

More than one version means a dependency pinned an 18.x range. Force a single
copy with `overrides` (npm), `resolutions` (yarn) or `pnpm.overrides`:

```json
{
  "overrides": {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0"
  }
}
```

## Common patterns

### Run the type migration codemod first

The `@types/react` 19 changes are mechanical. Run the preset before you start
fixing errors by hand:

```bash
npx types-react-codemod@latest preset-19 ./src
```

Two of the individual codemods are worth knowing by name because you will hit
their errors even in a new project:

```bash
npx types-react-codemod@latest react-element-default-any-props ./src
npx types-react-codemod@latest no-implicit-ref-callback-return ./src
```

### `ReactElement` props default to `unknown`

In `@types/react` 19, `ReactElement` is declared as
`interface ReactElement<P = unknown, ...>`. Before 19 that default was `any`, so
reaching into an unknown element's props silently type-checked.

```tsx
import type { ReactElement } from 'react';

// Explicit type argument: unchanged, still { id: string }.
type LabelProps = ReactElement<{ id: string }>['props'];

export function readLabelId(props: LabelProps): string {
  return props.id;
}
```

Without the type argument, `element.props` is now `unknown` and you must narrow
before reading anything from it. The `react-element-default-any-props` codemod
inserts an `as any` at each site so you can migrate incrementally, but the honest
fix is a real check.

### Ref callbacks may not return a value

Since React 19 a ref callback may return a cleanup function, so TypeScript can
no longer allow an implicit return of anything else — it cannot tell an
assignment expression's value from a cleanup function.

```diff
- <input ref={current => (inputEl = current)} />
+ <input ref={current => { inputEl = current; }} />
```

That is what `no-implicit-ref-callback-return` fixes. Adding the braces is the
whole change.

### `useRef` requires an argument

`@types/react` 19 collapsed the old mutable/immutable ref split into one
`RefObject<T>` with a plain `current: T`, and every overload now takes an
initial value.

```text
function useRef<T>(initialValue: T): RefObject<T>;
function useRef<T>(initialValue: T | null): RefObject<T | null>;
function useRef<T>(initialValue: T | undefined): RefObject<T | undefined>;
```

`useRef()` with no argument is an error; write `useRef(undefined)`. See
[Typing hooks](./typing-hooks.md#useref) for what this means in practice.

### The `JSX` namespace is scoped under `React.JSX`

The global `JSX` namespace is gone. Two UI libraries can no longer fight over
one global `IntrinsicElements`. Augmenting it now needs a `declare module`
wrapper, and the module specifier depends on your `jsx` option — with
`"jsx": "react-jsx"` it is `react/jsx-runtime`:

```ts
// src/custom-elements.d.ts
import 'react';

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'temperature-gauge': { celsius: number; label?: string };
    }
  }
}
```

Inside your own code, refer to `React.JSX.Element` rather than a bare
`JSX.Element`. The `scoped-jsx` codemod rewrites both cases.

## Advanced example

A shared `Button` that proves the whole setup is wired correctly — automatic
JSX runtime, `strict`, DOM lib, and `ref` as an ordinary prop:

```tsx
import type { ComponentPropsWithRef } from 'react';

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'ghost';
};

export function Button({ variant = 'primary', ...rest }: ButtonProps) {
  return <button data-variant={variant} {...rest} />;
}

export function SaveBar() {
  return (
    <div className="save-bar">
      <Button variant="ghost" type="button">Cancel</Button>
      <Button type="submit">Save changes</Button>
    </div>
  );
}
```

If that compiles under `strict`, your configuration is correct. If `<button>` is
not a known element, `lib` is missing `DOM`. If `ref` is rejected on `Button`,
you are still resolving `@types/react` 18.

> [!NOTE]
> Before React 19 a component could not receive `ref` through ordinary props at
> all. Since **19.0**, `ref` is a regular prop on function components, which is
> why `ComponentPropsWithRef<'button'>` spreads cleanly onto your own component.

## Common mistakes

**Upgrading `react` but not `@types/react`.** The runtime accepts `ref` as a
prop and the types reject it. Upgrade both in the same commit.

**Leaving `strict` off "for now".** Every ref, every optional prop and every
context value is typed as if it can never be null. The types agree with you
about everything and catch nothing.

**Omitting `DOM` from `lib`.** `@types/react` ships empty stub interfaces for
React Native users who compile without the DOM lib. You get `Element`,
`HTMLElement` and friends as names with no members, and every property access on
an event target fails for a reason the error message never mentions.

**Reaching for `any` when `ReactElement['props']` becomes `unknown`.** That
change exists because the access was unsound. Narrow the value, or type the
element with an explicit props argument.

**Declaring `IntrinsicElements` in a global `namespace JSX`.** It compiled
before React 19 and silently does nothing now. Wrap it in
`declare module 'react/jsx-runtime'`.

**Trusting `skipLibCheck` to paper over duplicate types.** It suppresses errors
*inside* `.d.ts` files, not the assignability failures between two copies of
`ReactNode`. Run `npm ls @types/react`.

## Related topics

- [Typing props](./typing-props.md) — the patterns you will reach for first, and
  what replaced the removed prop-defaulting APIs.
- [Typing hooks](./typing-hooks.md) — the `useRef` and `useReducer` signature
  changes in `@types/react` 19, in context.
- [Installation](../getting-started/installation.md) — installing React 19
  itself and the security version floor.
- [React 18 to 19](../migration/react-18-to-19.md) — the runtime half of the
  upgrade that these type changes accompany.
- [Generic components](./generic-components.md) — where the compiler options
  above start to matter for real.
