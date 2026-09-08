---
title: React 19 cheat sheet
description: Every signature, rule and type you look up more than once, on one page.
group: reference
order: 30
status: current
since: "19.2"
shape: reference
---

Lookup, not reading. Signatures use `?` for optional parameters. Fragments shown
as `text` are deliberately incomplete — they are meant to be pattern-matched, not
pasted.

## Hooks

All from `react` except where noted.

| Hook | Signature | Use when |
|---|---|---|
| `useState` | `const [s, setS] = useState(init)` | A value changes and the UI must follow. |
| `useReducer` | `const [s, dispatch] = useReducer(reducer, initialArg, init?)` | Several fields move together, or transitions are a state machine. |
| `useContext` | `const v = useContext(Ctx)` | Reading a value provided higher in the tree. |
| `useRef` | `const r = useRef(init)` | A value that must survive renders without causing one. |
| `useImperativeHandle` | `useImperativeHandle(ref, createHandle, deps?)` | A parent needs methods, not the raw DOM node. |
| `useEffect` | `useEffect(setup, deps?)` | Synchronizing with something outside React. |
| `useLayoutEffect` | `useLayoutEffect(setup, deps?)` | You must measure or reposition before paint. |
| `useInsertionEffect` | `useInsertionEffect(setup, deps?)` | You are writing a CSS-in-JS library. Otherwise never. |
| `useEffectEvent` | `const onEvent = useEffectEvent(fn)` | An Effect reads a value it must not react to. *(19.2)* |
| `useMemo` | `const v = useMemo(calc, deps)` | A calculation is measurably slow. |
| `useCallback` | `const f = useCallback(fn, deps)` | A function identity feeds a memo'd child or a dep array. |
| `useTransition` | `const [isPending, startTransition] = useTransition()` | An update may block typing, and you want a spinner. |
| `useDeferredValue` | `const d = useDeferredValue(value, initialValue?)` | You own the value but not the update. *(`initialValue` 19.0)* |
| `useId` | `const id = useId()` | Wiring `<label htmlFor>` / `aria-*` across SSR. |
| `useSyncExternalStore` | `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)` | Subscribing to a store outside React. |
| `useDebugValue` | `useDebugValue(value, format?)` | Labelling a library custom hook in DevTools. |
| `useActionState` | `const [state, formAction, isPending] = useActionState(action, initialState, permalink?)` | A submit needs result + pending + error state. *(19.0)* |
| `useFormStatus` | `const { pending, data, method, action } = useFormStatus()` | A child of a `<form>` needs its pending state. **`react-dom`.** *(19.0)* |
| `useOptimistic` | `const [opt, addOptimistic] = useOptimistic(state, updateFn?)` | Showing a result before the server confirms. *(19.0)* |
| `use` | `const v = use(resource)` | Reading a promise or context. **Not a hook** — may be conditional. *(19.0)* |

Rules of Hooks, in one line each:

```text
Top level only — never in a condition, loop, nested function or try/catch.
React functions only — components or custom hooks, nothing else.
Same order every render — that ordering is how React identifies each hook.
`use` is exempt from all three.
```

## JSX

| Rule | Write | Not |
|---|---|---|
| Embed an expression | `{user.name}` | `{{user.name}}` |
| Attribute from an expression | `src={url}` | `src="{url}"` |
| CSS class | `className="card"` | `class="card"` |
| Label target | `htmlFor={id}` | `for={id}` |
| DOM attributes | `tabIndex`, `onClick`, `readOnly` | `tabindex`, `onclick`, `readonly` |
| Inline style | `style={{ marginTop: 8 }}` | `style="margin-top: 8px"` |
| Self-closing | `<img src={url} alt="" />` | `<img src={url}>` |
| Comment | `{/* note */}` | `<!-- note -->` |
| One root | `<>...</>` or a wrapper | two sibling roots |
| Raw HTML | `dangerouslySetInnerHTML={{ __html: html }}` | `innerHTML={html}` |

