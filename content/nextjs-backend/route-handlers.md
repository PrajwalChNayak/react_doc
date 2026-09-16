---
title: Route Handlers
description: Build HTTP endpoints inside the App Router with the Web Request and Response APIs.
group: nextjs-backend
order: 10
status: current
since: "16.0"
related: [nextjs-backend/proxy, nextjs-mutations/server-actions, server-react/server-functions, nextjs-security/input-validation]
---

## Overview

A Route Handler is a `route.ts` file inside `app/` that exports one function per
HTTP method. Next.js calls the matching export with a Web `Request` and sends
back the `Response` you return. There is no framework-specific request or
response object to learn, and no body parser to configure.

```text
app/api/items/route.ts        ->  GET, POST     /api/items
app/api/items/[id]/route.ts   ->  GET, PATCH    /api/items/itm_1
app/rss.xml/route.ts          ->  GET           /rss.xml
```

The supported exports are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` and
`OPTIONS`. A request for a method the file does not export gets a
`405 Method Not Allowed`. If you do not export `OPTIONS`, Next.js answers it for
you and sets the `Allow` header from the methods you did export.

This group covers the rest of the Next.js backend surface:
[proxy.ts](./proxy.md), [runtimes](./runtimes.md),
[environment variables](./environment-variables.md),
[webhooks](./webhooks.md), [file uploads](./file-uploads.md),
[streaming responses](./streaming-responses.md) and
[background work with `after()`](./background-work.md).

## Why it exists

A React app rendered by Next.js still needs endpoints that are not UI: a webhook
from a payment provider, an OAuth callback, a JSON API for a mobile client, an
RSS feed. Before Route Handlers, that meant a second server or the Pages Router's
API Routes.

Route Handlers put those endpoints in the same `app/` tree, with the same
deployment, environment variables and data layer as your pages. They use the
platform's `Request` and `Response` so the same code reads naturally to anyone
who has used `fetch`.

## When to use it

- **Callers that are not your React UI:** webhooks, third-party integrations,
  mobile apps, CLI tools, partner sites calling with CORS.
- **Non-HTML responses:** JSON, CSV downloads, XML feeds, `text/event-stream`,
  generated files.
- **HTTP semantics matter:** status codes, caching headers, `ETag`, `Location`,
  specific methods, redirects as responses.
- **Callbacks** from an OAuth or payment flow that land on a URL you choose.

## When not to use it

Use a different tool when your own UI is the only caller:

| You need to | Use | Why |
|---|---|---|
| Read data to render a page | A Server Component | It reads the data source directly. Fetching your own Route Handler adds an HTTP round trip, and fails at build time because no server is listening. |
| Mutate data from a form or button in your app | A [Server Action](../nextjs-mutations/server-actions.md) | Next.js generates the endpoint, wires progressive enhancement, and can revalidate and re-render in the same response. |
| Serve an endpoint to anyone who is not your React UI | A Route Handler | You control the URL, method, status codes, headers and content type. |
| Redirect or rewrite before routing, for many paths | [`proxy.ts`](./proxy.md) | It runs before the route is matched. |
| Serve `sitemap.xml`, `robots.txt`, icons or Open Graph images | The metadata file conventions | Next.js has dedicated conventions for these with sensible caching. |

The first row is the most common mistake: a Server Component that calls
`fetch('/api/items')` on its own app. React's model is covered in
[Server Components](../server-react/server-components.md), and the calling
convention for mutations in [Server Functions](../server-react/server-functions.md).

## Basic example

A collection endpoint that validates the query string and the JSON body with zod
before either reaches the data layer:

```ts file="app/api/items/route.ts"
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createItem, listItems } from '@/lib/items';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(0).max(10_000),
});

export async function GET(request: NextRequest) {
  const query = listQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json(
      { error: 'Invalid query', issues: z.flattenError(query.error).fieldErrors },
      { status: 400 },
    );
  }

  const items = await listItems(query.data.limit);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid item', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 422 },
    );
  }

  const item = await createItem(parsed.data);
  return NextResponse.json(item, {
    status: 201,
    headers: { Location: `/api/items/${item.id}` },
  });
}
```

Validation sits at the entry point for a reason. The TypeScript types on your
data layer are erased at runtime, and anyone can send this endpoint any bytes.
`safeParse` turns untrusted input into a typed value or a `4xx` response, so no
code after it has to wonder. [Input validation](../nextjs-security/input-validation.md)
covers what schema validation does not protect against.

The runnable version, with every handler on this page, is
[the Route Handlers and proxy example app](../../examples/nextjs/route-handlers-proxy/README.md).

## How it works

### Request and response objects

The first argument is a `NextRequest`, which extends `Request`:

- `request.nextUrl` is a parsed URL with `pathname` and `searchParams`.
- `request.cookies` has `get`, `getAll`, `has`, `set` and `delete`.
- The body methods are the standard ones: `json()`, `text()`, `formData()`,
  `arrayBuffer()`, and `request.body` as a stream. A body can be read **once**.
  Call `request.clone()` first if you need it twice.

You can return a plain `Response`, `Response.json()`, or a `NextResponse`.
`NextResponse` adds `json()`, `redirect()`, `rewrite()` and a `cookies` API on
the response. You can pass a `NextRequest` wherever a `Request` is expected, and
return a `NextResponse` wherever a `Response` is expected.

### Dynamic segments and `RouteContext`

The second argument is a context object whose `params` is a **Promise**. Type it
with the global `RouteContext` helper, which `next dev`, `next build` and
`next typegen` generate from your folder names:

```ts file="app/api/items/[id]/route.ts"
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getItem } from '@/lib/items';

