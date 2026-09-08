---
title: Rules of Hooks
description: Why hooks must be called at the top level of a component, and what breaks when they are not.
group: hooks
order: 10
status: current
related: [hooks/use-state, hooks/custom-hooks, hooks/use]
---

## Overview

Hooks are ordinary JavaScript functions, but React gives them a superpower: they
remember things between renders. That memory is bought with two rules.

1. **Only call hooks at the top level.** Never inside a condition, a loop, a
   nested function, or a `try` / `catch` / `finally` block.
2. **Only call hooks from React functions.** A function component, or a custom
   hook whose name starts with `use`.

Everything else about hooks follows from these two lines. Break them and you do
not get a clear crash — you get state that belongs to a different variable.

## Why it exists

React does not know the *names* of your hooks. When your component renders,
React walks a list attached to that component instance and hands out the stored
value at each position. Position `0`, position `1`, position `2`.

```text
function Profile() {
  const [name, setName] = useState('');   // slot 0
  const [age, setAge] = useState(0);      // slot 1
  useEffect(...);                         // slot 2
}
```

`name` is not "the state called name". It is "the state in slot 0 of this
component". The call order *is* the identity.

That design is why hooks work at all. React needs a way to attach state to a
plain function that has no `this`, no instance, and no lifetime of its own. An
ordered list keyed by the component's position in the tree is the cheapest
mechanism that does it, and it is why `useState` needs no key, no name and no
registration step.

The cost is that the order must be identical on every render of that component.

## When to use it

Call a hook only from these two places:

- The top level of a **function component** body.
- The top level of a **custom hook** — a function whose name starts with `use`
  and which is itself only called from a component or another custom hook.

"Top level" means the statement is not nested inside any other block that could
be skipped. It may sit after other statements; it may not sit after a
conditional `return`.

```jsx
import { useState, useEffect } from 'react';

export default function OrderSummary({ orderId, isOpen }) {
  // Every hook runs on every render, in the same order.
  const [notes, setNotes] = useState('');
  useEffect(() => {
    document.title = `Order ${orderId}`;
  }, [orderId]);

  // Conditions go *after* the hooks, in the returned markup.
  if (!isOpen) {
    return null;
  }
  return (
    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
  );
}
```

## When not to use it

Do not call a hook:

- **Inside a condition.** `if (isLoggedIn) { useState(...) }` changes the number
  of hooks between renders.
- **Inside a loop.** `items.forEach(() => useState(...))` changes the count when
  the array length changes. Extract a child component instead.
- **After an early `return`.** A conditional `return null` above a hook is a
  conditional hook call.
- **Inside `try` / `catch` / `finally`.** A thrown error mid-render would leave
  the hook list truncated.
- **Inside a nested function** — an event handler, a callback passed to
  `useMemo`, a reducer, a `setTimeout` body, or the setup function of another
  Effect.
- **From a class component.** Classes have their own state mechanism.
- **From a plain function** that is not a component and does not start with
  `use`. If a helper needs state, it is a custom hook — rename it.

> [!WARNING]
> Calling a hook conditionally does not throw at the call site. React throws a
> confusing "Rendered fewer hooks than expected" error on a *later* render, or —
> worse — silently hands one hook's stored value to another hook. Debugging that
> from the symptom is miserable, which is why the lint rule matters.

## Basic example

Here is the shape people reach for and the shape that works. Both render an
input that depends on the selected country.

```jsx
import { useState } from 'react';

// Broken: the hook list has one entry for US and a different one otherwise.
export default function ShippingFormBroken({ country }) {
  if (country === 'US') {
    const [zip, setZip] = useState('');
    return <input value={zip} onChange={(e) => setZip(e.target.value)} />;
  }
  const [postcode, setPostcode] = useState('');
  return <input value={postcode} onChange={(e) => setPostcode(e.target.value)} />;
}
```

Declare both pieces of state unconditionally and branch in the JSX:

