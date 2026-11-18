---
title: Pages Router to App Router
description: Move a Pages Router app to the App Router one route at a time, with a mapping for every Pages Router API.
group: nextjs-migration
order: 30
status: legacy
since: "16.0"
related: [nextjs-routing/pages-and-layouts, nextjs-rendering/server-components, nextjs-migration/pre-16-caching-model, server-react/server-components]
---

## Overview

The Pages Router (`pages/`) and the App Router (`app/`) can live in the same
Next.js 16 project. You do not have to migrate in one pull request. Move one
route, ship it, and move the next.

This page is for maintaining and migrating existing Pages Router code. Every
Pages Router snippet below is tagged legacy and paired with its App Router
equivalent in Next.js 16.3.

> [!LEGACY]
> The Pages Router still works in Next.js 16.3, and `getServerSideProps`,
> `getStaticProps`, `getStaticPaths`, `_app`, `_document`, `next/head` and
> `next/router` still run there. None of them work inside `app/`. New routes
> belong in the App Router.

> [!WARNING]
> **Running both routers is a security-relevant configuration.**
> CVE-2026-75604 (CVSS 9.0) is an unauthenticated RCE on **Windows-hosted**
> servers in apps that use **both** the Pages Router and the App Router
> **without** Cache Components. Linux and macOS are not affected, and there is
> no workaround. It affects `>= 13.4.0 < 15.5.24` and `>= 16.0.0 < 16.3.3`. A
> half-migrated app is exactly this configuration, so upgrade to `next@16.3.5`
> before you start.

## Why it exists

The Pages Router renders each page as a Client Component tree, fed by a
page-level data function. The App Router is built on React Server Components:
components fetch their own data on the server, layouts nest and persist across
navigations, and only interactive parts ship JavaScript to the browser.

That changes the unit of work. In `pages/` the page is the unit, so data loading,
layout and head tags are all page-level escape hatches (`getServerSideProps`,
`getLayout`, `next/head`). In `app/` each of those becomes a file convention or
an export that composes. The React model is explained in
[Server Components](../server-react/server-components.md).

## When to use it

- You maintain a Pages Router app and want layouts, streaming, Server Actions or
  Cache Components.
- You are on Windows hosting with both routers present: finish the migration
  or enable Cache Components, and in any case upgrade.
- A route needs a feature that only exists in `app/`, such as
  [parallel routes](../nextjs-routing/parallel-routes.md) or
  [`catchError`](../nextjs-errors/catch-error.md).

## When not to use it

- **During a Next.js major upgrade.** Do [Next.js 15 to 16](./next-15-to-16.md)
  first, ship it, then migrate routers. Two migrations in one diff are
  unreviewable.
- **When a route depends on a Pages-only library** (for example one that reads
  `next/router` internally) with no App Router release. Leave that route in
  `pages/` until it has one.

## How it works

Both routers run from one `next dev` / `next build`. Requests are matched against
both directories, so **the same URL must not exist in both**; delete the
`pages/` file in the same commit that adds the `app/` route.

Navigation between a Pages route and an App route is a **hard navigation**, and
`<Link>` does not prefetch across routers. Migrate groups of routes that link to
each other together to avoid full reloads in the middle of a flow.

The App Router vendors its own React Canary build. The Pages Router uses the
`react` and `react-dom` from your `package.json`. Keep those at `19.2.8`.

### API mapping

| Pages Router | App Router (16.3) | Notes |
|---|---|---|
| `pages/index.tsx`, `pages/about.tsx` | `app/page.tsx`, `app/about/page.tsx` | A folder is a segment; `page` makes it public. |
| `pages/blog/[slug].tsx` | `app/blog/[slug]/page.tsx` | `params` is a Promise. |
| `pages/_app.tsx` | `app/layout.tsx` (root layout) | Providers move into a Client Component. |
| `pages/_document.tsx` | `app/layout.tsx` | You write `<html>` and `<body>` yourself. |
| `pages/_error.tsx`, `pages/500.tsx` | `error.tsx`, `global-error.tsx`, `catchError` | Per segment, not per app. |
| `pages/404.tsx` | `not-found.tsx` | |
| `getServerSideProps` | An async Server Component that reads data directly | Dynamic by default under Cache Components. |
| `getStaticProps` | A `"use cache"` function or component with `cacheLife` | |
| `getStaticProps` `revalidate` | `cacheLife` profile | |
| `getStaticPaths` | `generateStaticParams` | Must return at least one entry under Cache Components. |
| `getStaticPaths` `fallback` | Unlisted params render on request; call `notFound()` for unknown ones | `dynamicParams` is not available with Cache Components. |
| `getInitialProps` | Server Component data fetching | |
| `req.cookies`, `req.headers` in data functions | `await cookies()`, `await headers()` from `next/headers` | |
| `pages/api/*` API Routes | `app/**/route.ts` Route Handlers | Web `Request` / `Response`. |
| `next/head` | `metadata` export or `generateMetadata` | |
| `next/router` `useRouter` | `useRouter`, `usePathname`, `useSearchParams`, `useParams` from `next/navigation` | No `query`, `asPath`, `isReady`, `locale`. |
| `Page.getLayout` pattern | Nested `layout.tsx` | |
| Global CSS only in `_app` | Import global CSS in any layout | |

