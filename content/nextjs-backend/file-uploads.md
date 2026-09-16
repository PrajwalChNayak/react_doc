---
title: File uploads
description: Accept files with request.formData() in Route Handlers and Server Actions, enforce size limits, and stream large uploads to storage.
group: nextjs-backend
order: 60
status: current
related: [nextjs-security/file-uploads, nextjs-backend/route-handlers, nextjs-mutations/server-actions, patterns/forms-and-actions]
---

## Overview

Next.js has no upload-specific API. Uploads arrive as ordinary requests, and you
read them with the Web platform:

| Where | How you read the file | Size limit Next.js applies |
|---|---|---|
| Server Action | The `FormData` argument | `experimental.serverActions.bodySizeLimit`, **1 MB** by default |
| Route Handler, `multipart/form-data` | `await request.formData()` | None documented. Enforce your own. |
| Route Handler, raw body | `request.body` as a `ReadableStream` | None documented. Enforce your own. |
| Any route matched by `proxy.ts` | — | Proxy buffers at most **10 MB** of the body for re-reading (see below) |

Uploaded files are `File` objects, with `name`, `type`, `size`, `arrayBuffer()`
and `stream()`.

## Why it exists

Uploads are where "the body is just JSON" assumptions break. A file can be larger
than the memory you want to spend on one request, arrives with a client-chosen
name and MIME type, and has to end up somewhere durable that is not your server's
local disk on most hosts.

This page covers the Next.js mechanics: which API to call, which limits apply,
and how to avoid buffering. What an attacker does with an upload endpoint, and
the full hardening checklist, is in
[File uploads (security)](../nextjs-security/file-uploads.md).

## When to use it

- **Server Action** for small files submitted from your own UI: avatars,
  attachments under a few megabytes. You get progressive enhancement and
  revalidation.
- **Route Handler with `formData()`** for small and medium files from other
  clients, such as a mobile app or a script.
- **Route Handler streaming `request.body`** when files can be large and you
  want constant memory use.

## When not to use it

For large files (video, datasets, backups), do not route the bytes through your
Next.js server at all. Have a Route Handler or Server Action authorize the upload
and return a short-lived, pre-signed upload URL from your storage provider, let
the browser upload directly to storage, then record the result. Your server
never holds the file, and serverless time and body limits stop mattering. The
exact API is your storage provider's.

Do not write uploads to the local filesystem on serverless hosts. The Next.js
docs note that such environments may not support writing to the file system, and
anything written is not shared between instances.

## Basic example

A Server Action for an avatar, with the checks in order: session, presence,
size, type, then storage.

```ts file="app/profile/avatar/actions.ts"
'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { storeObject } from '@/lib/storage';

const MAX_BYTES = 900 * 1024; // Leave room under the 1 MB action body limit.
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export type AvatarState = { error: string | null };

export async function uploadAvatar(_previous: AvatarState, formData: FormData): Promise<AvatarState> {
  const session = await requireSession();
  if (!session) return { error: 'Sign in to change your avatar.' };

  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image to upload.' };
  }
  if (file.size > MAX_BYTES) {
    return { error: 'The image must be smaller than 900 KB.' };
  }
  // file.type is what the browser claims. The security page shows how to check
  // the actual bytes before trusting it.
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: 'Use a PNG, JPEG or WebP image.' };
  }

  // Never use file.name as a storage key. Generate one.
  const key = `avatars/${session.userId}/${crypto.randomUUID()}`;
  await storeObject(key, file.stream(), { contentType: file.type, size: file.size });

  revalidatePath('/profile');
  return { error: null };
}
```

```tsx file="app/profile/avatar/avatar-form.tsx"
'use client';

import { useActionState } from 'react';
import { uploadAvatar, type AvatarState } from './actions';

export function AvatarForm() {
  const [state, formAction, isPending] = useActionState<AvatarState, FormData>(uploadAvatar, {
    error: null,
  });

  return (
    <form action={formAction}>
      <label htmlFor="avatar">Avatar</label>
      <input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Uploading…' : 'Upload'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

With a Server Action you do not set `encType`: React submits `FormData`, files
included. The form-handling side is explained in
[Forms and actions](../patterns/forms-and-actions.md) and
[useActionState](../hooks/use-action-state.md).

## How it works

### Server Action body limit

Server Action requests are capped at **1 MB** by default, to limit memory use and
denial-of-service risk. Raise it in `next.config.ts`. In Next.js 16.3.5 the
option is under `experimental`, as the bundled docs show:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
```

The limit applies to the raw request body, including the multipart boundaries
and part headers. The docs suggest leaving 10–20 KB of headroom above your
largest expected file. The setting applies to every Server Action in the app, so
keep it as low as your largest legitimate upload.

### Route Handlers with `formData()`

```ts file="app/api/uploads/route.ts"
import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { storeObject } from '@/lib/storage';

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Reject obviously oversized requests before reading the body.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  const key = `uploads/${user.id}/${crypto.randomUUID()}`;
  await storeObject(key, file.stream(), { contentType: 'application/octet-stream', size: file.size });
  return NextResponse.json({ key }, { status: 201 });
}
```

`request.formData()` parses the **whole** multipart body before it returns, so
the size check on `file.size` happens after the bytes are already in memory.
`Content-Length` can be missing or false, so the early check is a cheap filter,
not a guarantee. For files large enough that this matters, stream instead.

### Streaming a raw body to storage

