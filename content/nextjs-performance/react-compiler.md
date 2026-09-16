---
title: React Compiler in Next.js
description: Enable the React Compiler with reactCompiler in next.config, what it costs at build time, and the experimental Rust compiler in Turbopack.
group: nextjs-performance
order: 40
status: current
since: "16.0"
related: [performance/react-compiler, performance/memoization, nextjs-performance/turbopack, nextjs-rendering/client-components]
---

## Overview

Next.js has built-in support for the React Compiler through one config key:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default nextConfig;
```

The option is **stable since 16.0**, and **off by default**. It runs the Babel
plugin `babel-plugin-react-compiler`, which you install yourself.

This page covers the Next.js wiring and its costs. What the compiler does to your
components, how to verify it, and when it does not help are explained in
[React Compiler](../performance/react-compiler.md).

## Why it exists

The compiler removes most hand-written `useMemo`, `useCallback` and `memo`.
Wiring it into a Next.js build by hand would mean a Babel config, which changes
how Turbopack compiles every file you own. The `reactCompiler` option avoids that:
Next.js runs a fast SWC pass first and hands only relevant files (those with JSX
or hooks) to the Babel plugin.

It is off by default because it still relies on Babel. The Next.js 16 upgrade
guide says to expect higher compile times in development and during builds, and
the team kept it opt-in while gathering build performance data across app types.

## When to use it

- Apps with substantial client-side interactivity, where Client Components
  re-render often: dashboards, editors, complex forms.
- Codebases with many hand-written `useMemo` and `useCallback` calls you want to
  retire.
- Teams already running the compiler-powered lint rules from
  `eslint-plugin-react-hooks` v7, so rule violations are fixed before the
  compiler meets them.

## When not to use it

- **Mostly-server apps.** Server Components do not re-render in the browser. If
  your Client Components are a few buttons and forms, there is little for the
  compiler to save, and you still pay the compile time.
- **When build time is the constraint you are fighting.** Measure a build with
  and without it first.
- **To fix slow data fetching or large bundles.** The compiler changes how often
  Client Components re-render. It does not touch the server, the network or
  bundle size. See [Bundle analysis](./bundle-analysis.md).

## Basic example

Install the plugin as a dev dependency. It is an optional peer dependency of
`next`, so Next.js does not install it for you.

```bash
npm install -D babel-plugin-react-compiler
```

Then set `reactCompiler: true` as in the overview. No component changes are
needed:

```tsx file="app/orders/order-filter.tsx"
'use client';

import { useState } from 'react';

type Order = { id: string; customer: string; status: 'open' | 'shipped' };

export function OrderFilter({ orders }: { orders: Order[] }) {
  const [status, setStatus] = useState<Order['status']>('open');

  // No useMemo. With the compiler on, this is cached and recomputed only when
  // `orders` or `status` changes.
  const visible = orders.filter((order) => order.status === status);

  return (
    <div>
      <select value={status} onChange={(event) => setStatus(event.target.value as Order['status'])}>
        <option value="open">Open</option>
        <option value="shipped">Shipped</option>
      </select>
      <ul>
        {visible.map((order) => (
          <li key={order.id}>{order.customer}</li>
        ))}
      </ul>
    </div>
  );
}
```

> [!NOTE]
> The top-level `reactCompiler` key replaced the pre-16 `experimental.reactCompiler`
> option. Do not use the old location.

## How it works

`reactCompiler` accepts `true` or an options object. The object form supports
`compilationMode`, whose default `'infer'` lets Next.js apply its own heuristics
to find components and hooks before invoking the compiler. That pre-filter is
what keeps the Babel cost localized to files that need it.

You do not need a `babel.config.js` for the compiler. Adding one is the slower
path: when Turbopack finds a Babel config file it runs Babel over every file you
own, in addition to SWC. See [Turbopack](./turbopack.md).

At runtime, the compiler's memoization matters in Client Components, because
those are the components that re-render in the browser.

## Common patterns

### Opt in component by component with annotation mode

For a large existing app, compile only what you mark:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: {
    compilationMode: 'annotation',
  },
};

export default nextConfig;
```

```tsx file="app/inbox/message-list.tsx"
'use client';

type Message = { id: string; subject: string; unread: boolean };

export function MessageList({ messages }: { messages: Message[] }) {
  'use memo';

  const unreadCount = messages.filter((message) => message.unread).length;

  return (
    <section>
      <h2>Inbox ({unreadCount} unread)</h2>
      <ul>
        {messages.map((message) => (
          <li key={message.id}>{message.subject}</li>
        ))}
      </ul>
    </section>
  );
}
```

`"use memo"` opts a component or hook in. `"use no memo"` opts one out in the
default mode. Treat opt-outs as temporary markers for code you have not fixed,
as described in [React Compiler](../performance/react-compiler.md).

### Try the Rust React Compiler

> [!WARNING]
> **Experimental.** `experimental.turbopackRustReactCompiler` (16.3) runs a native
> Rust port of the React Compiler inside Turbopack instead of through Babel in
> Node.js. It is released to gather feedback before it becomes the default.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    turbopackRustReactCompiler: true,
  },
};

export default nextConfig;
```

- It **requires** `reactCompiler`. The flag selects the implementation; it does
  not turn the compiler on.
- It works **only with Turbopack**. Combined with `--webpack`, Next.js throws.
- You do not need `babel-plugin-react-compiler` installed when it is on.

The Next.js team reported that, on large apps such as v0, the Rust path cut the
time from `next dev` to a ready page by 34% on a cold build and 46% on a warm one
in Vercel's tests. Those gains assume the app no longer runs Babel at all. If a
Babel config is still present for other transforms, the gain is smaller.

### Measure the trade-off

Record `next build` time and a dev-server cold start with the compiler off,
then on. Then check runtime: profile an interaction in a production build before
and after, as described in [Profiling](../performance/profiling.md). Keep the
compiler only if the runtime win is worth the build-time cost for your app.

## Common mistakes

- **Enabling the option without installing the plugin.** `reactCompiler: true`
  needs `babel-plugin-react-compiler` unless the experimental Rust compiler is on.
- **Adding `babel-plugin-react-compiler` to a Babel config file** instead of
  using `reactCompiler`. Turbopack then runs Babel over every file you own
  instead of only the files with JSX or hooks.
- **Writing `experimental.reactCompiler`.** That location was replaced by the
  top-level key in 16.0.
- **Expecting faster server rendering or smaller bundles.** The compiler reduces
  client re-render work only.
- **Turning on the Rust compiler with `--webpack` builds.** It is Turbopack-only
  and throws under webpack.
- **Assuming it is on by default because it is stable.** Stable and default are
  different. It is off until you set it.

## Related topics

- [React Compiler](../performance/react-compiler.md) — what the compiler
  memoizes, how to verify it, and what it cannot fix.
- [Memoization](../performance/memoization.md) — `memo`, `useMemo` and
  `useCallback` for code the compiler skips.
- [Turbopack](./turbopack.md) — how a Babel config changes compilation, and where
  the Rust compiler runs.
- [Client Components](../nextjs-rendering/client-components.md) — the part of a
  Next.js app where re-render cost lives.
- [Profiling](../performance/profiling.md) — confirm the compiler moved a
  runtime number.
