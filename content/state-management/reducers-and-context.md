---
title: Reducers and context
description: Combine useReducer with a state context and a dispatch context to share complex state across a subtree.
group: state-management
order: 30
status: current
related: [hooks/use-reducer, state-management/context, state-management/external-stores]
---

## Overview

`useReducer` puts all of a feature's state transitions in one pure function.
Context makes that state and its `dispatch` reachable from anywhere in a
subtree. Together they are React's built-in answer to "shared state with real
rules" — no dependencies, no bundle cost.

The pattern has a specific shape:

1. One reducer that owns every transition.
2. One provider that calls `useReducer` and renders **two** contexts: state and
   dispatch.
3. Two custom hooks that read them and throw if the provider is missing.

The two-context split is the whole point. `dispatch` never changes identity, so
components that only dispatch never re-render when the state changes.

## Why it exists

A feature with a dozen `useState` calls scattered across five components has no
single place to answer "what can happen here?". Transitions are implicit,
invariants are unenforced, and every new interaction touches several files.

A reducer inverts that. Every change is a named action, every transition is a
`case`, and the whole state machine fits on one screen. Adding "undo" or
"restore from a URL" becomes tractable because the state is one serializable
object with one entry point.

Context solves the second half: the reducer's output has to reach components
that are not adjacent to it, and without it you drill both `state` and
`dispatch` through every layer.

> [!BEST-PRACTICE]
> Reach for a reducer when the *transitions* are complex, not when the *state*
> is large. Three booleans that must never be true at once want a reducer. A
> hundred independent form fields do not.

## When to use it

- The next state depends on the previous state in non-obvious ways.
- Several fields must change together to stay consistent.
- The same set of actions is triggered from components in different subtrees.
- You want the transitions testable in isolation — a reducer is a pure function,
  so a test is `expect(reducer(before, action)).toEqual(after)`, no rendering.
- The state is genuinely client state: a wizard, a cart, an editor's document,
  a filter panel, a multi-step form.

## When not to use it

**When one component owns the state.** Use `useReducer` without context. The
context layer only earns its keep when non-adjacent components need access.

**When the state changes many times a second.** Every state consumer re-renders
on every dispatch, with no selector to narrow it. A canvas editor tracking
pointer movement will feel it.

**When you need selectors, middleware, devtools or async orchestration.** This
is the honest ceiling of the pattern, and it is worth stating plainly: once you
start writing a `useSelector`-like helper, a middleware chain, an action log, or
a thunk runner, you are building a worse Redux. Use a real store instead — see
[External stores](./external-stores.md) and [Redux](../ecosystem/redux.md).

**When the state is server data.** A reducer holding `{ status, data, error }`
for a fetch is a cache with no invalidation strategy. See
[Choosing an approach](./choosing-an-approach.md).

## Basic example

A task list. The reducer owns all three transitions; the provider publishes
state and dispatch separately; `AddTask` dispatches without subscribing to the
list.

