---
title: Refs and the DOM
description: Reaching for real DOM nodes when you need focus, measurement, media, or a non-React widget.
group: patterns
order: 60
status: current
related: [hooks/use-ref, hooks/use-imperative-handle, accessibility/focus-management, migration/removed-apis]
---

## Overview

React renders the DOM for you, so most of the time you never touch it. A few
jobs have no declarative equivalent, and for those you need the actual node.

```jsx
import { useRef } from 'react';

export function SearchBox() {
  const inputRef = useRef(null);

  return (
    <>
      <input ref={inputRef} />
      <button type="button" onClick={() => inputRef.current.focus()}>
        Focus the search box
      </button>
    </>
  );
}
```

`useRef(null)` creates a box with a `current` property. Passing it as `ref` to a
host element makes React put the DOM node in that box after commit, and set it
back to `null` when the element is removed.

Two things changed in React 19 and both matter here: **`ref` is an ordinary prop
on function components**, so `forwardRef` is no longer needed, and **ref
callbacks may return a cleanup function**.

## Why it exists

The DOM has imperative APIs that are not derivable from state: `focus()`,
`select()`, `play()`, `scrollIntoView()`, `getBoundingClientRect()`,
`showModal()`, `requestFullscreen()`. Calling them requires a node.

The same is true of every library that predates React or ignores it — charting,
mapping, rich text editing, video players. They want a container element and
they want to own its contents.

A ref is the sanctioned escape hatch: it gives you the node without making React
re-render, and without React trying to reconcile whatever you do inside.

## When to use it

- **Focus.** Move focus after a route change, into a dialog, or to the first
  invalid field.
- **Text selection.** `select()` on a field the user is about to overwrite.
- **Media playback.** `play()`, `pause()`, seeking a `<video>` or `<audio>`.
- **Measurement.** Element size and position for tooltips, virtualization, or
  sticky headers.
- **Scrolling.** `scrollIntoView()` on a newly added item.
- **Dialogs.** `showModal()` and `close()` on a native `<dialog>`.
- **Third-party widgets.** Give a library a container and let it render inside.

## When not to use it

If a prop can express it, use a prop. Setting `element.textContent`,
`classList`, `style` or `value` directly puts the DOM out of sync with what
React believes it rendered, and the next render may or may not clobber your
change.

Do not use a ref to read a form field's current value when the field is
controlled — that value is already in state. Do not use one to force a
re-render; that is what state is for.

And never use a ref to reach into another component's DOM to change how it
looks. If you need to influence a child, pass it a prop.

## Basic example

Since **19.0**, a function component that needs to expose a DOM node just
accepts `ref` like any other prop and forwards it:

```jsx live
import { useRef } from 'react';

function LabeledInput({ label, ref, ...props }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span>{label}</span>
      <input ref={ref} {...props} />
    </label>
  );
}

export default function CouponForm() {
  const couponRef = useRef(null);

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <LabeledInput label="Coupon code" ref={couponRef} defaultValue="SPRING24" />
      <button
        type="button"
        onClick={() => {
          couponRef.current?.focus();
          couponRef.current?.select();
        }}
      >
        Edit the code
      </button>
    </div>
  );
}
```

No wrapper, no extra generic, nothing to remember. The typed version is
similarly plain:

```tsx
import { useRef } from 'react';
import type { ComponentPropsWithRef } from 'react';

type LabeledInputProps = ComponentPropsWithRef<'input'> & { label: string };

function LabeledInput({ label, ref, ...props }: LabeledInputProps) {
  return (
    <label>
      <span>{label}</span>
      <input ref={ref} {...props} />
    </label>
  );
}

export function CouponForm() {
  const couponRef = useRef<HTMLInputElement>(null);
  return <LabeledInput label="Coupon code" ref={couponRef} />;
}
```

> [!DEPRECATED]
> `forwardRef` still works in React 19, but it is deprecated and unnecessary —
> `ref` is a prop on function components since **19.0**. Do not write new
> components with it. To convert an existing codebase, run
> `npx codemod@latest react/19/migration-recipe`, which rewrites `forwardRef`
> calls for you.

## How it works