const idSchema = z.string().regex(/^itm_[\w-]{1,64}$/);

export async function GET(_request: NextRequest, context: RouteContext<'/api/items/[id]'>) {
  const { id } = await context.params;

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const item = await getItem(parsed.data);
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  return NextResponse.json(item);
}
```

`RouteContext` needs no import. The route literal must match the file's
location, so renaming the folder turns a stale type into a compile error.
[Typed routes](../nextjs-routing/typed-routes.md) covers the generated types,
and [Dynamic segments](../nextjs-routing/dynamic-segments.md) covers catch-all
and optional segments.

> [!NOTE]
> `params` became a Promise in Next.js 15, and the temporary synchronous access
> was removed in 16.0.
> Code that destructures `{ params: { id } }` from the second argument comes from
> an older tutorial.

### Cookies, headers and redirects

`cookies()` and `headers()` from `next/headers` work in Route Handlers and are
async. In a handler, the cookie store is writable:

```ts file="app/api/preferences/route.ts"
import { cookies, headers } from 'next/headers';
import { z } from 'zod';

const preferencesSchema = z.object({ theme: z.enum(['light', 'dark', 'system']) });

export async function PUT(request: Request) {
  const parsed = preferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid theme' }, { status: 422 });
  }

  const cookieStore = await cookies();
  cookieStore.set('theme', parsed.data.theme, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  const requestHeaders = await headers();
  return Response.json({
    theme: parsed.data.theme,
    requestId: requestHeaders.get('x-request-id'),
  });
}
```

`redirect()` from `next/navigation` also works in a handler. It throws, so code
after it does not run.

### Where a route file can live

A `route.ts` can sit at any depth in `app/`, but not in the same segment as a
`page.tsx`: each file takes over every HTTP method for its URL. Route Handlers
do not render layouts and do not take part in client-side navigation.

## Server and client implications

A Route Handler runs only on the server, so it can use secrets, database
clients and Node.js APIs. Nothing in the file is sent to the browser.

It is also a **public endpoint**. The fact that only your UI calls it today does
not restrict who can call it. Authenticate and authorize inside the handler, or
in a data access layer the handler calls, on every request. The pattern is in
[Data access layer](../nextjs-auth/data-access-layer.md), and
[IDOR](../nextjs-security/idor.md) shows the bug you get when the handler trusts
an ID from the URL.

Route Handlers run on the Node.js runtime. The Edge runtime is deprecated; see
[Runtimes](./runtimes.md).

## Caching implications

Only `GET` handlers are ever cached. `POST`, `PUT`, `PATCH`, `DELETE` and the
rest always run per request, even in a file whose `GET` is cached.

**With Cache Components** (`cacheComponents: true`), a `GET` handler follows the
same model as a page. It is prerendered at build time if it touches no uncached
or request data. Prerendering stops, and the handler runs per request, when it
reads request properties (`request.url`, `request.headers`, `request.cookies`,
the body), calls `cookies()`, `headers()` or `connection()`, queries a database,
makes a network request, or does something non-deterministic like
`Math.random()`.

```ts file="app/api/plans/route.ts"
// Touches no request or uncached data, so it is prerendered at build time.
export async function GET() {
  return Response.json({
    plans: [
      { id: 'starter', seats: 3 },
      { id: 'team', seats: 25 },
    ],
  });
}
```

To cache uncached data inside a prerendered response, move it into a helper with
`"use cache"`. The directive cannot go directly in the handler body:

```ts file="app/api/catalog/route.ts"
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

async function getCatalog() {
  'use cache';
  cacheLife('hours');
  cacheTag('catalog');
  return db.product.findMany({ select: { id: true, name: true, price: true } });
}