```text
{cond ? <A /> : <B />}      // choose
{cond && <A />}             // render or nothing  (see the 0 trap)
{null} {undefined} {false}  // render nothing
{list.map(x => <Row key={x.id} {...x} />)}
{'a string'} {42}           // rendered as text
```

What does *not* render: `null`, `undefined`, `true`, `false`. What throws:
objects, and promises outside `use()`.

`dangerouslySetInnerHTML` bypasses React's escaping. Sanitize the HTML first or
you have an XSS hole.

## Props

```text
function Card({ title, tone = 'neutral', children, ...rest }) { }   // destructure + default + rest
<Card title="Q3" tone="warning">…</Card>
<Card {...product} />                                              // spread
<Card ref={cardRef} />                                             // ref is a plain prop (19.0)
```

| Need | Do this |
|---|---|
| A default value | Default parameter in the destructuring. |
| Arbitrary content | The `children` prop. |
| Several content slots | Named props holding JSX: `header={<h1/>}`. |
| Pass through DOM props | `...rest` spread onto the root element. |
| Access the DOM node | Accept `ref` as a prop and forward it. |

Props are read-only. Never assign to one; lift the state instead.

> [!NOTE]
> Since **19.0** `ref` is an ordinary prop on function components — no wrapper
> function is needed to receive it.

## Events

Handlers take a synthetic event with the standard DOM interface plus
`nativeEvent`.

| Handler | Event type | Notes |
|---|---|---|
| `onClick` | `MouseEvent<HTMLButtonElement>` | Also `onDoubleClick`, `onMouseEnter`. |
| `onChange` | `ChangeEvent<HTMLInputElement>` | Fires on every keystroke, unlike DOM `change`. |
| `onInput` | `FormEvent<HTMLInputElement>` | |
| `onSubmit` | `FormEvent<HTMLFormElement>` | Call `preventDefault()` unless using `action`. |
| `onKeyDown` | `KeyboardEvent<HTMLInputElement>` | Also `onKeyUp`. |
| `onFocus` / `onBlur` | `FocusEvent<HTMLInputElement>` | These bubble in React. |
| `onPointerDown` | `PointerEvent<HTMLDivElement>` | Prefer over mouse + touch pairs. |
| `onScroll` | `UIEvent<HTMLDivElement>` | |
| `onWheel` | `WheelEvent<HTMLDivElement>` | |
| `onDragStart` / `onDrop` | `DragEvent<HTMLDivElement>` | |
| `onCopy` / `onPaste` | `ClipboardEvent<HTMLInputElement>` | |
| `onTransitionEnd` | `TransitionEvent<HTMLDivElement>` | |
| `onAnimationEnd` | `AnimationEvent<HTMLDivElement>` | |

```text
onClick={handleClick}            // pass the function
onClick={() => remove(item.id)}  // wrap when you need an argument
onClick={handleClick()}          // BUG: calls it during render
e.preventDefault()               // stop the default browser action
e.stopPropagation()              // stop it reaching parent handlers
```

## Conditional rendering

```text
if (!user) return <SignIn />;              // early return — clearest
{isAdmin ? <AdminBar /> : <UserBar />}     // either/or
{error && <ErrorText message={error} />}   // render or nothing
{items.length > 0 && <List items={items}/>}// guard a list
```

> [!WARNING]
> The `0` trap: `{count && <Badge />}` renders the number **0** when `count` is
> `0`, because `0` is falsy but is still a valid React child. Write
> `{count > 0 && <Badge />}` or `{count ? <Badge /> : null}`.

Same trap with `''` (renders nothing, harmless) and `NaN` (renders `NaN`).

## Lists and keys

```text
{users.map(user => <UserRow key={user.id} user={user} />)}
{pairs.map(p => <Fragment key={p.id}><dt>{p.term}</dt><dd>{p.def}</dd></Fragment>)}
```

