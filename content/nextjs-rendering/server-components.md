---
title: Server Components in Next.js
description: How the App Router makes every page and layout a Server Component, and what that means for data access, secrets and request data.
group: nextjs-rendering
order: 10
status: current
related: [server-react/server-components, nextjs-rendering/client-components, nextjs-rendering/static-and-dynamic-rendering, nextjs-auth/data-access-layer]
---

## Overview

In the App Router, every file under `app/` is a Server Component unless it, or a
module that imports it, is marked `"use client"`. Pages, layouts, `loading.tsx`,
`not-found.tsx` and the components they import all start on the server.

This page covers what Next.js does with that default: how it renders Server
Components, where data access and secrets belong, and why request data arrives
as promises. The React model itself, including what a Server Component can and
cannot do and the serialization rules, is explained in
[Server Components](../server-react/server-components.md). Read that first if
the idea is new.

## Why it exists

React defines Server Components but does not ship the pieces that make them
work: the module-graph split, the server that renders them, the router that
fetches their output. Next.js is one of those pieces. It decides where the
boundary sits by default, and it chose the server.

That default matters because the cheapest JavaScript is the JavaScript you never
send. A page that formats Markdown, queries a database and renders a table ships
none of that code when it stays on the server. You add client code only where a
user interacts.

## When to use it

Keep a component on the server when it:

- reads from a database, an internal service, the filesystem or a CMS
- uses an API key, token or any other secret
- only displays data and has no state, Effects or event handlers
- depends on a large library whose only job is producing markup

In practice, that is most of a typical app: layouts, navigation shells, article
bodies, product details, tables and dashboards.

## When not to use it

Move a component to the client when it needs `useState`, `useReducer`, an Effect,
an event handler, a ref to a DOM node or a browser API such as `localStorage`.
See [Client Components](./client-components.md) for how to place that boundary.

Do not keep a component on the server only to shrink the bundle if it then has
to serialize a large object for a Client Component below it. You have swapped
JavaScript bytes for payload bytes.

## Basic example

A page is an `async` Server Component. It reads its route parameters, loads data
directly and passes only what the interactive child needs.

```tsx file="app/recipes/[slug]/page.tsx"
import { notFound } from 'next/navigation';
import { getRecipe } from '@/lib/recipes';
import SaveRecipeButton from './save-recipe-button';

export default async function RecipePage({ params }: PageProps<'/recipes/[slug]'>) {
  const { slug } = await params;
  const recipe = await getRecipe(slug);

  if (!recipe) {
    notFound();
  }

  return (
    <article>
      <h1>{recipe.title}</h1>
      <p>{recipe.summary}</p>
      <SaveRecipeButton recipeId={recipe.id} initialSaved={recipe.isSaved} />
    </article>
  );
}
```

Because this page awaits `params` and an uncached query, its segment needs a
Suspense boundary. A `loading.tsx` next to the page provides one:

```tsx file="app/recipes/[slug]/loading.tsx"
export default function RecipeLoading() {
  return <p aria-busy="true">Loading recipe…</p>;
}
```

There is no API route, no client fetch and no loading state in the page itself.
`getRecipe` runs on the server during render. Only `SaveRecipeButton` and its
two props reach the browser.

## How it works

### What Next.js renders

On the server, Next.js renders each route segment (layouts and pages) with
React's server APIs. Server Components produce the **RSC Payload**, a serialized
description of the rendered tree. It holds the rendered output of Server
Components, placeholders for Client Components with references to their
JavaScript, and the props passed to those Client Components.

Next.js then uses the payload and the Client Components to produce HTML. On a
first visit the browser gets:

1. **HTML**, for a fast, non-interactive first paint.
2. **The RSC Payload**, so React can reconcile the server and client trees.
3. **JavaScript** for Client Components only, to hydrate them.

On later client-side navigations, the router fetches the RSC Payload for the new
route and renders Client Components in the browser without server HTML.

### Rendering again means rendering on the server

A Server Component's code never reaches the browser, so the browser cannot
re-render it. Next.js renders it again on the server when the route renders
again: on a navigation, a `router.refresh()`, or after a Server Action
revalidates data. The browser receives a new payload and React updates the DOM.

That is why mutating Server Component DOM nodes directly is a mistake. The next
payload overwrites your change, or React finds a DOM that no longer matches its
tree.

### Request data is asynchronous

Request-specific inputs are async. Next.js 15 introduced this with a temporary
synchronous fallback, and Next.js 16 removed the fallback:

| Input | How you read it |
|---|---|
| Route params | `const { slug } = await params` |
| Query string | `const { q } = await searchParams` |
| Cookies | `const cookieStore = await cookies()` from `next/headers` |
| Request headers | `const headerList = await headers()` from `next/headers` |
| Draft Mode | `const draft = await draftMode()` from `next/headers` |

They are promises because reading them is what makes a render depend on the
request. When `cacheComponents` is enabled, Next.js prerenders everything that
does not await one of them, and treats each await as a point where rendering
must wait for a real request. See
[static and dynamic rendering](./static-and-dynamic-rendering.md) for how that
decides what lands in the prerendered shell.