## Basic example

Start with the root layout. It replaces `_app` and `_document` for routes under
`app/`. Keep the old files until the last Pages route is gone, because
`pages/*` still needs them and styles in `app/layout.tsx` do not apply there.

:::tabs
== Before (Pages Router)
```tsx legacy file="pages/_document.tsx"
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
```
```tsx legacy file="pages/_app.tsx"
import type { AppProps } from 'next/app';
import { ThemeProvider } from '../components/theme-provider';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
```
== After (Next.js 16.3)
```tsx file="app/layout.tsx"
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: { template: '%s | Acme', default: 'Acme' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```
:::

Context providers need `"use client"`, because context does not exist in Server
Components. Put the provider in its own file and render it from the layout, so
the layout itself stays a Server Component. See
[Context](../state-management/context.md).

## Migrating data fetching

### `getServerSideProps`

A Server Component can `await` data directly, so the page-level function
disappears. With Cache Components enabled, uncached data runs at request time by
default, which is what `getServerSideProps` meant. Wrap the request-time part in
`<Suspense>` so the rest of the page can still prerender.

:::tabs
== Before (Pages Router)
```tsx legacy file="pages/dashboard.tsx"
import type { GetServerSideProps } from 'next';

type Project = { id: string; name: string };

export const getServerSideProps: GetServerSideProps<{ projects: Project[] }> = async ({ req }) => {
  const session = req.cookies.session;
  const res = await fetch('https://api.example.com/projects', {
    headers: { authorization: `Bearer ${session}` },
  });
  return { props: { projects: await res.json() } };
};

export default function Dashboard({ projects }: { projects: Project[] }) {
  return <ul>{projects.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```
== After (Next.js 16.3)
```tsx file="app/dashboard/page.tsx"
import { Suspense } from 'react';
import { cookies } from 'next/headers';

type Project = { id: string; name: string };

async function ProjectList() {
  const session = (await cookies()).get('session')?.value;
  const res = await fetch('https://api.example.com/projects', {
    headers: { authorization: `Bearer ${session ?? ''}` },
  });
  const projects: Project[] = await res.json();

  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  return (
    <main>
      <h1>Projects</h1>
      <Suspense fallback={<p>Loading projects…</p>}>
        <ProjectList />
      </Suspense>
    </main>
  );
}
```
:::

### `getStaticProps` and `getStaticPaths`

Static data becomes a `"use cache"` function. `revalidate` becomes a `cacheLife`
profile, and `getStaticPaths` becomes `generateStaticParams`, which returns
plain param objects instead of `{ params }` wrappers.

:::tabs
== Before (Pages Router)
```tsx legacy file="pages/blog/[slug].tsx"
import type { GetStaticPaths, GetStaticProps } from 'next';

type Post = { slug: string; title: string; body: string };

export const getStaticPaths: GetStaticPaths = async () => {
  const posts: Post[] = await fetch('https://api.example.com/posts').then((r) => r.json());
  return { paths: posts.map((p) => ({ params: { slug: p.slug } })), fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<{ post: Post }> = async ({ params }) => {
  const res = await fetch(`https://api.example.com/posts/${params?.slug}`);
  if (!res.ok) return { notFound: true };
  return { props: { post: await res.json() }, revalidate: 3600 };
};

export default function PostPage({ post }: { post: Post }) {
  return <article><h1>{post.title}</h1><p>{post.body}</p></article>;
}
```
== After (Next.js 16.3)
```tsx file="app/blog/[slug]/page.tsx"
import { notFound } from 'next/navigation';
import { cacheLife, cacheTag } from 'next/cache';

type Post = { slug: string; title: string; body: string };

async function getPost(slug: string): Promise<Post | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(`post-${slug}`);

  const res = await fetch(`https://api.example.com/posts/${slug}`);
  return res.ok ? res.json() : null;
}