Refs are attached during the **commit** phase, after React has mutated the DOM
and before layout effects run. So by the time `useLayoutEffect` or an event
handler runs, `ref.current` holds the node. During render it does not.

```jsx
import { useRef } from 'react';

export function Broken() {
  const boxRef = useRef(null);
  // Wrong: null on the first render, and React does not re-render when it changes.
  const width = boxRef.current?.offsetWidth ?? 0;
  return <div ref={boxRef}>{width}px</div>;
}
```

> [!WARNING]
> Never read or write `ref.current` during render. On the first render it is
> `null`, mutating it makes the render impure, and React does not re-render when
> it changes — so the value you read may be stale under concurrent rendering.
> Read refs in event handlers and effects.

Updating a ref never triggers a render. That is the point: it is storage that is
deliberately outside the render loop. If a change should be visible on screen,
it belongs in state.

### Ref callbacks and cleanup

Instead of a ref object you can pass a function. React calls it with the node
when the element is attached.

Since **19.0**, that function may **return a cleanup function**, which React
calls when the element is removed — the same shape as an effect:

```jsx
export function Measured() {
  return (
    <div
      ref={(node) => {
        const observer = new ResizeObserver(() => {});
        observer.observe(node);
        return () => observer.disconnect();
      }}
    />
  );
}
```

> [!WARNING]
> Returning anything **other** than a cleanup function from a ref callback is an
> error, and TypeScript rejects it. The common casualty is the concise arrow
> body: `ref={(node) => (nodeRef.current = node)}` returns the node. Add braces:
> `ref={(node) => { nodeRef.current = node; }}`.

If you do not return a cleanup, React falls back to the pre-19 behavior of
calling your callback again with `null` on detach. That fallback is kept for
compatibility and will be removed in a future version, so return a cleanup in
new code.

Note that unless the callback is a stable function reference, React detaches and
re-attaches on every render — so wrap expensive setup in `useCallback`, or move
it into an effect.

## Common patterns

### Own a third-party widget entirely inside a ref callback

Setup and teardown live next to each other, and the widget's lifetime is exactly
the element's lifetime. This is the strongest argument for ref cleanup: an
effect would need its own dependency array and a separate ref to find the node.

```jsx
import { useCallback } from 'react';
import { createChart } from 'some-charting-library';

export function RevenueChart({ series }) {
  const attachChart = useCallback((node) => {
    const chart = createChart(node, { series });
    return () => chart.destroy();
  }, [series]);

  return <div style={{ height: 240 }} ref={attachChart} />;
}
```

Changing `series` produces a new callback, so React tears the old chart down and
builds a new one. If the widget supports updating in place, keep the callback
stable and push updates through an effect instead.

Here is the same shape with a real browser API, so you can watch it run:

```jsx live
import { useCallback, useState } from 'react';

export default function BoxMeasurer() {
  const [size, setSize] = useState(null);
  const [wide, setWide] = useState(false);

  const measure = useCallback((node) => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        ref={measure}
        style={{
          height: 80,
          width: wide ? '100%' : '50%',
          background: '#e0e7ff',
          borderRadius: 8,
          transition: 'width 200ms',
        }}
      />
      <p style={{ margin: 0 }}>
        {size ? `${size.width} × ${size.height}` : 'Measuring…'}
      </p>
      <button type="button" onClick={() => setWide((value) => !value)}>
        Toggle width
      </button>
    </div>
  );
}
```

The observer is created once, disconnected when the element goes away, and never
leaks — with no `useEffect` and no second ref.

### A ref per item in a dynamic list

You cannot call `useRef` in a loop. Keep a single ref holding a `Map`, and fill
it from a callback ref.

