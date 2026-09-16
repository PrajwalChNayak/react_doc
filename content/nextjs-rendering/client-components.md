---
title: Client Components in Next.js
description: Place the "use client" boundary in an App Router app, control what crosses it, and keep client bundles small.
group: nextjs-rendering
order: 20
status: current
related: [server-react/directives, nextjs-rendering/server-components, nextjs-rendering/composition-patterns, state-management/context]
---

## Overview

A Client Component in Next.js is any component in a module marked
`"use client"`, or imported by one. It renders on the server for the initial
HTML, then hydrates and runs in the browser, where it can hold state, run
Effects and handle events.

What the directive means to React (a module-graph boundary, not a
"browser only" switch) is covered in [Directives](../server-react/directives.md).
This page is about the Next.js side: where to put the boundary in an App Router
app, what may cross it, what it costs in bundle size, and how to handle
third-party libraries and context providers.

## Why it exists

The App Router makes everything a Server Component by default, and Server
Components cannot respond to a user. `"use client"` is the opt-in for the parts
that must: a search box, a like button, a date picker, a chart the user can
zoom.

The directive is a module-level switch rather than a per-component flag because
bundlers decide what to ship per module. Everything reachable from a
`"use client"` module through imports goes into the client bundle, so where you
put the directive decides how much JavaScript the page downloads.

## When to use it

Mark a module `"use client"` when its component needs:

- `useState`, `useReducer`, `useOptimistic` or another stateful hook
- `useEffect`, `useLayoutEffect` or refs to DOM nodes
- event handlers such as `onClick` or `onChange`
- browser APIs such as `localStorage`, `window` or `navigator.geolocation`
- a custom hook built on any of these, or a library that uses them
- Next.js client hooks such as `useRouter`, `usePathname` or `useSearchParams`

## When not to use it

Do not add `"use client"` to a component that only displays data. The browser
already has built-in interactivity that needs no JavaScript from you: a
`<details>` element opens and closes, a `<form>` can submit to a Server Action,
and `<video controls>` plays.

Do not put the directive on a layout, or on a page, to make an error go away.
Every import below it becomes client code, and none of it can read from the
database any more.

## Basic example

The page stays on the server and fetches data. Only the button is a Client
Component, and it receives two serializable props.

```tsx file="app/recipes/[slug]/save-recipe-button.tsx"
'use client';

import { useState, useTransition } from 'react';
import { toggleSavedRecipe } from './actions';

export default function SaveRecipeButton({
  recipeId,
  initialSaved,
}: {
  recipeId: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await toggleSavedRecipe(recipeId);
      setSaved(result.saved);
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} aria-pressed={saved}>
      {saved ? 'Saved' : 'Save recipe'}
    </button>
  );
}
```

The page that renders it is shown on
[Server Components in Next.js](./server-components.md). `toggleSavedRecipe` is a
Server Action in a `"use server"` module, so the button can call server code
without an API route.

## How it works

### The boundary follows imports, not the render tree

Once a file starts with `"use client"`, the modules it imports and the
components it renders directly are part of the client module graph. You do not
repeat the directive in each of those files.

The boundary does **not** swallow components passed in as `children` or other
props. Those are rendered by their owner, a Server Component, and arrive as
rendered output. That is what makes
[composition patterns](./composition-patterns.md) possible.

### Client Components still render on the server

On a direct visit, Next.js renders Client Components to HTML on the server (at
build time for prerendered routes, or per request), then hydrates them. On a
client-side navigation, they render in the browser from the RSC Payload.

So code in the component body runs in both environments. Reading `window` or
`localStorage` during render throws on the server. Read them in an Effect or an
event handler.

```tsx file="app/ui/recently-viewed.tsx"
'use client';

import { useEffect, useState } from 'react';

export default function RecentlyViewed() {
  const [recipeTitles, setRecipeTitles] = useState<string[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem('recently-viewed');
    if (stored) {
      setRecipeTitles(JSON.parse(stored) as string[]);
    }
  }, []);

  if (recipeTitles.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Recently viewed recipes">
      {recipeTitles.map((title) => (
        <li key={title}>{title}</li>
      ))}
    </ul>
  );
}
```

### What crosses the boundary

Code crosses through imports. Data crosses through props, and props must be
serializable by React: primitives, plain objects, arrays, `Date`, `Map`, `Set`,
promises, JSX, and Server Functions. The full list is on
[Directives](../server-react/directives.md).

Next.js adds two practical points:

