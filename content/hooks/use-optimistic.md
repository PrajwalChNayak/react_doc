---
title: useOptimistic
description: Render a predicted result while an async action is in flight, then fall back to the real state.
group: hooks
order: 200
status: current
since: "19.0"
related: [hooks/use-action-state, hooks/use-transition, hooks/use-form-status, patterns/forms-and-actions]
---

## Overview

`useOptimistic` shows a value you *expect* to be true while an async action
runs. The instant the action settles, the optimistic value disappears and React
renders whatever the real state now is.

```text
const [optimisticState, addOptimistic] = useOptimistic(state, updateFn);
```

| Argument | Required | Meaning |
|---|---|---|
| `state` | yes | The real value, returned whenever no action is pending. |
| `updateFn` | no | `(currentState, payload) => nextState`. A pure function producing the optimistic value. |

Omit `updateFn` and the setter takes the next optimistic state directly — either
a value or an updater function `(pendingState) => nextState`.

> [!WARNING]
> `addOptimistic` must be called inside an **Action** — an async function passed
> to `startTransition`, or a function passed to a `<form action>` /
> `useActionState`. Called outside one, React warns and the optimistic state
> renders only briefly before snapping back.

## Why it exists

Optimistic UI has always been possible by hand: push a placeholder into state,
fire the request, then either replace the placeholder or splice it out. The
archived version of these docs did exactly that, with a temporary id and a
manual rollback in a `catch` block.

That approach has three problems. Rollback is hand-written, so it is
hand-forgotten. Concurrent submissions interleave and the splice logic gets
subtle fast. And the optimistic value is stored in the same `useState` as the
truth, so a background refresh can overwrite it.

`useOptimistic` separates the two. The real state stays a single source of
truth; the optimistic value is a **derived overlay** that exists only for the
lifetime of the pending action. React removes it automatically when the
transition ends — whether the action succeeded, failed, or was superseded.

## When to use it

- Sending a message, posting a comment, adding a to-do — anything appended to a
  list where the server only confirms what you already know.
- Toggles: likes, stars, follow buttons, checkbox lists.
- Reordering, where waiting for a round trip makes drag-and-drop feel broken.
- Anywhere the action almost always succeeds and the latency is visible.

## When not to use it

- **When failure is common or expensive.** Showing a payment as complete and
  then retracting it is worse than a spinner. Optimism should be justified.
- **When the server assigns data you must display.** If the row must show a
  server-generated invoice number, you cannot predict it — show a pending row,
  not a fake number.
- **For purely local state.** If nothing async is happening, `useState` already
  updates instantly.
- **As an error-handling strategy.** Reverting is not the same as telling the
  user what went wrong. You still need real error handling.

## Basic example

A message thread. The message appears immediately, dimmed, and settles when the
"send" completes.