```jsx live
import { useRef, useState } from 'react';

const RELEASES = Array.from({ length: 20 }, (unused, index) => ({
  id: index + 1,
  name: `v19.2.${index}`,
}));

export default function ReleaseList() {
  const nodesRef = useRef(new Map());
  const [target, setTarget] = useState('');

  function scrollToRelease() {
    const node = nodesRef.current.get(Number(target));
    node?.scrollIntoView({ block: 'center' });
  }

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="1–20"
          style={{ width: 80 }}
        />
        <button type="button" onClick={scrollToRelease}>Scroll to release</button>
      </div>

      <ul style={{ height: 160, overflowY: 'auto', margin: 0, padding: 8 }}>
        {RELEASES.map((release) => (
          <li
            key={release.id}
            ref={(node) => {
              const nodes = nodesRef.current;
              nodes.set(release.id, node);
              return () => {
                nodes.delete(release.id);
              };
            }}
          >
            {release.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

The cleanup function is what keeps the map from growing forever as items unmount
— before 19 you had to delete the entry in the `null` branch of the callback.

### Expose an API, not the node

Handing a parent your raw DOM node lets it do anything, including things that
break you. `useImperativeHandle` narrows that to the methods you intend:

```jsx
import { useImperativeHandle, useRef } from 'react';

export function VideoPlayer({ src, ref }) {
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    seekTo: (seconds) => {
      if (videoRef.current) {
        videoRef.current.currentTime = seconds;
      }
    },
  }), []);

  return <video ref={videoRef} src={src} />;
}
```

See [useImperativeHandle](../hooks/use-imperative-handle.md) for when this is
worth the indirection — mostly, when the component owns internal state that a
raw node would let callers desynchronize.

### flushSync, for the rare synchronous read

React batches state updates, so the DOM does not reflect a `setState` on the
next line. When you must render and then measure or scroll in the same tick,
`flushSync(callback)` forces the updates inside the callback to commit
synchronously.

```jsx
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export function MessageList() {
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);

  function addMessage(text) {
    flushSync(() => {
      setMessages((current) => [...current, text]);
    });
    // The new message is in the DOM now, so this scrolls to it.
    listRef.current?.lastElementChild?.scrollIntoView();
  }

  return (
    <ul ref={listRef}>
      {messages.map((message, index) => <li key={index}>{message}</li>)}
    </ul>
  );
}
```

> [!WARNING]
> `flushSync` opts you out of concurrent rendering for that update. React's own
> docs call it uncommon and warn it can significantly hurt performance, and it
> may force pending Suspense boundaries to show their fallback. Try
> `useLayoutEffect` first — it also runs before paint and costs nothing extra.

> [!LEGACY]
> `ReactDOM.findDOMNode` was **removed in React 19**. It existed to find a class
> component's DOM node without a ref, and it broke every abstraction it touched.
> Replace it with a ref on the element you actually want. See
> [removed APIs](../migration/removed-apis.md).

## Common mistakes

**Reading `ref.current` during render.** `null` on first render, stale
afterwards, and impure either way.

**Assuming the ref is set in the same event that mounted the element.** State
updates in an event handler commit asynchronously; the node exists on the next
commit, not on the next line.

**Concise arrow ref callbacks.** `ref={(node) => (map[id] = node)}` returns a
value, which React 19 treats as a bad cleanup function. Use a block body.

**An unstable inline ref callback doing expensive setup.** A new function every
render means detach and re-attach every render. `useCallback` it.

**Mutating DOM that React owns.** Setting `textContent` or `className` on a node
React renders will be silently reverted by the next render, or worse, will not
be.

**Using a ref where state belongs.** If the screen should change, it is state.
Refs never cause a re-render.

**Reaching for `flushSync` to fix a timing bug.** It is almost always a
`useLayoutEffect`, or a sign that a value should have been state.

**Passing `ref` through a component that spreads props onto a non-element.**
`ref` is a real prop now, so `{...props}` carries it — which is convenient, but
means an accidental spread onto a `<div>` wrapper attaches the ref to the
wrapper instead of the input.

## Related topics

- [useRef](../hooks/use-ref.md) — the hook itself, including refs that hold
  values rather than nodes.
- [useImperativeHandle](../hooks/use-imperative-handle.md) — exposing a narrow
  API instead of a DOM node.
- [Focus management](../accessibility/focus-management.md) — where refs earn
  their keep.
- [Removed APIs](../migration/removed-apis.md) — `findDOMNode`, string refs, and
  what replaced them.
- [Portals](./portals.md) — refs plus native `<dialog>`, and DOM nodes React
  does not own.
