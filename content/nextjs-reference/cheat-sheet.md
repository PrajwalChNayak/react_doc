---
title: Next.js 16.3 cheat sheet
description: Copy-ready Next.js 16.3 snippets for routes, request data, caching, revalidation, errors, proxy, Server Actions and config.
group: nextjs-reference
order: 40
status: current
since: "16.3"
related: [nextjs-reference/file-conventions, nextjs-reference/troubleshooting, nextjs-reference/next-config, reference/cheat-sheet]
shape: reference
---

Every block compiles against `next@16.3.5` in strict mode. Paths are part of the
API: a block's `file` label is where it has to live. Pin `next@16.3.5`; the
security floor is `16.3.3`. For React APIs, see the
[React 19 cheat sheet](../reference/cheat-sheet.md).

## Imports at a glance

| From | Import |
|---|---|
| `next/headers` | `cookies`, `headers`, `draftMode` (all async) |
| `next/server` | `NextRequest`, `NextResponse`, `NextProxy`, `connection`, `after`, `userAgent`, `ImageResponse` |
| `next/navigation` | `notFound`, `redirect`, `permanentRedirect`, `forbidden`\*, `unauthorized`\*, `unstable_rethrow`, `useRouter`, `usePathname`, `useSearchParams`, `useParams` |
| `next/cache` | `cacheLife`, `cacheTag`, `revalidateTag`, `revalidatePath`, `updateTag`, `refresh`, `io` |
| `next/error` | `catchError`, `type ErrorInfo` |
| `next/root-params` | one async getter per root segment, for example `lang` |
| `next/og` | `ImageResponse` |
| `next` | `type NextConfig`, `type Metadata`, `type MetadataRoute` |
| globals (generated) | `PageProps<'/route'>`, `LayoutProps<'/route'>`, `RouteContext<'/route'>` |

\* Needs `experimental.authInterrupts`.

## Pages: async `params` and `searchParams`

```tsx file="app/blog/[slug]/page.tsx"
import type { Metadata } from 'next';

export async function generateMetadata(props: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: slug.replaceAll('-', ' ') };
}

export async function generateStaticParams() {
  return [{ slug: 'hello-world' }];
}

export default async function BlogPostPage(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const { tab = 'post' } = await props.searchParams;
  return (
    <article>
      <h1>{slug}</h1>
      <p>Tab: {String(tab)}</p>
    </article>
  );
}
```

Under Cache Components, `generateStaticParams` must return at least one entry.

## Layouts

```tsx file="app/dashboard/layout.tsx"
import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard">
      <nav>Dashboard</nav>
      {children}
    </div>
  );
}
```

## Request data: cookies and headers

```tsx file="app/account/page.tsx"
import { Suspense } from 'react';
import { cookies, headers } from 'next/headers';

async function Greeting() {
  const cookieStore = await cookies();
  const headerList = await headers();
  const name = cookieStore.get('display-name')?.value ?? 'there';
  const language = headerList.get('accept-language')?.split(',')[0] ?? 'en';
  return <p lang={language}>Hi, {name}</p>;
}

export default function AccountPage() {
  return (
    <main>
      <h1>Account</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Greeting />
      </Suspense>
    </main>
  );
}
```

Request-time reads go inside `<Suspense>` so the rest of the page can prerender.

## Request time without request data: `connection` and `io`

```tsx file="app/status/page.tsx"
import { Suspense } from 'react';
import { connection } from 'next/server';
import { io } from 'next/cache';

async function Uptime() {
  await connection(); // render per request
  return <p>Region: {process.env.DEPLOY_REGION ?? 'local'}</p>;
}

async function RenderedAt() {
  await io(); // keep new Date() out of the static shell (16.3)
  return <p>Rendered at {new Date().toISOString()}</p>;
}

export default function StatusPage() {
  return (
    <Suspense fallback={<p>Checking…</p>}>
      <Uptime />
      <RenderedAt />
    </Suspense>
  );
}
```

## `use cache`, `cacheLife`, `cacheTag`

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: {
    catalog: { stale: 300, revalidate: 3600, expire: 86400 },
  },
};

