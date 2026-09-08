---
title: Your first component
description: Build a real component step by step, from static markup to props, state, events, and a list.
group: getting-started
order: 30
status: current
related: [core-concepts/components, core-concepts/props, core-concepts/state]
---

## Overview

A React component is a JavaScript function that returns markup. That is the whole
definition. Everything else — props, state, hooks — is detail layered on top of
it.

This page builds one component four times, adding a single idea each round:

1. **Markup** — static output.
2. **Props** — the same markup, driven by data from the parent.
3. **State and an event handler** — output that changes when the user acts.
4. **A list** — many instances of the component from an array.

By the end you will have a small team directory that works.

## Basic example

Start with markup and nothing else. Create `src/TeamMemberCard.jsx`:

```jsx
export default function TeamMemberCard() {
  return (
    <article className="card">
      <h2>Priya Raman</h2>
      <p>Engineering Manager</p>
      <p>priya@example.com</p>
    </article>
  );
}
```

Three rules are already in play here.

**The name is capitalized.** `TeamMemberCard`, not `teamMemberCard`. JSX uses
capitalization to decide what you meant: a lowercase tag like `<article>` becomes
the string `"article"` and renders a DOM element, while a capitalized tag like
`<TeamMemberCard>` becomes a reference to the variable of that name. Name a
component in lowercase and React renders an unknown HTML element instead of
calling your function, with no error.

**It returns one tree.** A function returns one value, so JSX must have a single
root element. Wrapping in a `<div>` works but adds a node you may not want; a
fragment adds nothing to the DOM:

```jsx
export default function ContactLines() {
  return (
    <>
      <p>priya@example.com</p>
      <p>+1 555 0142</p>
    </>
  );
}
```

**Attributes use JavaScript names.** `className` rather than `class`, `htmlFor`
rather than `for`, `onClick` rather than `onclick`. JSX is JavaScript, and `class`
and `for` are reserved words. [JSX](../core-concepts/jsx.md) covers the rest.

### Default export or named export

Both work. The difference is how the importer writes it:

```jsx
// TeamMemberCard.jsx — one main component per file
export default function TeamMemberCard() {
  return <article>Priya Raman</article>;
}

// Also fine, and required if a file exports several components:
export function TeamMemberBadge() {
  return <span>PR</span>;
}
```

```text
import TeamMemberCard from './TeamMemberCard.jsx';        // default
import { TeamMemberBadge } from './TeamMemberCard.jsx';   // named
```

A default export can be imported under any name, which is convenient and also how
files end up importing `Card` from `TeamMemberCard.jsx`. Named exports keep the
name honest and are friendlier to editor auto-import. Pick one convention per
codebase; if you have no opinion, use a default export for the component a file is
named after and named exports for everything else.

## How it works

### Props: inputs from the parent

Hardcoding "Priya Raman" makes the component useless for anyone else. Props turn
the values into parameters:

```jsx
function TeamMemberCard({ name, role, email }) {
  return (
    <article className="card">
      <h2>{name}</h2>
      <p>{role}</p>
      <p>
        <a href={`mailto:${email}`}>{email}</a>
      </p>
    </article>
  );
}

export default function TeamPage() {
  return (
    <section>
      <TeamMemberCard name="Priya Raman" role="Engineering Manager" email="priya@example.com" />
      <TeamMemberCard name="Diego Santos" role="Design Lead" email="diego@example.com" />
    </section>
  );
}
```

The parent supplies props as JSX attributes. Inside the child, curly braces switch
from markup back into JavaScript: `{name}` reads a variable and
`` {`mailto:${email}`} `` evaluates a template literal. Any expression is allowed.

**Props are read-only.** A component must never assign to its own props. React
assumes rendering is pure — same props in, same markup out — and breaks in subtle
ways when that assumption is violated.

For default values, use ordinary JavaScript default parameters — `role = 'Team
member'` in the parameter list. In TypeScript you also type the props:

```tsx
type TeamMemberCardProps = {
  name: string;
  role?: string;
  email: string;
};

export default function TeamMemberCard({
  name,
  role = 'Team member',
  email,
}: TeamMemberCardProps) {
  return (
    <article>
      <h2>{name}</h2>
      <p>{role}</p>
      <a href={`mailto:${email}`}>{email}</a>
    </article>
  );
}
```

### State: values that change

Props come from above and you cannot change them. State belongs to the component
and survives across renders. `useState` returns the current value and a function
to set it:

```jsx live
import { useState } from 'react';

function TeamMemberCard({ name, role, email }) {
  const [showEmail, setShowEmail] = useState(false);

  const card = { border: '1px solid #d0d7de', borderRadius: 8, padding: 16 };

  return (
    <article style={{ ...card, marginBottom: 12, fontFamily: 'system-ui' }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{name}</h2>
      <p style={{ margin: '4px 0', color: '#57606a' }}>{role}</p>
      <button onClick={() => setShowEmail(!showEmail)}>
        {showEmail ? 'Hide contact' : 'Show contact'}
      </button>
      {showEmail && (
        <p style={{ margin: '8px 0 0' }}>
          <a href={`mailto:${email}`}>{email}</a>
        </p>
      )}
    </article>
  );
}

export default function TeamPage() {
  return (
    <div>
      <TeamMemberCard name="Priya Raman" role="Manager" email="priya@example.com" />
      <TeamMemberCard name="Diego Santos" role="Design Lead" email="diego@example.com" />
    </div>
  );
}
```

Open the preview and toggle one card. The other stays closed — **state is per
component instance**, not per component. Two `<TeamMemberCard>` elements have two
independent `showEmail` values.

Three things to notice about the event handler:

- `onClick` receives **a function**, not a call. `onClick={setShowEmail(true)}`
  would call it during render, which is a common early mistake.
