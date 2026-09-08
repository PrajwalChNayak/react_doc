---
title: Troubleshooting
description: React 19 warnings and broken behaviors, each with its real cause and the fix.
group: reference
order: 40
status: current
since: "19.2"
shape: reference
---

Find your symptom, read the cause, apply the fix. Symptoms are grouped by what
you see, not by which API is involved.

> [!NOTE]
> Error text below is quoted verbatim only where it was verified against
> `react.dev`. Everything else is marked *(paraphrased)* — React's wording varies
> by version and by whether you are on a development or production build. Match
> on the shape of the message, not on an exact string.

## "Too many re-renders" *(paraphrased)*

React stops the render loop and throws once a component re-renders too many times
in a row.

**Cause 1 — setting state during render.** Almost always a handler that is called
instead of passed:

```text
const [count, setCount] = useState(0);

// Calls setCount during render, which schedules another render, forever.
return <button onClick={setCount(count + 1)}>{count}</button>;
```

Pass the function, do not call it: `onClick={() => setCount(count + 1)}`.

**Cause 2 — an Effect with a missing or unstable dependency.** An Effect that
sets state and depends on a value it recreates every render never settles:

```text
useEffect(() => {
  setRows(filterRows(data, filters));
}, [filters]);        // filters is a new object literal every render
```

Fix it by deriving during render instead (`const rows = filterRows(data, filters)`),
or by making the dependency stable (`useMemo`, or depend on primitives).

**Cause 3 — `getSnapshot` returning a new object.** React compares snapshots with
`Object.is`, so a fresh object every call means a re-render every check:

```text
// Loops: a new object each call
function getSnapshot() { return { todos: store.todos }; }

// Fine: the same reference until the store changes
function getSnapshot() { return store.todos; }
```

Return the stored value itself, or cache the snapshot object and only replace it
when the underlying data changes.

## "Rendered more hooks than during the previous render" *(paraphrased)*

**Cause.** A hook call is behind a condition, a loop, or an early return, so the
number or order of hooks changed between renders. React identifies hooks by call
order alone.

```text
if (!user) return null;      // early return BEFORE a hook
const [name, setName] = useState('');
```

**Fix.** Move every hook above every early return and out of every condition. Put
the condition inside the hook, not around it:

```text
const [name, setName] = useState('');
useEffect(() => {
  if (!user) return;
  // ...
}, [user]);
if (!user) return null;
```

If the branches genuinely need different hooks, they are different components.
Split them and let the parent choose.

`use()` is the exception — it may be called conditionally. Nothing else may.

## "Cannot update a component while rendering a different component" *(paraphrased)*

**Cause.** A component calls another component's setter during its own render
phase. React names both components in the message: the one being updated and the
one that was rendering.

```text
function Parent() {
  const [tab, setTab] = useState('list');
  return <Child onMount={setTab} />;
}
function Child({ onMount }) {
  onMount('detail');     // called during render
  return null;
}
```

**Fix.** Move the update into an event handler if it is caused by an interaction,
or into an Effect if it is genuinely a synchronization. Better still, remove it:
if the parent's state is derivable from the child's props, compute it in the
parent instead of pushing it up.

The one legitimate case for setting state during render is a component updating
**its own** state to adjust for a prop change — and even that should be replaced
by a `key` on the component where possible, so React resets the state for you.

## Hydration mismatch

**Cause.** The HTML the server produced does not match what the client renders on
its first pass. React's documented common causes:

| Cause | Fix |
|---|---|
| Extra whitespace or newlines around the root's HTML | Remove it from the server template. |
| `typeof window !== 'undefined'` branching in render | Render the server version, then switch in an Effect. |
| Browser-only APIs such as `window.matchMedia` in render | Read them in `useEffect` and store the result in state. |
| Values that differ per render: `Date.now()`, `Math.random()`, locale formatting | Compute on the server and pass down, or render after mount. |
| Different data on server and client | Serialize the server's data and hydrate from it. |
| Invalid nesting, e.g. a `<div>` inside a `<p>` | The browser repairs the HTML, so the trees differ. Fix the markup. |
| Browser extensions injecting nodes | Not your bug; verify in a clean profile before chasing it. |

