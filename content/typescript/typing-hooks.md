---
title: Typing hooks
description: Annotate state, refs, reducers, context and the React 19 action hooks so inference works for you.
group: typescript
order: 30
status: current
since: "19.0"
related: [typescript/setup, hooks/use-state, hooks/use-reducer, hooks/use-ref, hooks/use-context]
---

## Overview

Most hooks infer their types from what you pass them. The skill is knowing the
few places where inference cannot succeed — an empty array, a `null` initial
value, a reducer with more than one action shape — and supplying exactly one
type argument there.

Two signatures changed in `@types/react` 19: `useRef` now requires an argument
and returns a single `RefObject<T>`, and `useReducer` infers better but rejects
the old whole-reducer type argument.

## Why it exists

A hook's return type is the type of a value that outlives a render. Get it wrong
and every consumer downstream is wrong too, usually in a way that only surfaces
on the second render — the one where state is no longer the initial value.

## When to use it

Add an explicit type argument when the initial value is narrower than the values
the state will actually hold. Leave it off otherwise: `useState(0)` is `number`
and adding `<number>` is noise.

## When not to use it

Do not annotate a hook's return value by declaring the variable's type. Writing
`const [items, setItems]: [Item[], Dispatch<SetStateAction<Item[]>>] = useState<Item[]>([])`
says the same thing twice and drifts. Put the type argument on the hook.

## Basic example

```tsx
import { useState } from 'react';

type Filter = 'all' | 'active' | 'done';

export function TaskFilter() {
  // Inferred as Filter, because the initial value is compared against Filter below.
  const [filter, setFilter] = useState<Filter>('all');

  return (
    <div role="group" aria-label="Filter tasks">
      {(['all', 'active', 'done'] as const).map(value => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          onClick={() => setFilter(value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
```

Without `<Filter>`, `useState('all')` infers `string` — widening a literal is
what TypeScript does with a mutable binding — and `setFilter('activ')` would
compile.

## How it works

### useState

`useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>]`.
The setter accepts either a value or an updater function, which is why
`setCount(c => c + 1)` type-checks against the same type.

Three cases need an explicit argument:

```tsx
import { useState } from 'react';

type CartLine = { sku: string; quantity: number };
type User = { id: string; email: string };

export function useCheckoutState() {
  // Empty array would infer never[].
  const [lines, setLines] = useState<CartLine[]>([]);

  // null would infer null, and you could never set a user.
  const [user, setUser] = useState<User | null>(null);

  // A string literal widens to string; the union keeps it narrow.
  const [step, setStep] = useState<'cart' | 'address' | 'payment'>('cart');

  return { lines, setLines, user, setUser, step, setStep };
}
```

> [!TIP]
> `useState<User | null>(null)` forces every read site to handle the null case,
> which is the point. Do not reach for `useState({} as User)` — it lies, and the
> first `user.email` on the initial render throws at runtime.

Lazy initializers are typed by their return value, so an expensive computation
does not need an annotation:

```tsx
import { useState } from 'react';

export function usePreferences() {
  const [prefs, setPrefs] = useState(() => ({
    theme: 'system' as 'system' | 'light' | 'dark',
    density: 'comfortable' as 'comfortable' | 'compact',
  }));
  return [prefs, setPrefs] as const;
}
```

### useRef

`@types/react` 19 replaced the old two-headed ref type with one interface:

```text
interface RefObject<T> { current: T }

function useRef<T>(initialValue: T): RefObject<T>;
function useRef<T>(initialValue: T | null): RefObject<T | null>;
function useRef<T>(initialValue: T | undefined): RefObject<T | undefined>;
```

Every overload requires an argument, and `current` is always writable. In
`@types/react` 18 a ref created with `null` came back read-only, which is why
people wrote `useRef<T | null>(null)` to get a mutable one. That workaround is
no longer needed.

```tsx
import { useRef, useEffect } from 'react';

export function SearchField() {
  // DOM node: not attached until after commit, so the type includes null.
  const inputRef = useRef<HTMLInputElement>(null);

  // Mutable instance value: never null after the first assignment.
  const submitCount = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      type="search"
      onKeyDown={event => {
        if (event.key === 'Enter') submitCount.current += 1;
      }}
    />
  );
}
```

