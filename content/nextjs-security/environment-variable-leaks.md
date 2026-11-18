---
title: Environment variable leaks
description: How NEXT_PUBLIC_ inlining and Server-to-Client props put secrets into the browser, how to prove it by searching the build, and how server-only stops it.
group: nextjs-security
order: 40
status: current
related: [nextjs-backend/environment-variables, server-react/directives, nextjs-auth/data-access-layer, nextjs-rendering/client-components]
---

## Overview

Next.js decides at **build time** which environment variables reach the
browser. A variable whose name starts with `NEXT_PUBLIC_` is replaced with its
literal value in every JavaScript bundle that references it. That bundle is a
public file under `/_next/static`. There is no runtime lookup to protect and no
way to take the value back without rebuilding and rotating the secret.

Unprefixed variables stay on the server: in client bundles Next.js replaces them
with an empty string. They can still leak when server code hands them to the
client, most often as a prop on a Client Component.

This page exploits both leaks, fixes them with server-only reads and
`import 'server-only'`, and verifies the fix by searching the build output. The
`NEXT_PUBLIC_` pair runs in the
[security-pairs example app](../../examples/nextjs/security-pairs/README.md).

## The threat

A secret is anything that grants access when someone else holds it: a payment
provider's secret key, a database URL, a signing secret, an internal API token.
Three common paths put one into the browser:

1. **The `NEXT_PUBLIC_` prefix.** Someone needs a key in a Client Component,
   finds `process.env.PAYMENTS_SECRET_KEY` is empty there, and "fixes" it by
   renaming the variable to `NEXT_PUBLIC_PAYMENTS_SECRET_KEY`. The build inlines
   the value into a chunk.
2. **A secret passed as a prop.** A Server Component reads the secret correctly,
   then passes it (or a whole config object containing it) to a Client
   Component. Props are serialized into the RSC payload embedded in the HTML.
3. **A secret hardcoded in a shared module.** A module with a literal key is
   imported by a Client Component and bundled. Hardcoded secrets in Server
   Function source were also the target of CVE-2025-55183, a React Server
   Components source code exposure bug; runtime `process.env` reads were not
   exposed by it.

`next.config` has a separate `env` option that is documented as legacy. Values
set there are **always** included in the JavaScript bundle, whatever their
name. Never put a secret in it.

## Exploit

### Leak 1: a `NEXT_PUBLIC_` secret

```text file=".env.production"
NEXT_PUBLIC_PAYMENTS_SECRET_KEY=sk_live_51H8exampleSecret
```

```tsx file="app/checkout/payments-widget.tsx" vulnerable
'use client';

// Inlined at build time. The literal key ends up in a public JS chunk.
const PAYMENTS_KEY = process.env.NEXT_PUBLIC_PAYMENTS_SECRET_KEY;

export function PaymentsWidget() {
  async function startCheckout() {
    await fetch('https://api.payments.example/v1/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAYMENTS_KEY}` },
    });
  }

  return (
    <button type="button" onClick={startCheckout}>
      Pay now
    </button>
  );
}
```

Anyone can read it without an account. Download every script the page loads and
search them:

```bash
BASE=https://app.example.com
curl -s "$BASE/checkout" \
  | grep -o '/_next/static/[^"]*\.js' | sort -u \
  | while read -r chunk; do curl -s "$BASE$chunk" | grep -o 'sk_live_[A-Za-z0-9]*'; done
```

In a browser, the same search is DevTools, Sources, "Search all files" for
`sk_live_`. If you have the build output, it is one command:

```bash
grep -rl 'sk_live_' .next/static
```

The Network tab also shows the key in the `Authorization` header of every
checkout request.

### Leak 2: a server-read secret passed as a prop

```tsx file="app/settings/integrations/page.tsx" vulnerable
import { connection } from 'next/server';
import { IntegrationPanel } from './integration-panel';

export default async function IntegrationsPage() {
  await connection();

  // Read correctly on the server...
  const config = {
    webhookUrl: 'https://app.example.com/api/webhooks/payments',
    signingSecret: process.env.PAYMENTS_WEBHOOK_SECRET ?? '',
  };

  // ...then serialized into the page for the Client Component.
  return <IntegrationPanel config={config} />;
}
```

The value is in the HTML response, inside the RSC payload:

```bash
curl -s https://app.example.com/settings/integrations -H 'Cookie: session=<any-user>' | grep -o 'whsec_[A-Za-z0-9]*'
```

## Fix

### Read secrets only in a `server-only` module

Remove the prefix, rotate the leaked key (it is public now), and move every
read into one module that cannot be bundled for the client:

```text file=".env.production"
PAYMENTS_SECRET_KEY=sk_live_rotated_example
```

```ts file="lib/payments.ts"
import 'server-only';

function secretKey(): string {
  const key = process.env.PAYMENTS_SECRET_KEY;
  if (!key) throw new Error('PAYMENTS_SECRET_KEY is not set');
  return key;
}

export async function createCheckoutSession(amountCents: number): Promise<{ checkoutUrl: string }> {
  const response = await fetch('https://api.payments.example/v1/checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountCents }),
  });
  if (!response.ok) throw new Error('Checkout failed');
  const body = (await response.json()) as { url: string };
  return { checkoutUrl: body.url };
}
```

The client calls a Server Action and receives only the result:

```ts file="app/checkout/actions.ts"
'use server';

