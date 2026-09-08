---
title: useReducer
description: Manage state through a pure reducer function when several values change together.
group: hooks
order: 30
status: current
related: [hooks/use-state, state-management/reducers-and-context, typescript/typing-hooks]
---

## Overview

`useReducer` moves your state transitions out of event handlers and into one
pure function.

```text
const [state, dispatch] = useReducer(reducer, initialArg, init?)
```

- `reducer` — `(state, action) => nextState`. Must be **pure**.
- `initialArg` — the value the initial state is built from.
- `init` *(optional)* — if given, the initial state is `init(initialArg)`
  instead of `initialArg` itself.
- Returns the current state and a `dispatch` function. `dispatch(action)`
  schedules a re-render whose state is `reducer(currentState, action)`.

```jsx live
import { useReducer } from 'react';

function counterReducer(count, action) {
  switch (action.type) {
    case 'incremented':
      return count + 1;
    case 'decremented':
      return count - 1;
    case 'reset':
      return 0;
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

export default function Counter() {
  const [count, dispatch] = useReducer(counterReducer, 0);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => dispatch({ type: 'decremented' })}>-1</button>{' '}
      <button onClick={() => dispatch({ type: 'incremented' })}>+1</button>{' '}
      <button onClick={() => dispatch({ type: 'reset' })}>Reset</button>
    </div>
  );
}
```

## Why it exists

`useState` scatters update logic across every handler that touches it. In a
component with six pieces of state and ten handlers, the rules for how state may
change exist only as the sum of those handlers — you cannot read them in one
place, and you cannot test them without rendering.

A reducer inverts that. Handlers describe **what happened** (`{ type:
'quantity_changed' }`); the reducer decides **what the state becomes**. The
result is one function that takes a value and returns a value, which you can
unit-test with no React at all.

It also removes a class of bugs. Because the reducer receives the current state
as an argument, a transition can never read a stale snapshot.

## When to use it

- **Several values change together.** A form with `values`, `errors`, `touched`
  and `isSubmitting` has combinations that are invalid; a reducer lets you make
  them unrepresentable.
- **The next state depends on the previous state** in ways more complex than
  `n + 1`.
- **The same transition is fired from several places.** Three buttons and a
  keyboard shortcut dispatching `{ type: 'closed' }` share one implementation.
- **You want to test transitions.** `expect(reducer(state, action)).toEqual(...)`
  needs no DOM.
- **You are debugging "who changed this and when".** A single `console.log` in
  the reducer logs every transition in the component.
- **You want to pass update logic deep down the tree.** `dispatch` has a stable
  identity, so it travels through context without invalidating memoized
  children. See [reducers and context](../state-management/reducers-and-context.md).

## When not to use it

- **One independent value.** `useState` is shorter and clearer for a boolean or
  a string.
- **Values that never change together.** Grouping unrelated state into one
  reducer couples them for no benefit.
- **Data you do not own** — server data, or a store outside React. A reducer
  does not make a cache.
- **Derived values.** Anything computable from state or props should be computed
  during render, not stored in the reducer.
- **As a substitute for a state library.** A reducer is local to one component
  unless you pair it with context; it does not give you devtools, middleware, or
  cross-component subscriptions. See
  [choosing an approach](../state-management/choosing-an-approach.md).
- **When you need async logic inside the transition.** Reducers must be pure —
  do the async work in the handler, then dispatch the result.

## Basic example

Compare the same feature written both ways. With `useState`:

```jsx
import { useState } from 'react';

export default function CheckoutStateVersion() {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  function next() {
    setError('');
    setStep((s) => s + 1);
  }
  function submit() {
    setError('');
    setIsSubmitting(true);
  }
  function fail(message) {
    setIsSubmitting(false);
    setError(message);
  }

  return (
    <p>
      Step {step} {isSubmitting ? '(submitting)' : ''} {error}
      <button onClick={next}>Next</button>
      <button onClick={submit}>Submit</button>
      <button onClick={() => fail('Card declined')}>Simulate failure</button>
    </p>
  );
}
```

Three handlers each remember to clear `error`. Miss one and a stale error stays
on screen. With a reducer, clearing is part of the transition:

```jsx
import { useReducer } from 'react';

const initialCheckout = { step: 0, isSubmitting: false, error: '' };

function checkoutReducer(state, action) {
  switch (action.type) {
    case 'advanced':
      return { ...state, step: state.step + 1, error: '' };
    case 'submitted':
      return { ...state, isSubmitting: true, error: '' };
    case 'failed':
      return { ...state, isSubmitting: false, error: action.message };
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

export default function Checkout() {
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckout);

  return (
    <p>
      Step {state.step} {state.isSubmitting ? '(submitting)' : ''} {state.error}
      <button onClick={() => dispatch({ type: 'advanced' })}>Next</button>
      <button onClick={() => dispatch({ type: 'submitted' })}>Submit</button>
      <button
        onClick={() => dispatch({ type: 'failed', message: 'Card declined' })}
      >
        Simulate failure
      </button>
    </p>
  );
}
```

