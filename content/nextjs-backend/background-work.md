---
title: Background work
description: Run work after the response with after(), know its time limits, use a queue for durable jobs, and run startup code in instrumentation.ts.
group: nextjs-backend
order: 80
status: current
related: [nextjs-backend/webhooks, nextjs-backend/route-handlers, nextjs-mutations/server-actions, server-react/server-functions]
---

## Overview

Next.js gives you three tools for work that should not happen inline in a
request, and one thing it deliberately does not give you:

| Tool | Runs | Survives a crash or timeout? |
|---|---|---|
| `after(callback)` from `next/server` | After the response (or prerender) finishes, in the same invocation | No |
| `event.waitUntil(promise)` in `proxy.ts` | Keeps the proxy invocation alive until the promise settles | No |
| `register()` in `instrumentation.ts` | Once, when a server instance starts, before it accepts requests | Not applicable |
| A job queue or workflow service | In a separate worker, with retries | Yes. **Not built into Next.js.** |

## Why it exists

A request handler often has two kinds of work: what the user is waiting for, and
what merely has to happen. Logging, analytics, cache warming, sending a
confirmation email and notifying another service fall in the second group.
Doing them before responding makes every user wait for them.

Plain un-awaited promises (`void sendEmail()`) are not a fix. On a serverless
platform the function can be frozen or terminated as soon as the response is
sent, and the promise silently never finishes. `after()` tells the platform to
keep the invocation alive until the callback completes.

## When to use it

Use `after()` for short, best-effort side effects:

- analytics events and audit logs;
- flushing telemetry;
- sending a notification where an occasional loss is acceptable or detectable;
- revalidating or warming a cache after a mutation's response.

Use a **queue** for work that must happen, can take long, or needs retries:
payment fulfillment, video processing, bulk emails, anything a customer would
notice missing.

Use **`instrumentation.ts`** for one-time server setup: OpenTelemetry, error
reporting, validating configuration at startup.

## When not to use it

- **Work the response depends on.** If the client needs the result, await it.
- **Long jobs.** `after()` runs within the route's maximum duration. A five-minute
  video transcode will be killed on most serverless hosts.
- **Work that must not be lost.** Nothing retries a failed `after()` callback, and
  a deploy, crash or timeout drops it.
- **Scheduled jobs.** A `setInterval` in `register()` does not run reliably on
  serverless platforms, where instances start and stop on demand. Use your
  host's cron feature to call a protected Route Handler, or a job scheduler.

## Basic example

A Server Action that responds as soon as the comment is saved, then records an
audit entry and notifies the author:

```ts file="app/posts/[id]/comments/actions.ts"
'use server';

import { after } from 'next/server';
import { headers } from 'next/headers';
import { updateTag } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { notifyPostAuthor, writeAuditLog } from '@/lib/notifications';

const commentSchema = z.object({
  postId: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
});

export async function addComment(formData: FormData) {
  const session = await requireSession();
  const parsed = commentSchema.safeParse({
    postId: formData.get('postId'),
    body: formData.get('body'),
  });
  if (!session || !parsed.success) return;

  const comment = await db.comment.create({
    data: { postId: parsed.data.postId, body: parsed.data.body, authorId: session.userId },
  });
  updateTag(`post:${parsed.data.postId}:comments`);

  after(async () => {
    // In Server Actions and Route Handlers, request APIs work inside after().
    const userAgent = (await headers()).get('user-agent') ?? 'unknown';
    await writeAuditLog({ action: 'comment.created', commentId: comment.id, userAgent });
    await notifyPostAuthor(parsed.data.postId, comment.id);
  });
}
```

The user sees their comment as soon as the action returns. The audit log and the
notification happen afterwards, and a slow email provider no longer slows the
form. The React side of Server Actions is in
[Server Functions](../server-react/server-functions.md).

## How it works

### Where `after()` can be called

