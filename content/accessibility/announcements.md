---
title: Announcements
description: Tell screen reader users about changes that happen away from focus, using live regions that already exist.
group: accessibility
order: 30
status: current
since: "19.0"
related: [accessibility/focus-management, accessibility/forms-accessibility, hooks/use-action-state, hooks/use-form-status]
---

## Overview

A screen reader reads what the user navigates to. If you change something
elsewhere on the page — a result count, a saved indicator, an error above a form
— nothing is read. The change is silent.

A **live region** is an element you mark as worth announcing. When its contents
change, assistive technology reads the new text without moving focus.

## Why it exists

Sighted users notice change through peripheral vision. Screen reader users have
no peripheral vision; they have a cursor that is somewhere specific. Live
regions are the only way to convey "something happened over there" without
dragging focus to it.

React makes this particularly error-prone: the natural React expression of
"show a message when there is one" is conditional rendering, and conditional
rendering is precisely what breaks live regions.

## When to use it

- Asynchronous results that appear away from focus: search counts, filter
  results, autosave confirmations.
- Form submission outcomes, when focus stays where it was.
- Errors and warnings the user did not trigger by pressing something.
- Progress on a long operation, at coarse intervals.

## When not to use it

If the user must now *do* something, move focus instead — see
[Focus management](./focus-management.md). A message nobody can act on is worse
than a message that lands where the action is.

Do not make a live region out of content the user already navigated to. It gets
announced twice.

Do not announce every keystroke, every list re-sort, or every percent of a
progress bar. Assistive technology has one speech queue, and a chatty region
blocks everything else the user is trying to hear.

## Basic example

The region is rendered on the first paint and stays rendered. Only its text
changes.

```jsx live
import { useState } from 'react';

const invoices = [
  { id: 'INV-4021', client: 'Northwind', status: 'paid' },
  { id: 'INV-4022', client: 'Contoso', status: 'overdue' },
  { id: 'INV-4023', client: 'Fabrikam', status: 'paid' },
  { id: 'INV-4024', client: 'Northwind', status: 'draft' },
];

export default function InvoiceFilter() {
  const [status, setStatus] = useState('all');
  const visible = status === 'all' ? invoices : invoices.filter(i => i.status === status);

  return (
    <div style={{ fontFamily: 'system-ui', lineHeight: 1.6 }}>
      <label htmlFor="invoice-status" style={{ marginRight: '0.5rem' }}>
        Status
      </label>
      <select
        id="invoice-status"
        value={status}
        onChange={event => setStatus(event.currentTarget.value)}
      >
        <option value="all">All</option>
        <option value="paid">Paid</option>
        <option value="overdue">Overdue</option>
        <option value="draft">Draft</option>
      </select>

      {/* Always rendered. Text changes, element does not. */}
      <p role="status" style={{ minHeight: '1.5em', fontWeight: 600 }}>
        {visible.length} of {invoices.length} invoices shown.
      </p>

      <ul>
        {visible.map(invoice => (
          <li key={invoice.id}>
            {invoice.id} — {invoice.client} ({invoice.status})
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Focus stays on the `<select>` while the count is read. That is the whole point:
the user keeps arrowing through options and hears the effect of each one.

## How it works

### `polite` and `assertive`

`aria-live` takes three values:

| Value | Behavior | Use for |
|---|---|---|
| `off` | Not announced unless focus is inside the region. The default when the attribute is absent. | Turning a region off |
| `polite` | Announced at the next pause — after the current sentence, or when the user stops typing. | Almost everything |
| `assertive` | Announced immediately, interrupting whatever is being spoken. | Errors and time-critical warnings only |

Default to `polite`. `assertive` cuts off the sentence the user was listening
to, including a sentence they asked for. Two assertive regions firing at once
means one of them is never heard.

### The region must already exist — the bug everyone hits

Assistive technology watches registered live regions for mutations. An element
inserted into the DOM *with its message already inside it* is not a mutation of
a watched region; it is a new element. Announcement is unreliable at best and,
in practice, usually absent.

This is the broken version, and it is the shape React pushes you toward:

```jsx
import { useState } from 'react';

export default function SaveButton() {
  const [message, setMessage] = useState('');

  return (
    <>
      <button type="button" onClick={() => setMessage('Draft saved.')}>Save draft</button>
      {/* Broken. The region does not exist until there is a message, so the
          message arrives at the same moment as its container. */}
      {message && <p role="status">{message}</p>}
    </>
  );
}
```

The fix is to move the condition inside the region:

```jsx
import { useState } from 'react';

