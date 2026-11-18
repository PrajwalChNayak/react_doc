---
title: Debugging production
description: Inspect a running Next.js server, get readable stack traces, report server errors with instrumentation, and match error digests to logs.
group: nextjs-deployment
order: 80
status: current
since: "16.2"
related: [nextjs-errors/error-boundaries, nextjs-deployment/self-hosting, nextjs-deployment/build-output, patterns/error-boundaries]
---

## Overview

Production builds are minified, errors shown to users are redacted, and you
cannot open the dev overlay. Next.js gives you four tools to work with that:

| Tool | Use it for |
|---|---|
| `next start --inspect` (16.2) | Attach Chrome DevTools or VS Code to a production server |
| `instrumentation.ts` `onRequestError` | Report every server error with route and render context |
| `instrumentation.ts` `register` + OpenTelemetry | Traces and spans for requests, rendering and `fetch` |
| `error.digest` | Match a redacted error in the browser to the server log entry |

Source maps are the fifth piece: `productionBrowserSourceMaps` for client code,
and a debugging build with `--debug-prerender` when a prerender fails.

## Why it exists

In production, Next.js deliberately hides the details of Server Component errors
from the browser. A user sees a generic message and a digest, not your database
error. That protects you, but it means the useful information exists only on the
server, and you need a reliable path to get it out.

## When to use it

- **An error only happens in production** or only with production data.
- **A route is slow** and you need to know whether it is rendering, a `fetch`, or
  your database.
- **A user reports an error ID.** The digest ties their report to a log line.

## When not to use it

- **Bugs you can reproduce locally.** `next dev` has the overlay, full stack
  traces and Server Function logs. Start there.
- **Do not attach an inspector to a server that takes public traffic.** A paused
  breakpoint stops every request on that process. Use a separate instance.
- **Do not leave `--inspect` bound to a public interface.** The inspector can run
  arbitrary code in the process.

## Basic example

Report every server error with its digest and route:

```ts file="instrumentation.ts"
import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined;

  console.error(
    JSON.stringify({
      level: 'error',
      message,
      digest,
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    }),
  );
};
```

Show the digest to the user so support can find the entry:

```tsx file="app/dashboard/error.tsx"
'use client';

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div role="alert">
      <h2>Something went wrong loading your dashboard.</h2>
      {error.digest ? <p>Error reference: {error.digest}</p> : null}
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
```

## How it works

### Error digests

When a Server Component throws, Next.js replaces the message sent to the browser
with a generic one and attaches `digest`, a hash of the error. The original error
is logged on the server and passed to `onRequestError`. Errors thrown in Client
Components keep their original message.

`onRequestError` receives `error` typed as `unknown`. Narrow it before reading
`message` or `digest`. The error may not be the instance you threw, because React
can process it during Server Components rendering, which is why the digest is the
reliable identifier. `context.routeType` tells you whether the error came from
rendering (`'render'`), a Route Handler (`'route'`), a Server Action (`'action'`)
or proxy (`'proxy'`). Await any async reporting inside the function.

The error boundary itself is React's mechanism. See
[Error boundaries (React)](../patterns/error-boundaries.md) and
[Error boundaries](../nextjs-errors/error-boundaries.md) for `error.tsx`.

### `next start --inspect`

Since **16.2**, `next start` accepts `--inspect`, like `next dev`. The value is
passed to Node.js:

```bash
npx next start --inspect
```

The server prints a `ws://127.0.0.1:9229/...` URL. Open `chrome://inspect` and
choose the target under **Remote Target**, or attach VS Code. The default
address is loopback only.

For standalone output, which runs `node server.js` instead of `next start`, use
Node.js directly: `node --inspect server.js`. To pause before any code runs, the
docs say to use `NODE_OPTIONS=--inspect-brk` rather than a flag.

### Source maps