| Rule | Why |
|---|---|
| `key` goes on the outermost element inside `map`. | React reads it from the array element. |
| Keys must be stable across renders. | `Math.random()` remounts everything, every time. |
| Keys must be unique among siblings only. | Not globally. |
| Prefer a data ID. | It survives sorting, filtering and insertion. |
| Index keys are acceptable only for a static, never-reordered list. | Otherwise state attaches to the wrong row. |
| `key` is not a prop. | `props.key` is undefined; pass an `id` prop too if you need it. |
| A keyed fragment needs `<Fragment key>`. | `<>` accepts no props. |

## Forms and Actions

```text
<form action={submitOrder}>            // function → runs as an Action, POST, resets uncontrolled fields
<form action="/search">                // string  → plain HTML behavior
<button formAction={saveDraft}>        // overrides the form's action
```

| API | Shape | Gives you |
|---|---|---|
| `useActionState` | `const [state, formAction, isPending] = useActionState(action, initialState, permalink?)` | The action's return value, a wrapped action for `<form action>`, and pending. |
| `useFormStatus` | `const { pending, data, method, action } = useFormStatus()` | Parent form status. Must be in a **child** of the form. |
| `useOptimistic` | `const [opt, addOptimistic] = useOptimistic(state, updateFn?)` | A provisional value; `addOptimistic` must run inside an Action or `startTransition`. |

The action function receives one argument, the `FormData`. With
`useActionState` it receives `(previousState, formData)`.

### Controlled vs uncontrolled

| | Controlled | Uncontrolled |
|---|---|---|
| Value lives in | React state | The DOM |
| Written as | `value={v} onChange={…}` | `defaultValue="…"` + `name` |
| Read on submit via | state | `FormData` |
| Validate as you type | Straightforward | Needs an event handler anyway |
| Re-renders per keystroke | Yes | No |
| Reset after a form Action | You must do it | React does it |
| Use when | The value drives other UI | A plain form posting to an action |

Never switch between them: `value={maybeUndefined}` flips a controlled input to
uncontrolled and warns. Use `value={draft ?? ''}`.

## Refs

```text
const inputRef = useRef(null);          // DOM node
<input ref={inputRef} />
inputRef.current?.focus();              // read in an event or Effect, never during render

const timerRef = useRef(0);             // any mutable value
timerRef.current = window.setTimeout(tick, 1000);
```

Callback refs, with cleanup (**19.0** — returning a cleanup function is new):

```text
<div ref={(node) => {
  const observer = new ResizeObserver(onResize);
  if (node) observer.observe(node);
  return () => observer.disconnect();
}} />
```

`useImperativeHandle(ref, createHandle, deps?)` narrows what a parent can touch:

```text
function TextField({ ref }) {
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }), []);
  return <input ref={inputRef} />;
}
```

| State | Ref |
|---|---|
| Re-renders on change | Does not |
| Read during render | Do not read or write during render |
| Immutable per render | Mutable at any time |
| For anything the UI shows | For anything the UI does not show |

## Context

```text
const ThemeContext = createContext('light');     // default used only with no provider above

<ThemeContext value={theme}>{children}</ThemeContext>   // 19.0: the context renders as the provider
const theme = useContext(ThemeContext);                 // unconditional
const theme = use(ThemeContext);                        // may be conditional
```

Every consumer re-renders when `value` changes by `Object.is`. Memoize an object
value, split one context into two, or move to an external store when that becomes
a problem.

## Suspense and `use()`

```text
<Suspense fallback={<Skeleton />}>
  <Profile />
</Suspense>

const user = use(userPromise);   // suspends until it settles; throws if it rejects
```

| Suspense reacts to | Suspense ignores |
|---|---|
| `lazy()` component code | `fetch` inside `useEffect` |
| A promise read with `use()` | A promise awaited in an event handler |
| `<link rel="stylesheet" precedence>` loading | `async` work you never render |
| Streaming SSR HTML | |

The promise passed to `use()` must be **cached** — creating it during render
makes a new one every attempt and suspends forever. Create it in a Server
Component, a cache, or a data library.