- Setting state does not change the variable you are looking at. `showEmail` is a
  constant for the whole render; the new value appears on the *next* render.
- `{showEmail && ...}` renders something conditionally. See
  [Conditional rendering](../core-concepts/conditional-rendering.md).

> [!WARNING]
> Call hooks at the top level of a component, never inside a condition, loop, or
> nested function. React matches hooks to state by call order.
> [Rules of Hooks](../hooks/rules-of-hooks.md) explains why, and the ESLint plugin
> enforces it.

## Common patterns

### Rendering a list

Real data arrives as an array. Turn it into elements with `map`:

```jsx live
import { useState } from 'react';

const team = [
  { id: 'priya', name: 'Priya Raman', role: 'Engineering Manager' },
  { id: 'diego', name: 'Diego Santos', role: 'Design Lead' },
  { id: 'amara', name: 'Amara Okafor', role: 'Staff Engineer' },
  { id: 'jonas', name: 'Jonas Weber', role: 'Product Analyst' },
];

function TeamMemberCard({ name, role, isSelected, onSelect }) {
  const style = {
    listStyle: 'none',
    cursor: 'pointer',
    padding: '8px 12px',
    marginBottom: 6,
    border: '1px solid #d0d7de',
    background: isSelected ? '#ddf4ff' : 'transparent',
  };

  return (
    <li onClick={onSelect} style={style}>
      <strong>{name}</strong>
      <span style={{ color: '#57606a' }}> — {role}</span>
    </li>
  );
}

export default function TeamDirectory() {
  const [selectedId, setSelectedId] = useState(null);
  const selected = team.find((member) => member.id === selectedId);

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 420 }}>
      <h2 style={{ fontSize: 18 }}>Team ({team.length})</h2>
      <ul style={{ padding: 0 }}>
        {team.map((member) => (
          <TeamMemberCard
            key={member.id}
            name={member.name}
            role={member.role}
            isSelected={member.id === selectedId}
            onSelect={() => setSelectedId(member.id)}
          />
        ))}
      </ul>
      <p>{selected ? `Selected: ${selected.name}` : 'Select a team member.'}</p>
    </div>
  );
}
```

Two ideas carry most of the weight here.

**`key` identifies an item across renders.** React uses it to tell which items
were added, removed, or reordered, and which DOM nodes and state belong to which
item. Use a stable id from your data. The array index works only for lists that
never reorder and never have items inserted or removed.

**The selection lives in the parent.** `TeamDirectory` owns `selectedId` because
it is the only component that can see all the cards. The cards report clicks
upward through the `onSelect` prop they were handed. That is React's data flow in
one screen: props down, events up. [Lifting state up](../state-management/lifting-state-up.md)
generalizes it.

Also note that `selected` is **not** state. It is derived from `team` and
`selectedId` on every render, so it cannot go stale.

## Advanced example

The same directory with the parts a production version would have: typed props,
a search field, and derived filtering.

```tsx
import { useState } from 'react';

type TeamMember = {
  id: string;
  name: string;
  role: string;
};

const team: TeamMember[] = [
  { id: 'priya', name: 'Priya Raman', role: 'Engineering Manager' },
  { id: 'diego', name: 'Diego Santos', role: 'Design Lead' },
  { id: 'amara', name: 'Amara Okafor', role: 'Staff Engineer' },
];

function TeamMemberCard({
  member,
  isSelected,
  onSelect,
}: {
  member: TeamMember;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button type="button" onClick={() => onSelect(member.id)}>
        {member.name} — {member.role}
        {isSelected ? ' (selected)' : ''}
      </button>
    </li>
  );
}

export default function TeamDirectory() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = team.filter((member) =>
    member.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <label htmlFor="team-search">Search</label>
      <input
        id="team-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul>
        {visible.map((member) => (
          <TeamMemberCard
            key={member.id}
            member={member}
            isSelected={member.id === selectedId}
            onSelect={setSelectedId}
          />
        ))}
      </ul>
      {visible.length === 0 && <p>No one matches “{query}”.</p>}
    </div>
  );
}
```

`visible` is computed, not stored. There is no Effect keeping a `filteredTeam`
state variable in sync with `query`, because there is nothing to keep in sync —
the filter runs as part of rendering.

## Common mistakes

- **Lowercase component names.** `<teamMemberCard />` renders an unknown HTML
  element silently. Capitalize.
- **Returning more than one root element.** Wrap in a fragment (`<>…</>`).
- **Calling the handler instead of passing it.** `onClick={handleClick()}` runs
  during render. Pass `onClick={handleClick}` or `onClick={() => handleClick(id)}`.
- **Mutating props or state.** `member.name = 'x'` or `items.push(item)` will not
  trigger a re-render and will corrupt the previous value React compares against.
  Create a new object or array.
- **Reading state right after setting it.** `setCount(count + 1); console.log(count)`
  logs the old value. State updates are applied before the next render, not
  during the current one.
- **Declaring components inside other components.** A nested function component is
  a brand-new component type on every render, so React unmounts and remounts it,
  throwing away its DOM and state. Define components at module level.
- **Storing derived values in state.** A filtered list, a total, a formatted date:
  compute these during render.
- **Using the array index as a `key`** in a list that can reorder or shrink.

## Related topics

- [Components](../core-concepts/components.md) — composition, children, and component boundaries.
- [Props](../core-concepts/props.md) — passing data down, including `children`.
- [State](../core-concepts/state.md) — how state behaves across renders.
- [useState](../hooks/use-state.md) — the full API, including updater functions.
- [Lists and keys](../core-concepts/lists-and-keys.md) — why `key` matters and how to choose one.
- [Thinking in React](./thinking-in-react.md) — going from a design to a component tree.
