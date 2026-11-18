---
title: Troubleshooting
description: The Next.js 16.x errors and surprises you are most likely to hit, each with its cause and the fix.
group: nextjs-reference
order: 50
status: current
since: "16.3"
related: [nextjs-reference/cheat-sheet, nextjs-migration/next-15-to-16, nextjs-reference/next-config, reference/troubleshooting]
shape: reference
---

Find the symptom, read the cause, apply the fix. Most of these come from code
written for Next.js 13 to 15, so the fixes link to the migration pages.

> [!NOTE]
> Messages in quotes were copied from the `next@16.3.5` source. Messages marked
> *(paraphrased)* describe the error's shape; match on that, not on exact text.
> For React-level errors such as hydration mismatches, see the
> [React troubleshooting page](../reference/troubleshooting.md).

## Build fails: a parallel route slot has no `default` *(paraphrased)*

**Cause.** Since 16.0 every parallel route slot (`@folder`) needs an explicit
`default` file. Earlier versions silently rendered nothing for an unmatched
slot; 16.0 removed that fallback and fails the build instead.

**Fix.** Add `default.tsx` to each slot. Return `null`, or call `notFound()` if
an unmatched slot should 404.

```tsx file="app/dashboard/@analytics/default.tsx"
export default function AnalyticsDefault() {
  return null;
}
```

A slot at any level needs one, including slots you only render from a nested
layout. See [Parallel routes](../nextjs-routing/parallel-routes.md).

## "`params` is a Promise and must be unwrapped with `await` or `React.use()` before accessing its properties."

**Cause.** Code reads `params.slug` or `searchParams.page` directly. Next.js 15
allowed that synchronous access temporarily; **16.0 removed it**. The same
applies to `cookies()`, `headers()` and `draftMode()`, which now return Promises,
so chaining `.get()` straight off the call fails.

**Fix.** `await` them. Type props with the generated helpers so the compiler
catches the next one.

```tsx file="app/blog/[slug]/page.tsx"
import { cookies } from 'next/headers';

export default async function BlogPostPage(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const theme = (await cookies()).get('theme')?.value ?? 'light';
  return <h1 data-theme={theme}>{slug}</h1>;
}
```

In a Client Component, unwrap a `params` Promise passed as a prop with `use()`.
For many files, run `npx @next/codemod@canary next-async-request-api .`. See
[Next.js 15 to 16](../nextjs-migration/next-15-to-16.md).

## `revalidateTag`: "Expected 2 arguments, but got 1."

That is the TypeScript diagnostic. In JavaScript files, which the compiler does
not check, the server logs a warning instead: "`"revalidateTag" without the
second argument is now deprecated, add second argument of "max" or use
"updateTag"`".

**Cause.** The single-argument form was **deprecated in 16.0**. The second
argument makes the stale-while-revalidate trade-off explicit.

**Fix.** Pick the behavior you want:

```ts file="app/posts/actions.ts"
'use server';

import { revalidateTag, updateTag } from 'next/cache';

export async function savePost(postId: string) {
  // The editor must see the change immediately: Server Actions only.
  updateTag(`post-${postId}`);
  // Everyone else can get the old list while it regenerates.
  revalidateTag('posts', 'max');
}
```

In a Route Handler or webhook, `updateTag` throws; use
`revalidateTag(tag, 'max')` or `revalidateTag(tag, { expire: 0 })`. See
[Revalidation](../nextjs-data-caching/revalidation.md).

## `"use cache"` reads `cookies()` or `headers()` *(paraphrased)*

Symptoms: an error that request data cannot be used inside a cache scope, or a
prerender that times out with "…likely because request-specific arguments such as
params, searchParams, cookies() or dynamic data were used inside "use cache"."

**Cause.** A `"use cache"` result is shared by everyone who calls it with the
same arguments. Request data would leak one user's values to another, so Next.js
refuses it.

**Fix.** Read the request data outside the cached function and pass the value in
as an argument, which also makes it part of the cache key.

```tsx file="app/account/page.tsx"
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife } from 'next/cache';