**Escape hatch.** For a single element whose content is legitimately different —
a timestamp, for example — add `suppressHydrationWarning={true}`. It works one
level deep only, and React does not patch the mismatched text. It is a silencer,
not a fix.

**Diagnosis.** Set `onRecoverableError` on `hydrateRoot` and log what it reports;
mismatches surface there rather than as thrown errors.

## "Each child in a list should have a unique key prop" *(paraphrased)*

**Cause.** A `map` returned elements with no `key`, or the `key` is on the wrong
element — it belongs on the outermost element returned by the callback, not on
something nested inside it.

```text
{rows.map(row => <tr><Cell key={row.id} /></tr>)}   // wrong element
{rows.map(row => <tr key={row.id}><Cell /></tr>)}   // right
```

For a fragment, `<>` accepts no props — use `<Fragment key={row.id}>`.

### The subtler bug: index keys and reordering

The warning goes away when you write `key={index}`, and a real bug takes its
place. Keys tell React which DOM node and which piece of state belongs to which
item. With index keys, deleting the first row does not delete the first row's
state — every row shifts up into the previous row's state.

Symptoms: a checkbox stays checked on the wrong row after a delete; text typed in
one input appears in another after a sort; an animation restarts on the wrong
element.

**Fix.** Use a stable ID from the data. Index keys are acceptable only when the
list is never reordered, filtered, inserted into or deleted from, and the items
hold no state.

Do not swap in `Math.random()` or `crypto.randomUUID()` at render time either —
that gives every item a new key on every render, unmounting and remounting the
whole list.

## "An update was not wrapped in act(...)" *(paraphrased)*

**Cause.** State updated outside the window your test framework controls —
usually a promise resolving after the assertion, or a timer firing.

**Fix, in order of preference:**

1. Use `@testing-library/react`'s `findBy*` queries or `waitFor`. They are
   already act-wrapped and they wait for the update instead of asserting through
   it.
2. Use `userEvent` rather than firing raw DOM events.
3. Wrap the manual update yourself, importing `act` **from `react`**:

```text
import { act } from 'react';

await act(async () => {
  root.render(<Checkout cart={cart} />);
});
```

> [!LEGACY]
> If the import fails, you are importing `act` from `react-dom/test-utils`. That
> entry point was removed in React 19; `act` is exported from `react` itself.

Set `global.IS_REACT_ACT_ENVIRONMENT = true` in your test setup if your runner
does not do it. And do not silence this warning — it means an assertion may run
against a stale tree.

See [act and async](../testing/act-and-async.md).

## An Effect runs twice in development

**This is correct behavior, not a bug.** `<StrictMode>` deliberately runs setup,
then cleanup, then setup again on mount in development, to prove your Effect
cleans up after itself. It does not happen in production.

What it is catching: an Effect that opens a subscription, a connection, an
observer or an interval and never closes it. Run twice, such an Effect leaks
twice.

```text
useEffect(() => {
  const connection = createConnection(roomId);
  connection.connect();
  return () => connection.disconnect();   // this is what StrictMode is checking for
}, [roomId]);
```

**Fix.** Write the cleanup. If the Effect cannot be made idempotent — a POST that
must fire once, an analytics event — it probably should not be in an Effect at
all. Move it to the event handler that caused it.

StrictMode also re-runs render functions and ref callbacks an extra time, for the
same reason. Removing `<StrictMode>` to make the symptom go away hides a bug that
concurrent rendering can reproduce in production.

See [Strict Mode](../core-concepts/strict-mode.md).

## A stale value inside an Effect or a callback

**Symptom.** An interval logs the count as `0` forever. A `setTimeout` submits
the first draft, not the current one. An event handler registered once sees old
props.

**Cause.** A closure captures the values from the render in which it was created.
If the Effect does not re-run, it keeps the old closure.

```text
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000);  // count is frozen at 0
  return () => clearInterval(id);
}, []);                                                     // never re-runs
```

**Fixes, in order:**

1. **Use an updater function.** `setCount(c => c + 1)` needs no captured value at
   all, and the dependency disappears.
2. **List the dependency honestly.** If the Effect must see the latest `count`,
   put `count` in the array and let it re-subscribe.
3. **Use `useEffectEvent` (19.2)** when the Effect must *read* a value without
   *reacting* to it — the classic case being an Effect that connects to a room and
   also wants to log the current theme:

