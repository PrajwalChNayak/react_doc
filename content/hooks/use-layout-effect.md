---
title: useLayoutEffect
description: Measure the DOM and adjust layout before the browser paints.
group: hooks
order: 50
status: current
related: [hooks/use-effect, hooks/use-ref, patterns/refs-and-dom]
---

## Overview

`useLayoutEffect` has the same signature as [`useEffect`](./use-effect.md) and
one difference that defines it: it runs **synchronously after React mutates the
DOM and before the browser paints**.

```text
useLayoutEffect(setup, dependencies?)
```

- `setup` — runs after the DOM update, before paint. May return a cleanup
  function.
- `dependencies` *(optional)* — same rules as `useEffect`: an array of every
  reactive value the setup reads, compared with `Object.is`.

Because it runs before paint, a state update made inside it is rendered in the
same frame. The user never sees the intermediate position.

Because it runs before paint, it also **blocks** that paint. That is the whole
trade.

## Why it exists

Some layout decisions cannot be made until the DOM exists. How tall is this
tooltip? Does the menu fit below the button or must it flip above? Where was the
scroll position before the new messages arrived?

You cannot compute those during render — there is nothing to measure yet. And
you cannot compute them in a `useEffect`, because that runs *after* paint: the
browser would show one frame with the wrong position, then a corrected frame.
The user sees a flicker or a jump.

`useLayoutEffect` gives you the one moment where the DOM is real but the screen
has not been updated yet: measure, set state, and let React re-render before the
pixels reach the screen.

## When to use it

- **Measuring a node and positioning something from the measurement** — tooltips,
  popovers, dropdown menus, context menus that must flip when they hit a
  viewport edge.
- **Reading or restoring scroll position** before the user can perceive the old
  one.
- **Reading layout to decide what to render** — truncating a label to the
  available width, deciding how many tabs fit in a toolbar.
- **Synchronously undoing a visual glitch** that would otherwise be visible for
  one frame.

The shared pattern: *read the DOM, then change what is on screen, before the
screen is drawn.*

## When not to use it

- **For anything that is not layout measurement.** Data fetching, subscriptions,
  logging, analytics, timers, connecting to a socket — all of it belongs in
  `useEffect`. There is no benefit to running them earlier and there is a cost.
- **When `useEffect` produces no visible flicker.** If the user cannot tell,
  choose the one that does not block paint.
- **In a component that renders on the server** and depends on the measurement
  for its initial output. It does not run during server rendering, so the server
  HTML will be wrong. See below.
- **For expensive work.** Everything inside it, plus every state update it
  schedules, plus every remaining Effect that update flushes, happens before the
  browser can draw a single pixel.
- **In a list of many items.** A layout effect per row multiplies the pre-paint
  cost by the row count.
- **For injecting styles in a CSS-in-JS library.** `useInsertionEffect` exists
  for that; it runs before layout effects, when the DOM has not been mutated yet.

> [!BEST-PRACTICE]
> Default to `useEffect`. Reach for `useLayoutEffect` only after you have seen
> the flicker you are fixing.

## Basic example

A tooltip that flips above its anchor when there is room, and below when there
is not. Its height is unknown until it is in the DOM.