## How it works

**Across re-renders.** `state` is this render's snapshot, exactly like
`useState`. `dispatch` does not change it — it queues an action. React runs the
reducer while preparing the next render, feeding it the state that resulted from
the previous queued action, so several dispatches in one handler compose
correctly.

**`dispatch` has a stable identity.** It is the same function object for the
lifetime of the component. You can omit it from dependency arrays, pass it
through context, and hand it to memoized children without breaking their
memoization.

**Bailing out.** If your reducer returns the state object it received, React
compares with `Object.is`, sees no change and skips the re-render. This is a
useful escape hatch (`case 'noop': return state;`) and also a trap: mutating the
state object and returning it means nothing renders.

**With StrictMode.** In development, React calls **both your reducer and your
`init` function twice** and discards one result. This is a deliberate purity
stress test. A pure reducer produces the same output both times and you notice
nothing. An impure one — pushing into the existing array, mutating a nested
object, incrementing a module-level id, calling `fetch` — produces duplicated
work or corrupted state, which is precisely the bug StrictMode is trying to
surface.

**With concurrent rendering.** React may prepare a render, throw it away and
prepare it again at a different priority. Your reducer can therefore run more
than once per dispatched action. A pure reducer is idempotent under that replay;
an impure one is not.

> [!WARNING]
> A reducer must not mutate its arguments, call `fetch`, read `Date.now()`,
> generate a random id, or write to anything outside itself. Compute those values
> in the event handler and put them **in the action**.

### Passing an `init` function

The third argument separates "the input the state is built from" from "the state
itself". It also gives you a reset path: call the same `init` from a reducer
case.

```jsx live
import { useReducer } from 'react';

function createInitialState(username) {
  return {
    username,
    draft: '',
    messages: [`Welcome back, ${username}.`],
  };
}

function chatReducer(state, action) {
  switch (action.type) {
    case 'typed':
      return { ...state, draft: action.text };
    case 'sent':
      if (state.draft.trim() === '') return state; // bail out, no re-render
      return {
        ...state,
        draft: '',
        messages: [...state.messages, state.draft],
      };
    case 'cleared':
      return createInitialState(state.username);
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

export default function Chat() {
  const [state, dispatch] = useReducer(chatReducer, 'ada', createInitialState);

  return (
    <div>
      <ul>
        {state.messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
      <input
        value={state.draft}
        placeholder="Message"
        onChange={(e) => dispatch({ type: 'typed', text: e.target.value })}
      />{' '}
      <button onClick={() => dispatch({ type: 'sent' })}>Send</button>{' '}
      <button onClick={() => dispatch({ type: 'cleared' })}>Clear</button>
    </div>
  );
}
```

`createInitialState` runs on mount (twice in development under StrictMode, which
is safe because it is pure) rather than on every render.

## Common patterns

### Async work belongs in the handler

```jsx
import { useReducer } from 'react';

const initialState = { status: 'idle', order: null, error: '' };

function orderReducer(state, action) {
  switch (action.type) {
    case 'submit_started':
      return { status: 'pending', order: null, error: '' };
    case 'submit_succeeded':
      return { status: 'success', order: action.order, error: '' };
    case 'submit_failed':
      return { status: 'error', order: null, error: action.message };
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

export default function OrderButton({ cartId }) {
  const [state, dispatch] = useReducer(orderReducer, initialState);

  async function placeOrder() {
    dispatch({ type: 'submit_started' });
    try {
      const response = await fetch(`/api/orders/${cartId}`, { method: 'POST' });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      dispatch({ type: 'submit_succeeded', order: await response.json() });
    } catch (error) {
      dispatch({ type: 'submit_failed', message: String(error) });
    }
  }

  return (
    <button onClick={placeOrder} disabled={state.status === 'pending'}>
      {state.status === 'pending' ? 'Placing order...' : 'Place order'}
    </button>
  );
}
```

The reducer stays pure and synchronous; the network lives in the handler. The
`status` field makes the impossible states — success *and* an error message —
unrepresentable.

### Typing a reducer with a discriminated union

TypeScript makes reducers considerably better: the `action.type` discriminant
narrows each `case` to exactly the fields that action carries, and a `never`
check makes forgetting a case a compile error.

```tsx
import { useReducer } from 'react';

type Task = { id: number; text: string; done: boolean };

type TaskAction =
  | { type: 'added'; id: number; text: string }
  | { type: 'toggled'; id: number }
  | { type: 'deleted'; id: number };

function tasksReducer(tasks: Task[], action: TaskAction): Task[] {
  switch (action.type) {
    case 'added':
      // action.text is available here; action.done is a compile error.
      return [...tasks, { id: action.id, text: action.text, done: false }];
    case 'toggled':
      return tasks.map((task) =>
        task.id === action.id ? { ...task, done: !task.done } : task
      );
    case 'deleted':
      return tasks.filter((task) => task.id !== action.id);
    default: {
      // Add a new action type without a case here and this line fails to compile.
      const unhandled: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(unhandled)}`);
    }
  }
}