```text
const onConnected = useEffectEvent(() => {
  showNotification('Connected', theme);   // reads the latest theme
});

useEffect(() => {
  const connection = createConnection(roomId);
  connection.on('connected', onConnected);
  connection.connect();
  return () => connection.disconnect();
}, [roomId]);   // theme is NOT a dependency, and must not be
```

Never add an Effect Event to the dependency array — its identity changes on
purpose every render.

**Do not** silence the linter with a disable comment. `eslint-plugin-react-hooks`
v6 (shipped with 19.2) is right far more often than the person disabling it.

## "Objects are not valid as a React child" *(paraphrased)*

**Cause.** You rendered an object where React expected a node. React renders
strings, numbers, elements, arrays and `null`/`undefined`/booleans. It throws on
plain objects, and the message usually lists the object's keys.

Common sources:

| You wrote | You meant |
|---|---|
| `{user}` | `{user.name}` |
| `{error}` where `error` is an `Error` | `{error.message}` |
| `{new Date()}` | `{date.toLocaleDateString()}` |
| `{fetchUser()}` — a promise | `{use(userPromise)}` inside a `<Suspense>` |
| `{{ label: 'Save' }}` | `{label}` — double braces make an object literal |
| `{items}` where `items` is a `Map` or `Set` | `{[...items].map(…)}` |

The key list in the message is the fastest way to identify which object it is.

## A controlled input became uncontrolled

**Message** *(paraphrased)*: a component is changing a controlled input to be
uncontrolled.

**Cause.** `value` was a string and then became `undefined` or `null` — typically
because the state was initialized from data that had not loaded yet, or from an
optional field.

```text
const [form, setForm] = useState({});          // form.email is undefined
<input value={form.email} onChange={…} />      // uncontrolled on the first render
```

**Fixes:**

- Default the value: `value={form.email ?? ''}`.
- Initialize the state with every field: `useState({ email: '', name: '' })`.
- If the data arrives asynchronously, do not render the form until it does, or
  give the form a `key` that changes when the data arrives so React remounts it
  with fresh state.

The mirror image — starting with `value={''}` and later passing `undefined` —
produces the same warning in reverse. Pick controlled or uncontrolled per input
and never switch.

See [Controlled inputs](../patterns/controlled-inputs.md).

## "Cannot update during an existing state transition" *(paraphrased)*

**Cause.** A setter ran during the render phase of a component that is itself
inside a transition — most often a `set` call in the body of a render function,
or in a function called from it (a `useMemo` callback, a `getDerivedState`-style
helper, a selector).

**Fix.** Render functions must be pure: same props and state in, same JSX out, no
side effects. Move the update to an event handler or an Effect. If you are
adjusting state in response to a prop change, use a `key` to reset the component
instead.

Related: `useOptimistic`'s setter must be called inside an Action or a
`startTransition`, never during render.

## After upgrading to React 19

### The old top-level render entry point is not a function

**Symptom.** A `TypeError` at startup saying the render function is not a
function, or that a hydrate function is undefined.

> [!LEGACY]
> React 18 and earlier mounted with `ReactDOM.render(<App />, container)` and
> hydrated with `ReactDOM.hydrate(...)`. Both were removed in React 19, along
> with `unmountComponentAtNode` and `ReactDOM.findDOMNode`.