## Server and client implications

### Secrets stay on the server, if you let them

Next.js only inlines environment variables prefixed with `NEXT_PUBLIC_` into
client bundles. An unprefixed `process.env.RECIPES_API_KEY` is replaced with an
empty string in client code, so a data helper imported by a Client Component
quietly breaks instead of leaking.

"Quietly breaks" is not a guarantee. Mark modules that must never reach the
browser with the `server-only` package. Importing one from a Client Component
then fails at build time.

```ts file="lib/recipes.ts"
import 'server-only';

type Recipe = {
  id: string;
  title: string;
  summary: string;
  isSaved: boolean;
};

export async function getRecipe(slug: string): Promise<Recipe | null> {
  const response = await fetch(`https://recipes.internal.example.com/v1/recipes/${slug}`, {
    headers: { Authorization: `Bearer ${process.env.RECIPES_API_KEY}` },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Recipe service responded with ${response.status}`);
  }

  return (await response.json()) as Recipe;
}
```

Next.js handles the `server-only` and `client-only` imports itself, so installing
the packages is optional. Install them anyway if your linter flags undeclared
dependencies.

### Props are a public API

Everything a Server Component passes to a Client Component is serialized into
the payload and readable in the browser. Passing a whole user record because the
child needs `displayName` sends the email address, role and anything else on
that object. Shape data before it crosses. A
[data access layer](../nextjs-auth/data-access-layer.md) that returns narrow
data transfer objects makes that the default rather than a code-review item.

### Server Components and SEO

A crawler that does not run JavaScript sees the HTML response. Both Server and
Client Components contribute to it, so being a Client Component does not hide
content from crawlers. Content that only appears after a click or an Effect
does not show up.

## Caching implications

A Server Component that awaits uncached data does that work on every request.
With Cache Components you decide per function or per component what to cache
with `"use cache"`. See [`use cache`](../nextjs-data-caching/use-cache.md).

React's `cache()` is a different tool. It deduplicates calls within one server
request and forgets everything afterward. See
[request memoization](../nextjs-data-caching/request-memoization.md).

## Common patterns

### Load data where it is used

Two sibling components that need the same recipe can each call `getRecipe`.
Wrap the loader in React's `cache` so both calls share one query per request,
and skip threading the record through props.

```ts file="lib/recipe-loaders.ts"
import 'server-only';
import { cache } from 'react';
import { getRecipe } from '@/lib/recipes';

export const loadRecipe = cache(async (slug: string) => getRecipe(slug));
```

### Keep request reads close to the component that needs them

Do not `await cookies()` at the top of a layout to read one value for a user
menu. That makes the whole layout wait for the request. Read it inside the
component that renders the value, wrapped in `<Suspense>`. The
[streaming](./streaming.md) page shows the pattern.

### Choose where a feature's boundary goes

Build the page as Server Components, then find the smallest piece that must be
interactive and make only that a Client Component. When interactive UI has to
wrap server-rendered content, pass the content as `children`. See
[composition patterns](./composition-patterns.md).

## Security considerations

- A Server Component is not an authorization boundary for its children. Every
  Server Action and Route Handler is reachable directly, so check access there
  too. See [authorizing Server Actions](../nextjs-security/server-actions-authorization.md).
- Treat `params`, `searchParams`, cookies and headers as untrusted input. They
  come from the request.
- Keep secret-reading modules behind `import 'server-only'`, and review what
  each Client Component prop exposes.

## Common mistakes

**Adding `"use server"` to make a Server Component.** Components under `app/`
are already Server Components. `"use server"` marks Server Functions, which are
callable endpoints.

**Reading request data synchronously.** `params`, `searchParams`, `cookies()`,
`headers()` and `draftMode()` are promises. Next.js 15 kept a temporary
synchronous fallback; Next.js 16 removed it, so code that reads `params.id`
without `await` no longer works and is a type error against 16.3.

**Passing whole database rows to Client Components.** Every field becomes
visible in the page source. Select the fields the child renders.

**Relying on the missing `NEXT_PUBLIC_` prefix as protection.** It prevents a
leak through inlining, not through props, logs or returned values. Use
`server-only` and shape your data.

**Awaiting request data at the top of a layout.** It pulls the entire layout out
of the prerendered shell. Read it lower down, inside a Suspense boundary.

**Fetching your own Route Handler from a Server Component.** The component is
already on the server. Call the data function directly and skip the extra HTTP
hop.

## Related topics

- [Server Components (React)](../server-react/server-components.md): the
  underlying model, what a Server Component cannot do and the serialization
  rules.
- [Client Components](./client-components.md): where the `"use client"`
  boundary goes in a Next.js app.
- [Static and dynamic rendering](./static-and-dynamic-rendering.md): how
  awaiting request data decides what is prerendered.
- [Data access layer](../nextjs-auth/data-access-layer.md): centralizing
  server-only data access and authorization checks.
- [Prerendering](./prerendering.md) and [React Canary in Next.js](./react-canary.md):
  build-time output, and which React build your Server Components run on.
