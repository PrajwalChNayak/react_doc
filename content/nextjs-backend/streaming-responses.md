---
title: Streaming responses
description: Stream bytes from Route Handlers with ReadableStream, Server-Sent Events and AI-style text, and keep every layer from buffering them.
group: nextjs-backend
order: 70
status: current
related: [nextjs-backend/route-handlers, nextjs-rendering/streaming, server-react/streaming, nextjs-deployment/self-hosting]
---

## Overview

A Route Handler can return a `Response` whose body is a `ReadableStream`. Next.js
sends the headers immediately and forwards each chunk as you enqueue it, so the
client starts receiving data before you have finished producing it.

This is the raw-bytes counterpart of streaming UI. Streaming HTML with Suspense
is covered in [Streaming in Next.js](../nextjs-rendering/streaming.md) and in
React's [Streaming](../server-react/streaming.md). This page is about responses
you build yourself: progress output, Server-Sent Events, generated text from a
language model, large exports.

## Why it exists

Some responses take seconds to finish but are useful from the first byte: a
model generating an answer token by token, a log tail, an export of a million
rows. Buffering them means a long blank wait and, for large bodies, a server
holding the whole thing in memory.

Web Streams are the platform's answer, and Route Handlers use them directly.
Nothing Next.js-specific is required, which is why the interesting part is what
sits between your handler and the user and may buffer anyway.

## When to use it

- **Incremental text**: language model output, build logs, long computations
  with progress.
- **Server-Sent Events**: one-way server-to-browser updates (notifications, job
  status) over plain HTTP.
- **Large downloads**: files and exports streamed from disk, a database cursor or
  another service without loading them into memory.

## When not to use it

- **Two-way, low-latency messaging.** Use WebSockets on infrastructure built for
  them. The Next.js docs note that on hosts that run Route Handlers as
  short-lived functions, WebSockets do not work because the connection closes on
  timeout.
- **Very long-lived connections on serverless.** Each open stream holds a
  function invocation until `maxDuration` ends it. Poll, or use a dedicated
  realtime service.
- **Small responses.** Streaming a 2 KB JSON body adds complexity for nothing.
- **UI.** Render Server Components with Suspense and let Next.js stream the HTML.

## Basic example

```ts file="app/api/progress/route.ts"
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const steps = Math.min(Number(request.nextUrl.searchParams.get('steps') ?? '5') || 5, 20);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let step = 1; step <= steps; step += 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        controller.enqueue(encoder.encode(`step ${step}/${steps} done\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
```

```bash
curl -N "http://localhost:3000/api/progress?steps=5"
```

`-N` turns off `curl`'s output buffering. Each line ends with `\n` because
`curl` flushes to the terminal by line.

## How it works

### Headers go first, and are final

The status code and headers are sent before the first chunk. Once the stream has
started, you cannot switch to a `500` or add a header. Validate input,
authenticate and check preconditions **before** returning the `Response`, and
report errors that happen mid-stream inside the stream itself (an `event: error`
in SSE, or an error line your client understands).

### `start` versus `pull`: backpressure

A `ReadableStream` with `start()` runs your loop as fast as it can and queues
everything it enqueues. If the client reads slowly, the queue grows in server
memory.

`pull()` inverts that: the stream calls it only when the consumer is ready for
more. Producing inside `pull()` gives you backpressure, so a slow reader slows
the producer. Use it whenever the producer can outrun the network, such as when
reading from a database cursor or an async iterator:

```ts file="app/api/exports/orders/route.ts"
import type { NextRequest } from 'next/server';
import { iterateOrderRows } from '@/lib/orders';

function toCsvLine(row: { id: string; total: number; createdAt: string }): string {
  return `${row.id},${row.total},${row.createdAt}\n`;
}