**Fix.** Mount with `createRoot` from `react-dom/client`:

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <h1>Storefront</h1>;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
```

Server-rendered HTML uses `hydrateRoot(container, <App />)`. Unmount with
`root.unmount()`. Replace DOM lookups with refs.

### `act` is missing from the old test utilities entry point

> [!LEGACY]
> `react-dom/test-utils` was removed in React 19. Tests that did
> `import { act } from 'react-dom/test-utils'` fail to resolve.
>
> `react-test-renderer/shallow` went away in the same release. The standalone
> `react-shallow-renderer` package replaces it if you still need shallow
> rendering, and `react-test-renderer` itself is deprecated.

**Fix.** `import { act } from 'react';`. The migration recipe rewrites these
imports. For shallow rendering, prefer `@testing-library/react` over any of the
replacements above — it tests what the user sees rather than one render pass.

### Runtime prop validation stopped warning

**Symptom.** Invalid props no longer produce console warnings, and default values
declared as a static property on the component silently do nothing.

> [!LEGACY]
> `propTypes` and `defaultProps` on function components were removed in React 19.
> React ignores both. `defaultProps` still works on class components.

**Fix.** Move prop validation to TypeScript, and express defaults as default
parameters:

```tsx
type BadgeProps = { label: string; tone?: 'neutral' | 'warning' };

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{label}</span>;
}
```

`npx types-react-codemod@latest preset-19 ./path-to-app` handles most of the type
side of the migration.

### A test or CSS selector matching `:r:` stopped matching

**Symptom.** A snapshot diff full of changed IDs, a selector like
`[id^=":r"]` that matches nothing, or a CSS rule that no longer applies.

**Cause.** React 19.2 changed the `useId` prefix from `:r:` to `_r_`. The old
prefix needed escaping in CSS selectors; the new one does not. The format was
never a public contract.

**Fix.** Stop matching on the generated value. Query by role, label or test ID
instead, and pass `identifierPrefix` to `createRoot` / `hydrateRoot` if you need
a prefix you control. Regenerate snapshots that captured the old IDs.

## Invalid hook call — two copies of React

**Message** (verified wording from `react.dev`): "Hooks can only be called inside
the body of a function component."

React documents three causes, in this order:

1. **Breaking the Rules of Hooks** — a hook inside a condition, loop, nested
   function, event handler, class component, or inside `useMemo` / `useReducer` /
   `useEffect`.
2. **Mismatching versions of `react` and `react-dom`.**
3. **More than one copy of React in the app.**

The third is the one that wastes an afternoon. Two copies of `react` resolve to
two different module instances, and the copy holding the hook dispatcher is not
the copy your component imported.

**Diagnose:**

```bash
npm ls react
npm ls react-dom
```

More than one version, or the same version at two paths, confirms it. React's own
suggestion is to compare the instances directly — add
`window.React1 = require('react')` in `node_modules/react-dom/index.js`, then
`window.React2 = require('react')` in your component file, and log
`window.React1 === window.React2`. `false` means two copies.

**Typical sources and fixes:**

| Source | Fix |
|---|---|
| A linked local library with its own `node_modules/react` | Make `react` and `react-dom` `peerDependencies` there, and `npm link` the host's copy. |
| A monorepo hoisting failure | Add `react`/`react-dom` to the workspace root, or use `overrides` / `resolutions` to force one version. |
| A bundler resolving two paths | Alias `react` and `react-dom` to a single absolute path in the bundler config. |
| A stale lockfile after an upgrade | Delete `node_modules` and the lockfile, reinstall, and confirm `19.2.8`. |

Keep `react` and `react-dom` on the same version. Mixing them produces the same
symptom.

## Common mistakes

- **Silencing instead of fixing.** `suppressHydrationWarning`, an
  `eslint-disable` on a dependency array, and removing `<StrictMode>` all hide the
  symptom and keep the bug.
- **Blaming StrictMode for double Effects.** The double invocation found a
  missing cleanup. Write the cleanup.
- **Reaching for `key={index}` to clear the key warning.** You traded a warning
  for a state-corruption bug.
- **Adding dependencies to an array until the loop stops.** Removing a dependency
  the Effect actually reads produces a stale closure. Restructure instead.
- **Assuming an error message is exact.** React's wording differs between
  development and production builds and between versions — never assert on the
  string in a test.
- **Upgrading to 19.2.1 and calling it patched.** The full Server Components fix
  landed in **19.2.4**; pin `19.2.8`.

## Related topics

- [Rules of Hooks](../hooks/rules-of-hooks.md) — the source of the two most common
  errors on this page.
- [Strict Mode](../core-concepts/strict-mode.md) — why development double-invokes,
  and what it finds.
- [SSR and hydration](../server-react/ssr-and-hydration.md) — hydration mismatches
  in their proper context.
- [act and async](../testing/act-and-async.md) — testing updates that resolve
  later.
- [React 18 to 19](../migration/react-18-to-19.md) — the upgrade path behind the
  breakages above.
- [Cheat sheet](./cheat-sheet.md) — the correct form of every API named here.
