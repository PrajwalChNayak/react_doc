---
title: Hooks reference
description: Every built-in hook in React 19.2, grouped by purpose, with signatures and links.
group: reference
order: 10
status: current
since: "19.2"
shape: reference
---

Every hook React ships in 19.2, grouped by the problem it solves. Signatures use
`?` to mark an optional parameter, matching the notation on `react.dev`.

Two things to check before you copy a row:

- **The import module.** Every hook here comes from `react` except
  `useFormStatus`, which comes from `react-dom`.
- **The version.** A `Since` value means the hook did not exist in React 18. An
  empty `Since` means it has been there since hooks shipped in 16.8.

> [!NOTE]
> `use` is in the table below but it is **not** a hook. React documents it as an
> API precisely because it is exempt from the Rules of Hooks: you may call it
> inside an `if`, inside a loop, or after an early return.

## State

| Hook | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `useState` | `const [state, setState] = useState(initialState)` | Declares a state variable you update directly. | | [useState](../hooks/use-state.md) |
| `useReducer` | `const [state, dispatch] = useReducer(reducer, initialArg, init?)` | Declares a state variable whose update logic lives in a reducer. | | [useReducer](../hooks/use-reducer.md) |

`useState` is the default. Reach for `useReducer` when several fields change
together, when the next state depends on the current state in more than a couple
of ways, or when you want the update logic testable without rendering.

## Context

| Hook | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `useContext` | `const value = useContext(SomeContext)` | Reads and subscribes to a context. | | [useContext](../hooks/use-context.md) |