`useRef<HTMLInputElement>(null)` resolves to the second overload and gives you
`RefObject<HTMLInputElement | null>`. The `?.` is not pessimism — the ref really
is `null` during the first render, before the element exists.

For a mutable value with no meaningful initial state, pass `undefined`
explicitly:

```tsx
import { useRef, useEffect } from 'react';

export function ResizeReporter({ onResize }: { onResize: (width: number) => void }) {
  const observerRef = useRef<ResizeObserver | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    observerRef.current = new ResizeObserver(entries => {
      onResize(entries[0].contentRect.width);
    });
    observerRef.current.observe(node);
    return () => observerRef.current?.disconnect();
  }, [onResize]);

  return <div ref={boxRef} />;
}
```

### useReducer

The single most valuable typing on this page. Type the state and the action
union, annotate the reducer's parameters, and pass no type arguments to the
hook.

```tsx
import { useReducer } from 'react';

type Upload = { id: string; name: string; progress: number };

type UploadState = {
  uploads: Upload[];
  error: string | null;
};

type UploadAction =
  | { type: 'started'; id: string; name: string }
  | { type: 'progressed'; id: string; progress: number }
  | { type: 'finished'; id: string }
  | { type: 'failed'; message: string };

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'started':
      return {
        ...state,
        uploads: [...state.uploads, { id: action.id, name: action.name, progress: 0 }],
      };
    case 'progressed':
      return {
        ...state,
        uploads: state.uploads.map(upload =>
          upload.id === action.id ? { ...upload, progress: action.progress } : upload,
        ),
      };
    case 'finished':
      return { ...state, uploads: state.uploads.filter(u => u.id !== action.id) };
    case 'failed':
      return { ...state, error: action.message };
  }
}

export function UploadQueue() {
  const [state, dispatch] = useReducer(uploadReducer, { uploads: [], error: null });

  return (
    <>
      <button
        type="button"
        onClick={() => dispatch({ type: 'started', id: crypto.randomUUID(), name: 'report.pdf' })}
      >
        Add upload
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      <ul>
        {state.uploads.map(upload => (
          <li key={upload.id}>{upload.name}: {upload.progress}%</li>
        ))}
      </ul>
    </>
  );
}
```

Three things fall out of this for free. `action.progress` is only visible in the
`progressed` case. Dispatching `{ type: 'progressed', id: '1' }` is an error
because `progress` is missing. And because the reducer declares its return type,
a `switch` that forgets a case fails to compile — the function would implicitly
return `undefined`.

> [!NOTE]
> `@types/react` 19 improved `useReducer` inference and removed support for
> passing the reducer type as a type argument. If you have
> `useReducer<Reducer<State, Action>>(reducer, init)` in an existing codebase,
> delete the type argument entirely; `preset-19` does this for you.

### useContext

`createContext` requires a default value. The honest default for a context that
must be provided is `null`, with a hook that throws:

```tsx
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return value;
}
```

The throw is doing type-level work: `useTheme` returns
`ThemeContextValue`, not `ThemeContextValue | null`, so no consumer writes `?.`.
The alternative — inventing a plausible default object — produces a component
that renders wrong instead of failing loudly.

> [!NOTE]
> Since **19.0** you render the context itself as the provider:
> `<ThemeContext value={...}>`. The `.Provider` form still works and is
> deprecated.

### useMemo and useCallback

Both infer from the function you pass. `useMemo<T>(factory: () => T, deps)`
takes its type from the factory's return; `useCallback<T extends Function>`
returns the callback type unchanged.