export async function GET() {
  return Response.json(await getCatalog());
}
```

That handler is prerendered with the cached catalog and refreshed according to
the `hours` profile, or when you revalidate the `catalog` tag. See
[use cache](../nextjs-data-caching/use-cache.md) and
[cacheLife and cacheTag](../nextjs-data-caching/cache-life-and-tags.md).

> [!WARNING]
> A `GET` handler that reads a database through a synchronous driver, or an
> in-memory value, and touches nothing else can be frozen into the build output
> under Cache Components. Read the request (for example
> `request.nextUrl.searchParams`) or `await connection()` from `next/server` when
> the response must be computed per request. (In Server Components, the 16.3
> docs prefer `io()` from `next/cache` for this; the Route Handler docs list
> `connection()`.)

**Without Cache Components**, `GET` handlers are not cached by default. The
`dynamic = 'force-static'` segment option that opts one in belongs to the
previous caching model and is removed when Cache Components is on. See
[the pre-16 caching model](../nextjs-migration/pre-16-caching-model.md).

## Common patterns

### Returning errors without leaking internals

Catch, log on the server, and send a message you are happy for a stranger to
read:

```ts file="app/api/reports/route.ts"
import { NextResponse } from 'next/server';
import { generateReport } from '@/lib/reports';

export async function POST(request: Request) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const report = await generateReport(await request.json());
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error(`[reports] ${requestId}`, error);
    return NextResponse.json(
      { error: 'Could not generate the report', requestId },
      { status: 500 },
    );
  }
}
```

### Non-UI responses

Any content type works. A folder named with a dot becomes the URL:

```ts file="app/feed.xml/route.ts"
import { getPublishedPosts } from '@/lib/posts';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET() {
  const posts: { title: string; url: string }[] = await getPublishedPosts();
  const items = posts
    .map((post) => `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(post.url)}</link></item>`)
    .join('');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog</title>${items}</channel></rss>`,
    { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } },
  );
}
```

Escape anything you interpolate into markup. The data came from your database,
but it may have come into your database from a user.

### CORS for a specific handler

Set CORS headers in the handler that needs them, echo only allow-listed origins,
and export `OPTIONS` yourself when preflights need specific headers. The example
app's `app/api/public/items/route.ts` shows the full pattern, and
[CORS](../nextjs-security/cors.md) explains why reflecting any `Origin` is a
vulnerability. To apply the same headers to many routes, set them in
[proxy.ts](./proxy.md).

### Library factories

Auth and API libraries often hand you one handler for several methods, mounted
on a catch-all segment:

```ts file="app/api/integrations/[...path]/route.ts"
import { handler } from '@/lib/integrations-handler';

export const GET = handler;
export const POST = handler;
```

## Security considerations

- **Every handler is reachable by anyone.** Check the session and the caller's
  right to the specific resource inside the handler, not in `proxy.ts` alone.
  See [Proxy is not authorization](../nextjs-security/proxy-is-not-authorization.md).
- **Validate every input**: path params, query strings, headers and the body.
- **Do not reflect the `Origin` header** into `Access-Control-Allow-Origin`.
- **Keep secrets in non-`NEXT_PUBLIC_` variables.** See
  [Environment variables](./environment-variables.md).
- **Limit what you return.** Serialize a response shape, not a database row with
  password hashes and internal flags.

## Common mistakes

- **Fetching your own Route Handler from a Server Component.** It adds a network
  hop, and at build time there is no server to answer. Call the data function
  directly.
- **Accessing `params` synchronously.** It is a Promise. Use
  `RouteContext<'/your/[route]'>` and `await context.params`.
- **Reading the body twice.** The second `request.json()` throws. Read once, or
  `request.clone()` first.
- **Putting `route.ts` next to `page.tsx`** in the same folder. The two conflict.
- **Using a Route Handler for your own form submissions.** A Server Action gives
  you progressive enhancement and revalidation for free.
- **Expecting a `POST` handler to be cached**, or expecting a `GET` handler to be
  dynamic under Cache Components when it reads no request data.
- **Trusting TypeScript types on the body.** `await request.json()` is `any` at
  runtime. Parse it.
- **Returning `error.message` from a caught exception.** It can contain queries,
  hostnames or file paths.

## Related topics

- [Server Actions](../nextjs-mutations/server-actions.md) — the better choice
  when your own UI is the caller.
- [Server Functions](../server-react/server-functions.md) — the React model
  behind Server Actions, and why they are public endpoints too.
- [Proxy](./proxy.md) — logic that runs before a request reaches any route.
- [use cache](../nextjs-data-caching/use-cache.md) — caching data inside a
  prerendered `GET` response.
- [Input validation](../nextjs-security/input-validation.md) — what zod catches
  and what it does not.
- [Webhooks](./webhooks.md) — a Route Handler that verifies who sent the request.