async function getRecommendations(segment: string): Promise<string[]> {
  'use cache';
  cacheLife('hours');
  const res = await fetch(`https://api.example.com/recommendations?segment=${segment}`);
  return res.json();
}

async function Recommendations() {
  const segment = (await cookies()).get('segment')?.value ?? 'general';
  const items = await getRecommendations(segment);
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<p>Loading recommendations…</p>}>
      <Recommendations />
    </Suspense>
  );
}
```

If the value is genuinely per user and still worth deduplicating, the bundled
docs describe `"use cache: private"`. See [use cache](../nextjs-data-caching/use-cache.md).

## Root params in a Route Handler or Server Action

In a Server Action: "`` `import('next/root-params').lang()` was used inside a
Server Action. This is not supported. Functions from 'next/root-params' can only
be called in the context of a route. ``" In a Route Handler, support is not
implemented yet *(paraphrased)*.

**Cause.** `next/root-params` (16.3) works in Server Components and `"use cache"`
scopes only. Route Handler support is planned; Server Actions and Client
Components are not supported.

**Fix.** In a Route Handler, read the segment from `params`:

```ts file="app/[lang]/feed/route.ts"
export async function GET(_request: Request, context: RouteContext<'/[lang]/feed'>) {
  const { lang } = await context.params;
  return Response.json({ lang });
}
```

In a Server Action, pass the value from the Server Component that renders the
form, for example as a hidden input or a bound argument, and validate it. See
[Root params](../nextjs-routing/root-params.md).

## Root param export does not exist *(paraphrased)*

Symptoms: `Module '"next/root-params"' has no exported member 'lang'`, or an
error about an invalid root param name.

**Cause.** Exports are generated only for dynamic segments **above the root
layout**, and only after `next dev`, `next build` or `next typegen` has run. A
kebab-case folder such as `[site-lang]` is not a valid identifier.

**Fix.** Put the root layout under the segment (`app/[lang]/layout.tsx`), rename
the folder to an identifier, and regenerate types.

## Edge runtime with Cache Components *(paraphrased)*

**Cause.** A route still exports the Edge runtime while `cacheComponents` is on.
Cache Components requires the Node.js runtime, and the Edge runtime is
**deprecated**: the 16.3.5 docs say to remove the `runtime` export from route
files.

**Fix.** Delete the `runtime` export. Node.js is the default. If a `proxy.ts`
contains a `config.runtime`, delete that too: "Route segment config is not
allowed in Proxy file… Proxy always runs on Node.js runtime." Only the deprecated
`middleware.ts` can still run on Edge. See [Runtimes](../nextjs-backend/runtimes.md).

## "Route segment config "dynamicParams" is not compatible with `nextConfig.cacheComponents`."

**Cause.** With `cacheComponents` on, the Previous Model's segment exports
`dynamic`, `revalidate`, `fetchCache` and `dynamicParams` are build errors.

**Fix.** Remove them and express the intent with `"use cache"` and `cacheLife`,
or with `notFound()` for unknown params. The full mapping is in
[The pre-16 caching model](../nextjs-migration/pre-16-caching-model.md).

## Local image with a query string fails *(paraphrased)*

**Cause.** Since 16.0, a local `src` with a query string (for example
`/assets/logo.png?v=3`) must match `images.localPatterns` including its
`search`. This stops attackers from enumerating optimizer variants.

**Fix.** Allow the exact pattern, or remove the query string and rely on
content-hashed filenames.

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: '/assets/**', search: '?v=3' }],
  },
};

export default nextConfig;
```

Related 16.0 image changes that look like bugs: `quality` values outside
`images.qualities` (default `[75]`) are coerced to the nearest allowed value,
images from local IPs are blocked unless `dangerouslyAllowLocalIP` is set, and
more than 3 redirects fail.