```jsx live
import { useState, useRef, useLayoutEffect } from 'react';

export default function MeasuredTooltip() {
  const [message, setMessage] = useState('Saved');
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const tooltipRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useLayoutEffect(() => {
    const node = tooltipRef.current;
    if (node) {
      // Measured after the DOM update, before the user sees anything.
      setTooltipHeight(node.getBoundingClientRect().height);
    }
  }, [message]);

  const anchorTop = 90;
  const fitsAbove = anchorTop >= tooltipHeight + 8;
  const tooltipTop = fitsAbove
    ? anchorTop - tooltipHeight - 8
    : anchorTop + 32;

  return (
    <div style={{ position: 'relative', height: 220 }}>
      <button
        onClick={() =>
          setMessage((current) =>
            current.length > 20
              ? 'Saved'
              : 'Saved. Everyone on the team can see your changes now, including the reviewers you added a moment ago.'
          )
        }
      >
        Toggle tooltip length
      </button>

      <div
        style={{
          position: 'absolute',
          top: anchorTop,
          left: 0,
          padding: '4px 8px',
          border: '1px solid currentColor',
        }}
      >
        Anchor element
      </div>

      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          top: tooltipTop,
          left: 0,
          maxWidth: 240,
          padding: '4px 8px',
          borderRadius: 4,
          background: '#222',
          color: '#fff',
          fontSize: 13,
        }}
      >
        {message}
      </div>

      <p style={{ position: 'absolute', bottom: 0 }}>
        Measured height: {Math.round(tooltipHeight)}px —{' '}
        {fitsAbove ? 'placed above' : 'flipped below'}
      </p>
    </div>
  );
}
```

Swap `useLayoutEffect` for `useEffect` in that example and the long tooltip
renders at the wrong position for one frame before snapping into place. That
single frame is the entire reason this hook exists.

> [!NOTE]
> Setting state inside a layout effect looks like an infinite loop waiting to
> happen. It is not, as long as the value converges: React bails out when the new
> state is `Object.is`-equal to the current one, so the second run measures the
> same height and stops.

## How it works

**Order within a commit.** React mutates the DOM, then runs every
`useLayoutEffect` cleanup and setup synchronously, then hands control back to
the browser to paint, then runs `useEffect`.

```text
render -> commit DOM mutations -> useLayoutEffect -> paint -> useEffect
```

**State updates flush immediately.** If you call a setter inside a layout
effect, React re-renders and re-commits before yielding to the browser — and it
executes all remaining Effects, including `useEffect` ones, at that point. The
user sees only the final result.

**Across re-renders.** Dependencies behave exactly as in `useEffect`: cleanup for
the previous run, then setup for the new one, whenever a dependency changes.
Layout effects are as prone to stale closures as any other Effect, so the same
honesty about dependencies applies.

**With StrictMode.** In development, React runs one extra setup + cleanup cycle
before the first real setup. Measurement code is naturally idempotent — reading
`getBoundingClientRect()` twice changes nothing — so a correctly written layout
effect is unaffected. If the extra cycle breaks something, your setup is doing
work that is not measurement, or your cleanup does not undo it.

**With concurrent rendering.** Layout effects run only for committed renders,
and they run synchronously in the commit phase, so React cannot interleave other
work between the DOM mutation and your measurement. That is the guarantee you
are paying for. Because they are blocking, a heavy layout effect delays every
frame it takes part in — including during a transition that was supposed to keep
the page responsive.

### Server rendering

Effects do not run on the server. A component that positions itself in a layout
effect renders its *unmeasured* markup into the server HTML, and corrects itself
after hydration.

React warns when a component that uses `useLayoutEffect` is rendered with
`renderToString` and similar APIs: the hook does nothing on the server, so any
output that depends on it is wrong. The warning is about a real mismatch — the
server cannot know a viewport it has never seen.

Three honest fixes, in order of preference:

1. **Use `useEffect` instead** if the one-frame correction is acceptable.
2. **Render the measured UI only on the client**: keep the server output stable
   (a placeholder, or nothing), then render the real thing after mount.
3. **Do not measure at all** — CSS often solves positioning without JavaScript.
   Anchor positioning, `position: sticky` and flexbox handle more cases than
   people expect.

```jsx
import { useState, useEffect } from 'react';

export default function ClientOnlyPopover({ children }) {
  const [mounted, setMounted] = useState(false);

  // Server and first client render agree: nothing. No hydration mismatch.
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return <div className="popover">{children}</div>;
}
```

Libraries often define an alias that picks `useLayoutEffect` in the browser and
`useEffect` on the server. It silences the warning but does not make the
measurement happen on the server, so it only helps when the component tolerates
being unmeasured in the initial HTML. Prefer being explicit about that in your
own code.

## Common patterns

