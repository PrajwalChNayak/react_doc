---
title: Fetching in Effects
description: How to fetch data in useEffect correctly, and what that approach can never do for you.
group: data-fetching
order: 40
status: current
related: [hooks/use-effect, data-fetching/overview, data-fetching/libraries, core-concepts/strict-mode]
---

## Overview

Fetching in an Effect is the option of last resort in
[the data-fetching hierarchy](./overview.md). It is also the one you will
inherit in every existing codebase, so it is worth writing correctly.

Correctly means five things, and most hand-written versions miss at least two:

1. **Cleanup**, so a response that arrives after the inputs changed is ignored.
2. **Cancellation**, so an abandoned request stops consuming bandwidth.
3. **Honest dependencies**, so the Effect re-runs exactly when its inputs change.
4. **Real loading and error state**, including the error that arrives second.
5. **No fetching for things that are not fetches** — derived values, event
   responses, subscriptions.

## Why it exists

`useEffect` synchronizes a component with an external system. A server is an
external system, so the fit is not absurd — but it is a poor fit, because a
fetch is a one-shot request with a result, not an ongoing synchronization with a
value you can read back.

The mismatch shows up as everything the Effect does not handle for you: no
cache, no dedupe, no revalidation, and a race condition that appears only when
the network is slow enough to interleave two responses.

Use it when you have no framework, no data library, and one or two places that
need data. Do not use it as the foundation of a data layer.

## When to use it

- A small app or a single widget where adding a dependency is not justified.
- Data that is genuinely component-local and never shared.
- Bridging to a non-HTTP source that has no library — a Web Worker, a native
  bridge, an SDK with a callback API.
- Maintaining code that already works this way, where a rewrite is not the task.

## When not to use it

- **Deriving a value from props or state.** Compute it during render. An Effect
  that only calls `setState` from other state is a bug in waiting.
- **Responding to an event.** A search submitted by a button belongs in the
  handler, not in an Effect watching a state variable.
- **Subscribing to a store.** Use
  [`useSyncExternalStore`](../hooks/use-sync-external-store.md).
- **Anything that needs a cache.** Two components needing the same record will
  issue two requests, forever.
- **Submitting a form.** That is an [action](../patterns/forms-and-actions.md).

## Basic example

Race conditions are the reason cleanup is not optional. This example uses a
simulated backend whose responses arrive out of order, so you can watch the bug
and the fix side by side.

```jsx live
import { useEffect, useState } from 'react';

// Deliberately uneven latency: request 2 answers before request 1.
const LATENCY = { 1: 1500, 2: 300, 3: 700 };

function fetchArticle(articleId) {
  return new Promise(resolve => {
    setTimeout(
      () => resolve(`Article ${articleId}`),
      LATENCY[articleId] ?? 500
    );
  });
}

function ArticleTitle({ articleId, safe }) {
  const [title, setTitle] = useState('…');

  useEffect(() => {
    let ignore = false;
    setTitle('…');

    fetchArticle(articleId).then(result => {
      if (safe && ignore) {
        return; // Stale response: a newer request has already been sent.
      }
      setTitle(result);
    });

    return () => {
      ignore = true;
    };
  }, [articleId, safe]);

  return <strong>{title}</strong>;
}

export default function RaceDemo() {
  const [articleId, setArticleId] = useState(1);

  return (
    <div>
      <button onClick={() => setArticleId(1)}>Open 1 (slow)</button>{' '}
      <button onClick={() => setArticleId(2)}>Open 2 (fast)</button>{' '}
      <button onClick={() => setArticleId(3)}>Open 3</button>
      <p>Requested: article {articleId}</p>
      <p>Without cleanup: <ArticleTitle articleId={articleId} safe={false} /></p>
      <p>With cleanup: <ArticleTitle articleId={articleId} safe={true} /></p>
    </div>
  );
}
```

Click "Open 1" and then "Open 2" quickly. The unguarded row briefly shows
"Article 2" and then flips back to "Article 1" — the slow first response landed
last and won. The guarded row stays on "Article 2", because the cleanup function
set `ignore` before the stale response arrived.

## How it works

React runs the Effect after the component commits. Before running it again — and
when the component unmounts — React runs the cleanup function returned by the
previous run. That ordering is the whole mechanism:

```text
render  →  effect(id=1)
                       ↘ cleanup(id=1)  →  effect(id=2)
```

Any response belonging to a run whose cleanup has already fired is stale by
definition. The `ignore` flag is closed over by exactly one run, so each run
knows whether it is still current.

### `ignore` flag versus `AbortController`

Both are correct. They solve different halves of the problem.

| | `ignore` flag | `AbortController` |
|---|---|---|
| Prevents stale state updates | Yes | Yes, via the rejection |
| Stops the network request | No | Yes |
| Works with any promise | Yes | Only with APIs that accept a signal |
| Extra error handling | None | Must ignore `AbortError` |

Use `AbortController` with `fetch`, since it frees the connection. Use an
`ignore` flag for promises you cannot cancel. Using both is reasonable and
costs one line.

### StrictMode's double mount is a feature

In development, React 19's StrictMode mounts each component, unmounts it, and
mounts it again. Your Effect runs, cleans up, and runs again — on purpose.

That is not a bug to work around with a `useRef` guard. It is a **test of your
cleanup**, run on every component you write. If the double mount produces
duplicate rows, a flipped state, or two open sockets, then the same thing
happens in production the first time the user navigates away and back quickly.

Fix the cleanup, not the symptom. See
[StrictMode](../core-concepts/strict-mode.md).

### Waterfalls

An Effect runs after render, so a child that fetches starts its request one
commit after its parent's data arrived. Three nested levels of data-fetching
components is three sequential round trips. Nothing in the Effect API can fix
this — only fetching higher up, or preloading, can.

## Common patterns

### The complete shape, with `AbortController`

```jsx static="Calls a real endpoint, so there is no browser preview."
import { useEffect, useState } from 'react';

export default function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setErrorMessage('');

    async function load() {
      try {
        const response = await fetch(`/api/users/${userId}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }
        const body = await response.json();
        setUser(body);
        setStatus('success');
      } catch (loadError) {
        if (controller.signal.aborted) {
          return; // The Effect was cleaned up; this result is not wanted.
        }
        setErrorMessage(
          loadError instanceof Error ? loadError.message : 'Request failed'
        );
        setStatus('error');
      }
    }

    load();

    return () => controller.abort();
  }, [userId]);

  if (status === 'error') return <p role="alert">{errorMessage}</p>;
  if (status === 'loading' || !user) return <p>Loading profile…</p>;

  return (
    <section>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </section>
  );
}
```

Three things to copy: the status is a single string rather than two booleans
that can both be true; `response.ok` is checked, because `fetch` does not reject
on a 404 or a 500; and the abort is checked before any state is set.

> [!NOTE]
> `fetch` rejects only on network failure. A `500` resolves successfully with
> `ok === false`. Axios rejects on non-2xx by default, which is the main reason
> teams reach for it — but a three-line `if (!response.ok) throw` removes the
> difference.

### A custom hook, with cancellation

The archived version of these docs offered a `useFetch` hook with an `isMounted`
flag and `JSON.stringify(options)` in the dependency array. Both parts are worth
revisiting: the flag prevents the state update but not the request, and
stringifying an options object on every render is a dependency smell. Take the
URL and a stable `AbortSignal`-aware fetcher instead.

```jsx static="Calls a real endpoint, so there is no browser preview."
import { useCallback, useEffect, useState } from 'react';

export function useJson(url) {
  const [state, setState] = useState({
    status: 'loading',
    data: null,
    errorMessage: '',
  });
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken(token => token + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: null, errorMessage: '' });

    fetch(url, { signal: controller.signal })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        setState({ status: 'success', data, errorMessage: '' });
      })
      .catch(loadError => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          status: 'error',
          data: null,
          errorMessage:
            loadError instanceof Error ? loadError.message : 'Request failed',
        });
      });

    return () => controller.abort();
  }, [url, reloadToken]);

  return { ...state, reload };
}
```

`url` is a string, so the dependency is honest without serializing anything.
`reload` bumps a token rather than exposing a mutable ref, so a caller can retry
without the hook growing an imperative API.

### Polling that actually stops

The archived polling example set an interval and cleared it on unmount, but each
tick fired an uncancelled request and wrote state without checking whether the
component was still interested. Both are fixed by scheduling the next tick
*after* the previous one finishes.

```jsx live
import { useEffect, useState } from 'react';