- **Passing an ordinary function as a prop throws.** An `onClick` handler
  defined in a Server Component cannot cross. A Server Action can, because it
  crosses as a reference to a server endpoint.
- **The TypeScript plugin checks function props.** A Server Action is not
  distinguishable from a plain function by its type. The Next.js TypeScript
  plugin allows a function-typed prop on a Client Component when the prop is
  named `action` or ends in `Action`, and flags other function props. Naming
  props `saveAction` or `deleteAction` documents intent and keeps the editor
  quiet.

## Server and client implications

### Bundle size

Every module reachable from a `"use client"` file ships to the browser. Three
habits keep that small:

- Put the directive on the **smallest interactive leaf**, not on the layout
  around it.
- Import components from their own modules. A `"use client"` barrel file that
  re-exports twenty components pulls all twenty in.
- Keep heavy, display-only work (Markdown, syntax highlighting, date formatting
  for static text) in Server Components.

To see what actually ships, use the bundle analyzer described in
[bundle analysis](../nextjs-performance/bundle-analysis.md).

### Environment variables

Only variables prefixed with `NEXT_PUBLIC_` are inlined into client code, and
they are inlined at build time. An unprefixed variable reads as an empty string
in a Client Component. See
[environment variables](../nextjs-backend/environment-variables.md).

### State survives navigation with Cache Components

When `cacheComponents` is enabled, Next.js hides the previous route with React's
[`<Activity>`](../performance/activity.md) instead of unmounting it. Client state
such as form input or an expanded panel is still there when the user navigates
back. Effects are cleaned up while the route is hidden and run again when it
becomes visible. Next.js keeps a few recently visited routes this way and
removes older ones.

## Common patterns

### Wrap third-party components that lack the directive

Many libraries use hooks but do not mark their entry points `"use client"`.
They work inside your own Client Components, but importing one directly into a
Server Component fails, because Next.js cannot know the library needs the
client. Re-export it from a module you mark:

```tsx file="app/ui/carousel.tsx"
'use client';

import { Carousel } from 'acme-carousel';

export default Carousel;
```

A Server Component can now render `<Carousel />` from `@/app/ui/carousel`. If
you publish a component library, add `"use client"` to the entry points that
need it, so your users do not have to write wrappers.

### Put context providers in a Client Component, and render them deep

Server Components cannot create or read React context. Create the provider in a
Client Component that accepts `children`:

```tsx file="app/providers/theme-provider.tsx"
'use client';

import { createContext, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

export const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}
```

Render it from a layout, wrapping `{children}` rather than the whole document:

```tsx file="app/layout.tsx"
import type { ReactNode } from 'react';
import { ThemeProvider } from './providers/theme-provider';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider initialTheme="light">{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

The children are still Server Components. They were rendered by the layout and
passed through. Rendering the provider as deep as possible leaves more of the
tree, such as `<html>` and `<body>`, as plain server output that Next.js can
optimize. How context itself behaves is on [Context](../state-management/context.md).

### Mark client-only modules

The `client-only` package is the mirror of `server-only`. Import it in a module
that touches `window` at the top level, and importing that module from a Server
Component fails at build time instead of at runtime.

## Common mistakes

**Putting `"use client"` in the root layout.** The whole app becomes client
code, Server Components stop existing, and data access has to move to Route
Handlers. Put the directive on the interactive leaves.

**Placing the directive below an import.** It must be the first statement in the
file (comments above it are fine). Anywhere else it is an ignored string, and
the module stays in the server graph.

**Using a compound component across the boundary.** `Menu.Item` as a static
property of a Client Component is `undefined` in a Server Component, because the
Server Component receives a client reference, not the function. React then
throws "Element type is invalid". Export the pieces as named exports instead.

**Reading browser globals during render.** Client Components render on the
server first. Use an Effect, or a check inside an event handler.

**Passing an event handler from a Server Component.** Functions do not
serialize. Either move the handler into the Client Component, or pass a Server
Action.

**Importing a server-only helper only for its types.** A value import from a
module that reads secrets pulls it toward the client graph. Use `import type`,
and guard the module with `server-only`.

## Related topics

- [Directives](../server-react/directives.md): the React rules for
  `"use client"`, placement and serializable props.
- [Server Components in Next.js](./server-components.md): the default side of
  the boundary.
- [Composition patterns](./composition-patterns.md): nesting server-rendered
  content inside Client Components.
- [Context](../state-management/context.md): how providers and consumers work
  once they are on the client.
- [Bundle analysis](../nextjs-performance/bundle-analysis.md): measure what the
  client graph costs.