```tsx
import { useMemo, useCallback, useState } from 'react';

type Product = { id: string; name: string; priceCents: number };

export function ProductPicker({ products }: { products: readonly Product[] }) {
  const [query, setQuery] = useState('');

  // Inferred as Product[].
  const matches = useMemo(
    () => products.filter(p => p.name.toLowerCase().includes(query.toLowerCase())),
    [products, query],
  );

  // Inferred as (product: Product) => void.
  const handlePick = useCallback((product: Product) => {
    console.log('picked', product.id);
  }, []);

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search products" />
      <ul>
        {matches.map(p => (
          <li key={p.id}>
            <button type="button" onClick={() => handlePick(p)}>{p.name}</button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

`useCallback` cannot infer its own parameter types — annotate them on the
function you pass, as `(product: Product)` above. This is the most common source
of implicit-`any` errors in a hook-heavy file.

### useImperativeHandle

`useImperativeHandle<T, R extends T>(ref, init, deps?)`. Declare the handle type,
accept `Ref<Handle>` as a prop, and return an object matching it:

```tsx
import { useImperativeHandle, useRef } from 'react';
import type { Ref } from 'react';

export type VideoHandle = {
  play: () => void;
  seekTo: (seconds: number) => void;
};

type VideoProps = {
  src: string;
  ref?: Ref<VideoHandle>;
};

export function Video({ src, ref }: VideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    play: () => { void videoRef.current?.play(); },
    seekTo: (seconds: number) => {
      if (videoRef.current) videoRef.current.currentTime = seconds;
    },
  }), []);

  return <video ref={videoRef} src={src} controls />;
}
```

Exporting `VideoHandle` matters — the parent writes `useRef<VideoHandle>(null)`
and needs the name.

### useSyncExternalStore

`useSyncExternalStore<Snapshot>(subscribe, getSnapshot, getServerSnapshot?)`.
The snapshot type comes from `getSnapshot`, and both snapshot functions must
agree.

```tsx
import { useSyncExternalStore } from 'react';

function subscribeToOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeToOnline,
    () => navigator.onLine,
    () => true, // server snapshot: assume online during SSR
  );
}
```

`getSnapshot` must return a value that is `Object.is`-stable between calls or
React re-renders forever. TypeScript cannot check that, so returning a freshly
built object here is a runtime bug the types will not catch.

## Common patterns

### The React 19 action hooks

`useActionState` has two overloads. The one you want takes an action of
`(state, payload) => State | Promise<State>` and returns
`[state, dispatch, isPending]`. When passed as a form `action`, the payload is
`FormData`:

```tsx
import { useActionState } from 'react';

type SubscribeState = {
  status: 'idle' | 'ok' | 'error';
  message: string;
};

const initialState: SubscribeState = { status: 'idle', message: '' };

async function subscribe(
  _previous: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const email = formData.get('email');
  if (typeof email !== 'string' || !email.includes('@')) {
    return { status: 'error', message: 'Enter a valid email address.' };
  }
  return { status: 'ok', message: `Subscribed ${email}.` };
}

export function SubscribeForm() {
  const [state, formAction, isPending] = useActionState(subscribe, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required />
      <button type="submit" disabled={isPending}>Subscribe</button>
      <p role="status">{state.message}</p>
    </form>
  );
}
```

The state type is inferred from `initialState`, and the action's first parameter
must match it. Note `formData.get()` returns `FormDataEntryValue | null`, so the
`typeof` check is required, not defensive padding.

`useOptimistic<State, Action>(passthrough, reducer)` types the optimistic
update separately from the committed state:

```tsx
import { useOptimistic, useState, startTransition } from 'react';

type Message = { id: string; text: string; pending?: boolean };

export function MessageList({ initial }: { initial: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (state: Message[], text: string) => [...state, { id: 'temp', text, pending: true }],
  );

  function send(text: string) {
    startTransition(async () => {
      addOptimistic(text);
      const saved: Message = { id: crypto.randomUUID(), text };
      setMessages(current => [...current, saved]);
    });
  }

  return (
    <ul>
      {optimistic.map(message => (
        <li key={message.id} aria-busy={message.pending}>{message.text}</li>
      ))}
      <li>
        <button type="button" onClick={() => send('Hello')}>Send</button>
      </li>
    </ul>
  );
}
```

`use<T>(usable: Usable<T>): T` accepts a promise or a context and unwraps it.
Its type argument is inferred from the argument, so you rarely write it:

```tsx
import { use, Suspense } from 'react';

type Profile = { id: string; displayName: string };

function ProfileName({ profilePromise }: { profilePromise: Promise<Profile> }) {
  const profile = use(profilePromise); // Profile
  return <h2>{profile.displayName}</h2>;
}