let tick = 0;

// Stands in for a status endpoint so the example needs no network.
function fetchStatus() {
  return new Promise(resolve => {
    tick += 1;
    setTimeout(() => resolve(`healthy (poll #${tick})`), 300);
  });
}

export default function StatusMonitor() {
  const [status, setStatus] = useState('starting…');
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!polling) {
      return;
    }

    let cancelled = false;
    let timeoutId;

    async function poll() {
      const next = await fetchStatus();
      if (cancelled) {
        return;
      }
      setStatus(next);
      timeoutId = setTimeout(poll, 1500);
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [polling]);

  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={() => setPolling(p => !p)}>
        {polling ? 'Pause polling' : 'Resume polling'}
      </button>
    </div>
  );
}
```

Chaining `setTimeout` rather than using `setInterval` guarantees that a slow
response cannot cause requests to pile up on top of each other.

### Parallel requests

Sequential `await`s inside one Effect are a waterfall you wrote yourself. When
two requests do not depend on each other, start both and wait once:

```js
const options = { signal: controller.signal };

const [service, alerts] = await Promise.all([
  fetch(`/api/services/${serviceId}`, options).then(r => r.json()),
  fetch(`/api/services/${serviceId}/alerts`, options).then(r => r.json()),
]);
```

One `AbortController` cancels both.

## Advanced example

Search-as-you-type is where every weakness of Effect fetching appears at once:
overlapping requests, stale responses, and a request per keystroke.

```jsx static="Calls a real endpoint, so there is no browser preview."
import { useEffect, useState } from 'react';

export default function ProjectSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    // Debounce: only the last keystroke in a 300ms window issues a request.
    const timeoutId = setTimeout(() => {
      fetch(`/api/projects?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(response => response.json())
        .then(data => {
          setResults(data.items);
          setIsSearching(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  return (
    <div>
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Search projects"
        aria-label="Search projects"
      />
      <p aria-live="polite">{isSearching ? 'Searching…' : `${results.length} results`}</p>
      <ul>
        {results.map(project => (
          <li key={project.id}>{project.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

The cleanup clears the pending timer *and* aborts the in-flight request, so a
fast typist issues one request instead of twelve.

Now compare what this still does not do. It refetches the same query every time
the user retypes it. It does not share results with any other component. It has
no retry, no revalidation, and no way to invalidate after a mutation elsewhere
in the app. Getting those requires a cache — which is the argument for
[a data library](./libraries.md), not a longer Effect.

> [!BEST-PRACTICE]
> Write the Effect correctly, and the moment you need a second component to see
> the same data, stop extending it and adopt a cache.

## Common mistakes

**No cleanup at all.** The default outcome is a race condition that only shows
up on a slow connection, which means it ships.

**Guarding StrictMode instead of fixing cleanup.** A `useRef(false)` "did I
already run" flag hides the symptom in development and leaves the bug in
production. React 19 has no way to disable the double mount, and you would not
want one.

**Not checking `response.ok`.** `fetch` resolves on a 500. Without the check you
render an error page's JSON as if it were data.

**Reading properties off a `catch` variable without narrowing.** The caught value
is `unknown` in TypeScript and can be anything at runtime. Use
`error instanceof Error ? error.message : 'Request failed'`.

**Objects and arrays in the dependency array.** A new object literal every render
means the Effect runs every render. Depend on the primitives you actually use,
or memoize the object.

**`setInterval` polling with an uncancelled request.** A slow endpoint makes
requests overlap and queue. Chain `setTimeout` after each completed response.

**Two booleans for one state.** `isLoading` and `isError` can both be true, and
one day they will be. Use a single status string.

**Fetching in a child that the parent could have fetched.** Each nesting level
adds a full round trip before anything renders.

## Related topics

- [useEffect](../hooks/use-effect.md) — the dependency and cleanup rules in
  detail.
- [Data fetching overview](./overview.md) — why this page is the last resort.
- [Data libraries](./libraries.md) — what to adopt when one Effect becomes ten.
- [StrictMode](../core-concepts/strict-mode.md) — why development mounts twice.
- [useSyncExternalStore](../hooks/use-sync-external-store.md) — for
  subscriptions rather than requests.
