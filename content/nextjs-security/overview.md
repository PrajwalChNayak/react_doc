---
title: Security in Next.js
description: The attack surface a Next.js 16.3 app exposes, the version floor to patch to, and a checklist that links every security walkthrough.
group: nextjs-security
order: 10
status: current
related: [nextjs-security/security-advisories, nextjs-security/server-actions-authorization, nextjs-auth/data-access-layer, server-react/server-functions]
---

## Overview

A Next.js app is a web server. Every page, Route Handler and Server Action it
builds is reachable over HTTP by anyone, with any headers, cookies and body they
choose. Most Next.js vulnerabilities come from forgetting one of those entry
points, or from trusting something the framework does for convenience (hiding a
button, a `proxy.ts` matcher, an environment variable prefix) as if it were a
security boundary.

This group is a set of walkthroughs. Each page after this one follows the same
shape: **the threat**, a concrete **exploit** against vulnerable code, the
**fix**, and a way to **verify the fix** with a test, a `curl` command or a build
error. Four of the pairs run for real in the
[security-pairs example app](../../examples/nextjs/security-pairs/README.md).

> [!WARNING]
> **Patch first.** The minimum safe version is **`next@16.3.3`**. The
> [August 2026 security release](./security-advisories.md) fixed two Critical
> remote code execution bugs in every 16.x release below 16.3.3. This site pins
> **16.3.5**.

```bash
npm install next@16.3.5
```

## Why it exists

Server Components, Server Actions and Route Handlers put backend code in the
same files as UI code. That is the productivity win of the App Router, and it is
also why security bugs slip in: a function that *looks* like a component helper
is a public POST endpoint, and a variable that *looks* like configuration is
compiled into the browser bundle.

React documents the model-level rules on
[Server Functions](../server-react/server-functions.md) and
[directives](../server-react/directives.md). The pages here cover what Next.js
adds: how it exposes those functions, what `proxy.ts` can and cannot guarantee,
how the build inlines environment variables, and the framework advisories you
must patch.

## How it works

### The attack surface

| Entry point | What an attacker controls | Where it is covered |
|---|---|---|
| **Server Actions** (`"use server"`) | A POST to any page that uses the action, with the action ID and arbitrary arguments. Hiding the form does not remove the endpoint. | [Server Actions authorization](./server-actions-authorization.md), [Input validation](./input-validation.md) |
| **Route Handlers** (`route.ts`) | Method, path params, query, headers, body, `Origin`. | [IDOR](./idor.md), [CORS](./cors.md), [SQL injection](./sql-injection.md), [File uploads](./file-uploads.md) |
| **`proxy.ts`** | Which paths it sees depends on its `matcher`, rewrites and framework bugs. It is an optimistic filter, not an authorization layer. | [Proxy is not authorization](./proxy-is-not-authorization.md) |
| **Build-time env inlining** | Every `NEXT_PUBLIC_` value, and anything a Client Component imports, ships to the browser. | [Environment variable leaks](./environment-variable-leaks.md) |
| **`redirect()` and redirects config** | `next`, `callbackUrl` and similar parameters; request-controlled hostnames in `rewrites()` / `redirects()`. | [Open redirects](./open-redirects.md) |
| **Image Optimization API** (`/_next/image`) | The image bytes it optimizes. The August 2026 AVIF bug made this an RCE. | [Security advisories](./security-advisories.md) |
| **RSC payloads** | Everything a Server Component passes as props to a Client Component is serialized into the page. | [Environment variable leaks](./environment-variable-leaks.md), [Data Access Layer](../nextjs-auth/data-access-layer.md) |
| **The framework itself** | Framework and React Server Components bugs, reachable with no application bug at all. | [Security advisories](./security-advisories.md) |

### Where authorization belongs

The Next.js data security guide recommends a **Data Access Layer**: a
`server-only` module that authenticates, authorizes per resource and returns
minimal DTOs. Every page, action and Route Handler reads protected data through
it. `proxy.ts` and layouts may add optimistic redirects for UX, but they are
never the only check.

[Data Access Layer](../nextjs-auth/data-access-layer.md) builds that module.
Most fixes in this group call into it.

## Common patterns

### Checklist

Work through this for every Next.js app you ship.

- [ ] **Version.** `next` is at least **16.3.3** in the lockfile *and* in the
  deployed build. Upgrading `next` is also what patches React Server Components
  in the App Router. See [Security advisories](./security-advisories.md).
- [ ] **Server Actions.** Every `"use server"` function authenticates,
  authorizes and validates *inside* the function. See
  [Server Actions authorization](./server-actions-authorization.md).
- [ ] **Proxy.** No data is protected *only* by `proxy.ts`. See
  [Proxy is not authorization](./proxy-is-not-authorization.md).
- [ ] **Secrets.** No secret has a `NEXT_PUBLIC_` prefix, and modules that read
  secrets start with `import 'server-only'`. See
  [Environment variable leaks](./environment-variable-leaks.md).
- [ ] **Object access.** Every lookup by ID checks ownership, not only sign-in.
  See [IDOR](./idor.md).
- [ ] **SQL.** No user input is concatenated into SQL, including `ORDER BY`
  columns. See [SQL injection](./sql-injection.md).
- [ ] **Redirects.** Every redirect target taken from the request is a
  same-origin relative path or on an allow-list. See
  [Open redirects](./open-redirects.md).
- [ ] **Input.** Every server entry point parses its input with a schema and
  picks fields explicitly. See [Input validation](./input-validation.md).
- [ ] **CORS.** Cross-origin Route Handlers use an explicit origin allow-list,
  never a reflected origin with credentials. See [CORS](./cors.md).
- [ ] **Uploads.** Size limits, magic-byte type checks, random names, storage
  outside `public/`. See [File uploads](./file-uploads.md).
- [ ] **Content Security Policy.** A CSP limits the damage of any XSS that gets
  through. The bundled Next.js guide
  (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`)
  shows nonces set from `proxy.ts`. Nonces require dynamic rendering, so decide
  per route.

### Audit order

The data security guide suggests where to spend review time: the Data Access
Layer, every `"use client"` file's props (are they receiving private data?),
every `"use server"` file, every folder with brackets (`[param]` is user input),
and `proxy.ts` plus every `route.ts`.

## Common mistakes

**Treating a UI rule as a security rule.** Not rendering a button, a link or a
page does not remove the endpoint behind it.

**Upgrading `react` to patch an App Router app.** The App Router uses the React
build vendored inside `next`. Only upgrading `next` changes it.

**Relying on framework hardening alone.** Encrypted action IDs, the Server
Action `Origin` check and the 1 MB body limit reduce risk. The Next.js docs say
explicitly that they do not replace authentication and authorization inside
each action.

**Securing the page but not the data.** A page-level `redirect('/login')` does
not protect the Server Actions defined on that page or the Route Handler that
returns the same data.

**Checking once, at the edge.** Authorization that runs in `proxy.ts` or a layout
and nowhere else is bypassed by any request that does not pass through that
exact code path.

## Related topics

- [Security advisories](./security-advisories.md) — the patched versions and how
  to confirm what is deployed.
- [Server Actions authorization](./server-actions-authorization.md) — the most
  common Next.js-specific vulnerability.
- [Data Access Layer](../nextjs-auth/data-access-layer.md) — the module most
  fixes in this group call.
- [Server Functions](../server-react/server-functions.md) — React's rules for
  the public endpoints that Server Actions are built on.
- [Directives](../server-react/directives.md) — what `"use client"` and
  `"use server"` actually mark.