export function ProfilePanel({ profilePromise }: { profilePromise: Promise<Profile> }) {
  return (
    <Suspense fallback={<p>Loading profile…</p>}>
      <ProfileName profilePromise={profilePromise} />
    </Suspense>
  );
}
```

### Typing a custom hook's return

Return a tuple with `as const` when the caller should rename the values, and an
object when there are more than two:

```tsx
import { useCallback, useState } from 'react';

export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn(value => !value), []);
  return [on, toggle] as const; // readonly [boolean, () => void]
}
```

Without `as const` the return type is `(boolean | (() => void))[]`, and
destructuring gives both variables that useless union.

## Advanced example

A typed reducer plus context, exposing a narrow public API:

```tsx
import { createContext, useContext, useReducer } from 'react';
import type { Dispatch, ReactNode } from 'react';

type Filters = { search: string; onlyUnread: boolean; page: number };

type FiltersAction =
  | { type: 'searched'; search: string }
  | { type: 'toggledUnread' }
  | { type: 'pageChanged'; page: number }
  | { type: 'reset' };

const initialFilters: Filters = { search: '', onlyUnread: false, page: 1 };

function filtersReducer(state: Filters, action: FiltersAction): Filters {
  switch (action.type) {
    case 'searched':
      return { ...state, search: action.search, page: 1 };
    case 'toggledUnread':
      return { ...state, onlyUnread: !state.onlyUnread, page: 1 };
    case 'pageChanged':
      return { ...state, page: action.page };
    case 'reset':
      return initialFilters;
  }
}

const FiltersContext = createContext<Filters | null>(null);
const FiltersDispatchContext = createContext<Dispatch<FiltersAction> | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, dispatch] = useReducer(filtersReducer, initialFilters);
  return (
    <FiltersContext value={filters}>
      <FiltersDispatchContext value={dispatch}>{children}</FiltersDispatchContext>
    </FiltersContext>
  );
}

export function useFilters(): Filters {
  const value = useContext(FiltersContext);
  if (value === null) throw new Error('useFilters must be used inside FiltersProvider');
  return value;
}

export function useFiltersDispatch(): Dispatch<FiltersAction> {
  const value = useContext(FiltersDispatchContext);
  if (value === null) throw new Error('useFiltersDispatch must be used inside FiltersProvider');
  return value;
}
```

Splitting state and dispatch into two contexts means a component that only
dispatches does not re-render when filters change — and `Dispatch<FiltersAction>`
gives it exact autocomplete for the actions it may send.

## Common mistakes

**`useState<Item[]>([])` forgotten.** `useState([])` is `never[]`, and the first
`setItems([item])` fails with an error about `Item` not being assignable to
`never`.

**`useState({} as User)`.** The cast silences the compiler and moves the failure
to runtime, on the first render, in the child that reads `user.email`.

**Calling `useRef()` with no arguments.** An error in `@types/react` 19. Write
`useRef(undefined)` and let the third overload give you
`RefObject<T | undefined>`.

**Passing a reducer type argument to `useReducer`.** Removed in
`@types/react` 19. Annotate the reducer function's parameters instead.

**A context default that is a plausible-looking empty object.** Consumers get no
error, no throw, and a component that renders as though the provider were there.
Default to `null` and throw in the accessor hook.

**Un-annotated `useCallback` parameters.** `useCallback` infers the callback's
type from the callback, so its parameters have nothing to infer from and become
implicit `any`.

**Returning an array from a custom hook without `as const`.** Positional
destructuring gives you a union of every element type.

## Related topics

- [useState](../hooks/use-state.md) — the runtime behavior these annotations describe.
- [useReducer](../hooks/use-reducer.md) — when a reducer beats several `useState` calls.
- [useRef](../hooks/use-ref.md) — refs for DOM nodes versus mutable instance values.
- [useContext](../hooks/use-context.md) — context at runtime, and when not to use it.
- [Typing props](./typing-props.md) — the props types these hooks consume and produce.
- [TypeScript setup](./setup.md) — the `@types/react` 19 changes behind `useRef` and `useReducer`.