In React 19 you can also read a context with `use(SomeContext)`, which works
conditionally. See the [API row](#apis-that-are-not-hooks) below.

## Refs

| Hook | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `useRef` | `const ref = useRef(initialValue)` | Holds a mutable value that does not trigger a re-render. | | [useRef](../hooks/use-ref.md) |
| `useImperativeHandle` | `useImperativeHandle(ref, createHandle, dependencies?)` | Customizes the value a parent receives through `ref`. | | [useImperativeHandle](../hooks/use-imperative-handle.md) |

> [!NOTE]
> Since **19.0**, `ref` is an ordinary prop on function components, so
> `useImperativeHandle(ref, ...)` reads that prop directly. React 18 required a
> wrapper to receive the ref.

## Effects

| Hook | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `useEffect` | `useEffect(setup, dependencies?)` | Connects a component to an external system. | | [useEffect](../hooks/use-effect.md) |
| `useLayoutEffect` | `useLayoutEffect(setup, dependencies?)` | Fires before the browser repaints, so you can measure layout. | | [useLayoutEffect](../hooks/use-layout-effect.md) |
| `useInsertionEffect` | `useInsertionEffect(setup, dependencies?)` | Fires before React mutates the DOM, so a CSS-in-JS library can inject styles. | | *(covered below — no dedicated page)* |
| `useEffectEvent` | `const onEvent = useEffectEvent(callback)` | Extracts non-reactive logic out of an Effect so it stops re-running. | 19.2 | [useEffectEvent](../hooks/use-effect-event.md) |

Ordering within a commit: `useInsertionEffect` → DOM mutation →
`useLayoutEffect` → paint → `useEffect`.

### useInsertionEffect

`useInsertionEffect` has no dedicated page because almost nobody should call it.
React's own wording is blunt:

> `useInsertionEffect` is for CSS-in-JS library authors. Unless you are working
> on a CSS-in-JS library and need a place to inject the styles, you probably want
> `useEffect` or `useLayoutEffect` instead.

It exists to solve one problem: injecting a `<style>` rule *before* any layout
Effect reads geometry, so measurements are not taken against unstyled markup.

Caveats that make it unusable as a general Effect:

- Refs are **not** attached yet when it runs.
- You **cannot** update state from inside it.
- It does not run during server rendering.
- Cleanup and setup are interleaved one component at a time, unlike other Effects.

```tsx
import { useInsertionEffect } from 'react';

export function useInjectedStyleRule(rule: string) {
  useInsertionEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = rule;
    document.head.appendChild(styleElement);
    return () => {
      styleElement.remove();
    };
  }, [rule]);
}
```

## Performance

| Hook | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `useMemo` | `const cached = useMemo(calculateValue, dependencies)` | Caches the result of a calculation between renders. | | [useMemo](../hooks/use-memo.md) |
| `useCallback` | `const cached = useCallback(fn, dependencies)` | Caches a function identity between renders. | | [useCallback](../hooks/use-callback.md) |

> [!BEST-PRACTICE]
> Measure before you memoize, and check whether the
> [React Compiler](../performance/react-compiler.md) already does this for you.
> Compiler v1.0 shipped 7 October 2025 and inserts these caches automatically.

## Transitions and responsiveness

| Hook | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `useTransition` | `const [isPending, startTransition] = useTransition()` | Marks updates as non-blocking and gives you a pending flag. | | [useTransition](../hooks/use-transition.md) |
| `useDeferredValue` | `const deferred = useDeferredValue(value, initialValue?)` | Renders a stale copy of a value while the fresh one renders in the background. | `initialValue` 19.0 | [useDeferredValue](../hooks/use-deferred-value.md) |

`startTransition` accepts an async function. Only the state updates scheduled
**synchronously** inside it are part of the Transition — anything after an
`await` needs its own `startTransition`.

## Forms and Actions

| Hook | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `useActionState` | `const [state, formAction, isPending] = useActionState(action, initialState, permalink?)` | Runs an action, keeps its returned state, and reports pending status. | 19.0 | [useActionState](../hooks/use-action-state.md) |
| `useFormStatus` | `const { pending, data, method, action } = useFormStatus()` | Reads the submission status of the **parent** `<form>`. Imports from `react-dom`. | 19.0 | [useFormStatus](../hooks/use-form-status.md) |
| `useOptimistic` | `const [optimisticState, addOptimistic] = useOptimistic(state, updateFn?)` | Shows a provisional value while an action is in flight. | 19.0 | [useOptimistic](../hooks/use-optimistic.md) |

Details worth memorizing:

- `useFormStatus` is the only hook on this page imported from `react-dom`, not
  `react`. It also only reports on a `<form>` **above** the calling component —
  calling it in the same component that renders the `<form>` returns
  `pending: false` forever.
- `useFormStatus` returns `method` as `'get'` or `'post'`, and `action` as the
  function passed to the parent form, or `null` when the form's `action` is a
  URL string.
- `addOptimistic` must be called inside an action or a `startTransition`.

## Other built-ins

| Hook | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `useId` | `const id = useId()` | Generates an ID stable across server and client, for `htmlFor` / `aria-*`. | | [useId](../hooks/use-id.md) |
| `useSyncExternalStore` | `const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)` | Subscribes to a store outside React, safely under concurrent rendering. | | [useSyncExternalStore](../hooks/use-sync-external-store.md) |
| `useDebugValue` | `useDebugValue(value, format?)` | Labels a custom hook in React DevTools. | | [useDebugValue](../hooks/use-debug-value.md) |

> [!WARNING]
> `useId` output is opaque and its format is not part of the public contract.
> The prefix changed from `:r:` to `_r_` in **19.2**. Never use a `useId` value
> as a CSS selector or hard-code it in a test.

## APIs that are not hooks

| API | Signature | What it does | Since | Page |
|---|---|---|---|---|
| `use` | `const value = use(resource)` | Reads a promise (suspending until it settles) or a context. **Not a hook** — callable inside conditions and loops. | 19.0 | [use](../hooks/use.md) |

React's own wording: "Despite its name, `use` is not a Hook." That is the whole
point of it. Everything else on this page must be called unconditionally at the
top level of a component or custom hook.

## Dependency arrays

Four of these hooks take a dependency array, and they all read it the same way.

| Argument | Meaning |
|---|---|
| Omitted (`useEffect(setup)`) | Re-runs after **every** render. Almost always a mistake. |
| `[]` | Runs on mount, cleans up on unmount. Under StrictMode: setup, cleanup, setup. |
| `[a, b]` | Re-runs when any listed value changes by `Object.is`. |

`useMemo` and `useCallback` require the array — omitting it defeats them
entirely. `useEffect`, `useLayoutEffect`, `useInsertionEffect` and
`useImperativeHandle` accept it as optional.

The array is not a trigger list you choose; it is a declaration of what the
function reads. If the linter wants a dependency you do not want to react to, the
answer is `useEffectEvent` or an updater function, never a disable comment.

## Choosing between neighbors

| | `useMemo` | `useCallback` |
|---|---|---|
| Caches | The **result** of calling the function | The **function itself** |
| Signature | `useMemo(() => compute(a), [a])` | `useCallback((x) => send(a, x), [a])` |
| Use for | An expensive calculation, or a stable object identity | A stable handler for a `memo`'d child or a dep array |

| | `useState` | `useRef` |
|---|---|---|
| Change re-renders | Yes | No |
| Safe to read during render | Yes | No |
| Safe to write during render | No | No |
| Value per render | Frozen snapshot | Always the latest |

| | `useTransition` | `useDeferredValue` |
|---|---|---|
| You control | The update that causes the work | Only the value |
| Gives you | `isPending` plus `startTransition` | A lagging copy of the value |
| Typical use | Tab switch, route change, filter submit | A search box feeding an expensive list |

| | `useEffect` | `useEffectEvent` |
|---|---|---|
| Runs | After commit, when deps change | Only when you call it, from inside an Effect |
| Reads | The values from the render it closed over | Always the latest committed values |
| In a dep array | Its deps go in the array | **Never** goes in the array |

| | `useContext` | `useSyncExternalStore` |
|---|---|---|
| Source | A provider in the React tree | A store outside React |
| Re-renders | Every consumer when `value` changes | Only when the snapshot changes |
| Tearing under concurrency | Not possible | Prevented by the hook |

## What changed since React 18

| Hook | Change | Version |
|---|---|---|
| `useActionState` | New. Replaced the short-lived `useFormState` from `react-dom`. | 19.0 |
| `useFormStatus` | New, in `react-dom`. | 19.0 |
| `useOptimistic` | New. | 19.0 |
| `useDeferredValue` | Gained the optional `initialValue` parameter. | 19.0 |
| `useImperativeHandle` | Takes the `ref` prop directly; no wrapper function needed. | 19.0 |
| `useEffectEvent` | New, and stable. | 19.2 |
| `useId` | Generated prefix changed from `:r:` to `_r_`. | 19.2 |

`use` also arrived in 19.0, though it is an API rather than a hook.

## Which hook do I want

- **A value that changes and should re-render the UI** → `useState`.
- **The same, but several fields move together or the transitions are a state
  machine** → `useReducer`.
- **A value that changes but must not re-render** (a timer id, a previous value,
  a DOM node) → `useRef`.
- **A DOM node to focus, measure or scroll** → `useRef` plus a `ref` prop.
- **A value shared deep down the tree** → `useContext`, or `use(Context)` when
  the read is conditional.
- **Subscription to something outside React** (a browser API, a store, a socket)
  → `useSyncExternalStore`. Not an Effect.
- **A side effect that synchronizes with an external system** → `useEffect`.
- **An Effect that reads a prop but must not re-run when it changes** →
  `useEffectEvent`.
- **A measurement that must happen before paint** → `useLayoutEffect`.
- **Injecting stylesheet rules from a styling library** → `useInsertionEffect`.
- **A slow calculation repeated every render** → `useMemo`.
- **A function identity that must stay stable for a memoized child or an Effect
  dependency** → `useCallback`.
- **A navigation or filter that makes typing stutter** → `useTransition` when you
  own the update, `useDeferredValue` when you only own the value.
- **A submit handler with pending, error and result state** → `useActionState`.
- **A submit button that should disable itself** → `useFormStatus`, in a child of
  the form.
- **Instant feedback before the server confirms** → `useOptimistic`.
- **An ID to wire a `<label>` to an `<input>`** → `useId`.
- **Nothing on this list** → you probably want plain derived state computed
  during render, or an event handler. Neither needs a hook.

## Common mistakes

- **Importing `useFormStatus` from `react`.** It is exported by `react-dom`. This
  is the single most common import error on this page.
- **Calling `useFormStatus` in the component that renders the `<form>`.** It
  reads the status of a form *above* it. Put the button in its own component.
- **Treating `use` like a hook, or the reverse.** `use` may be called
  conditionally; nothing else here may. Conditional `useState` produces
  "Rendered more hooks than during the previous render."
- **Reaching for `useInsertionEffect` because it "runs earliest."** It cannot set
  state and refs are not attached. You want `useLayoutEffect`.
- **Returning a fresh object from `useSyncExternalStore`'s `getSnapshot`.** Every
  call returns a new reference, so React re-renders forever. Return the stored
  value itself, or cache the snapshot.
- **Adding an Effect Event to a dependency array.** Its identity intentionally
  changes every render; listing it defeats the purpose and reintroduces the loop.
- **Memoizing everything by hand.** `useMemo` and `useCallback` have a cost of
  their own, and the React Compiler now covers most of this ground.
- **Hard-coding a `useId` value.** The format is not stable across versions — it
  changed in 19.2.

## Related topics

- [Rules of Hooks](../hooks/rules-of-hooks.md) — the constraints every hook on
  this page shares, and why `use` is exempt.
- [Custom hooks](../hooks/custom-hooks.md) — composing these built-ins into your
  own reusable logic.
- [Built-in components and APIs](./built-in-components.md) — the non-hook half of
  the React surface.
- [Cheat sheet](./cheat-sheet.md) — the same signatures next to JSX, events and
  TypeScript types, for fast lookup.
- [Troubleshooting](./troubleshooting.md) — what the hook-related error messages
  actually mean.
- [React Compiler](../performance/react-compiler.md) — why most `useMemo` and
  `useCallback` calls are now optional.
