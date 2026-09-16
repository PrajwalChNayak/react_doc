---
title: React Canary in Next.js
description: Which React build the App Router actually runs, how that differs from the React in package.json, and how this site labels Canary-only APIs.
group: nextjs-rendering
order: 70
status: current
related: [server-react/server-components, nextjs-rendering/server-components, nextjs-security/security-advisories, nextjs-getting-started/installation]
---

## Overview

A Next.js app can run two different Reacts:

| Router | React it runs | Where it comes from |
|---|---|---|
| App Router (`app/`) | A **React Canary** build vendored inside `next` | `node_modules/next/dist/compiled/react` and `react-dom` |
| Pages Router (`pages/`) | The `react` and `react-dom` you installed | Your `package.json` |

`next@16.3.5` vendors React **`19.3.0-canary-cbb046ab-20260731`**. Every App
Router page, layout, Server Component and Client Component runs on that build,
whatever version your `package.json` says.

The React sections of this site document **React 19.2 stable**. This page
explains the gap between the two, how to see which React you are running, and
how the Next.js pages label APIs that exist only in the Canary build.

## Why it exists

Server Components, Server Functions and the streaming protocol involve React,
the bundler and the framework changing together. A framework cannot wait for
each React stable release to ship fixes and features that span all three. So
Next.js pins an exact React Canary build, tests against it, and ships it inside
the `next` package.