export default function TypedTaskApp() {
  const [tasks, dispatch] = useReducer(tasksReducer, [] as Task[]);

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id} onClick={() => dispatch({ type: 'toggled', id: task.id })}>
          {task.done ? '[x]' : '[ ]'} {task.text}
        </li>
      ))}
    </ul>
  );
}
```

> [!TIP]
> Name actions after what happened in the interface — `added`, `toggled`,
> `reordered` — not after what the reducer should do (`setTasks`). Actions are a
> log of events; if they read like setter calls you have moved the update logic
> back into the handlers.

## Advanced example

A task list combining everything: one reducer, immutable updates, a bail-out, a
derived count computed during render, and `dispatch` handed to a child.

```jsx live
import { useReducer, useState } from 'react';

const initialTasks = [
  { id: 1, text: 'Read the Rules of Hooks', done: true },
  { id: 2, text: 'Delete an unnecessary Effect', done: false },
];

function tasksReducer(tasks, action) {
  switch (action.type) {
    case 'added':
      if (action.text.trim() === '') return tasks; // no change, no re-render
      return [...tasks, { id: action.id, text: action.text, done: false }];
    case 'toggled':
      return tasks.map((task) =>
        task.id === action.id ? { ...task, done: !task.done } : task
      );
    case 'deleted':
      return tasks.filter((task) => task.id !== action.id);
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

function TaskRow({ task, dispatch }) {
  return (
    <li>
      <label>
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => dispatch({ type: 'toggled', id: task.id })}
        />{' '}
        <span style={{ textDecoration: task.done ? 'line-through' : 'none' }}>
          {task.text}
        </span>
      </label>{' '}
      <button onClick={() => dispatch({ type: 'deleted', id: task.id })}>
        Delete
      </button>
    </li>
  );
}

export default function TaskApp() {
  const [tasks, dispatch] = useReducer(tasksReducer, initialTasks);
  const [draft, setDraft] = useState('');

  // Derived during render. Never stored.
  const remaining = tasks.filter((task) => !task.done).length;

  function add() {
    // The id is computed in the handler, not in the reducer: reducers are pure.
    dispatch({ type: 'added', id: Date.now(), text: draft });
    setDraft('');
  }

  return (
    <div>
      <input
        value={draft}
        placeholder="New task"
        onChange={(e) => setDraft(e.target.value)}
      />{' '}
      <button onClick={add}>Add</button>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} dispatch={dispatch} />
        ))}
      </ul>
      <p>{remaining} remaining</p>
    </div>
  );
}
```

`TaskRow` receives `dispatch`, whose identity never changes, so wrapping it in
[`memo`](../performance/memoization.md) would actually work — unlike a fresh
arrow function created on every render.

## Common mistakes

**Mutating state in the reducer.** `tasks.push(newTask); return tasks;` returns
the same reference, React bails out, and nothing renders. Return a new array.

**Doing side effects inside the reducer.** `fetch`, `localStorage`,
`Date.now()`, `Math.random()`, logging to an analytics endpoint. All of it
breaks under StrictMode's double invocation and under concurrent replay. Compute
in the handler, pass the result in the action.

**Generating ids inside the reducer.** `id: nextId++` produces gaps or
duplicates when the reducer runs twice. Put the id in the action.

**Forgetting the `default` case.** A typo in an action type silently returns
`undefined` and wipes your state. Throw instead — you will find the typo in
seconds.

**Calling the initializer instead of passing it.**
`useReducer(reducer, createInitialState(user))` runs on every render;
`useReducer(reducer, user, createInitialState)` runs once.

**Actions named like setters.** `{ type: 'setStep', value: 3 }` puts the logic
back in the handler and leaves the reducer as a dumb assignment. Name the event.

**Reaching for a reducer too early.** One boolean does not need one. Start with
`useState` and convert when the handlers begin repeating each other.

**Expecting `dispatch` to return the new state.** It returns nothing. Read the
new state on the next render.

## Related topics

- [useState](./use-state.md) — the simpler default, and the comparison table for choosing.
- [Reducers and context](../state-management/reducers-and-context.md) — sharing one reducer across a subtree.
- [Rules of Hooks](./rules-of-hooks.md) — why `dispatch` must not be called during render.
- [Typing hooks](../typescript/typing-hooks.md) — more on discriminated unions and inference.
- [Redux](../ecosystem/redux.md) — the same idea scaled to an application store.
- [StrictMode](../core-concepts/strict-mode.md) — why your reducer runs twice in development.