Production builds do not emit browser source maps, so your source is not
published. `productionBrowserSourceMaps: true` generates them next to the
JavaScript files, and Next.js serves them when requested. That makes minified
client stack traces readable, but it publishes your client source and increases
build time and memory.

For errors during prerendering, rebuild with `next build --debug-prerender`. It
turns off server minification, enables server source maps and continues past the
first error. Never deploy that build.

### OpenTelemetry

Next.js is instrumented with OpenTelemetry spans out of the box. The bundled docs
recommend the `@vercel/otel` package to register a tracer from `register`:

```bash
npm install @vercel/otel @opentelemetry/sdk-logs @opentelemetry/api-logs @opentelemetry/instrumentation
```

```ts file="instrumentation.ts"
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({ serviceName: 'shop-web' });
}
```

`register` runs once per server instance and must complete before the server
handles requests. For manual setup with `@opentelemetry/sdk-node`, import that
code only when `process.env.NEXT_RUNTIME === 'nodejs'`.

### CPU profiles

`next start --experimental-cpu-prof` writes a V8 CPU profile to `.next-profiles/`
when the process exits. Open it in Chrome DevTools' Performance panel.

> [!WARNING]
> **Experimental.** `--experimental-cpu-prof` is an experimental CLI flag. Use it
> on an instance you can restart, not as permanent production configuration.

## Server and client implications

- **Server errors are redacted for the client** in production. Log on the server;
  do not try to send the original message to the browser.
- **Client errors are not reported by `onRequestError`.** It only sees server
  errors. Report client errors from your `error.tsx` boundary or a client
  monitoring script.

## Common patterns

### One log line per error

Write structured JSON with the digest, route and request path, as in the basic
example. Your log platform can then index by `digest`, and a support ticket with
an error reference becomes a single search.

### Debug inside a container

Start a separate debugging container, bind the inspector inside it, and publish
the port only to your own machine:

```bash
docker run --rm -p 127.0.0.1:9229:9229 -p 127.0.0.1:3000:3000 -e NODE_OPTIONS="--inspect=0.0.0.0:9229" shop-web:1.4.0
```

`0.0.0.0` inside the container makes the port reachable through Docker's
mapping; `127.0.0.1` on the host keeps it off the network.

### Readable server stack traces for one route

Combine the debugging flags with a single route:

```bash
next build --debug-prerender --debug-build-paths="app/dashboard/page.tsx"
```

## Security considerations

- **The inspector is remote code execution by design.** Never expose port 9229
  beyond localhost or a private tunnel.
- **Public source maps reveal client code.** Leave `productionBrowserSourceMaps`
  off unless you accept that, or upload maps to your error tracker instead of
  serving them.
- **Do not log secrets.** `request.headers` in `onRequestError` includes cookies
  and authorization headers. Filter them before logging.

## Common mistakes

**Showing `error.message` from a Server Component error to users** and seeing a
generic text. That is intended. Show the digest.

**Reading `error.message` in `onRequestError` without narrowing.** The type is
`unknown`, and the value may not be an `Error`.

**Fire-and-forget reporting in `onRequestError`.** Await the call, or the report
may be lost.

**Attaching a debugger to the only production instance.** A breakpoint pauses
every user's request.

**Deploying a `--debug-prerender` build** to get better traces. Rebuild normally
after debugging.

**Importing Node.js-only telemetry SDKs at the top of `instrumentation.ts`.**
Load them conditionally on `NEXT_RUNTIME === 'nodejs'`.

## Related topics

- [Error boundaries](../nextjs-errors/error-boundaries.md): `error.tsx`, digests and
  `retry` in the App Router.
- [Error boundaries (React)](../patterns/error-boundaries.md): the React mechanism
  that catches render errors.
- [Self-hosting](./self-hosting.md): where logs and signals go on your own servers.
- [Build output](./build-output.md): `--debug-prerender` and reading build errors.
- [Profiling (React)](../performance/profiling.md): finding slow renders once you
  know which route is slow.