```jsx live
import { useState } from 'react';

export default function ShippingForm() {
  const [country, setCountry] = useState('US');
  const [zip, setZip] = useState('');
  const [postcode, setPostcode] = useState('');

  const isUS = country === 'US';

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <select value={country} onChange={(e) => setCountry(e.target.value)}>
        <option value="US">United States</option>
        <option value="GB">United Kingdom</option>
      </select>
      {isUS ? (
        <input
          placeholder="ZIP code"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
        />
      ) : (
        <input
          placeholder="Postcode"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
        />
      )}
      <p>
        Shipping to {country}: {(isUS ? zip : postcode) || 'not set'}
      </p>
    </form>
  );
}
```

The rule costs you one unused state variable. It buys you a component that
cannot desynchronize.

## How it works

Each mounted component gets an internal list of hook records. On the first
render React appends one record per hook call. On every later render it moves a
cursor through that list from the start, matching call number `n` to record `n`.

```text
Render 1 (isOpen = true)     Render 2 (isOpen = false)
0  useState  -> ''           0  useState  -> ''
1  useState  -> 0            1  useEffect -> ???   mismatch
2  useEffect
```

If render 2 skips the second `useState`, the `useEffect` call lands on the
record built for `useState`. React detects the count change and throws; when the
*types* happen to line up it does not throw and you get the wrong value.

**Across re-renders.** Hook records live on the component instance, keyed by
position in the tree. They survive re-renders. They are thrown away when the
component unmounts, or when its `key` changes — which is why changing `key` is
the supported way to reset a subtree's state.

**With StrictMode.** In development, StrictMode renders each component twice and
double-invokes initializers, updaters and reducers. It does not change the
ordering rules; it exists to surface impurity. A component that follows the
rules but reads or writes something outside itself during render will start
behaving differently under StrictMode — that is the point.

**With concurrent rendering.** React may start rendering a component, abandon
the work, and render it again from scratch before committing. That is safe only
because a render is a pure function of props, state and context, replayable from
the same hook list. A conditional hook call makes the replay produce a different
list than the first attempt, so the failure modes get less predictable, not more.

## Common patterns

### Move the condition inside the hook

You cannot call `useEffect` conditionally, but the code *inside* it can branch.

```jsx
import { useEffect } from 'react';

export default function ConnectionBanner({ roomId, enabled }) {
  useEffect(() => {
    if (!enabled) return;
    const socket = new WebSocket(`wss://chat.example.com/${roomId}`);
    return () => socket.close();
  }, [roomId, enabled]);

  return <p>{enabled ? `Live: ${roomId}` : 'Offline'}</p>;
}
```

### Extract a component instead of looping

If you want per-item state, give each item its own component. Then each item is
its own instance with its own hook list, and the loop is over elements, not over
hook calls.

```jsx live
import { useState } from 'react';

function TaskRow({ title }) {
  const [done, setDone] = useState(false);
  return (
    <li>
      <label>
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => setDone(e.target.checked)}
        />{' '}
        <span style={{ textDecoration: done ? 'line-through' : 'none' }}>
          {title}
        </span>
      </label>
    </li>
  );
}

export default function TaskList() {
  const tasks = ['Write the migration guide', 'Audit Effects', 'Ship 19.2.8'];
  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {tasks.map((title) => (
        <TaskRow key={title} title={title} />
      ))}
    </ul>
  );
}
```

### The one exception: `use()`

React 19 added `use()`, which reads a promise or a context during render.
Despite the name it is not a hook, and it is the single API in this family that
**may** be called inside a condition or a loop.

```jsx
import { use, createContext } from 'react';

const ThemeContext = createContext('light');

export default function Divider({ decorated }) {
  if (decorated) {
    const theme = use(ThemeContext); // allowed — use() is not a hook
    return <hr className={`rule rule--${theme}`} />;
  }
  return <hr />;
}
```

`use()` still has to be called from inside a component or a hook, and it cannot
be called inside a `try` / `catch` block. See [use](./use.md) for the full rules.

### Let the linter enforce it

`eslint-plugin-react-hooks` ships the `rules-of-hooks` and `exhaustive-deps`
rules. The current major is **v7**, and flat config is the default.

```js
// eslint.config.js
import reactHooks from 'eslint-plugin-react-hooks';

