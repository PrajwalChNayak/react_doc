---
title: Security advisories
description: The 2026 Next.js and React Server Components advisories, why App Router apps patch by upgrading next, the safe version floor, and how to confirm what is deployed.
group: nextjs-security
order: 110
status: current
related: [nextjs-security/overview, nextjs-getting-started/installation, nextjs-deployment/self-hosting, server-react/overview]
---

## Overview

Some vulnerabilities are in your code; the pages in this group cover those. This
page covers the other kind: bugs in Next.js and in React Server Components that
are reachable **with no application bug at all**. The only fix is to run a
patched version.

The minimum safe version is **`next@16.3.3`**. This site pins and recommends
**`next@16.3.5`**.

```bash
npm install next@16.3.5
```

> [!WARNING]
> Two of the 2026 advisories are **Critical** unauthenticated remote code
> execution bugs affecting every 16.x release below 16.3.3. If you run any 16.x
> before 16.3.3, or any 15.x before 15.5.24, upgrade now.

## August 2026 security release

Published 25 August 2026 as `16.3.3` (Active LTS) and `15.5.24` (Maintenance
LTS). Two Critical vulnerabilities:

| Advisory | Issue | Affected `next` | Patched |
|---|---|---|---|
| GHSA-2xp9-vwfh-vxw4 (with upstream GHSA-g89c-p67h-r497) | Unauthenticated RCE in the **Image Optimization API** when it optimizes an attacker-controlled **AVIF** image. The bug is in `libheif`, reached through `sharp`. CVSS v4 9.5. | `>= 10.0.0 < 15.5.24`, `>= 16.0.0 < 16.3.3` | 15.5.24, 16.3.3 |
| CVE-2026-75604 / GHSA-p293-qw3h-jr36 | Unauthenticated RCE on **Windows-hosted** servers, in apps using **both the Pages Router and the App Router without Cache Components**. A path-traversal (CWE-22) issue. CVSS v3.1 9.0. | `>= 13.4.0 < 15.5.24`, `>= 16.0.0 < 16.3.3` | 15.5.24, 16.3.3 |

Details worth knowing:

- **AVIF optimization is disabled** in the patched releases, until an upstream
  `libheif` fix propagates. If you rely on serving AVIF through `/_next/image`,
  expect it to stop being optimized after upgrading; the vulnerability is the
  price of keeping it on.
- **The Windows RCE is Windows-only.** Linux and macOS hosts are not affected by
  CVE-2026-75604. There is **no workaround**: the advisory says to upgrade
  immediately if the server runs on a Windows filesystem.
- GHSA-g89c-p67h-r497 is the upstream `libheif` advisory. It is cited by the
  Next.js post, but the GitHub advisory API returned 404 for it, so no further
  details are reproduced here.

## July 2026 security release

Published 20 July 2026 as `16.2.11` (Active LTS) and `15.5.21` (Maintenance
LTS), and folded into `16.3.0`. It fixed nine issues. The ones that matter most
for the code in this group:

- **CVE-2026-64641 (High)** — Denial of Service in App Router apps with at least
  one Server Action; crafted requests cause excessive CPU and block the process.
- **CVE-2026-64642 (High)** — Proxy/middleware **bypass** in App Router apps
  built with **Turbopack** and a **single** `i18n.locales` entry. Authentication
  or security checks in `proxy.ts` are skipped. This is why
  [Proxy is not authorization](./proxy-is-not-authorization.md) insists on a data
  layer check.
- **CVE-2026-64645 (High)** — SSRF (for rewrites) and Open Redirect (for
  redirects) when a `rewrites()` / `redirects()` rule builds its destination
  hostname from request-controlled input. See [Open redirects](./open-redirects.md).
- **CVE-2026-64649 (High)** — SSRF in Server Actions on custom servers when the
  attacker controls Host-associated headers.
- **CVE-2026-64643 (Medium)** — Unauthenticated disclosure of internal Server
  Function (`"use server"` / `use cache`) endpoint IDs, useful for reconnaissance.
  It is why [Server Actions authorization](./server-actions-authorization.md)
  treats action IDs as public.
- The remaining Medium issues were an SVG-based DoS in the Image Optimization API
  (CVE-2026-64644), an unbounded Server Action payload on the Edge runtime
  (CVE-2026-64646), and two `fetch` cache-confusion bugs (CVE-2026-64647,
  CVE-2026-64648).

## React Server Components advisories