Send the file as the request body (`PUT` with the file's bytes, not multipart)
and count bytes while you stream them, aborting past the limit:

```ts file="app/api/uploads/[uploadId]/route.ts"
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { NextRequest } from 'next/server';

const MAX_BYTES = 500 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'uploads');

export async function PUT(request: NextRequest, context: RouteContext<'/api/uploads/[uploadId]'>) {
  const { uploadId } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(uploadId)) {
    return new Response('Invalid upload id', { status: 400 });
  }
  if (!request.body) {
    return new Response('Empty body', { status: 400 });
  }

  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      callback(received > MAX_BYTES ? new Error('LIMIT') : null, chunk);
    },
  });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const destination = path.join(UPLOAD_DIR, uploadId);

  try {
    await pipeline(
      Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>),
      limit,
      createWriteStream(destination, { flags: 'wx' }),
    );
  } catch (error) {
    await rm(destination, { force: true });
    if (error instanceof Error && error.message === 'LIMIT') {
      return new Response('File too large', { status: 413 });
    }
    throw error;
  }

  return Response.json({ uploadId, bytes: received }, { status: 201 });
}
```

`pipeline` applies backpressure: if the disk (or an object-storage client's
writable stream) is slow, reading from the request slows down instead of
buffering. Memory use stays roughly constant regardless of file size. This
example writes to local disk to stay self-contained; on a serverless host,
replace the write stream with your storage provider's streaming upload. The
authorization check is omitted to keep the streaming visible, and a real handler
needs it first.

The cast on `request.body` is only there because TypeScript's DOM and Node.js
typings describe the same Web `ReadableStream` with two different types.

### Uploads through `proxy.ts`

When a `proxy.ts` matcher covers an upload route, Next.js clones and buffers the
request body in memory so both proxy and the route can read it.

> [!WARNING]
> **Experimental.** `experimental.proxyClientMaxBodySize` sets the size of that
> buffer, **10 MB** by default. If a body exceeds it, Next.js buffers only up to
> the limit, logs a warning, and lets the request continue with a **truncated
> body**. It does not return an error. Exclude large-upload routes from your
> matcher, or raise the limit, and always verify the received size in the
> handler.

```ts file="proxy.ts"
import { type NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('x-frame-options', 'DENY');
  return response;
}

export const config = {
  // Upload routes are excluded so their bodies are never buffered by proxy.
  matcher: ['/((?!api/uploads|_next/static|_next/image|favicon.ico).*)'],
};
```

## Server and client implications

The browser builds the multipart body. On the client, `accept`, `required` and a
size check in JavaScript improve the experience, and none of them are
security checks: any client can send any bytes to the action or handler.

A Server Action receives `File` objects inside `FormData` exactly as a Route
Handler does. Server Actions are public endpoints too; see
[Server Actions](../nextjs-mutations/server-actions.md).

## Caching implications

Upload handlers are `POST` or `PUT` and are never cached. After storing a file,
refresh what displays it: `revalidatePath` or `updateTag` from a Server Action,
or `revalidateTag(tag, 'max')` from a Route Handler. See
[Revalidating after mutations](../nextjs-mutations/revalidating-after-mutations.md).

## Common patterns

- **Pre-signed direct uploads** for anything large, with the Next.js server only
  issuing the URL and recording the result.
- **Generated storage keys** (`crypto.randomUUID()`), never the client's
  filename, and serve files from a separate domain or with
  `Content-Disposition: attachment`.
- **Magic-byte sniffing** before trusting `file.type`. The ecosystem package for
  this is `file-type`; see the security page linked below.
- **`maxDuration`** on the upload route when a platform's default function time
  limit is shorter than a slow client's upload.
- **Post-processing in the background** (thumbnails, virus scanning) with a queue,
  not inline; see [Background work](./background-work.md).

## Security considerations

Apply at least these defaults, and read
[File uploads (security)](../nextjs-security/file-uploads.md) for the attack
walkthroughs:

- Authenticate and authorize before reading the body.
- Enforce a byte limit while reading, not after.
- Allow-list types by content, not by extension or `file.type`.
- Generate storage keys; never join `file.name` into a path.
- Store outside the web root and do not serve user files from your app's origin
  with an executable content type.

## Common mistakes

- **Raising `bodySizeLimit` to hundreds of megabytes** instead of uploading
  directly to storage.
- **Putting `serverActions` at the top level of `next.config`.** In 16.3.5 it is
  under `experimental`.
- **Checking `file.size` after `formData()`** and assuming memory was protected.
- **Letting `proxy.ts` match large uploads** and receiving silently truncated
  bodies.
- **Trusting `file.type` or the extension.**
- **Writing to `process.cwd()` on a serverless host.**
- **Using `file.name` as the storage path**, which enables overwrites and path
  traversal.
- **Setting `encType` manually on a Server Action form**, which React already
  handles.

## Related topics

- [File uploads (security)](../nextjs-security/file-uploads.md) — content
  sniffing, storage isolation, and the exploits these defaults prevent.
- [Forms and actions](../patterns/forms-and-actions.md) — the React form model a
  Server Action upload uses.
- [Server Actions](../nextjs-mutations/server-actions.md) — the Next.js wiring,
  including `bodySizeLimit` and `allowedOrigins`.
- [Route Handlers](./route-handlers.md) — request body APIs for non-UI clients.
- [Streaming responses](./streaming-responses.md) — the same Web Streams and
  backpressure ideas, in the other direction.