export default nextConfig;
```

```ts file="lib/posts.ts"
import { cacheLife, cacheTag } from 'next/cache';

export type Post = { id: string; title: string };

export async function getPosts(): Promise<Post[]> {
  'use cache';
  cacheLife('hours'); // built-in: default, seconds, minutes, hours, days, weeks, max
  cacheTag('posts');

  const res = await fetch('https://api.example.com/posts');
  return res.json();
}

export async function getPost(id: string): Promise<Post> {
  'use cache';
  cacheLife('catalog'); // custom profile from next.config
  cacheTag('posts', `post-${id}`);

  const res = await fetch(`https://api.example.com/posts/${id}`);
  return res.json();
}
```

Arguments are part of the cache key. Do not read `cookies()` or `headers()`
inside `"use cache"`; read them outside and pass the value in.

## Revalidation

| API | Where | Effect |
|---|---|---|
| `revalidateTag(tag, profile)` | Server Actions, Route Handlers | Stale-while-revalidate. **Two arguments required.** |
| `updateTag(tag)` | Server Actions only | Expire now; the next request waits for fresh data (read-your-writes). |
| `refresh()` | Server Actions only | Re-render uncached data on the client. Touches no cache. |
| `revalidatePath(path)` | Server Actions, Route Handlers | Invalidate a path. |

```ts file="app/posts/actions.ts"
'use server';

import { refresh, revalidateTag, updateTag } from 'next/cache';

export async function publishPost(postId: string) {
  // ...write to the database
  updateTag(`post-${postId}`);
  revalidateTag('posts', 'max');
}

export async function dismissBanner() {
  refresh();
}
```

```ts file="app/api/revalidate/route.ts"
import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  if (request.headers.get('x-webhook-secret') !== process.env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  revalidateTag('posts', { expire: 0 });
  return Response.json({ revalidated: true });
}
```

## Server Action with Zod

```ts file="app/newsletter/actions.ts"
'use server';

import { z } from 'zod';
import { updateTag } from 'next/cache';

const Subscriber = z.object({
  email: z.email({ error: 'Enter a valid email address.' }),
});

export type SubscribeState = {
  ok: boolean;
  errors?: { email?: string[] };
};

export async function subscribe(
  _previous: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const parsed = Subscriber.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  // Authorize here too: every Server Action is a public endpoint.
  // await db.subscriber.create({ data: parsed.data });
  updateTag('subscribers');
  return { ok: true };
}
```

```tsx file="app/newsletter/subscribe-form.tsx"
'use client';

import { useActionState } from 'react';
import { subscribe, type SubscribeState } from './actions';

const initialState: SubscribeState = { ok: false };

export function SubscribeForm() {
  const [state, formAction, isPending] = useActionState(subscribe, initialState);

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      {state.errors?.email?.map((message) => <p key={message}>{message}</p>)}
      <button disabled={isPending}>{isPending ? 'Subscribing…' : 'Subscribe'}</button>
      {state.ok ? <p role="status">Subscribed.</p> : null}
    </form>
  );
}
```

## Route Handler

```ts file="app/api/items/[id]/route.ts"
import { NextResponse } from 'next/server';

export async function GET(_request: Request, context: RouteContext<'/api/items/[id]'>) {
  const { id } = await context.params;
  return NextResponse.json({ id });
}

export async function DELETE(_request: Request, context: RouteContext<'/api/items/[id]'>) {
  const { id } = await context.params;
  // ...authorize, then delete
  return new Response(null, { status: 204, headers: { 'x-deleted-id': id } });
}
```

## `proxy.ts`

```ts file="proxy.ts"
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (!request.cookies.has('session')) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

Node.js runtime only. An optimistic check, not authorization: verify the session
again where the data is read.

## Errors: `error.tsx` and `catchError`

```tsx file="app/dashboard/error.tsx"
'use client';

import type { ErrorInfo } from 'next/error';

export default function DashboardError({ error, retry }: ErrorInfo) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div role="alert">
      <p>{message}</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
```