`after()` works in Server Components (including `generateMetadata`), Server
Actions, Route Handlers and `proxy.ts`. It takes a callback (sync or async) or a
promise, and callbacks can call `after()` again.

Whether request APIs work **inside** the callback depends on where you call it:

| Called from | `cookies()` / `headers()` inside the callback |
|---|---|
| Route Handler, Server Action | Allowed |
| Server Component (page, layout, `generateMetadata`) | **Throws at runtime.** Read the values during render and close over them. |

Server Components cannot read request data inside `after()` because Next.js
must know which parts of the tree use request data to prerender the rest, and
`after()` runs once rendering is over:

```tsx file="app/articles/[slug]/page.tsx"
import { after } from 'next/server';
import { cookies } from 'next/headers';
import { getArticle, recordView } from '@/lib/articles';

export default async function ArticlePage({ params }: PageProps<'/articles/[slug]'>) {
  const { slug } = await params;
  // Read request data during render...
  const visitorId = (await cookies()).get('visitor-id')?.value ?? 'anonymous';
  const article: { title: string; html: string } = await getArticle(slug);

  // ...and pass the values in. Calling cookies() inside the callback would throw.
  after(() => recordView({ slug, visitorId }));

  return (
    <article>
      <h1>{article.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: article.html }} />
    </article>
  );
}
```

With Cache Components, a component that reads cookies like this belongs inside a
`<Suspense>` boundary so the rest of the route can be prerendered. See
[Streaming in Next.js](../nextjs-rendering/streaming.md).

### When the callback runs

- After the response is finished, **even if** the request failed: a thrown error,
  `notFound()` or `redirect()` still runs scheduled callbacks.
- `after()` is not a request-time API. Calling it does not make a route dynamic.
  In a prerendered page, the callback runs at build time or when the page is
  revalidated, not on every visit.
- It is not deduplicated by default. Wrap functions called from several places
  with React's `cache` if they should run once per request.

### How long it can run

`after()` work runs within the platform's default or configured maximum duration
for the route. Set `maxDuration` (in seconds) as a route segment export to raise
it on platforms that read it:

```ts file="app/api/reports/export/route.ts"
import { after } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { buildReport, emailReportLink } from '@/lib/reports';

// The response returns immediately; this budget covers the after() work too.
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return new Response(null, { status: 401 });

  const reportId = crypto.randomUUID();
  after(async () => {
    const url: string = await buildReport(reportId, user.id);
    await emailReportLink(user.email, url);
  });

  return Response.json({ reportId, status: 'accepted' }, { status: 202 });
}
```

For Server Actions, set `maxDuration` on the **page** that uses them. The actual
ceiling is the host's plan limit; `maxDuration` cannot exceed it.

### Where it is supported

`after()` is fully supported with `next start`, in Docker, and on platforms whose
adapter implements it. It is **not** supported in a static export. On serverless
platforms, Next.js hands the pending work to the platform's `waitUntil`
primitive, so support depends on the host.

When self-hosting, stop the server with `SIGINT` or `SIGTERM` and give it time to
drain. The server finishes in-flight requests and pending `after()` callbacks
before exiting. The Next.js docs recommend a drain period of 10–30 seconds in
your orchestrator. See [Self-hosting](../nextjs-deployment/self-hosting.md).

### `waitUntil` in proxy

`proxy.ts` receives a `NextFetchEvent` as its second argument. Its
`waitUntil(promise)` extends the proxy invocation until the promise settles. It
has the same best-effort semantics as `after()`. See [Proxy](./proxy.md).

### Durable work: queues

`after()` does not persist anything. For work that must eventually succeed, the
handler writes a job record, in the same transaction as the change that caused it
when possible, and returns. A separate worker, queue service or workflow engine
picks the job up, retries on failure, and marks it done. Next.js does not include
one; choose a service your host supports.