export default function SaveButton() {
  const [message, setMessage] = useState('');

  return (
    <>
      <button type="button" onClick={() => setMessage('Draft saved.')}>Save draft</button>
      {/* Correct. The region is mounted from the first render and empty.
          Only its text content changes. */}
      <p role="status">{message}</p>
    </>
  );
}
```

An empty `<p>` collapses to nothing, so there is no visual difference. If your
layout shifts, give the element a `min-height` rather than removing it.

> [!WARNING]
> The same trap catches conditional rendering one level up. A live region inside
> a panel that mounts along with its first message has the same problem. Put the
> region in a component that is always mounted.

### `role="status"` and `role="alert"`

These roles are live regions with the attributes pre-set, and they are what you
should reach for:

| | Implicit `aria-live` | Implicit `aria-atomic` |
|---|---|---|
| `role="status"` | `polite` | `true` |
| `role="alert"` | `assertive` | `true` |

`role="status"` is the everyday one. `role="alert"` is for errors that need to
interrupt. Neither should be given focus when it updates — that is what makes it
a live region rather than a dialog.

### `aria-atomic` and `aria-relevant`

`aria-atomic="true"` means "read the whole region, not only the part that
changed". Without it, changing `<p aria-live="polite">3 of 12 shown</p>` to
`<p aria-live="polite">7 of 12 shown</p>` may announce only "7", which is
meaningless on its own. `role="status"` and `role="alert"` set it for you.

`aria-relevant` says which kinds of change count. The default is
`additions text`, meaning added nodes and changed text. Removals are ignored
unless you ask for them with `aria-relevant="additions removals text"` or `all`.
You rarely need it — announcing removals produces noise more often than
information.

`aria-busy="true"` on a region suppresses announcements while you make several
changes; set it back to `false` when done, and the region is read once.

### The same message twice

Setting a live region's text to the string it already holds is not a DOM change,
so nothing is announced. A user who submits an invalid form twice hears the
error once.

Two ways out. Vary the text so it is genuinely different ("Enter a valid email
address." then "Still invalid: enter a valid email address."), or keep two live
regions and alternate which one holds the message, so every message is a real
change in one of them. The Advanced example below does the second.

## Common patterns

### Route changes

A client-side navigation does not reload the document, so the browser announces
nothing. If you are already moving focus to the new page's `<h1>` — the
recommendation in [Focus management](./focus-management.md#route-changes-in-a-single-page-app) —
the heading is read and you need nothing more.

If you deliberately keep focus where it is (a tab-like navigation, a filter that
changes the URL), announce the new page title from a live region that lives in
your app shell, above the router outlet, so it never unmounts.

### Form results and pending state

React 19 Actions give you the two signals worth announcing.

`useActionState` returns the action's result as state, which you render into a
live region:

```jsx
import { useActionState } from 'react';

async function saveProfile(previousState, formData) {
  const displayName = String(formData.get('displayName') ?? '').trim();

  if (displayName.length < 2) {
    return { ok: false, message: 'Display name must be at least 2 characters.' };
  }
  return { ok: true, message: `Saved as ${displayName}.` };
}

export default function ProfileForm() {
  const [result, formAction, isPending] = useActionState(saveProfile, { ok: true, message: '' });

  return (
    <form action={formAction}>
      <label htmlFor="display-name">Display name</label>
      <input id="display-name" name="displayName" />
      <button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
      {/* Always rendered. Errors interrupt; confirmations wait. */}
      <p role={result.ok ? 'status' : 'alert'}>{result.message}</p>
    </form>
  );
}
```

`useFormStatus` gives the pending flag to a component rendered *inside* the
`<form>` — it does not see a form rendered by the same component. Disable the
submit button from it, and pair that with a visually hidden `role="status"`
region carrying the same words; see
[Form accessibility](./forms-accessibility.md#pending-state-during-a-submit).

> [!WARNING]
> Changing a button's label from "Save" to "Saving…" while it has focus does not
> reliably re-announce it, and a spinner announces nothing at all. Pair the
> disabled state with a live region.

### Suspense fallbacks and streaming

React does not announce a Suspense boundary switching between its fallback and
its content. It is a DOM replacement like any other, and a spinner with no text
conveys nothing at all.

Two consequences:

- Give the fallback real text, not only a graphic. `<p>Loading orders…</p>` beats
  an unlabeled spinner, because a user who navigates there hears something.
- Put the live region *outside* the boundary and drive it from state you
  control. A region inside the fallback mounts with its text already present —
  the exact case that does not announce.

During SSR streaming the server sends boundaries as their data resolves, and
each reveal is a DOM change on the client. React **19.2** batches SSR Suspense
boundary reveals, which cuts down the number of separate changes, but it does
not turn them into announcements. If the arrival of a section matters, announce
it explicitly.

## Advanced example

One announcer for the whole app: a provider that owns two live regions and a
hook any component can call. Press "Add to cart" twice — the message alternates
between the regions, so the repeat is still a real DOM change.

```jsx live
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const AnnouncerContext = createContext(null);