## `Cannot find name 'PageProps'.`

**Cause.** `PageProps`, `LayoutProps` and `RouteContext` are global types
**generated** by `next dev`, `next build` or `next typegen`. A fresh clone or a
CI job that runs `tsc` first has not generated them. A route literal that does
not match a real folder (`PageProps<'/blog/[id]'>` for `app/blog/[slug]`) fails
the same way, or with a constraint error.

**Fix.**

```bash
npx next typegen && npx tsc --noEmit
```

Make sure `next-env.d.ts` exists and is included by `tsconfig.json`, and that the
route string matches the folder names exactly. See [CLI reference](./cli.md).

## AVIF images are not optimized after upgrading to 16.3.3

**Cause.** This is intentional. The August 2026 Security Release fixed a Critical
unauthenticated RCE in the Image Optimization API, reached through an
attacker-controlled AVIF image (GHSA-2xp9-vwfh-vxw4 / GHSA-g89c-p67h-r497). The
patch in 16.3.3 and 15.5.24 **disables AVIF optimization** until an upstream fix
ships.

**Fix.** None needed, and do not downgrade: every 16.x below 16.3.3 is
vulnerable. Keep `image/webp` in `images.formats`, which is the default, so
browsers still get an optimized format. Watch the Next.js security advisories for
the release that restores AVIF. See
[Security advisories](../nextjs-security/security-advisories.md).

## `next build` fails because a `webpack` config was found *(paraphrased)*

**Cause.** Turbopack is the default for `next build` since 16.0, and a custom
`webpack` function, often added by a plugin, would be ignored silently. Next.js
fails instead.

**Fix.** Migrate to `turbopack` options, or build with `next build --webpack`.

## Both the deprecated `middleware.ts` and `proxy.ts` are detected

"Both middleware file … and proxy file … are detected. Please use … only."

**Cause.** A half-finished rename. `middleware.ts` is **deprecated** since 16.0.

**Fix.** Delete the old file. See [Middleware to proxy](../nextjs-migration/middleware-to-proxy.md).

## `partialPrefetching` throws at startup *(paraphrased)*

**Cause.** `partialPrefetching: true` requires `cacheComponents: true`; config
validation throws in `next dev` and `next build` without it.

**Fix.** Enable both, or neither. Instant Navigations are opt-in in 16.3.

## State survives navigating away and back

**Cause.** With Cache Components, Next.js keeps recently visited routes in a
hidden React `<Activity>` instead of unmounting them. `useState`, open menus and
`useActionState` results persist. Effects still clean up and re-run.

**Fix.** Reset state explicitly on the event that should clear it, derive
dialog state from the URL, or close popovers in an effect cleanup.

## Common mistakes

- **Fixing a Previous Model error by turning `cacheComponents` off.** That hides
  the problem and gives up Partial Prerendering. Migrate the route.
- **Downgrading below 16.3.3 to get AVIF back.** That reintroduces a Critical RCE.
- **Running `tsc` before `next typegen` in CI.**
- **Wrapping `cookies()` inside `"use cache"` in a `try`/`catch`.** The error is
  there to prevent cross-user data leaks.
- **Adding `instant = false` to silence a `new Date()` prerender error.** It does
  not clear synchronous IO errors. Use `io()` inside `<Suspense>`.

## Related topics

- [Cheat sheet](./cheat-sheet.md) — the correct 16.3 form of every snippet
  referenced here.
- [Next.js 15 to 16](../nextjs-migration/next-15-to-16.md) — the full list of
  changes behind most of these errors.
- [next.config reference](./next-config.md) — defaults and flags mentioned above.
- [React troubleshooting](../reference/troubleshooting.md) — React-level
  warnings, including hydration mismatches.
- [Next.js 16.2 to 16.3](../nextjs-migration/next-16-2-to-16-3.md) — the
  `catchError` and `retry` renames.
