---
title: Directives
description: What "use client" and "use server" actually mark, and why both are usually misread.
group: server-react
order: 30
status: current
since: "19.0"
related: [server-react/server-components, server-react/server-functions, server-react/overview]
---

## Overview

React has exactly two directives, and both are widely misunderstood.

`"use client"` marks the **entry point into client code**. Everything the marked
module imports becomes client code too.

`"use server"` marks **Server Functions** — server code that client code is
allowed to call. It does not create Server Components.

Both are string literals at the top of a file, written with single or double
quotes, never backticks. Both are read by your **bundler**, not by React at
runtime. React ships the runtime that understands the resulting split; the build
tool is what performs it.

## Why it exists

RSC needs to divide your source into two module graphs — one that runs on the
server and one that is bundled for the browser — and it needs a marker that is
visible to a static analyzer before any code runs. A directive is that marker:
one line, at the top, impossible to compute conditionally.

The alternative designs all fail. File naming conventions (`*.client.jsx`) do
not survive refactors. Configuration files drift from the code. A runtime API
cannot work, because the decision has to be made at build time.

## When to use it

Add `"use client"` at the boundary where interactivity begins — the topmost
component that needs state, an Effect, an event handler or a browser API. Not on
every file below it; the directive propagates.

Add `"use server"` when a Client Component needs to invoke server code: form
submissions, mutations, anything that writes.

## When not to use it

Do not add `"use client"` to a file that only formats or displays data. You are
paying bundle bytes for nothing.

Do not add `"use client"` to the root of your app "to keep things simple". That
turns off Server Components entirely, since everything below is now client code.

Do not add `"use server"` to a file of pure helpers. Every export in that file
becomes a callable HTTP endpoint. Only mark what genuinely needs to be reachable
from the browser.

## Basic example

```jsx
'use client';

import { useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      Switch to {theme === 'light' ? 'dark' : 'light'} mode
    </button>
  );
}
```

```tsx static="Runs on the server — this module is never sent to the browser."
'use server';

import { db } from '../lib/db';
import { requireSession } from '../lib/auth';

export async function archiveNotebook(notebookId: string) {
  const session = await requireSession();
  await db.notebooks.archive({ id: notebookId, ownerId: session.userId });
}
```

## How it works

### `"use client"` marks a boundary, not a runtime

The name reads like "this runs on the client". It does not mean that.

A Client Component is server-rendered for the initial HTML, exactly like every
other component in an SSR app, and then it runs again in the browser during
hydration. `"use client"` says *where the client bundle starts*, not *where the
code executes*.

React's description of the render pass:

> During render, the framework will server-render the root component and
> continue through the render tree, opting-out of evaluating any code imported
> from client-marked code.

So the boundary marks what the server render **stops descending into as server
code** — and that subtree is then rendered as ordinary SSR and hydrated.

### The boundary propagates through imports

The directive works on the module dependency graph, not on the render tree.

> Add `'use client'` at the top of a file to mark the module and its transitive
> dependencies as client code.

If `RichTextEditor.jsx` starts with `"use client"` and imports `formatDate` and
`Button`, then `formatDate` and `Button` are client code as well — whether or
not their own files carry the directive.

```text
app/page.jsx                 (Server Component)
└── EditorPanel.jsx          "use client"   <- boundary
    ├── Toolbar.jsx                          client, inherited
    ├── formatDate.js                        client, inherited
    └── icons/index.js                       client, inherited
```

Two consequences people trip over:

- The directive is idempotent from the client side. When a `"use client"` module
  is imported from another client module, the directive has no effect — the
  boundary was already crossed.
- A single module can be evaluated in both environments. Import it from server
  code and it runs on the server; import it from client code and it is bundled
  for the browser. Modules with side effects that assume one environment will
  bite you here.

### Placement rules

| Directive | Allowed positions |
|---|---|
| `"use client"` | Top of a **file only**, above all imports and other code |
| `"use server"` | Top of a **file**, or top of an **async function body** |

Comments above a directive are fine. Quotes must be single or double, not
backticks. Nothing else may precede it — not an import, not a `const`, not a
`export {}`.

The function-body form of `"use server"` is what lets you define a Server
Function inline inside a Server Component:

```tsx static="Runs on the server."
import { db } from '../lib/db';
import { requireSession } from '../lib/auth';

export default function RenameForm({ notebookId }: { notebookId: string }) {
  async function renameNotebook(formData: FormData) {
    'use server';
    const session = await requireSession();
    await db.notebooks.rename({
      id: notebookId,
      ownerId: session.userId,
      title: String(formData.get('title')),
    });
  }

  return (
    <form action={renameNotebook}>
      <input name="title" defaultValue="Untitled" />
      <button type="submit">Rename</button>
    </form>
  );
}
```

There is no equivalent inline form for `"use client"`. A client boundary is
always a whole module.

### Serializable types across the boundary

The directives create a network boundary, so what crosses it must serialize.

| | `"use client"` props (server to client) | `"use server"` arguments and return values |
|---|---|---|
| Primitives | string, number, bigint, boolean, `undefined`, `null`, `Symbol.for` symbols | same |
| Collections | String, Array, `Map`, `Set`, `TypedArray`, `ArrayBuffer` | same |
| Objects | `Date`, plain objects of serializable values | `Date`, `FormData`, plain objects of serializable values |
| Functions | Server Functions, or functions exported from client-marked modules | Server Functions only |
| JSX | Allowed — elements render as `children` | **Not allowed** |
| Promises | Allowed | Allowed |

Never serializable in either direction: classes, instances of your own classes,
objects with a null prototype, non-global symbols. For `"use server"`
specifically, React elements and DOM events are also out.

### The bundler enforces this, not React

If your setup does not implement the directive protocol, `"use client"` is an
inert string expression and `"use server"` is an inert string expression. No
error, no warning, no boundary. Everything ends up in one bundle and the code
that was supposed to stay on the server does not.

This is why the directives only work inside a framework or with an
RSC-aware bundler plugin. See [the overview](./overview.md).

## Common mistakes

**Reading `"use client"` as "client-only".** It is a bundling boundary. The
component still renders on the server to produce initial HTML, which is why
`typeof window` checks and `Date.now()` inside it cause hydration mismatches.
See [SSR and hydration](./ssr-and-hydration.md).

**Using `"use server"` to make a Server Component.** There is no directive for
Server Components — they are the default. `"use server"` publishes an endpoint.

**Putting the directive below an import.** It must be the very first statement.
A directive after an import is a plain, ignored string expression, and most
bundlers will not tell you.

**Writing it with backticks.** `` `use client` `` is not a directive. Only
`'use client'` and `"use client"` are.

**Marking a barrel file `"use client"`.** A file that re-exports twenty
components drags all twenty into the client bundle the moment anything imports
from it. Import components from their own modules.

**Sprinkling `"use client"` downward to silence errors.** Each addition widens
the client graph. Push the boundary *down* to the smallest interactive leaf
instead, and pass server-rendered content in as `children`.

## Related topics

- [Server Components](./server-components.md) — what lives on the server side of
  the boundary.
- [Server Functions](./server-functions.md) — what `"use server"` actually
  creates, and how to secure it.
- [SSR and hydration](./ssr-and-hydration.md) — why Client Components still run
  on the server.
- [Server React overview](./overview.md) — which frameworks implement the
  directive protocol.