```jsx live
import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useState,
} from 'react';

const TasksContext = createContext(null);
const TasksDispatchContext = createContext(null);

function tasksReducer(tasks, action) {
  switch (action.type) {
    case 'added':
      return [...tasks, { id: action.id, title: action.title, done: false }];
    case 'toggled':
      return tasks.map((task) =>
        task.id === action.id ? { ...task, done: !task.done } : task,
      );
    case 'deleted':
      return tasks.filter((task) => task.id !== action.id);
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

const INITIAL_TASKS = [
  { id: 1, title: 'Read the reducer docs', done: true },
  { id: 2, title: 'Split state and dispatch contexts', done: false },
];

function TasksProvider({ children }) {
  const [tasks, dispatch] = useReducer(tasksReducer, INITIAL_TASKS);

  return (
    <TasksDispatchContext value={dispatch}>
      <TasksContext value={tasks}>{children}</TasksContext>
    </TasksDispatchContext>
  );
}

function useTasks() {
  const tasks = useContext(TasksContext);
  if (tasks === null) {
    throw new Error('useTasks must be used inside <TasksProvider>');
  }
  return tasks;
}

function useTasksDispatch() {
  const dispatch = useContext(TasksDispatchContext);
  if (dispatch === null) {
    throw new Error('useTasksDispatch must be used inside <TasksProvider>');
  }
  return dispatch;
}

function AddTask() {
  const dispatch = useTasksDispatch();
  const [title, setTitle] = useState('');
  const nextId = useRef(100);

  function handleSubmit(event) {
    event.preventDefault();
    if (title.trim() === '') return;
    nextId.current += 1;
    dispatch({ type: 'added', id: nextId.current, title: title.trim() });
    setTitle('');
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="New task"
        aria-label="New task"
      />
      <button type="submit">Add</button>
    </form>
  );
}

function TaskList() {
  const tasks = useTasks();
  const dispatch = useTasksDispatch();

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          <label>
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => dispatch({ type: 'toggled', id: task.id })}
            />{' '}
            {task.done ? <s>{task.title}</s> : task.title}
          </label>{' '}
          <button onClick={() => dispatch({ type: 'deleted', id: task.id })}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}

function RemainingCount() {
  const tasks = useTasks();
  const remaining = tasks.filter((task) => !task.done).length;
  return <p>{remaining} remaining</p>;
}

export default function TaskApp() {
  return (
    <TasksProvider>
      <AddTask />
      <TaskList />
      <RemainingCount />
    </TasksProvider>
  );
}
```

`RemainingCount` derives its number during render. Storing a `remaining` field
in the reducer would be a second source of truth that every action has to
remember to update.

## How it works

`useReducer(reducer, initialState)` returns the current state and a `dispatch`
function. Calling `dispatch(action)` schedules a re-render; React then calls
`reducer(currentState, action)` to produce the next state.

Three properties make the pattern work:

**`dispatch` is stable.** React guarantees its identity does not change between
renders, so it is safe as a dependency and safe to put in its own context
without memoization.

**The reducer must be pure.** It takes state and action, returns new state,
touches nothing else. No fetches, no `Math.random()`, no mutation of the
previous state. In development [StrictMode](../core-concepts/strict-mode.md)
calls your reducer twice with the same arguments to surface impurity; a pure
reducer produces the same result both times and you notice nothing.

**Immutability is required.** Returning the same array after `tasks.push(...)`
gives React the same identity, and it skips the re-render. Always return a new
object or array.

### Why two contexts

If state and dispatch share one context, its value is an object that changes
identity every time the state changes, so every consumer re-renders — including
components that only ever dispatch.

Split them and the picture changes:

| | Single context | State + dispatch contexts |
|---|---|---|
| Value identity | New on every state change | State changes; dispatch never does |
| Dispatch-only components | Re-render on every action | Never re-render |
| Provider code | Needs `useMemo` on the value | No memoization needed |
| Consumer code | One hook | Two hooks; take only what you need |

`AddTask` in the example above reads only `TasksDispatchContext`. Adding a
thousand tasks does not re-render it.

> [!WARNING]
> The split narrows re-renders to *state consumers*, not to *the parts of state
> they use*. `RemainingCount` re-renders when a task's title is edited, because
> it subscribes to the whole array. Context has no selector. If that matters,
> you have outgrown the pattern.

## Common patterns

### Action creators instead of raw objects

Dispatching `{ type: 'added', id, title }` from twelve components spreads the
action shape across the codebase. Export helpers from the provider module —
`addTask(title)`, `toggleTask(id)` — and keep the object literals in one file.

### Scope the provider, and keep one reducer per feature

Render `<TasksProvider>` around the tasks feature, not around the whole app. A
narrower provider means fewer consumers, fewer re-renders, and state that
unmounts with the feature. One giant `appReducer` recreates the mega-context
problem: any action re-renders every consumer.

## Advanced example

The same store with typed actions. The discriminated union plus the `never`
check in the `default` branch means adding a new action type to `TaskAction` and
forgetting to handle it is a compile error, not a runtime one.