```tsx file="app/dashboard/widget-boundary.tsx"
'use client';

import { catchError, type ErrorInfo } from 'next/error';

function WidgetFallback(props: { name: string }, { error, retry }: ErrorInfo) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return (
    <section role="alert">
      <h2>{props.name} failed</h2>
      <p>{message}</p>
      <button type="button" onClick={() => retry()}>
        Retry
      </button>
    </section>
  );
}

export default catchError(WidgetFallback);
```

`error` is `unknown`: narrow before reading `.message`. `retry()` re-fetches
Server Components; `reset()` only clears client state. `notFound()` and
`redirect()` pass through both.

## Not found and redirects

```tsx file="app/products/[id]/page.tsx"
import { notFound, redirect } from 'next/navigation';

type Product = { id: string; name: string; replacedBy?: string };

async function getProduct(id: string): Promise<Product | null> {
  const res = await fetch(`https://api.example.com/products/${id}`);
  return res.ok ? res.json() : null;
}

export default async function ProductPage(props: PageProps<'/products/[id]'>) {
  const { id } = await props.params;
  const product = await getProduct(id);

  if (!product) notFound();
  if (product.replacedBy) redirect(`/products/${product.replacedBy}`);

  return <h1>{product.name}</h1>;
}
```

## Root params (16.3)

```tsx file="app/[lang]/layout.tsx"
import { lang } from 'next/root-params';

export default async function RootLayout(props: LayoutProps<'/[lang]'>) {
  return (
    <html lang={await lang()}>
      <body>{props.children}</body>
    </html>
  );
}

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'de' }];
}
```

```tsx file="app/[lang]/language-badge.tsx"
import { lang } from 'next/root-params';

export async function LanguageBadge() {
  const current = await lang();
  return <span>{(current ?? 'en').toUpperCase()}</span>;
}
```

Server Components and `"use cache"` scopes only. Not in Route Handlers, Server
Actions or Client Components.

## Parallel route slot default

```tsx file="app/dashboard/@analytics/default.tsx"
export default function AnalyticsDefault() {
  return null;
}
```

Required for every slot since 16.0.

## Background work after the response

```ts file="app/api/events/route.ts"
import { after } from 'next/server';

export async function POST(request: Request) {
  const event: { type: string } = await request.json();
  after(async () => {
    await fetch('https://analytics.example.com/ingest', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  });
  return Response.json({ accepted: true }, { status: 202 });
}
```

## `next.config` essentials

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true, // Opt-in (16.3), requires cacheComponents
  reactCompiler: true,
  typedRoutes: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.example.com' }],
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
```

`partialPrefetching` turns on Instant Navigations, which are opt-in in 16.3 and
slated to become the default in a future major.

## Commands

```bash
npx create-next-app@latest my-app
npx next dev
npx next build
npx next typegen && npx tsc --noEmit
npx @next/codemod@canary upgrade latest
```

## Common mistakes

- **`revalidateTag('posts')`.** The one-argument form is deprecated and a type error in 16.x. Pass a
  profile: `revalidateTag('posts', 'max')`.
- **`updateTag` or `refresh` in a Route Handler.** Both work only in Server
  Actions.
- **Reading `params` without `await`.** It is a Promise.
- **`import { connection } from 'next/headers'`.** It comes from `next/server`.
- **`error.message` straight off `ErrorInfo`.** `error` is `unknown`.
- **`cookies()` inside `"use cache"`.** Request data is not allowed in a cached
  scope.
- **Writing `middleware.ts` in new code.** It is deprecated; use `proxy.ts`.

## Related topics

- [File conventions reference](./file-conventions.md) — where each of these files
  goes and what else is available.
- [Troubleshooting](./troubleshooting.md) — what breaks when a snippet is
  written the 15.x way.
- [next.config reference](./next-config.md) — every option with defaults and
  labels.
- [React 19 cheat sheet](../reference/cheat-sheet.md) — the React APIs these
  snippets use, such as `useActionState`.
- [Server Functions](../server-react/server-functions.md) — the React model
  behind Server Actions.
