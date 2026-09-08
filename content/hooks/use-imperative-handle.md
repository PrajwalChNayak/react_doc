---
title: useImperativeHandle
description: Expose a narrow imperative API on a ref instead of the raw DOM node.
group: hooks
order: 90
status: current
since: "19.0"
related: [hooks/use-ref, patterns/refs-and-dom, hooks/use-effect, accessibility/focus-management]
---

## Overview

`useImperativeHandle` replaces what a parent gets when it puts a `ref` on your
component.

```text
useImperativeHandle(ref, createHandle, dependencies?)
```

| Parameter | Meaning |
|---|---|
| `ref` | The `ref` your component received as a prop. |
| `createHandle` | A function taking no arguments that returns the object to expose. |
| `dependencies?` | Reactive values used inside `createHandle`. Omit to recreate the handle on every render. |

It returns `undefined`. Without it, `ref.current` is whatever DOM node you
attached `ref` to. With it, `ref.current` is exactly the object you return.

## Why it exists

A ref to a component is a hole in your encapsulation. Hand a parent the raw
`<input>` and it can call `focus()` — but it can also set `value`, add classes,
change `disabled`, or rip the node out of the document. Your next render will
fight it.

`useImperativeHandle` narrows the hole. You publish `focus()` and nothing else,
so the parent gets the one capability it needs and none of the ones that would
corrupt your component's state.

It also decouples the API from the implementation. A `<Chart>` can expose
`exportPng()` today over a `<canvas>` and switch to SVG tomorrow without any
caller changing.

## When to use it

- The parent needs an imperative action that genuinely cannot be expressed as a
  prop: focus, scroll into view, select text, play or pause media, start an
  animation, open a `<dialog>`.
- You want to expose a *subset* of a DOM node's capabilities.
- Your component renders several DOM nodes and the parent needs a specific one.

## When not to use it

Almost always. This is the rarest of the built-in hooks and it should stay that
way.

- **The action can be a prop.** `<Modal open>` beats `modalRef.current.open()`.
  Props re-run through React's render cycle; imperative calls bypass it and
  create state React does not know about.
- **The parent wants to read child state.** Lift the state up instead.
- **You only need the plain DOM node.** Then forward the `ref` prop
  straight to the element — no hook required.
- **You are working around a rendering bug.** Reaching in imperatively will hide
  it, not fix it.

> [!BEST-PRACTICE]
> Write the prop-based version first. Only reach for an imperative handle when
> the action is a one-off *event* with no meaningful "state" — focus and scroll
> are the canonical examples, because "focused" is browser state, not yours.

## Basic example

Since **19.0** `ref` arrives as an ordinary prop, so the whole thing is one
function.

```jsx live
import { useImperativeHandle, useRef, useState } from 'react';

function EmailField({ ref, value, onChange }) {
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
    },
    scrollIntoView() {
      inputRef.current?.scrollIntoView();
    },
  }), []);

  return (
    <input
      ref={inputRef}
      type="email"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="you@example.com"
    />
  );
}

export default function SignupForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const emailRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      emailRef.current?.focus();
      return;
    }
    setError('');
  }

  return (
    <form onSubmit={handleSubmit}>
      <EmailField ref={emailRef} value={email} onChange={setEmail} />
      <button type="submit">Sign up</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

The parent can focus the field. It cannot clear it, disable it, or read its DOM
`value` — those stay under `EmailField`'s control.

> [!DEPRECATED]
> Before **19.0** the component had to be wrapped in `forwardRef` for `ref` to
> reach it at all, and `useImperativeHandle` took that forwarded ref. In React
> 19 `forwardRef` still works but is deprecated. Convert with
> `npx codemod@latest react/19/migration-recipe`.

## How it works

### Across re-renders

React attaches the handle during the commit phase, at the same point it would
have attached a DOM node — before layout effects run, and before the browser
paints.

With a dependency array, the handle object is **recreated whenever a dependency
changes**, compared with `Object.is`. React first detaches the old handle (as if
the ref were being removed) and then attaches the new one.

With **no** dependency array, `createHandle` runs after every render and
`ref.current` is a brand new object each time. That is usually harmless, but it
defeats any parent that compares `ref.current` by identity or that stores it.
Pass `[]` when the handle closes over nothing reactive.

```jsx
import { useImperativeHandle, useRef } from 'react';

function Chart({ ref, dataUrl }) {
  const canvasRef = useRef(null);

  useImperativeHandle(ref, () => ({
    exportPng: () => canvasRef.current?.toDataURL('image/png'),
    getSourceUrl: () => dataUrl,
  }), [dataUrl]); // Recreated when dataUrl changes.

  return <canvas ref={canvasRef} width={320} height={160} />;
}
```

### Ref cleanup

The handle participates in the ref lifecycle. When your component unmounts,
React sets the parent's `ref.current` back to `null`. And since **19.0**, if the
parent passed a *ref callback* that returned a cleanup function, React runs that
cleanup against the handle — the same mechanism used for DOM refs.

```jsx live
import { useCallback, useImperativeHandle, useRef, useState } from 'react';

function Ticker({ ref }) {
  const [count, setCount] = useState(0);

  useImperativeHandle(ref, () => ({
    bump: () => setCount(c => c + 1),
  }), []);

  return <p>Count: {count}</p>;
}

