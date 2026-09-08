---
title: Server React
description: How server rendering, static generation, Server Components and Server Functions differ, and which one you actually need.
group: server-react
order: 10
status: current
related: [server-react/server-components, server-react/server-functions, server-react/ssr-and-hydration, server-react/static-generation]
---

## Overview

> [!WARNING]
> **Patch before you read further.** React Server Components had two rounds of
> security advisories. The first was CVE-2025-55182, a CVSS 10.0 remote code
> execution bug, fixed in 19.0.1 / 19.1.2 / 19.2.1. The second round —
> CVE-2025-55183, CVE-2025-55184, CVE-2025-67779 and CVE-2026-23864 — is fixed
> only in **19.0.4 / 19.1.5 / 19.2.4**.
>
> The releases 19.0.3 / 19.1.4 / 19.2.3 were **incomplete patches**. Being on
> one of them is not enough.
>
> The floor is **19.0.4, 19.1.5 or 19.2.4**. The version this site documents,
> and the one to move to, is **19.2.8**.
>
> Apps that never render React on a server with an RSC-capable bundler are not
> affected. Check anyway — a framework you depend on may render React on a
> server on your behalf.

```bash
npm install react@19.2.8 react-dom@19.2.8
```

"React on the server" is four separate technologies that people routinely
collapse into one word. They solve different problems, they can be used
independently, and three of the four are not the same thing as the fourth.

- **Server-side rendering (SSR)** — render your app to an HTML string or stream
  on every request, send that HTML, then attach React to it in the browser.
- **Static generation (SSG / prerendering)** — the same render, but done once at
  build time and served as a file.
- **React Server Components (RSC)** — components that execute in a separate
  server environment ahead of bundling and never ship their own JavaScript to
  the browser.
- **Server Functions** — `async` functions that live on the server and can be
  called directly from client code.

## Why it exists

Each one removes a different cost.

SSR removes the blank screen. The browser gets meaningful HTML before any
JavaScript parses, which is what search crawlers read and what the user sees
first.

Static generation removes the server from the request path entirely. If the
output is the same for everyone, computing it once and putting it on a CDN is
strictly cheaper than computing it per request.

Server Components remove JavaScript. A Markdown renderer, a date formatter or a
syntax highlighter used only for display is dead weight in a bundle; run it on
the server and the browser downloads the resulting HTML instead of the library.

Server Functions remove the API layer. Mutations become a function call rather
than a hand-written endpoint plus a hand-written `fetch` plus a hand-written
serialization contract on both sides.

## When to use it

| | Server rendering | Static generation | Server Components | Server Functions |
|---|---|---|---|---|
| Where it runs | Your server, per request | Your build machine | A server environment, before bundling | Your server, per call |
| Ships JS for itself | Yes — the same component runs again on the client | Yes | **No** | No — only a reference the client can invoke |
| Can hold state | Yes, after hydration | Yes, after hydration | **No** | Not applicable |
| Can use Hooks | Yes | Yes | Only non-interactive ones | No |
| When it runs | Every request | Once, at build | Build time or per request, ahead of the HTML render | When a Client Component calls it |
| Needs a framework | No | No | **Yes** | **Yes** |

Read the table by row, not by column. A Client Component is *server-rendered*
(row 1) **and** shipped to the browser (row 2) **and** stateful (row 3). None of
that makes it a Server Component.

## When not to use it

Reach for none of this if your app is a signed-in dashboard behind a login
screen with no SEO requirement and no first-paint budget you are missing. A
client-rendered app served from a CDN is less machinery to operate, and every
item above adds an operational surface: a server to keep running, a build step
to keep correct, or a public endpoint to keep authorized.

Do not adopt RSC to "make the app faster" without measuring. It moves work, it
does not delete work. If your bundle is large because of a charting library used
inside an interactive widget, RSC will not help — that code has to run in the
browser.

## How it works

### React alone does not give you Server Components

This is the single most common misunderstanding. `renderToPipeableStream` and
`hydrateRoot` are in the `react-dom` package and you can wire them up yourself
in an afternoon. Server Components are not like that.

RSC requires a bundler that understands the `"use client"` and `"use server"`
directives, splits the module graph in two, and implements a wire format for
sending the server render tree to the client. React ships the runtime pieces;
something else has to do the build and the transport.

In practice that means one of:

- **Next.js (App Router)** — the most complete implementation of the Server
  Components specification today.
- **React Router** in framework mode.
- **Expo**, for React Native apps.
- **TanStack Start** and **RedwoodSDK**, both newer.
- A **bundler plugin** — Parcel, Vite and RSbuild all have RSC support you can
  build a custom setup on.

See [react.dev on creating a React app](https://react.dev/learn/creating-a-react-app)
for the current list, and [build tooling](../ecosystem/build-tooling.md) for
how these fit together.

### The four layers stack

They are not alternatives. A production framework typically runs all four at
once:

1. Server Components execute first, ahead of time, producing a description of
   the UI that includes references to Client Components.
2. That description is rendered to HTML — either per request (SSR) or at build
   time (static generation).
3. The HTML reaches the browser and React hydrates the Client Components.
4. Those Client Components call Server Functions to mutate data.

Step 2 is where a Client Component runs on the server. It runs there to produce
initial HTML, and then again in the browser to become interactive. That is why
"Client Component" does not mean "client-only".

## Common patterns

### Choosing a rendering strategy per route

Marketing pages and documentation change on deploy: prerender them. Pages that
depend on the request — a user's dashboard, a search results page — must render
per request. Partial pre-rendering, added in 19.2, lets one page do both: see
[static generation](./static-generation.md).

### Keeping heavy dependencies on the server

Move a formatting, parsing or templating library into a Server Component and the
browser never downloads it. Measure the bundle before and after; that number is
the whole justification.

### Auditing your React version

Every dependency that renders React on a server pulls React in. Check the
resolved version, not the range in `package.json`:

```bash
npm ls react react-dom
```

Anything below 19.0.4 / 19.1.5 / 19.2.4 needs to move.

## Common mistakes

**Treating "Server Component" and "server-rendered" as synonyms.** Every
component is server-rendered under SSR. Only components outside a `"use client"`
boundary are Server Components.

**Believing 19.2.1 closed the RSC advisories.** It closed the first one. Four
more followed, and the patches in 19.2.3 were incomplete. The floor is 19.2.4.

**Expecting `"use client"` to make a component client-only.** It marks the entry
point into the client module graph. The component still renders on the server
for the initial HTML. See [directives](./directives.md).

**Adding SSR for a perceived speed win on an app that is already fast.** SSR
moves work to a machine you now have to scale, and introduces hydration
mismatches as a whole new class of bug. Have a reason.

**Assuming a Server Function is private because only your UI calls it.** It is a
public HTTP endpoint the moment it is defined. See
[Server Functions](./server-functions.md).

## Related topics

- [Server Components](./server-components.md) — components that run on the
  server and ship no JavaScript.
- [Directives](./directives.md) — what `"use client"` and `"use server"`
  actually mark.
- [Server Functions](./server-functions.md) — client-callable server code, and
  why every one of them needs an authorization check.
- [SSR and hydration](./ssr-and-hydration.md) — rendering to HTML per request
  and attaching React to it.
- [Static generation](./static-generation.md) — prerendering at build time, and
  resuming the dynamic parts later.
- [Streaming](./streaming.md) — sending the shell first and filling in Suspense
  boundaries as data resolves.