```tsx
import { createContext, useContext, useReducer } from 'react';
import type { Dispatch, ReactNode } from 'react';

export type Task = {
  id: number;
  title: string;
  done: boolean;
};

export type TaskAction =
  | { type: 'added'; id: number; title: string }
  | { type: 'toggled'; id: number }
  | { type: 'deleted'; id: number };

export function tasksReducer(tasks: Task[], action: TaskAction): Task[] {
  switch (action.type) {
    case 'added':
      return [...tasks, { id: action.id, title: action.title, done: false }];
    case 'toggled':
      return tasks.map((task) =>
        task.id === action.id ? { ...task, done: !task.done } : task,
      );
    case 'deleted':
      return tasks.filter((task) => task.id !== action.id);
    default: {
      // Exhaustiveness check: `action` is `never` if every case is handled.
      const unhandled: never = action;
      throw new Error(`Unhandled task action: ${JSON.stringify(unhandled)}`);
    }
  }
}

const TasksContext = createContext<Task[] | null>(null);
const TasksDispatchContext = createContext<Dispatch<TaskAction> | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, dispatch] = useReducer(tasksReducer, []);

  return (
    <TasksDispatchContext value={dispatch}>
      <TasksContext value={tasks}>{children}</TasksContext>
    </TasksDispatchContext>
  );
}

export function useTasks(): Task[] {
  const tasks = useContext(TasksContext);
  if (tasks === null) {
    throw new Error('useTasks must be used inside <TasksProvider>');
  }
  return tasks;
}

export function useTasksDispatch(): Dispatch<TaskAction> {
  const dispatch = useContext(TasksDispatchContext);
  if (dispatch === null) {
    throw new Error('useTasksDispatch must be used inside <TasksProvider>');
  }
  return dispatch;
}
```

Because both contexts default to `null`, the hooks distinguish "no provider"
from "empty task list", and their return types are non-nullable for callers.

### Async work belongs outside the reducer

Reducers are pure, so a reducer cannot fetch. Do the async work in the event
handler or an Action, then dispatch the result:

```jsx
import { useTransition } from 'react';

export default function SaveButton({ task, dispatch }) {
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const saved = await fetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(task),
      }).then((response) => response.json());

      dispatch({ type: 'saved', id: saved.id });
    });
  }

  return (
    <button onClick={handleSave} disabled={isPending}>
      {isPending ? 'Saving…' : 'Save'}
    </button>
  );
}
```

Once several such flows need to coordinate — retries, cancellation, request
deduplication, optimistic rollback across screens — the reducer stops being the
right home for them. That is the signal to move to a store with middleware, or
to a server-state library.

## Common mistakes

**Mutating the state argument.** `tasks.push(newTask); return tasks;` returns
the same identity, so React bails out and the UI does not update. Return a new
array.

**Side effects inside the reducer.** Logging to an analytics endpoint, writing
to `localStorage`, or reading `Date.now()` makes the reducer impure. StrictMode
double-invocation will make those effects happen twice in development, which is
the warning, not the bug.

**One context for state and dispatch.** Every dispatch-only component re-renders
on every action. Split them.

**Memoizing `dispatch`.** It is already stable. Wrapping it in `useCallback` or
`useMemo` adds noise and no benefit.

**Storing derived data in the reducer.** `completedCount`, `filteredTasks` and
`isEmpty` are computed from `tasks`. Every action would have to keep them in
sync, and one day one of them will not.

**A provider at the app root for feature state.** It makes the state global,
keeps it alive after the feature unmounts, and widens the re-render blast
radius. Render the provider where the feature lives.

**Growing it into a framework.** Selector helpers, a middleware array, an action
history, a thunk runner — each addition is reasonable and the sum is an
untested, undocumented state library. Adopt a real one at that point.

## Related topics

- [useReducer](../hooks/use-reducer.md) — the hook's full reference, including
  lazy initialization.
- [Context](./context.md) — the re-render model that makes the two-context split
  necessary.
- [External stores](./external-stores.md) — where to go when you need selectors
  or middleware.
- [Redux](../ecosystem/redux.md) — the mature version of this pattern, with
  devtools and RTK Query.
- [Choosing an approach](./choosing-an-approach.md) — how this fits the ladder.
- [useTransition](../hooks/use-transition.md) — running the async half of an
  action without blocking the UI.