import { verifySession } from '@/lib/dal';
import { createCheckoutSession } from '@/lib/payments';

export async function startCheckout(): Promise<{ checkoutUrl: string } | { error: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Sign in required' };
  return createCheckoutSession(4_900);
}
```

```tsx file="app/checkout/payments-widget.tsx"
'use client';

import { startCheckout } from './actions';

export function PaymentsWidget() {
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await startCheckout();
        if ('checkoutUrl' in result) window.location.assign(result.checkoutUrl);
      }}
    >
      Pay now
    </button>
  );
}
```

### Pass DTOs, not configuration

For the prop leak, send the Client Component only what it renders:

```tsx file="app/settings/integrations/page.tsx"
import { IntegrationPanel } from './integration-panel';

export default function IntegrationsPage() {
  // The secret never enters render. The panel gets display data only.
  return (
    <IntegrationPanel
      webhookUrl="https://app.example.com/api/webhooks/payments"
      signingSecretConfigured={Boolean(process.env.PAYMENTS_WEBHOOK_SECRET)}
    />
  );
}
```

Why this works:

- **No prefix, no inlining.** Unprefixed variables are replaced with an empty
  string in client bundles, so the value cannot be compiled into a chunk.
- **`import 'server-only'` turns a mistake into a build error.** If a Client
  Component (or anything it imports) imports `lib/payments.ts`, `next build`
  fails, reporting that `server-only` cannot be imported from a Client Component
  module. The leak cannot ship silently.
- **Only the DAL and similar server modules touch `process.env`.** The data
  security guide recommends exactly that, which makes "who reads secrets?" a
  one-file review.
- **Props are an API.** A boolean `signingSecretConfigured` cannot leak a secret.

> [!WARNING]
> **Experimental.** React's taint APIs (`experimental_taintUniqueValue`,
> `experimental_taintObjectReference`) need `experimental.taint: true` in
> `next.config`. They are **Canary/experimental React APIs**: the flag switches
> the App Router to React's `experimental` channel, they are **not** in React
> 19.2 and **not** stable in React 19.3. Tainting throws when a marked value is
> passed to a Client Component, but it tracks references only: a copied object
> or a derived string such as `` `key:${secret}` `` is not tainted. Treat it as a
> backstop, never as the fix.

## Verify the fix

**Search the build output.** After `next build`, nothing under `.next/static` is
allowed to contain the secret. `grep` exits with status 1 when it finds nothing:

```bash
PAYMENTS_SECRET_KEY=sk_test_verify_marker_123 npx next build
grep -rl 'sk_test_verify_marker_123' .next/static; echo "grep exit: $?"
# grep exit: 1   (no file contains the key)
```

Use a unique fake value for this check so a match cannot be a coincidence. Do
not search `.next/server`: server bundles are supposed to use the key.

The example app automates the same check. `npm run test:leak` builds with two
fake keys and fails if the server-only key appears anywhere in `.next/static`,
and a Playwright test downloads every script `/fixed/env-leak` loads:

```bash
cd examples/nextjs
npm install
npm run test:leak --workspace @nextjs-examples/security-pairs
npm run test --workspace @nextjs-examples/security-pairs
```

**Prove `server-only` is wired.** Temporarily import `lib/payments.ts` from a
`"use client"` file and run `next build`. It must fail. If it builds, the
module is missing its `import 'server-only'` line.

**Check the HTML for the prop leak:**

```bash
curl -s https://app.example.com/settings/integrations -H 'Cookie: session=<any-user>' | grep -c 'whsec_'
# 0
```

## Common mistakes

**Treating the prefix as a naming convention.** `NEXT_PUBLIC_` is an
instruction to publish. Read every `NEXT_PUBLIC_` variable in `.env*` and your
deployment settings as "this is on the internet".

**Rotating nothing after a leak.** Removing the prefix and redeploying does not
un-publish old chunks. CDNs, caches and anyone who downloaded them still have
the key. Rotate it.

**Expecting runtime changes to a `NEXT_PUBLIC_` value.** Values are frozen at
build time. A Docker image promoted between environments keeps the build-time
value. Read per-environment values on the server at request time instead.

**Passing `process.env` or a config object to a Client Component.** Every field
is serialized. Pass the fields the UI needs.

**Hardcoding a secret "temporarily" in a Server Function.** Source exposure bugs
such as CVE-2025-55183 read source, not `process.env`. Keep secrets in the
environment and stay on a patched `next`.

**Confusing `server-only` with security.** It prevents accidental *bundling*.
It does not authorize anything. A Server Action that returns the secret still
leaks it.

## Related topics

- [Environment variables](../nextjs-backend/environment-variables.md) — load
  order, `.env` files and reading values at runtime.
- [Directives](../server-react/directives.md) — how `"use client"` pulls every
  import into the client bundle.
- [Client Components](../nextjs-rendering/client-components.md) — what crosses
  the Server-to-Client boundary as props.
- [Data Access Layer](../nextjs-auth/data-access-layer.md) — the one place that
  should read secrets and return DTOs.
- [Security advisories](./security-advisories.md) — the React Server Components
  source exposure fix.