export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get('since') ?? '1970-01-01';
  const rows: AsyncIterator<{ id: string; total: number; createdAt: string }> =
    iterateOrderRows({ since })[Symbol.asyncIterator]();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('id,total,created_at\n'));
    },
    // Called only when the client has room for more.
    async pull(controller) {
      const { value, done } = await rows.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(toCsvLine(value)));
    },
    // Release the cursor if the stream is cancelled early.
    async cancel() {
      await rows.return?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="orders.csv"',
    },
  });
}
```

For files on disk, `FileHandle.readableWebStream()` from `node:fs/promises`
returns a Web stream you can pass straight to `Response`; the
[Runtimes](./runtimes.md) page shows it.

### Server-Sent Events

SSE is a text format over a normal `GET` response with
`Content-Type: text/event-stream`. Each message is a set of `field: value` lines
ended by a blank line. Browsers consume it with `EventSource`, which reconnects
automatically and sends `Last-Event-ID` so you can resume.

```ts file="app/api/jobs/[jobId]/events/route.ts"
import type { NextRequest } from 'next/server';
import { getJobStatus } from '@/lib/jobs';

export const maxDuration = 60;

export async function GET(_request: NextRequest, context: RouteContext<'/api/jobs/[jobId]/events'>) {
  const { jobId } = await context.params;
  const encoder = new TextEncoder();
  const send = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const status: { state: 'queued' | 'running' | 'done' | 'failed'; percent: number } =
        await getJobStatus(jobId);
      controller.enqueue(send('status', status));

      if (status.state === 'done' || status.state === 'failed') {
        controller.close();
        return;
      }
      // Wait before the next poll; pull() is not called again until this resolves.
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 1000);
      });
    },
    cancel() {
      clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

The consumer is a Client Component. Close the `EventSource` in the Effect
cleanup, or every re-render and navigation leaks a connection:

```tsx file="app/jobs/[jobId]/job-progress.tsx"
'use client';

import { useEffect, useState } from 'react';

type JobStatus = { state: 'queued' | 'running' | 'done' | 'failed'; percent: number };

export function JobProgress({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<JobStatus | null>(null);

  useEffect(() => {
    const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
    source.addEventListener('status', (event) => {
      const next = JSON.parse((event as MessageEvent<string>).data) as JobStatus;
      setStatus(next);
      if (next.state === 'done' || next.state === 'failed') source.close();
    });
    return () => source.close();
  }, [jobId]);

  if (!status) return <p>Connecting…</p>;
  return (
    <p role="status">
      {status.state} ({status.percent}%)
    </p>
  );
}
```

### Streaming generated text

To relay a streaming upstream (a language model API, another service), pipe its
body through a `TransformStream` instead of reading it into a string. The shape
of the upstream request and its chunk format are provider-specific; this example
assumes a provider that streams plain UTF-8 text:

```ts file="app/api/answer/route.ts"
import { NextResponse } from 'next/server';
import { z } from 'zod';

const questionSchema = z.object({ question: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid question' }, { status: 422 });
  }

  const endpoint = process.env.TEXT_MODEL_URL;
  const apiKey = process.env.TEXT_MODEL_API_KEY;
  if (!endpoint || !apiKey) {
    return NextResponse.json({ error: 'Model is not configured' }, { status: 500 });
  }

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: parsed.data.question, stream: true }),
    // Stop generating (and paying) if the client disconnects, where supported.
    signal: request.signal,
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Model request failed' }, { status: 502 });
  }

  // Decode, redact anything you must not forward, re-encode. Chunks flow through
  // without the full answer ever being held in memory.
  const redact = new TransformStream<string, string>({
    transform(chunk, controller) {
      controller.enqueue(chunk.replaceAll(apiKey, '[redacted]'));
    },
  });

  const body = upstream.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(redact)
    .pipeThrough(new TextEncoderStream());

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

`pipeThrough` propagates backpressure end to end: if the browser reads slowly,
the handler reads the upstream slowly. On the client, read it with
`response.body.getReader()` and a `TextDecoder`, appending text to state as it
arrives. SDKs for specific model providers wrap this pattern; they still return
a stream from the Route Handler.

## Server and client implications

Streaming happens in Route Handlers on the Node.js runtime. The client needs code
that consumes a stream (`EventSource`, `fetch` with `getReader()`, or a download
the browser handles). A plain `await response.json()` or `response.text()`
waits for the whole body and gives up every benefit.

Mid-stream failures reach the client as a truncated or errored body, not an HTTP
status. Design the protocol so the client can tell "finished" from "cut off": a
final `done` event, a trailing marker, or a known length.

## Caching implications

`POST` handlers are never cached. A **`GET`** streaming handler under Cache
Components is prerendered at build time if it reads no request data and no
uncached data, which would freeze a "live" stream into a static file. Read from
the request (a query parameter, a header, `params`) or `await connection()` from
`next/server` before building the stream, as every example on this page does.

Always send `Cache-Control: no-cache` on SSE and live text so a CDN does not
store and replay it. `no-transform` asks intermediaries not to re-encode, and so
not to buffer, the body. See [Caching and CDNs](../nextjs-deployment/caching-and-cdn.md).

## Common patterns

### Keeping every layer from buffering

The handler streaming is necessary but not sufficient. Check each hop:

| Layer | What buffers | What to do |
|---|---|---|
| nginx and similar reverse proxies | Response buffering is on by default | Send `X-Accel-Buffering: no`, or disable buffering for the route in the proxy config |
| Compression | gzip or Brotli wait for enough data to compress; `next start` compresses by default | Verify with `Accept-Encoding: identity`; if compression delays first bytes, let the reverse proxy compress and set `compress: false` only if it does |
| CDNs | Some buffer whole responses | Check your CDN's streaming support and plan tier |
| Serverless platforms | Some need streaming enabled explicitly (AWS Lambda requires response streaming mode) | Enable it, or use a host that streams natively |
| Load balancers | Some buffer Lambda-style integrations | Use chunked transfer or HTTP/2 end to end |
| Safari/WebKit | Buffers until about 1 KB has arrived | Only noticeable in tiny demos; send a short preamble if needed |
| `curl` | Buffers output | Use `-N` and newline-terminated chunks |

Self-hosting specifics are in [Self-hosting](../nextjs-deployment/self-hosting.md).

### Verifying that a response really streams

Read the body chunk by chunk with timestamps, with compression turned off:

```js file="scripts/observe-stream.mjs"
async function observe(url) {
  const response = await fetch(url, { headers: { 'Accept-Encoding': 'identity' } });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const startedAt = Date.now();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(`+${Date.now() - startedAt}ms`, JSON.stringify(decoder.decode(value)));
  }
}