Reveals are batched at roughly one every 300ms so boundaries do not pop in one by
one. Pair `use()` with an Error Boundary: a rejected promise throws.

## Error boundaries

Still the one place a class component is required. React has no hook equivalent.

```text
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }   // render the fallback
  componentDidCatch(error, info) { report(error, info.componentStack); }  // log it
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
```

Boundaries do **not** catch: errors in event handlers, in `setTimeout`, during
server rendering, or thrown by the boundary itself.

Root-level options (**19.0**), passed to `createRoot` / `hydrateRoot`:

| Option | Fires when |
|---|---|
| `onCaughtError` | An Error Boundary caught the error. |
| `onUncaughtError` | Nothing caught it and the root is unmounting. |
| `onRecoverableError` | React recovered on its own, e.g. a hydration mismatch. |

## Performance

| Tool | Signature | Reach for it when |
|---|---|---|
| React Compiler | build-time | Default. It inserts the memoization below for you. |
| `memo` | `memo(Component, arePropsEqual?)` | A pure child re-renders often with identical props. |
| `useMemo` | `useMemo(calc, deps)` | A calculation is slow enough to measure. |
| `useCallback` | `useCallback(fn, deps)` | A function is a dep of an Effect or a prop of a `memo`'d child. |
| `lazy` | `lazy(load)` | A route or a heavy panel should not be in the first bundle. |
| `<Activity>` | `<Activity mode="hidden">` | Hiding UI whose state and DOM you want back instantly. *(19.2)* |
| `useTransition` | `[isPending, startTransition]` | An update makes the input stutter. |
| `useDeferredValue` | `useDeferredValue(value, initialValue?)` | The same, but you only have the value. |

Order of operations: fix the algorithm, cut the re-render at its source, then
memoize. Profile with `<Profiler>` or the DevTools Performance Tracks that 19.2
added before you change anything.

## TypeScript

```tsx
import { useState, useRef, useCallback } from 'react';
import type { ReactNode, ChangeEvent, MouseEvent, Ref } from 'react';

type FieldProps = {
  label: string;
  defaultValue?: string;
  children?: ReactNode;
  ref?: Ref<HTMLInputElement>;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function Field({ label, defaultValue = '', children, ref, onChange }: FieldProps) {
  const [value, setValue] = useState<string>(defaultValue);
  const resetRef = useRef<HTMLButtonElement | null>(null);

  const handleReset = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setValue('');
  }, []);

  return (
    <label>
      {label}
      <input ref={ref} value={value} onChange={(e) => { setValue(e.target.value); onChange?.(e); }} />
      <button ref={resetRef} onClick={handleReset}>Reset</button>
      {children}
    </label>
  );
}
```

| Need | Type |
|---|---|
| Anything renderable | `ReactNode` |
| A single element | `ReactElement` |
| A component value | `ComponentType<Props>` / `FC<Props>` |
| All the props of a DOM tag | `ComponentProps<'button'>` |
| Props of another component | `ComponentProps<typeof Card>` |
| A ref you accept as a prop | `Ref<HTMLInputElement>` |
| A ref object you create | `RefObject<HTMLInputElement \| null>` |
| State that starts empty | `useState<User \| null>(null)` |
| A reducer | `useReducer<(s: State, a: Action) => State>` via typed functions |
| An event handler prop | `(event: ChangeEvent<HTMLInputElement>) => void` |
| CSS in `style` | `CSSProperties` |

## React 19 at a glance

**Added in 19.0**

| Area | What |
|---|---|
| Actions | Async transitions with automatic pending, error and optimistic handling. |
| Hooks | `useActionState`, `useFormStatus` (`react-dom`), `useOptimistic`. |
| APIs | `use()`, `preload`, `preinit`, `preconnect`, `prefetchDNS`. |
| Refs | `ref` as a regular prop; ref callbacks may return a cleanup function. |
| Context | The context object renders directly as the provider. |
| DOM | Hoisted `<title>`/`<meta>`/`<link>`, stylesheet `precedence`, async `<script>` dedupe. |
| Roots | `onCaughtError`, `onUncaughtError`, `onRecoverableError`. |
| Server | Server Components and Server Functions, `prerender()`, `prerenderToNodeStream()`. |
| Tweaks | `useDeferredValue` gained `initialValue`. |