export default function TickerHost() {
  const [mounted, setMounted] = useState(true);
  const [log, setLog] = useState([]);
  const tickerRef = useRef(null);

  // The callback identity must be stable, or React detaches and
  // reattaches the handle on every single render.
  const attachTicker = useCallback(handle => {
    tickerRef.current = handle;
    setLog(entries => [...entries, 'attached']);
    // React 19: this runs when the child unmounts.
    return () => {
      tickerRef.current = null;
      setLog(entries => [...entries, 'detached']);
    };
  }, []);

  return (
    <div>
      <button onClick={() => setMounted(m => !m)}>
        {mounted ? 'Unmount' : 'Mount'}
      </button>
      <button onClick={() => tickerRef.current?.bump()}>Bump</button>
      {mounted && <Ticker ref={attachTicker} />}
      <ul>
        {log.map((entry, index) => (
          <li key={index}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
```

### StrictMode

In development StrictMode mounts, unmounts, and remounts each component. The
handle is created, detached, and created again. If `createHandle` is pure — it
should only build an object of closures — this is invisible. If it opens a
connection or registers a global, you will see it happen twice, which is the
warning you wanted.

StrictMode also double-invokes the render function, but `useImperativeHandle`
does its work at commit time, so the handle is not built twice per render.

### Concurrent rendering

Handles are attached at commit, never during render, so a render React discards
never produces a handle. That makes `useImperativeHandle` safe under concurrent
rendering — provided `createHandle` stays pure and you do not call handle
methods during another component's render.

Calling `chartRef.current.exportPng()` inside a render body is the failure mode:
it reads committed DOM from a render that may be about to be thrown away. Call
handles from event handlers and Effects only.

## Common patterns

### Exposing exactly one method

Resist the urge to publish everything the node can do.

```jsx
import { useImperativeHandle, useRef } from 'react';

function ConfirmDialog({ ref, message, onConfirm }) {
  const dialogRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: () => dialogRef.current?.showModal(),
  }), []);

  return (
    <dialog ref={dialogRef}>
      <p>{message}</p>
      <form method="dialog">
        <button onClick={onConfirm}>Confirm</button>
        <button>Cancel</button>
      </form>
    </dialog>
  );
}
```

Notice that `close` is absent: the native `<form method="dialog">` handles it,
so exposing a `close()` would be a second way to do the same thing.

### Extending the DOM node instead of replacing it

Sometimes you want everything an `<input>` offers *plus* one extra method.
Spread the node into the handle.

```jsx
import { useImperativeHandle, useRef } from 'react';

function CurrencyInput({ ref, ...props }) {
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => {
    const node = inputRef.current;
    return {
      ...node,
      focus: () => node?.focus(),
      selectAmount: () => node?.setSelectionRange(1, node.value.length),
    };
  }, []);

  return <input ref={inputRef} {...props} />;
}
```

> [!WARNING]
> Spreading a DOM node copies own properties, not the prototype methods, which
> is why `focus` is re-declared above. It is a leaky pattern — prefer listing
> the handful of methods you actually need.

## Advanced example

A typed handle. Declaring the interface is the point of the exercise: it is the
contract the parent codes against.

```tsx
import { useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
}

interface VideoPlayerProps {
  src: string;
  ref?: Ref<VideoPlayerHandle>;
}

export function VideoPlayer({ src, ref }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useImperativeHandle(ref, () => ({
    play: () => {
      videoRef.current?.play();
    },
    pause: () => {
      videoRef.current?.pause();
    },
    seek: (seconds: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = seconds;
      }
    },
  }), []);

  return <video ref={videoRef} src={src} controls />;
}

export function Lesson() {
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const [chapter, setChapter] = useState(0);

  function jumpTo(seconds: number, index: number) {
    playerRef.current?.seek(seconds);
    playerRef.current?.play();
    setChapter(index);
  }

  return (
    <div>
      <VideoPlayer ref={playerRef} src="/lesson.mp4" />
      <button onClick={() => jumpTo(0, 0)}>Intro</button>
      <button onClick={() => jumpTo(120, 1)}>Setup</button>
      <p>Chapter {chapter + 1}</p>
    </div>
  );
}
```

Type the parent's ref as `useRef<VideoPlayerHandle | null>(null)`. The child
declares `ref?: Ref<VideoPlayerHandle>` in its props — no wrapper type is
involved in React 19.

## Common mistakes

**Using it when a prop would do.** `<Accordion>` exposing `expand()` and
`collapse()` on a ref is worse than an `expanded` prop: the parent now holds
state React cannot see, and the two can drift apart.

**Omitting the dependency array.** The handle object is then new on every
render. Anything that captured `ref.current` earlier holds a stale object, and
any Effect depending on it re-fires constantly.

**Stale closures in the handle.** `createHandle` captures the values of that
render. If a method reads `props.query` and you passed `[]`, it will forever
return the first query. Either list the dependency or read from a ref.

**Calling the handle during render.** `ref.current` is `null` on the first
render — the child has not committed yet. It is also unsafe: a render can be
abandoned. Move the call into an Effect or an event handler.

**Forgetting the parent's ref can be `null`.** Your component may be used
without a ref at all. `useImperativeHandle(undefined, ...)` is fine — React
ignores it — but do not assume the handle is ever read.

**Returning the DOM node itself.** `useImperativeHandle(ref, () => inputRef.current)`
gives the parent the raw node again, which is the situation the hook exists to
avoid. If that is what you want, pass the `ref` prop straight to the element and
delete the hook.

**Mutating state through the handle without going through React.** A handle
method that sets `inputRef.current.value` directly desynchronizes a controlled
input. Call a state setter instead, as `Ticker` does above.

## Related topics

- [useRef](./use-ref.md) — the ref object this hook writes into.
- [Refs and the DOM](../patterns/refs-and-dom.md) — when reaching for the DOM is
  the right call, and when it is not.
- [Focus management](../accessibility/focus-management.md) — the most common
  legitimate reason to expose an imperative handle.
- [Composition](../patterns/composition.md) — the prop-based designs that make
  imperative handles unnecessary.
- [Typing hooks](../typescript/typing-hooks.md) — typing the handle and the
  parent's ref.