React publishes Canary builds for this purpose: a channel that frameworks can
adopt before a stable release, with features that are expected to become stable.
See [React Canaries](https://react.dev/blog/2023/05/03/react-canaries) on
react.dev.

The practical consequence: in the App Router, **upgrading `next` is how you
upgrade React**.

## When to use it

Keep this relationship in mind when you:

- use a React API newer than 19.2 in an App Router app
- read a React security advisory and need to know what to patch
- debug behavior that differs between `app/` and `pages/` routes
- see type errors for React APIs that run fine at runtime

## When not to use it

Do not install `react@canary` yourself to get Canary features in the App Router.
You already have them, and a different Canary in `package.json` does not change
what the App Router runs.

Do not remove `react` and `react-dom` from `package.json` because the App Router
ignores them at runtime. Next.js still expects them to be declared for tooling
and ecosystem compatibility, and the Pages Router uses them.

## Basic example

Check which React the App Router bundles, straight from the installed package:

```bash
node -p "require('next/dist/compiled/react').version"
```

For `next@16.3.5` this prints `19.3.0-canary-cbb046ab-20260731`.

`next info` does **not** tell you this. Its `react` and `react-dom` lines report
the versions installed in `node_modules/react` and `node_modules/react-dom`,
which is what the Pages Router uses.

You can also render the version from inside the App Router. The `react` import
in `app/` resolves to the vendored build:

```tsx file="app/ui/react-version.tsx"
import { version } from 'react';

export function ReactVersion() {
  return <code>React {version}</code>;
}
```

Render `<ReactVersion />` in an App Router page and it shows the Canary version
string, even though `package.json` pins a stable release.

## How it works

### The `react` import is aliased

When Next.js compiles the App Router, it resolves `react`, `react-dom`,
`react/jsx-runtime` and the React Server Components packages to the copies under
`next/dist/compiled/`. Your code still writes `import { useState } from 'react'`.
Only the resolution changes.

### Some experimental flags switch to the experimental channel

`next` also ships an **experimental** React build
(`19.3.0-experimental-cbb046ab-20260731` in 16.3.5).

> [!WARNING]
> **Experimental.** Enabling `experimental.taint` in `next.config` switches the
> App Router to the React experimental channel. Experimental React APIs are not
> part of React 19.3 stable, may change or disappear, and are not documented on
> this site as current guidance.

### Which React 19.3 features you get

React 19.3.0 was released on 9 September 2026. It made these stable:

- `<ViewTransition>` and `addTransitionType`, for animating updates with the
  browser View Transitions API (already in the App Router's React Canary build)
- Fragment refs (`<Fragment ref>`)
- the `browser` API in `react-dom`
- Trusted Types support

The App Router's React Canary build contains the View Transitions APIs today,
and `next/link` accepts a `transitionTypes` prop (added in 16.2, App Router only,
React Canary). None of these are available in React 19.2, so none appear in
this site's React sections yet.

The vendored build is dated 31 July 2026, before the 19.3.0 release. Treat the
React 19.3 post as a description of the stable API, and verify details of a
specific feature against your installed `next` before depending on them.

### TypeScript types

`@types/react` 19.2 does not declare Canary APIs in its main entry. It ships
them in a separate `react/canary` entry. Reference it once anywhere in the
project:

```ts file="react-canary.d.ts"
/// <reference types="react/canary" />

export {};
```

Adding `"react/canary"` to a `types` array in `tsconfig.json` does the same.

## Server and client implications

- **Both routers in one app means two Reacts.** A component shared by `app/` and
  `pages/` runs on the Canary build in one and your installed version in the
  other. Keep shared components to APIs that exist in both.
- **Tests run on your installed React.** A test runner such as Vitest or Jest resolves `react` from
  `node_modules`, so component tests run on your installed stable React. A
  component using a Canary-only API can work in the app and fail in tests.

## Common patterns

### How this site labels Canary APIs

A Next.js page that uses a React API not in React 19.2 does two things:

1. Tags the code block `canary`. The example harness type-checks those blocks
   with the `react/canary` types.
2. Says, next to the mention, that the API comes from the React Canary build the
   App Router ships, is stable in React 19.3, and is **not available in React
   19.2**.

Here is what that looks like. `<ViewTransition>` comes from the React Canary
build the App Router ships. It is stable in React 19.3 and not available in
React 19.2.

```tsx file="app/ui/dish-thumbnail.tsx" canary
import { ViewTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export function DishThumbnail({
  dish,
}: {
  dish: { slug: string; name: string; imageUrl: string };
}) {
  return (
    <Link href={`/dishes/${dish.slug}`} transitionTypes={['open-dish']}>
      <ViewTransition name={`dish-photo-${dish.slug}`}>
        <Image src={dish.imageUrl} alt={dish.name} width={240} height={160} />
      </ViewTransition>
      <span>{dish.name}</span>
    </Link>
  );
}
```

Give the hero image on the detail page a Canary `<ViewTransition>` with the same `name`
and the thumbnail morphs into it during navigation. App Router navigations are
transitions, so no extra configuration is needed. Browsers without View
Transitions support skip the animation and navigate normally.

### Patching React Server Components advisories

React Server Components advisories are fixed in React (the floor is **19.2.4**
for the 19.2 line). For an App Router app, the fix reaches you only through a
`next` release that vendors a patched build:

```bash
npm install next@16.3.5
```

Updating `react` and `react-dom` in `package.json` patches the Pages Router, not
the App Router. The minimum safe Next.js version is **16.3.3**, and this site
recommends **16.3.5**. Keep `react` and `react-dom` at **19.2.8** as well, for
Pages Router routes and for tooling. See
[security advisories](../nextjs-security/security-advisories.md).

## Security considerations

- Upgrade `next` when an RSC advisory is published, even if the advisory names
  only `react-server-dom-*` packages. The vendored copy is not a separate
  dependency in your lockfile, so dependency scanners may not flag it.
- Do not pin an old `next` to keep a React API working. Security fixes for the
  App Router's React ship only in new `next` releases.

## Common mistakes

**Upgrading `react` to fix an App Router security issue.** The App Router does
not use it. Upgrade `next`.

**Reading `next info` to find the App Router's React.** It reports the installed
`react` package. Check `next/dist/compiled/react` instead.

**Installing `react@canary` to use `<ViewTransition>`.** The App Router already
runs a React Canary build with it. The extra install affects only the Pages
Router and tests.

**Using a Canary-only API in a component shared with `pages/`.** It exists in
one router and not the other. Keep it in `app/`.

**Documenting 19.3 APIs as React 19.2.** They are not in 19.2. Label them with
the Canary framing above.

**Assuming a type error means the API is missing.** `@types/react` keeps Canary
types in `react/canary`. Reference that entry.

## Related topics

- [Server Components (React)](../server-react/server-components.md): the React
  feature that ties Next.js to a specific React build.
- [Server Components in Next.js](./server-components.md): how the App Router
  uses that build.
- [Security advisories](../nextjs-security/security-advisories.md): current
  Next.js and React Server Components advisories and patched versions.
- [Installation](../nextjs-getting-started/installation.md): the `next`, `react`
  and `react-dom` versions to install.
- [Linking and navigation](../nextjs-routing/linking-and-navigation.md): the
  `<Link>` component and its navigation transitions.