**Added in 19.2**

| Area | What |
|---|---|
| Components | `<Activity mode="visible" \| "hidden">`. |
| Hooks | `useEffectEvent`. |
| Server | `cacheSignal()`, `resume()` family, partial pre-rendering via a `postponed` state. |
| SSR | Suspense boundary reveals are batched. |
| Tooling | Performance Tracks in Chrome DevTools; `eslint-plugin-react-hooks` v6 shipped with 19.2 (current major is now v7). |
| Behavior | `useId` prefix changed from `:r:` to `_r_`. |

> [!LEGACY]
> **Removed in 19.0.** Nothing here exists any more: `propTypes` ·
> `defaultProps` on function components (use default parameters) · legacy context
> (`contextTypes` / `getChildContext`) · string refs · module pattern factories ·
> `React.createFactory` · `ReactDOM.render` (use `createRoot`) ·
> `ReactDOM.hydrate` (use `hydrateRoot`) · `unmountComponentAtNode` (use
> `root.unmount()`) · `ReactDOM.findDOMNode` (use refs) · `react-dom/test-utils`
> (`act` now comes from `react`) · `react-test-renderer/shallow` (use the
> `react-shallow-renderer` package) · `unstable_flushControlled` ·
> `unstable_createEventHandle` · `unstable_renderSubtreeIntoContainer` ·
> `unstable_runWithPriority` · UMD builds (use an ESM CDN such as `esm.sh`).

> [!DEPRECATED]
> **Deprecated in 19.0** — these still run, but do not write new code this way:
> `forwardRef` (`ref` is a prop) · rendering a context through its `.Provider`
> property (render the context itself) · `element.ref` (read
> `element.props.ref`) · `react-test-renderer` (use
> `@testing-library/react`).

## Upgrade commands

```bash
npm install react@19.2.8 react-dom@19.2.8
```

```bash
npx codemod@latest react/19/migration-recipe
```

```bash
npx types-react-codemod@latest preset-19 ./path-to-app
```

> [!WARNING]
> Install **19.2.4 or newer**. CVE-2025-55183, CVE-2025-55184, CVE-2025-67779 and
> CVE-2026-23864 were only fully fixed in 19.0.4 / 19.1.5 / 19.2.4 — the patches
> in 19.0.3 / 19.1.4 / 19.2.3 were incomplete. The earlier RCE, CVE-2025-55182
> (CVSS 10.0), was fixed in 19.0.1 / 19.1.2 / 19.2.1. Pin `19.2.8`.

## Common mistakes

- `{count && <Badge />}` when `count` is `0`. Compare explicitly.
- `key={index}` on a list that reorders. State follows the key, not the data.
- `useFormStatus` imported from `react`, or called in the component that renders
  the `<form>`.
- `value={undefined}` on an input, flipping it from controlled to uncontrolled.
- Reading `ref.current` during render.
- Creating the promise for `use()` inside the render that consumes it.
- `useEffect` for derived state that could be computed during render.
- Memoizing everything before profiling anything.
- `onClick={handleClick()}` instead of `onClick={handleClick}`.

## Related topics

- [Hooks reference](./hooks-reference.md) — the same hooks with full descriptions
  and links to each page.
- [Built-in components and APIs](./built-in-components.md) — props tables for
  `<Suspense>`, `<Activity>`, `<Profiler>` and the top-level APIs.
- [Troubleshooting](./troubleshooting.md) — when one of these mistakes has already
  produced an error message.
- [React 18 to 19](../migration/react-18-to-19.md) — the upgrade in order, not as
  a list.
- [Rules of Hooks](../hooks/rules-of-hooks.md) — the reasoning behind the three
  lines at the top.