export async function generateStaticParams() {
  const res = await fetch('https://api.example.com/posts?limit=20');
  const posts: Post[] = await res.json();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function PostPage(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
```
:::

Slugs not returned by `generateStaticParams` are still served: Next.js renders
them on request, which covers `fallback: 'blocking'`. `fallback: false` becomes a
`notFound()` call for data that does not exist. The details, and the
Previous Model equivalents with `fetch` options, are in
[The pre-16 caching model](./pre-16-caching-model.md) and [ISR](../nextjs-data-caching/isr.md).

## Common patterns

### API Routes to Route Handlers

Route Handlers use the Web `Request` and `Response` APIs, export one function per
HTTP method, and receive `params` as a Promise.

:::tabs
== Before (Pages Router)
```ts legacy file="pages/api/items/[id].ts"
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  res.status(200).json({ id: req.query.id });
}
```
== After (Next.js 16.3)
```ts file="app/api/items/[id]/route.ts"
export async function GET(_request: Request, context: RouteContext<'/api/items/[id]'>) {
  const { id } = await context.params;
  return Response.json({ id });
}
```
:::

An unsupported method returns `405` automatically, so the method check goes
away. See [Route Handlers](../nextjs-backend/route-handlers.md).

### `next/head` to metadata

Head tags become data, which lets Next.js merge them across nested layouts and
stream them correctly. See [Metadata](../nextjs-styling/metadata.md).

:::tabs
== Before (Pages Router)
```tsx legacy file="pages/about.tsx"
import Head from 'next/head';

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>About | Acme</title>
        <meta name="description" content="Who we are." />
      </Head>
      <h1>About</h1>
    </>
  );
}
```
== After (Next.js 16.3)
```tsx file="app/about/page.tsx"
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'Who we are.',
};

export default function AboutPage() {
  return <h1>About</h1>;
}
```
:::

### `next/router` to `next/navigation`

The App Router splits the old router object into focused hooks. They are
Client Component hooks, and `useSearchParams` needs a `<Suspense>` boundary above
it when prerendering.

:::tabs
== Before (Pages Router)
```tsx legacy file="components/search-box.tsx"
import { useRouter } from 'next/router';

export function SearchBox() {
  const router = useRouter();
  const query = typeof router.query.q === 'string' ? router.query.q : '';

  return (
    <input
      defaultValue={query}
      onChange={(e) => router.push({ pathname: router.pathname, query: { q: e.target.value } })}
    />
  );
}
```
== After (Next.js 16.3)
```tsx file="app/search/search-box.tsx"
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <input
      type="search"
      defaultValue={searchParams.get('q') ?? ''}
      onChange={(event) => {
        const next = new URLSearchParams(searchParams);
        next.set('q', event.target.value);
        router.replace(`${pathname}?${next.toString()}`);
      }}
    />
  );
}
```
:::

A component shared by both routers during the migration can import `useRouter`
from `next/compat/router`, which returns the Pages Router instance or `null`
inside `app/`. Switch it to `next/navigation` once every caller is migrated.

### Moving one page at a time

For a large page, the lowest-risk first step keeps the component as it is:

1. Move the page component into a Client Component file under `app/`, for
   example `app/settings/settings-form.tsx` with `"use client"`.
2. Create `app/settings/page.tsx` as a Server Component that loads the data the
   old data function loaded and passes it as props.
3. Delete `pages/settings.tsx` in the same commit.
4. Later, push `"use client"` down to only the interactive leaves.

## Security considerations

- **Upgrade before migrating** (CVE-2026-75604 above).
- **Authorization moves with the data.** `getServerSideProps` often held the only
  auth check for a page. In `app/`, check in the data access layer that every
  Server Component and Server Action calls, not only in a layout. See
  [Protecting routes](../nextjs-auth/protecting-routes.md).
- **Server Actions are public endpoints.** A form that posted to an authenticated
  API Route and now calls a Server Action needs the same checks inside the
  action.

## Common mistakes

- **Keeping a route in both `pages/` and `app/`.** The build reports the
  conflict. Delete the Pages file in the same commit.
- **Deleting `_app.tsx` early.** Remaining `pages/*` routes lose their global CSS
  and providers.
- **Adding `"use client"` to `app/layout.tsx`** to host a provider. That turns
  the whole tree into client code. Put the provider in its own client file.
- **Returning `[]` from `generateStaticParams` under Cache Components** to mimic
  `fallback: 'blocking'` with no prebuilt paths. It is an error; return at least
  one param.
- **Using `useRouter().query`.** `useRouter` from `next/navigation` has no
  `query`; read `useSearchParams()` and `useParams()`.
- **Migrating on an unpatched Windows server.** A mixed-router app without Cache
  Components is the exact configuration CVE-2026-75604 targets.

## Related topics

- [Pages and layouts](../nextjs-routing/pages-and-layouts.md) — the App Router
  file conventions the pages move into.
- [Server Components in Next.js](../nextjs-rendering/server-components.md) — what
  runs where once `getServerSideProps` is gone.
- [The pre-16 caching model](./pre-16-caching-model.md) — mapping `fetch` options
  and segment config if you migrate without Cache Components first.
- [Server Components (React)](../server-react/server-components.md) — the React
  model the App Router is built on.
- [File conventions reference](../nextjs-reference/file-conventions.md) — every
  special file in `app/` at a glance.