React had its own two rounds, tracked in the React section's
[Server React overview](../server-react/overview.md):

- **CVE-2025-55182** (CVSS 10.0, unauthenticated RCE) — fixed in `react-server-dom-*`
  19.0.1 / 19.1.2 / 19.2.1.
- **CVE-2025-55183** (source code exposure), **CVE-2025-55184**,
  **CVE-2025-67779** and **CVE-2026-23864** (Denial of Service) — fixed only in
  **19.0.4 / 19.1.5 / 19.2.4**. The 19.0.3 / 19.1.4 / 19.2.3 patches were
  incomplete.

**Why upgrading `next` is what patches these in the App Router.** The App Router
does not use the `react` version in your `package.json`. It runs a React build
vendored inside `next` (`next@16.3.5` ships a `19.3.0-canary` build). So bumping
`react` and `react-dom` in `package.json` does **not** change the React that
renders your Server Components; only upgrading `next` does. A recent `next` line
already includes patched RSC packages. The `react` version in `package.json`
still matters for the Pages Router, which uses it directly.

## How to confirm the installed and deployed version

Being patched in your lockfile is not the same as being patched in production. A
CDN or platform can serve an older build. Check both.

**In development / CI:**

```bash
# What the tree actually resolved (not just the range in package.json):
npm ls next

# The exact version on disk:
node -p "require('next/package.json').version"

# A fuller report (also prints the resolved next version):
npx next info
```

`next info` prints an environment report including the resolved `next`, `react`
and `react-dom` versions and flags whether a newer `next` exists. It is the
quickest single command.

**In the build image / container**, read the file that shipped, since the
lockfile on your laptop may differ from what was built:

```bash
cat node_modules/next/package.json | grep '"version"'
```

Bake this into CI as a gate: fail the build if the resolved version is below
`16.3.3`.

> [!NOTE]
> Do not rely on a response header to read the deployed version. Next.js sends
> an `x-powered-by: Next.js` header by default (removable with
> `poweredByHeader: false`), but it carries **no version number**. Confirm the
> version from the build artifact or a health endpoint you control, not from
> response headers.

A small internal endpoint that returns the version is a reliable production
check:

```ts file="app/api/_internal/version/route.ts"
import { verifyAdmin } from '@/lib/dal';
import nextPkg from 'next/package.json';

export async function GET() {
  if (!(await verifyAdmin())) return new Response('Not found', { status: 404 });
  return Response.json({ next: nextPkg.version });
}
```

Guard it (here, admins only) so you are not advertising your version to
attackers.

## How to stay informed

- **Next.js security releases** are announced on the Vercel/Next.js blog, now on
  a pre-announced schedule, and in the
  [GitHub Security Advisories](https://github.com/vercel/next.js/security/advisories)
  for `vercel/next.js`.
- **React advisories** are posted on the React blog and in the React repository's
  advisories.
- **`npm audit`** flags known-vulnerable versions in your tree against the GitHub
  advisory database:

  ```bash
  npm audit
  ```

- **Automated updates** (Dependabot, Renovate) open PRs for patched releases.
  Upgrade Next.js with the codemod so config and API changes come along:

  ```bash
  npx @next/codemod@canary upgrade latest
  ```

## Common mistakes

**Upgrading `react` to patch an App Router app.** It has no effect on the
vendored React the App Router runs. Upgrade `next`.

**Stopping at a partial patch.** For the RSC DoS chain, 19.2.3 and its siblings
were incomplete. The floor is 19.2.4 / 19.1.5 / 19.0.4.

**Assuming Windows is like Linux.** CVE-2026-75604 is a Critical RCE on Windows
hosts specifically, with no workaround.

**Leaving AVIF assumptions in place after upgrading.** The August patch disables
AVIF optimization. Re-check any pipeline that expected optimized AVIF.

**Trusting the lockfile as proof of production.** Verify the version in the built
image and, ideally, from a guarded runtime endpoint.

## Related topics

- [Security overview](./overview.md) — the checklist and the rest of this group.
- [Installation](../nextjs-getting-started/installation.md) — pinning
  `next@16.3.5` in a new project.
- [Self-hosting](../nextjs-deployment/self-hosting.md) — making sure the deployed
  build is the patched one.
- [Server React overview](../server-react/overview.md) — the React Server
  Components advisories and version floor.
- [Proxy is not authorization](./proxy-is-not-authorization.md) — the concrete
  impact of the CVE-2026-64642 proxy bypass.