export default [reactHooks.configs.recommended];
```

The plugin also ships React Compiler powered rules that catch violations of the
Rules of React beyond hook ordering — impure render, mutating props, writing
state during render. **In v7 those rules are on by default** in `recommended`;
`recommended-latest` adds the experimental ones on top. Check the
[plugin reference on react.dev](https://react.dev/reference/eslint-plugin-react-hooks)
for the current rule list.

> [!NOTE]
> React 19.2 shipped alongside **v6** of the plugin, where flat config became the
> default and the compiler rules were opt-in. **v7 removed the
> `recommended-legacy` and `flat/recommended` configs** and turned the compiler
> rules on by default, so an older `.eslintrc` setup extending
> `plugin:react-hooks/recommended-legacy` must move to flat config to upgrade.
> Note also that 6.0.0 was published by mistake and untagged — the real 6.x
> release is 6.1.0.

> [!BEST-PRACTICE]
> Treat `react-hooks/rules-of-hooks` as an error, never a warning. There is no
> legitimate code that violates it, so a warning is pure noise you will learn to
> ignore.

## Advanced example

Custom hooks inherit the rules exactly, because a custom hook's calls are
appended to the *calling component's* hook list. Two calls in one component are
two independent slots.

```jsx live
import { useState } from 'react';

function useToggle(initial) {
  const [on, setOn] = useState(initial);
  const toggle = () => setOn((current) => !current);
  return { on, toggle };
}

export default function NotificationSettings() {
  // Two calls, two independent slots in this component's hook list.
  const email = useToggle(true);
  const push = useToggle(false);

  return (
    <fieldset>
      <legend>Notifications</legend>
      <button onClick={email.toggle}>
        Email: {email.on ? 'on' : 'off'}
      </button>{' '}
      <button onClick={push.toggle}>
        Push: {push.on ? 'on' : 'off'}
      </button>
    </fieldset>
  );
}
```

Because `useToggle` contributes a fixed number of slots, calling it twice is
fine — as long as *both* calls happen on every render. Wrapping the second one
in an `if` breaks the component exactly the same way a conditional `useState`
would.

## Common mistakes

**Putting an early return above a hook.** The most common real-world violation.
`if (!user) return <Spinner />;` placed before `useEffect` makes that Effect
conditional. Move every hook above every conditional return.

**Calling a hook inside an event handler.** Handlers run after render, when
there is no hook list cursor to advance. Call the hook at the top level and use
its result in the handler.

**Calling a hook inside `useMemo` or an Effect setup function.** These are
nested functions. React does not track hook calls inside them.

**Naming a custom hook without the `use` prefix.** `function fetchUser()` that
calls `useState` is invisible to the linter, so nothing checks its call sites.
Rename it `useUser`.

**Calling a custom hook from a plain helper.** The rule travels: if a function
calls a hook, that function is a hook, and its callers are constrained too.

**Assuming the count is what matters.** It is the *order*, not the count. Two
`useState` calls swapped by a condition keep the count identical and silently
swap your values.

**Wrapping hooks in `try` / `catch` to "handle" render errors.** Use an
[error boundary](../patterns/error-boundaries.md) instead.

**Disabling the lint rule.** `// eslint-disable-next-line
react-hooks/rules-of-hooks` is always the wrong fix. The right fix is extracting
a component.

## Related topics

- [useState](./use-state.md) — the hook whose slot-based memory these rules protect.
- [Custom hooks](./custom-hooks.md) — how the rules propagate into functions you write.
- [use](./use.md) — the one API in this family that may be called conditionally.
- [useEffect](./use-effect.md) — where conditional logic belongs inside the hook.
- [StrictMode](../core-concepts/strict-mode.md) — double-invoking, and what it is checking for.
- [Rendering](../core-concepts/rendering.md) — why a render must be replayable.
