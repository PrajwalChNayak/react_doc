---
title: Redux
description: Redux Toolkit, RTK Query and redux-persist in one page, plus an honest answer to whether you need any of it.
group: ecosystem
order: 60
status: current
related: [state-management/external-stores, state-management/choosing-an-approach, ecosystem/data-libraries]
---

## Overview

Redux is a third-party state container. It is not part of React, it is not
maintained by the React team, and React ships nothing equivalent.

Two things are true about Redux in 2026, and both matter before you install
anything.

**Redux Toolkit is the only sanctioned way to write Redux.** Not a convenience
wrapper, not one option among several — the official recommendation. The
handwritten action types, switch-statement reducers and `combineReducers` trees
that Redux is remembered for are not how you write it now, and the Redux
documentation itself says so.

**Most applications that reach for Redux needed a server-state library
instead.** The "we need global state" conversation is usually a symptom of
caching API responses by hand. If the answer to "where does this data come
from?" is "a server", it belongs in a cache — RTK Query, TanStack Query or SWR —
not in a store. See
[Choosing an approach](../state-management/choosing-an-approach.md#server-state-is-not-client-state).

What is left after those two corrections is a smaller, sharper tool: one store,
typed selectors, serializable actions, and a time-travelling debugger that
nothing else matches.

```bash
npm install @reduxjs/toolkit react-redux
```

That is the whole install. You do not install `redux` — Redux Toolkit depends on
it — and you do not install `redux-thunk`, `reselect` or `immer`, all of which
come with it.

## Why it exists

Redux (2015) answered a question React had no answer for: how do you make a
change in one part of a large application visibly, predictably update a
different part, and be able to explain afterwards why the state looks like it
does?

Its answer is three constraints:

1. **One store.** A single object tree for the whole application, so there is
   one place to look.
2. **State is read-only.** Nothing mutates it. You dispatch a plain,
   serializable object describing what happened.
3. **Changes are pure functions.** A reducer takes `(state, action)` and returns
   the next state, with no I/O and no randomness.

Those constraints buy you something no other model gives you: because every
change is a serializable action processed by a pure function, the entire history
of your application is replayable. That is what Redux DevTools is — not a state
inspector, a time machine.

The cost was ceremony. Every feature meant an action type constant, an action
creator, a reducer case, a `switch` with a `default`, and a spread-heavy
immutable update that broke silently if you missed a level. Redux Toolkit exists
because that ceremony was never the point; the constraints were.

## When to use it

Redux Toolkit earns its place when several of these are true at once:

- **A large, long-lived application with several teams.** The ceremony that
  looks like overhead in a small app is a shared contract in a big one.
- **Complex client-side state with rules**, not only values: an editor with
  undo, a configurator, a booking flow where one change invalidates three others.
- **Many components read the same fast-changing value**, each needing a
  different slice of it — the case where context re-renders everything.
- **You need to debug state changes after the fact.** Action logs, diffs and
  time travel are hard to give up once a team relies on them.
- **State must be readable outside React** — a WebSocket handler, a service
  worker, non-React code.
- **You are already on Redux and you want RTK Query.** It is included.

## When not to use it

**Do not use Redux to cache server data.** This is the big one. A slice full of
`data`, `loading` and `error` for one endpoint is a worse version of a query
library: no deduplication, no staleness policy, no refetch on focus, no
invalidation, no cancellation, no retries. Use RTK Query — which is in the same
package — or [TanStack Query](./data-libraries.md).

**Do not use Redux for a form**, or for UI state one component owns. An action
per keystroke into a global store is a lot of machinery for a value that belongs
in `useState`. See [Forms](./forms.md).

**Do not use Redux for a theme, a locale or a session.** Those change twice a
session and are read everywhere — exactly what
[context](../state-management/context.md) is for.

**Do not add Redux to a new small or medium application by default.** Start on
the [ladder](../state-management/choosing-an-approach.md) and climb only when
you can name the trigger. Zustand or Jotai covers most of what remains with a
fraction of the surface area.

## Basic example

Three files. This is a complete, typed Redux setup.

### The slice

`createSlice` generates the action types, the action creators and the reducer
from one object. The mutations inside are real: Immer wraps the draft and
produces an immutable next state, so `state.value += 1` is safe and correct.

```ts
// features/cart/cartSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type CartLine = { productId: string; name: string; unitPrice: number; quantity: number };
type CartState = { lines: CartLine[]; promoCode: string | null };

const initialState: CartState = { lines: [], promoCode: null };

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // Action type is derived from the slice name: "cart/lineAdded".
    lineAdded(state, action: PayloadAction<Omit<CartLine, 'quantity'>>) {
      const existing = state.lines.find(
        (line) => line.productId === action.payload.productId,
      );
      if (existing) {
        // Looks like mutation. Immer turns it into an immutable update.
        existing.quantity += 1;
      } else {
        state.lines.push({ ...action.payload, quantity: 1 });
      }
    },
    lineRemoved(state, action: PayloadAction<string>) {
      state.lines = state.lines.filter((l) => l.productId !== action.payload);
    },
    promoApplied(state, action: PayloadAction<string>) {
      state.promoCode = action.payload;
    },
  },
  // Selectors declared here receive the slice's own state, not the root state.
  selectors: {
    selectLines: (state) => state.lines,
    selectSubtotal: (state) =>
      state.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
  },
});

export const { lineAdded, lineRemoved, promoApplied } = cartSlice.actions;
export const { selectLines, selectSubtotal } = cartSlice.selectors;
export default cartSlice.reducer;
```

Name actions for **what happened**, not for what should change. `lineAdded`
describes an event; `setLines` describes a setter, and a setter tells you
nothing when you read it back in DevTools six weeks later.

### The store

```ts
// app/store.ts
import { configureStore } from '@reduxjs/toolkit';
import cartReducer from '../features/cart/cartSlice';

export const store = configureStore({ reducer: { cart: cartReducer } });

// Infer the types from the store itself, so they can never drift.
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
```

`configureStore` is not a thin wrapper. Out of the box it combines your
reducers, adds the thunk middleware, wires up the Redux DevTools extension, and
in development adds two checks that catch real bugs: an **immutability check**
that fails if a reducer mutates state outside Immer, and a **serializability
check** that fails if you put a `Date`, a `Map`, a `Promise` or a class instance
into state or into an action.

### Typed hooks

Write these once and import them everywhere instead of the raw `useSelector` and
`useDispatch`. Untyped `useSelector` gives you `any` state, which throws away
most of the reason to use TypeScript.

```ts
// app/hooks.ts
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { AppDispatch, AppStore, RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();
```

### The component

```jsx static="Requires a Redux store and a Provider above it."
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { lineRemoved, selectLines, selectSubtotal } from './cartSlice';

export default function CartSummary() {
  // Slice selectors take the root state, so they pass straight in.
  // Each one subscribes this component to that value only.
  const lines = useAppSelector(selectLines);
  const subtotal = useAppSelector(selectSubtotal);
  const dispatch = useAppDispatch();

  if (lines.length === 0) return <p>Your cart is empty.</p>;

  return (
    <section>
      <ul>
        {lines.map((line) => (
          <li key={line.productId}>
            {line.name} × {line.quantity}{' '}
            <button onClick={() => dispatch(lineRemoved(line.productId))}>
              Remove {line.name}
            </button>
          </li>
        ))}
      </ul>
      <p>Subtotal: {subtotal.toFixed(2)}</p>
    </section>
  );
}
```

And at the root, once: `createRoot(...).render(<StrictMode><Provider
store={store}><App /></Provider></StrictMode>)`, with `Provider` imported from
`react-redux`.

> [!DEPRECATED]
> The Redux documentation states plainly that "the original Redux core
> `createStore` method is deprecated". It still works and will not be removed —
> the deprecation is a marker, not a runtime warning — but new code uses
> `configureStore` from Redux Toolkit, and reducer logic uses `createSlice`.
> Handwritten action type constants, `combineReducers`, `applyMiddleware` and
> manual spread-based immutable updates are all things Redux Toolkit does for
> you.

## How it works

### The cycle

The mental model is one loop, unchanged since 2015:

1. A component **dispatches** an action — a plain object like
   `{ type: 'cart/lineAdded', payload: { productId: 'p-1', … } }`.
2. The store passes the current state and that action to the **reducer**, which
   returns the **next state**. It is pure: no fetching, no `Math.random()`, no
   `Date.now()`.
3. The store notifies subscribers, and `react-redux` runs each subscribed
   component's selector. **A component re-renders only if the value its selector
   returned actually changed.**

Step 3 is what makes Redux scale where context does not. Context has no
selector: every consumer re-renders when the provider's value identity changes.
Redux subscribes per selector, so a component reading `state.cart.promoCode`
does not render when a line quantity changes.

### Immer, and the one rule it has

Redux Toolkit runs your case reducers inside Immer, which hands you a mutable
**draft**, records what you touched, and produces a new immutable state from
the record. `state.lines.push(...)` is legal and correct.

The rule: **mutate the draft, or return a new value — never both in one
reducer.** Returning something while also mutating leaves Immer with two
conflicting answers, and it throws.

So `state.lines = state.lines.filter(…)` is fine, and
`cartReset() { return { lines: [], promoCode: null }; }` is fine — but a reducer
that assigns to `state.promoCode` *and then* returns a new object throws.

Immer's draft only applies to state inside the reducer. Anything you take *out*
of state and hold onto — in a selector, a component, a thunk — is frozen in
development, and mutating it throws.

### Selectors, memoization and the identity trap

A selector that builds a new object or array on every call defeats the
re-render check, because `react-redux` compares the result by reference.
`useAppSelector((s) => s.cart.lines.filter(…))` returns a fresh array every
time, so that component re-renders on **every** action in the app.

Use `createSelector` from Redux Toolkit (it re-exports Reselect) whenever a
selector derives a new object or array:

```ts
// features/cart/selectors.ts
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';

const selectLines = (state: RootState) => state.cart.lines;
const selectPromoCode = (state: RootState) => state.cart.promoCode;

// Recomputes only when an input changes identity, and returns the same
// reference otherwise — so consumers stop re-rendering on unrelated actions.
export const selectTotal = createSelector(
  [selectLines, selectPromoCode],
  (lines, promoCode) => {
    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    return promoCode === 'WELCOME10' ? subtotal * 0.9 : subtotal;
  },
);
```

Selectors returning a **primitive** — a number, a string, a boolean — never need
memoizing. The identity trap only exists for objects and arrays.

### Redux DevTools

`configureStore` enables the browser extension automatically. What you get is
worth naming, because it is the strongest reason to choose Redux over a smaller
store:

- Every dispatched action, in order, with its payload and a **diff** of the
  state before and after it.
- **Time travel** — click an earlier action and the UI re-renders as it was.
- **Action replay**, so you can export a session from a bug report and step
  through it locally, plus dispatching by hand to reproduce a state.

In production, disable it. It is on by default in development builds and
exposing your entire application state to any script on the page is not
something to ship.

## Common patterns

### `createAsyncThunk` versus RTK Query

Reducers are pure, so asynchronous work happens in middleware. Redux Toolkit
gives you two tools, and picking the wrong one is the most common Redux mistake
that survives into 2026.

`createAsyncThunk` wraps a promise and dispatches three actions —
`pending`, `fulfilled` and `rejected` — that a slice handles in `extraReducers`,
usually as a `status` string and an `error`.

```ts
// features/checkout/checkoutSlice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

export const submitOrder = createAsyncThunk(
  'checkout/submitOrder',
  async (orderId: string, { rejectWithValue }) => {
    const res = await fetch(`/api/orders/${orderId}/submit`, { method: 'POST' });
    if (!res.ok) return rejectWithValue(await res.text());
    return res.json();
  },
);

const checkoutSlice = createSlice({
  name: 'checkout',
  initialState: { status: 'idle', error: null as string | null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(submitOrder.pending, (s) => { s.status = 'submitting'; })
      .addCase(submitOrder.fulfilled, (s) => { s.status = 'succeeded'; })
      .addCase(submitOrder.rejected, (s, action) => {
        s.status = 'failed';
        s.error = String(action.payload ?? action.error.message);
      });
  },
});

export default checkoutSlice.reducer;
```

That is the right tool for a **one-shot side effect whose result is client
state**: submitting an order, uploading a file, running a wizard step.

It is the **wrong** tool for fetching data you display. Written that way it
gives you a `status` and an `error` and nothing else — no cache key, no
deduplication, no staleness, no invalidation. Every screen writes the same
twenty lines and every screen gets them slightly wrong.

| | `createAsyncThunk` | RTK Query |
|---|---|---|
| Purpose | An async side effect that produces client state | Fetching and caching server data |
| Caching | None — you write the slice | Automatic, keyed by endpoint + argument |
| Deduplication | None | Automatic |
| Loading and error state | Three cases you write | Provided by the generated hook |
| Invalidation | Manual dispatch | Declarative tags |
| Code per endpoint | A thunk, three cases, a slice | Four lines |
| Use it for | Submit, upload, multi-step orchestration | Every GET, and most mutations |

> [!BEST-PRACTICE]
> If a `createAsyncThunk` exists only to `fetch` something and put it in state,
> replace it with an RTK Query endpoint. You will delete the slice.

### RTK Query in depth

RTK Query is a full data-fetching and caching layer that ships inside
`@reduxjs/toolkit`. There is nothing extra to install.

**Define the API once.** Endpoints are declared, hooks are generated.

```ts
// app/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

type Project = { id: string; name: string; archived: boolean };

export const api = createApi({
  reducerPath: 'api', // Where the cache lives in the store.
  // prepareHeaders is the hook for auth tokens read out of the store.
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Project'], // Every tag this API can provide or invalidate.
  endpoints: (builder) => ({
    getProjects: builder.query<Project[], void>({
      query: () => 'projects',
      // Tag the collection itself, and every project in it.
      providesTags: (result = []) => [
        ...result.map(({ id }) => ({ type: 'Project' as const, id })),
        { type: 'Project' as const, id: 'LIST' },
      ],
    }),
    getProject: builder.query<Project, string>({
      query: (id) => `projects/${id}`,
      providesTags: (r, e, id) => [{ type: 'Project', id }],
    }),
    createProject: builder.mutation<Project, { name: string }>({
      query: (body) => ({ url: 'projects', method: 'POST', body }),
      // A new project changes the list, not any existing project.
      invalidatesTags: [{ type: 'Project', id: 'LIST' }],
    }),
    renameProject: builder.mutation<Project, { id: string; name: string }>({
      query: ({ id, ...patch }) => ({
        url: `projects/${id}`, method: 'PATCH', body: patch,
      }),
      // Only this project's queries are stale.
      invalidatesTags: (result, error, { id }) => [{ type: 'Project', id }],
    }),
  }),
});

// One hook per endpoint: use<Endpoint>Query / use<Endpoint>Mutation.
export const {
  useGetProjectsQuery, useGetProjectQuery,
  useCreateProjectMutation, useRenameProjectMutation,
} = api;
```

**Tag-based invalidation is the feature to understand.** A query `providesTags`;
a mutation `invalidatesTags`. When the tags intersect, RTK Query refetches every
affected query that is currently rendered. You declare the relationship once,
next to the endpoint, instead of remembering to refresh three screens from the
component that mutates. The `'LIST'` convention expresses "the collection
itself": creating a project invalidates `LIST` so the list refetches, without
touching the cache of any individual project that did not change.

**Wire it into the store**, including the middleware that runs the cache:

```ts
// app/store.ts
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api';
import cartReducer from '../features/cart/cartSlice';

export const store = configureStore({
  reducer: { cart: cartReducer, [api.reducerPath]: api.reducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});

// Enables refetchOnFocus and refetchOnReconnect.
setupListeners(store.dispatch);
```

Forgetting `.concat(api.middleware)` is the most common RTK Query setup bug:
queries fire, but nothing caches, invalidates or refetches.

**Use the generated hooks.** No slice, no thunk, no loading booleans.

```jsx static="Requires a configured store, the API slice, and a live endpoint."
import { useGetProjectsQuery, useCreateProjectMutation } from '../app/api';

export default function ProjectList() {
  const { data: projects = [], isLoading, isFetching, isError, refetch } =
    useGetProjectsQuery();
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();

  async function addProject() {
    try {
      // .unwrap() turns the result into a promise that rejects on failure,
      // so you can use try/catch instead of inspecting the result object.
      await createProject({ name: 'Untitled project' }).unwrap();
      // No manual refetch: invalidatesTags already refreshed the list.
    } catch {
      // Show a toast. The cache is untouched.
    }
  }

  if (isLoading) return <p>Loading projects…</p>;
  if (isError) return <button onClick={() => refetch()}>Retry</button>;

  return (
    <section aria-busy={isFetching}>
      <button onClick={addProject} disabled={isCreating}>
        {isCreating ? 'Creating…' : 'New project'}
      </button>
      <ul>
        {projects.map((project) => (
          <li key={project.id}>{project.name}</li>
        ))}
      </ul>
    </section>
  );
}
```

`isLoading` is true only on the first fetch with no data. `isFetching` is true
for any fetch including background revalidation — which is why the list stays on
screen while `aria-busy` tells assistive technology something is happening.

**Optimistic updates** patch the cache before the server answers, and roll back
if it refuses:

```ts
// Inside endpoints: (builder) => ({ ... })
toggleArchived: builder.mutation<Project, { id: string; archived: boolean }>({
  query: ({ id, archived }) => ({
    url: `projects/${id}`, method: 'PATCH', body: { archived },
  }),
  async onQueryStarted({ id, archived }, { dispatch, queryFulfilled }) {
    // Write to the cache immediately. The UI updates this frame.
    const patch = dispatch(
      api.util.updateQueryData('getProject', id, (draft) => {
        draft.archived = archived;
      }),
    );
    try {
      await queryFulfilled;
    } catch {
      // The server rejected it. Put the cache back exactly as it was.
      patch.undo();
    }
  },
  invalidatesTags: (result, error, { id }) => [{ type: 'Project', id }],
}),
```

Do this for actions that almost always succeed and whose failure is cheap to
undo — a like, a star, a checkbox. Do not do it for anything a user would act on
believing it had committed. Compare with
[`useOptimistic`](../hooks/use-optimistic.md), which does the same job for a
single form without a cache.

Other endpoint options worth knowing: `transformResponse` reshapes a payload
before it is cached, `transformErrorResponse` normalizes errors,
`keepUnusedDataFor` controls how long an unrendered entry survives, and
`pollingInterval` on the hook turns a query into a poll.

### redux-persist

`redux-persist` writes slices of your store to storage and rehydrates them on
load. It is genuinely useful for a cart, a draft, or a set of preferences — and
it comes with caveats you should read before adopting it.

```ts
// app/store.ts
import { configureStore } from '@reduxjs/toolkit';
import {
  persistStore, persistReducer,
  FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage'; // localStorage
import cartReducer from '../features/cart/cartSlice';

const persistedCart = persistReducer(
  // Persist as little as possible, and version it from day one.
  { key: 'cart', version: 1, storage, whitelist: ['lines', 'promoCode'] },
  cartReducer,
);

export const store = configureStore({
  reducer: { cart: persistedCart },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // redux-persist dispatches non-serializable lifecycle actions.
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);
```

At the root, wrap `<App />` in `<PersistGate persistor={persistor}>` — imported
from `redux-persist/integration/react` — inside the `<Provider>`. It holds
rendering until rehydration finishes, so the first paint is not the empty
initial state.

> [!WARNING]
> Four caveats, in order of how often they bite:
>
> **Persisted state is a schema you now have to version.** A user with a
> two-month-old cart in `localStorage` will rehydrate a shape your reducers no
> longer understand, and the crash happens before your error boundary mounts.
> Set `version` and write a `migrate` function every time the shape changes.
>
> **Never persist server data.** A stale cached API response restored from disk
> is worse than no data: it renders as if it were current. Persist client state
> only, and exclude the RTK Query `reducerPath` explicitly.
>
> **Never persist secrets.** `localStorage` is readable by any script on the
> origin. Auth tokens belong in an HTTP-only cookie.
>
> **It does not work with server rendering as-is.** There is no `localStorage`
> on the server, so the server and the client render different trees and
> hydration mismatches.
>
> Also worth knowing before you adopt it: `redux-persist` has been at **6.0.0
> since September 2019**, its repository was last pushed to in May 2024, and it
> has several hundred open issues. It is not archived and it works, but it is
> not actively developed. For a small amount of persistence, a `subscribe`
> listener that writes one slice to `localStorage` is perhaps fifteen lines and
> has no schema-migration story to inherit.

### Server rendering

Create the store **per request**. A module-level `export const store = …`
evaluated on a server is shared across every user, leaking one person's state
into another person's HTML. Export a `makeStore()` factory and call it in the
request handler.

## Advanced example

### Redux Toolkit versus the alternatives

| | Redux Toolkit | Zustand | Jotai | Plain context |
|---|---|---|---|---|
| Package | `@reduxjs/toolkit` + `react-redux` | `zustand` | `jotai` | Built into React |
| Model | One store, actions, reducers | One or more stores, direct setters | Atoms composed into a graph | A value passed down a tree |
| Re-render granularity | Per selector | Per selector | Per atom | **Every consumer** |
| Boilerplate | Low with RTK, but a real API to learn | Minimal | Minimal | None |
| DevTools | **Best in class** — time travel, diffs, replay | Redux DevTools bridge | Atom inspector | React DevTools only |
| Middleware | First class — thunks, listeners, logging | Middleware-ish | Not the model | None |
| Async and caching | **RTK Query included** | Bring your own | Bring your own | Bring your own |
| Derived state | `createSelector` | Selectors, or `useMemo` | **The core idea** — derived atoms | `useMemo` |
| Read outside React | Yes | Yes | Yes (with a store) | No |
| Server rendering | Works; store must be per request | Works; store must be per request | Works, with a provider | Works |
| Bundle cost | Largest of the four | Very small | Small | Zero |
| Best for | Large apps, many teams, deep debugging | Most apps that outgrew `useState` | Fine-grained derived state | Theme, locale, session |

**Zustand** is the default recommendation for an app that has outgrown lifting
state up: a hook that is a store, with selectors and almost nothing to learn.
**Jotai** fits when state is a dependency graph of small derived values, like a
spreadsheet or a design tool. **Context** is not a store and should not be
compared as one — it has no selectors, so every consumer re-renders. See
[External stores](../state-management/external-stores.md).

**Redux Toolkit wins on two axes and only two:** the debugging experience, and
having a first-class caching layer in the box. If neither is decisive, one of
the smaller stores will serve you better.

### What a whole feature looks like

The shape a mature Redux Toolkit codebase converges on:

| Kind of state | Where it lives |
|---|---|
| Everything from the server | An RTK Query endpoint |
| Client state a whole feature shares | A `createSlice` slice |
| One-shot async side effects | `createAsyncThunk`, or a mutation |
| Derived values | `createSelector`, never a slice field |
| UI state one component owns | `useState`, not the store |
| Filters, sort, pagination, the current tab | The URL — see [Routing](./routing.md) |
| Theme, locale, session | Context |

Notice what is *not* in the store. A store that contains only what genuinely
belongs there is small, and a small store is one people can still reason about
after two years.

## Common mistakes

**Caching server data in a slice.** The mistake this page exists to prevent.
`data` / `loading` / `error` per endpoint is a worse query library. Use RTK
Query.

**Putting everything in the store because it is there.** State only one
component reads should stay in that component; otherwise deleting a feature
never deletes its state.

**Writing Redux the pre-toolkit way.** Handwritten action constants,
`combineReducers`, `applyMiddleware`, spread-based updates. Redux's own docs
deprecate `createStore` and point at `configureStore` and `createSlice`.

**Mutating state outside a reducer, or mutating *and* returning inside one.**
Immer's draft exists only inside the case reducer — anything you pull out of the
store is frozen in development — and doing both in one reducer leaves Immer with
two conflicting answers, so it throws.

**Selectors that build a new object or array every call.** The reference changes
every time, so the component re-renders on every action. Memoize with
`createSelector`, or select primitives.

**Using untyped `useSelector`.** State becomes `any` and every selector is an
unchecked property access. Write the `withTypes` hooks once.

**Forgetting `.concat(api.middleware)`.** RTK Query requests fire but nothing
caches, invalidates, refetches or polls, and there is no error to tell you why.

**Invalidating with a bare tag when you meant one entity.**
`invalidatesTags: ['Project']` refetches every project query in the app. Use
`{ type: 'Project', id }` for a single record and the `'LIST'` convention for
the collection.

**Naming actions as setters.** `setUser`, `setLoading`, `setData` produce a
DevTools log that says what changed but never why. `userSignedIn` says both.

**Persisting the whole store.** A stale server response restored from disk
renders as if it were current, and a shape change from three releases ago
crashes on load. Whitelist a few client-state keys and version them.

**Storing non-serializable values.** `Date`, `Map`, `Set`, class instances,
functions and promises break time travel, persistence and the DevTools. Store an
ISO string and parse it in a selector.

**A module-level store on a server.** Every request shares one user's state.
Build it per request.

## Related topics

- [Choosing an approach](../state-management/choosing-an-approach.md) — the
  ladder that decides whether you need Redux at all.
- [External stores](../state-management/external-stores.md) — Zustand, Jotai and
  the subscription model underneath all of them.
- [Data libraries](./data-libraries.md) — RTK Query compared with TanStack
  Query, SWR, Apollo Client and tRPC.
- [Data fetching → Libraries](../data-fetching/libraries.md) — RTK Query usage
  next to the alternatives, with worked examples.
- [Context](../state-management/context.md) — the tool Redux is most often
  reached for instead of.
- [useOptimistic](../hooks/use-optimistic.md) — optimistic UI for a single form,
  without a cache to patch.