```ts file="app/api/videos/route.ts"
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { db } from '@/lib/db';

const videoSchema = z.object({ sourceKey: z.string().min(1), title: z.string().trim().min(1).max(200) });

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = videoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid video' }, { status: 422 });

  // One transaction: the video row and the job that processes it exist together or not at all.
  const video = await db.$transaction(async (tx: typeof db) => {
    const created = await tx.video.create({
      data: { ownerId: user.id, title: parsed.data.title, status: 'processing' },
    });
    await tx.job.create({
      data: { type: 'video.transcode', payload: { videoId: created.id, sourceKey: parsed.data.sourceKey } },
    });
    return created;
  });

  return NextResponse.json({ id: video.id, status: 'processing' }, { status: 202 });
}
```

The client then polls, or listens with Server-Sent Events, for the status. See
[Streaming responses](./streaming-responses.md).

### Startup work: `instrumentation.ts`

`instrumentation.ts` in the project root (or `src/`) can export `register()`.
Next.js calls it **once** when a new server instance starts, and waits for it to
finish before handling requests. It runs in every runtime, so import
Node.js-only code conditionally:

```ts file="instrumentation.ts"
import type { Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Importing these runs their setup before the first request:
    // env-check throws on bad configuration, telemetry starts exporting
    await Promise.all([import('./lib/env-check'), import('./lib/telemetry')]);
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  await fetch('https://errors.example.com/v1/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      path: request.path,
      method: request.method,
      routeType: context.routeType,
    }),
  });
};
```

`onRequestError` receives server errors from Server Components, Route Handlers,
Server Actions and proxy. Its `error` is typed `unknown`, so narrow it before
reading `message`. Await any async work inside it.

"Once per server instance" means once per cold start on serverless, which can be
many times a day. Keep `register()` fast.

## Server and client implications

All of this is server-only. A Client Component cannot call `after()`. To run
background work from a user interaction, call a Server Action or Route Handler
that schedules it.

The user gets no signal from `after()` work. If the result matters to them
(an export is ready, a video finished), persist status and show it, rather than
assuming the callback succeeded.

## Caching implications

- `after()` in a prerendered route runs at build or revalidation time, not per
  visit. Page-view analytics belong in a component that reads request data, a
  Route Handler, or client-side code.
- Revalidating from inside `after()` means the response the user just received
  does not reflect it. If the user must see their own write, call `updateTag`
  in the Server Action before it returns, as the basic example does.

## Common patterns

- **Acknowledge, then work**: webhooks return `202` and process in `after()` or a
  queue. See [Webhooks](./webhooks.md).
- **Audit and analytics** after mutations, with request data read in the callback
  from Route Handlers and actions.
- **Outbox**: write a job row in the same transaction as the change; a worker
  delivers it.
- **Cron via Route Handler**: your host's scheduler calls a `POST` handler
  protected by a secret header, which enqueues work or does a short task.
- **Startup validation** of environment variables in `register()`.

## Common mistakes

- **Fire-and-forget promises** without `after()`, which serverless platforms
  drop.
- **Calling `cookies()` or `headers()` inside `after()` in a Server Component.**
  It throws. Read first, close over the values.
- **Long jobs in `after()`**, killed at `maxDuration`.
- **Assuming `after()` retries** or survives a deploy.
- **Expecting `after()` in a static page to run per visit.**
- **Heavy or blocking work in `register()`**, which delays every cold start.
- **`setInterval` schedulers in `instrumentation.ts`** on serverless hosts.
- **Killing a self-hosted server with `SIGKILL`**, dropping pending callbacks.

## Related topics

- [Webhooks](./webhooks.md) — the most common place to acknowledge fast and work
  later.
- [Server Functions](../server-react/server-functions.md) — the React model for
  Server Actions, where `after()` is often called.
- [Server Actions](../nextjs-mutations/server-actions.md) — `updateTag` for
  read-your-writes before scheduling the rest.
- [Route Handlers](./route-handlers.md) — `maxDuration` and request APIs in
  handlers.
- [Self-hosting](../nextjs-deployment/self-hosting.md) — graceful shutdown so
  pending callbacks finish.