### Keeping a message list pinned to the bottom

```jsx live
import { useState, useRef, useLayoutEffect } from 'react';

export default function MessageList() {
  const [messages, setMessages] = useState([
    'Welcome to the channel.',
    'Effects run after paint.',
    'Layout effects run before it.',
  ]);
  const listRef = useRef(/** @type {HTMLUListElement | null} */ (null));

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) {
      // Scroll before paint: the user never sees the pre-scroll position.
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  return (
    <div>
      <ul
        ref={listRef}
        style={{
          height: 110,
          overflowY: 'auto',
          margin: 0,
          padding: 8,
          border: '1px solid currentColor',
        }}
      >
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
      <button
        onClick={() =>
          setMessages((current) => [
            ...current,
            `Message ${current.length + 1}`,
          ])
        }
      >
        Add message
      </button>
    </div>
  );
}
```

With `useEffect`, adding a message paints the list at the old scroll position and
then jumps. With `useLayoutEffect`, the jump happens before the frame is drawn.

### Measure with an observer, react with `useEffect`

If you need to keep responding to size changes over time — not only once after a
render — a `ResizeObserver` in a regular `useEffect` is usually the better tool.
Layout effects are for the measurement that must happen *within this commit*;
observers handle everything that happens afterwards.

## Advanced example

`useLayoutEffect` also gives you the last moment before paint to read a value
and hand it to something that is not React.

```jsx live
import { useState, useRef, useLayoutEffect } from 'react';

export default function ProgressBar() {
  const [percent, setPercent] = useState(30);
  const [pixelWidth, setPixelWidth] = useState(0);
  const barRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useLayoutEffect(() => {
    const node = barRef.current;
    if (!node) return;

    const { width } = node.getBoundingClientRect();
    setPixelWidth(Math.round(width));

    // Cleanup mirrors setup, so StrictMode's extra cycle changes nothing.
    return () => setPixelWidth(0);
  }, [percent]);

  return (
    <div>
      <div style={{ border: '1px solid currentColor', height: 16, width: 260 }}>
        <div
          ref={barRef}
          style={{ width: `${percent}%`, height: '100%', background: '#3b82f6' }}
        />
      </div>
      <p>
        {percent}% is {pixelWidth}px wide right now.
      </p>
      <input
        type="range"
        min="0"
        max="100"
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
      />
    </div>
  );
}
```

The measured pixel width is available in the same frame the bar changes size, so
the label never disagrees with the bar.

## Common mistakes

**Using it as the default Effect hook.** Every layout effect you write blocks a
paint. Reserve it for measurement.

**Fetching data in it.** The request does not start meaningfully sooner, and
everything that follows the fetch happens asynchronously anyway. Use
`useEffect`.

**Setting state that never converges.** If the value you set changes the layout
you measure, and the new layout produces a different value, you have an infinite
commit loop. Make sure the measurement stabilizes.

**Reading `ref.current` without a null check.** The ref is `null` before the
first commit and after the node is removed. Guard it.

**Rendering it on the server and ignoring the warning.** The warning means your
server HTML and your first client frame disagree. Fix the design, do not silence
the message.

**Depending on a value that changes every render.** An object literal or an
inline function in the dependency array makes the layout effect run — and block
paint — after every single render.

**Doing heavy work inside it.** Reading `getBoundingClientRect()` for hundreds of
rows in one commit stalls the frame. Measure a container, or use an observer.

**Forgetting cleanup.** Layout effects re-run and unmount exactly like regular
Effects, and everything you attach still needs detaching.

## Related topics

- [useEffect](./use-effect.md) — the default, and the comparison table for the three Effect hooks.
- [useRef](./use-ref.md) — how you get hold of the DOM node to measure.
- [Refs and the DOM](../patterns/refs-and-dom.md) — reading and controlling nodes React owns.
- [SSR and hydration](../server-react/ssr-and-hydration.md) — why the server has no layout.
- [Profiling](../performance/profiling.md) — measuring what a blocking effect costs you.