observe('http://localhost:3000/api/progress?steps=5');
```

Run it with `node scripts/observe-stream.mjs`. Staggered timestamps mean the
response streams; one burst at the end means something is buffering.

### Keepalives for long SSE connections

Some proxies close idle connections. An SSE comment line (`: keepalive\n\n`)
every 15–30 seconds keeps the connection active without triggering an event on
the client.

## Security considerations

- Authenticate and authorize **before** returning the stream. After the headers
  are sent you cannot return a `401`.
- Validate `params` used to select what to stream (a job id, a file), and check
  the caller owns it. See [IDOR](../nextjs-security/idor.md).
- Cap duration and size: limit loop counts, set `maxDuration`, and stop on
  cancellation, or a single client can hold resources open.
- Never stream upstream error bodies or headers verbatim; they can carry API
  keys or internal hostnames.
- Set `X-Content-Type-Options: nosniff` on text streams so browsers do not
  reinterpret them.

## Common mistakes

- **Using `start()` with an unbounded producer** and no backpressure.
- **Reading the upstream into a string** and then "streaming" it.
- **Trying to set an error status after streaming has begun.**
- **Forgetting `EventSource.close()`** in the Effect cleanup.
- **Missing `Cache-Control: no-cache`**, so a CDN caches a live stream.
- **A `GET` stream with no request access under Cache Components**, prerendered
  at build time.
- **Testing with plain `curl`**, seeing one burst, and blaming Next.js.
- **Expecting WebSockets to work** on a host that runs handlers as short-lived
  functions.

## Related topics

- [Streaming](../server-react/streaming.md) — React's HTML streaming model, the
  UI counterpart of these byte streams.
- [Streaming in Next.js](../nextjs-rendering/streaming.md) — `loading.tsx`,
  Suspense boundaries and the static shell.
- [Route Handlers](./route-handlers.md) — the handler API these streams are
  returned from.
- [Self-hosting](../nextjs-deployment/self-hosting.md) — reverse proxy and
  compression settings that affect streaming.
- [Background work](./background-work.md) — when the client does not need to
  watch the work happen.