```jsx live
import { useOptimistic, useState } from 'react';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function MessageThread() {
  const [messages, setMessages] = useState([
    { id: 'm1', text: 'Deploy is green.', sending: false },
  ]);

  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (current, text) => [
      ...current,
      { id: `optimistic-${current.length}`, text: String(text), sending: true },
    ]
  );

  async function sendMessage(formData) {
    const text = String(formData.get('text') ?? '').trim();
    if (!text) {
      return;
    }

    addOptimisticMessage(text);
    await delay(1200); // Stands in for the network round trip.

    setMessages(current => [
      ...current,
      { id: `m${current.length + 1}`, text, sending: false },
    ]);
  }

  return (
    <div>
      <ul>
        {optimisticMessages.map(message => (
          <li key={message.id} style={{ opacity: message.sending ? 0.5 : 1 }}>
            {message.text}
            {message.sending ? ' (sending…)' : ''}
          </li>
        ))}
      </ul>
      <form action={sendMessage}>
        <input name="text" placeholder="Write a message" />{' '}
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

Send several messages quickly. Each optimistic entry stacks, because React
applies `updateFn` once per pending action on top of the real state. Notice also
that the input clears itself: React 19 resets an uncontrolled form after a
function action completes.

## How it works

`optimisticState` is computed, not stored:

```text
optimisticState = pendingPayloads.reduce(updateFn, state)
```

React keeps the list of payloads passed to `addOptimistic` by actions that have
not finished. On every render it folds them over the current real `state`. When
an action finishes, its payload leaves the list.

Three consequences follow.

**`updateFn` must be pure.** It runs during render, possibly more than once, and
possibly discarded. No fetches, no mutation of `current`, no `Date.now()` in a
value you compare across renders.

**Reverting is not a rollback.** React does not undo anything. It stops applying
the overlay. If the action failed and the real state never changed, the UI
returns to exactly where it was.

**Late updates win.** If your action succeeds and you set the real state, the
overlay is removed in the same commit the new state arrives. There is no frame
where the item disappears and reappears — provided you set the state inside the
same action.

### Failure

When the action throws, the transition ends and React renders `state` as it is
now. The optimistic item vanishes with no explanation. That is a correct data
model and a terrible user experience on its own, so pair it with a message:

```jsx
import { useActionState, useOptimistic, useState } from 'react';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function StarButton() {
  const [stars, setStars] = useState(12);
  const [optimisticStars, addOptimisticStar] = useOptimistic(
    stars,
    current => current + 1
  );

  const [error, star] = useActionState(async () => {
    addOptimisticStar(null);
    await delay(600);

    // Half the time this "request" fails.
    if (Math.random() < 0.5) {
      return 'Could not save your star. Try again.';
    }
    setStars(current => current + 1);
    return '';
  }, '');

  return (
    <form action={star}>
      <button type="submit">★ {optimisticStars}</button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
```

The count jumps, then either sticks or slides back with an explanation. Silence
on failure is the mistake, not the revert itself.

### StrictMode and concurrent rendering

`updateFn` is a render-phase function, so StrictMode double-invokes it. A pure
function does not care. If your example misbehaves under StrictMode, the update
function is doing something it should not.

Because the overlay lives inside a transition, React can interrupt and re-render
it at a lower priority without losing it, and the rest of the UI stays
interactive while the action runs.

## Common patterns

### Outside a form, with `startTransition`

There is no form behind a like button. Wrap the work in a transition so
`addOptimistic` has an action to belong to.

```jsx
import { useOptimistic, useState, useTransition } from 'react';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function FollowButton() {
  const [following, setFollowing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [optimisticFollowing, setOptimisticFollowing] = useOptimistic(following);

  function toggleFollow() {
    startTransition(async () => {
      setOptimisticFollowing(!following);
      await delay(700);
      startTransition(() => {
        setFollowing(current => !current);
      });
    });
  }

  return (
    <button onClick={toggleFollow} disabled={isPending}>
      {optimisticFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
```

Two things to copy. This uses the **one-argument** form of `useOptimistic`, so
the setter takes the next value directly. And the state update *after* the
`await` is wrapped in `startTransition` again — once you await, you are no longer
inside the original transition's synchronous scope.

### Typed, with an explicit update function

```tsx
import { useOptimistic, useState, useTransition } from 'react';

type Reaction = { emoji: string; count: number };

export function ReactionBar({ initialReactions }: { initialReactions: Reaction[] }) {
  const [reactions, setReactions] = useState(initialReactions);
  const [isPending, startTransition] = useTransition();

  const [optimisticReactions, addReaction] = useOptimistic<Reaction[], string>(
    reactions,
    (current, emoji) =>
      current.map(reaction =>
        reaction.emoji === emoji
          ? { ...reaction, count: reaction.count + 1 }
          : reaction
      )
  );

  function handleReact(emoji: string) {
    startTransition(async () => {
      addReaction(emoji);

      const response = await fetch('/api/reactions', {
        method: 'POST',
        body: emoji,
      });
      const next = (await response.json()) as Reaction[];

      startTransition(() => {
        setReactions(next);
      });
    });
  }

  return (
    <div aria-busy={isPending}>
      {optimisticReactions.map(reaction => (
        <button key={reaction.emoji} onClick={() => handleReact(reaction.emoji)}>
          {reaction.emoji} {reaction.count}
        </button>
      ))}
    </div>
  );
}
```

Pass both type arguments — `useOptimistic<State, Payload>` — when you use the
update function in TypeScript. Without them the payload type has nothing to
infer from and lands on `unknown`.

## Advanced example

Deleting from a list is the case where naive optimistic UI most often breaks:
the item has to disappear immediately, come back on failure, and stay gone once
the server agrees.

```jsx static="Calls a real endpoint, so there is no browser preview."
import { useOptimistic, useState, useTransition } from 'react';

export default function TaskList({ initialTasks }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const [visibleTasks, hideTask] = useOptimistic(tasks, (current, taskId) =>
    current.filter(task => task.id !== taskId)
  );

  function deleteTask(taskId) {
    startTransition(async () => {
      hideTask(taskId);

      const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });

      startTransition(() => {
        if (response.ok) {
          setTasks(current => current.filter(task => task.id !== taskId));
        } else {
          // No rollback needed: `tasks` never changed, so the row returns.
          setMessage('That task could not be deleted.');
        }
      });
    });
  }

  return (
    <>
      {message ? <p role="alert">{message}</p> : null}
      <ul aria-busy={isPending}>
        {visibleTasks.map(task => (
          <li key={task.id}>
            {task.title}{' '}
            <button onClick={() => deleteTask(task.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

The failure branch sets a message and nothing else. Because the optimistic
filter is derived rather than committed, the row reappears on its own.

## Common mistakes

**Calling `addOptimistic` outside an action.** In a plain `onClick` with no
transition, React warns and the value flashes for a single render. Wrap the work
in `startTransition`, or move it into a form action.

**Doing side effects in `updateFn`.** It runs during render. Fetching, logging
or mutating there produces duplicate work under StrictMode and concurrent
rendering.

**Mutating the current state.** `current.push(item)` corrupts the real state
array. Always return a new value.

**Forgetting the second `startTransition` after an `await`.** Code after an
`await` runs outside the original transition scope. Updates made there are not
part of the action, so React may drop the optimistic overlay early.

**Fabricating server-owned fields.** Rendering an optimistic row with
`id: Date.now()` and a made-up permalink means the user can click something that
does not exist. Render the fields you know and mark the row pending.

**Treating the revert as feedback.** An item silently vanishing reads as a bug.
Always surface the failure.

**Reaching for it when the real state updates instantly anyway.** If there is no
async gap, `useOptimistic` adds a concept for nothing.

## Related topics

- [useActionState](./use-action-state.md) — the action whose lifetime the
  optimistic value is tied to.
- [useTransition](./use-transition.md) — how to create an action when there is
  no form.
- [useFormStatus](./use-form-status.md) — the pending flag for descendants of a
  form.
- [Forms and actions](../patterns/forms-and-actions.md) — the full form story in
  React 19.
- [Data libraries](../data-fetching/libraries.md) — optimistic updates that
  survive across components and cache entries.