/** @type {import('react').CSSProperties} */
const hidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };

function AnnouncerProvider({ children }) {
  // One piece of state holds both regions and which one is free, so the
  // updater stays pure — important under StrictMode double-invoking.
  const [regions, setRegions] = useState({ a: '', b: '', next: 'a' });
  const [tone, setTone] = useState('polite');

  const announce = useCallback((text, level = 'polite') => {
    setTone(level);
    setRegions(current =>
      current.next === 'a'
        ? { a: text, b: '', next: 'b' }
        : { a: '', b: text, next: 'a' }
    );
  }, []);

  const value = useMemo(() => ({ announce }), [announce]);

  return (
    <AnnouncerContext value={value}>
      {children}
      {/* Both regions are mounted for the life of the app and never unmount. */}
      <div aria-live={tone === 'assertive' ? 'assertive' : 'polite'} aria-atomic="true" style={hidden}>
        {regions.a}
      </div>
      <div aria-live={tone === 'assertive' ? 'assertive' : 'polite'} aria-atomic="true" style={hidden}>
        {regions.b}
      </div>
      <p style={{ fontSize: '0.85rem', color: '#555' }}>
        Region {regions.next === 'a' ? 'B' : 'A'} last spoke: “{regions.a || regions.b || '—'}”
      </p>
    </AnnouncerContext>
  );
}

function useAnnouncer() {
  const context = useContext(AnnouncerContext);
  if (!context) throw new Error('useAnnouncer must be used inside an AnnouncerProvider.');
  return context.announce;
}

function CartControls() {
  const announce = useAnnouncer();
  const [count, setCount] = useState(0);

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={() => {
          setCount(count + 1);
          announce(`Added to cart. ${count + 1} items.`);
        }}
      >
        Add to cart
      </button>
      <button type="button" onClick={() => announce('Checkout is unavailable.', 'assertive')}>
        Check out
      </button>
    </div>
  );
}

export default function StoreDemo() {
  return (
    <div style={{ fontFamily: 'system-ui', lineHeight: 1.6, position: 'relative' }}>
      <AnnouncerProvider>
        <CartControls />
      </AnnouncerProvider>
    </div>
  );
}
```

The caption exists so you can watch the mechanism; in a real app the two regions
are the only output and both stay hidden.

> [!NOTE]
> React **19.0** made `<Context>` render directly as a provider.
> `<Context.Provider>` still works but is deprecated — write `<AnnouncerContext>`.

The hidden style here is the standard visually-hidden recipe. Do not use
`display: none` or `visibility: hidden`: both remove the element from the
accessibility tree, and a removed live region announces nothing.

## Common mistakes

**Conditionally rendering the live region.** The number one bug on this page.
Mount the region empty and change its text.

**`display: none` on the live region.** It is invisible to assistive technology,
not only to sight. Use the clip-based visually-hidden pattern.

**`aria-live="assertive"` everywhere.** It interrupts. Reserve it for errors, and
prefer `role="alert"`, which says the same thing more clearly.

**Announcing and moving focus for the same event.** The user hears the region,
then focus moves and the new location is read over it. Pick one.

**Putting a live region inside a Suspense fallback.** It mounts with its message
already inside, which is the case that does not announce.

**Making a whole results list a live region.** Every item is read on every
change. Announce the summary — "12 results" — and leave the list alone.

**Relying on a spinner for pending state.** A graphic with no text and no
announcement leaves screen reader users with silence during the wait.

**Setting the same message string twice.** Nothing changed in the DOM, so
nothing is announced. Vary the text or alternate two regions.

## Related topics

- [Focus management](./focus-management.md) — for changes the user must act on.
- [Form accessibility](./forms-accessibility.md) — where these announcements are wired into real forms.
- [useActionState](../hooks/use-action-state.md) — the result state you render into a live region.
- [useFormStatus](../hooks/use-form-status.md) — the pending flag behind the submit announcement.
- [Suspense](../data-fetching/suspense.md) — what a fallback does, and does not, convey.
- [Streaming](../server-react/streaming.md) — how boundaries are revealed on the client.
