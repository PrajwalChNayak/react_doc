---
title: AI coding agents
description: How Next.js 16.3 points coding agents at version-matched docs with AGENTS.md, and gives them runtime visibility through next dev and the MCP server.
group: nextjs-getting-started
order: 60
status: current
since: "16.3"
related: [nextjs-getting-started/installation, nextjs-getting-started/dev-and-build, nextjs-getting-started/project-structure, server-react/overview]
---

## Overview

AI coding agents are trained on years of Next.js material, and most of it
describes Next.js 13 to 15: synchronous `params`, `middleware.ts`, implicit
`fetch` caching. Next.js 16 changed all of those. An agent working from memory
writes code that no longer compiles, or compiles and behaves differently.

Next.js addresses this in three layers:

| Layer | What it gives the agent | Since |
|---|---|---|
| Bundled docs | The full documentation for the installed version, at `node_modules/next/dist/docs/` | 16.2 |
| `AGENTS.md` | An instruction to read those docs before writing code. Written by `create-next-app` (16.2) and by `next dev` (16.3). | 16.2 / 16.3 |
| Runtime visibility | Browser errors in the dev terminal, a dev-server lockfile, and an MCP endpoint in `next dev` | 16.x |

## Why it exists

Documentation on a website describes the latest release, and an agent's training
data describes whatever was common when it was trained. Neither matches the
version in your lockfile. Shipping the docs inside the `next` package means the
agent reads exactly the version you run, offline, and upgrading `next` upgrades
the docs with it.

This site follows the same rule: its Next.js pages were written against the
docs bundled with `next@16.3.5`.

## When to use it

- Keep the generated `AGENTS.md` in any project where anyone uses a coding agent.
  It costs nothing for people who do not.
- Configure the MCP server when an agent works against a running dev server and
  needs to see errors, routes and logs that only exist at runtime.

## When not to use it

- Do not rely on `AGENTS.md` as a security control. It is advice for a
  cooperative agent, not a policy. Review agent-written Server Actions and
  Route Handlers like any other code; see [Security](../nextjs-security/overview.md).
- Do not paste the whole bundled docs directory into a prompt. The point of the
  pointer is that the agent reads only the page it needs.

## Basic example

### New projects

`create-next-app` writes `AGENTS.md` and a `CLAUDE.md` that imports it, by
default:

```bash
npx create-next-app@latest my-app --yes
```

Pass `--no-agents-md` to skip both files.

### Existing projects on 16.3

Run `next dev`. When Next.js detects an AI coding agent in the environment and
the managed block is missing, it creates `AGENTS.md` and `CLAUDE.md` at the
project root, or inserts the block into the files you already have:

```text file="AGENTS.md"
# Project conventions

Use pnpm. Run the typecheck script before committing.

<!-- BEGIN:nextjs-agent-rules -->
(managed by next dev: tells the agent this Next.js version has breaking
changes and to read the relevant guide in node_modules/next/dist/docs/
before writing code)
<!-- END:nextjs-agent-rules -->
```

```text file="CLAUDE.md"
@AGENTS.md
```

Everything **outside** the `BEGIN:nextjs-agent-rules` / `END:nextjs-agent-rules`
markers is yours and is preserved. Everything inside is rewritten by `next dev`
to match the installed version. Commit the block: if you delete it from a diff,
the next `next dev` run adds it back.

## How it works

### The bundled docs

Installing `next` installs its documentation:

```text
node_modules/next/dist/docs/
├── 01-app/
│   ├── 01-getting-started/
│   ├── 02-guides/
│   └── 03-api-reference/
├── 02-pages/
├── 03-architecture/
└── index.mdx
```

The layout mirrors nextjs.org/docs. The App Router material is under `01-app/`.
Because the files are part of the package, they are always the version your app
runs.

### What `next dev` writes, and when

- Detection happens at dev-server start. If no agent is detected, nothing is
  written.
- If `AGENTS.md` exists, the block goes there. If only `CLAUDE.md` exists, the
  block goes there instead. If neither exists, both are created.
- Blocks written by the older `agents-md` codemod are replaced, so you do not
  end up with two.

To turn this off, set `agentRules` to `false`:

```ts file="next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
};

export default nextConfig;
```

The Next.js team recommends leaving it on, citing its agent evaluations at
nextjs.org/evals.

### Earlier versions

| Version | Bundled docs | `AGENTS.md` |
|---|---|---|
| 16.3 | Yes | Written by `create-next-app` and maintained by `next dev` |
| 16.2 | Yes | Written by `create-next-app`. For an existing project, add one yourself that points at `node_modules/next/dist/docs/`. |
| 16.1 and earlier | No | Run `npx @next/codemod@canary agents-md`, which downloads version-matched docs to `.next-docs/` and indexes them |

Anything below 16.3.3 is below the security floor anyway. See
[Installation](./installation.md).

### Docs over the network

Agents that fetch pages rather than read `node_modules` can request Markdown:
append `.md` to any nextjs.org/docs URL, or send `Accept: text/markdown`. The
index at `nextjs.org/docs/llms.txt` and the single file `llms-full.txt` follow
the `llms.txt` convention. Per-error pages under `/docs/messages` are only
available this way; they are not bundled.

## Server and client implications

Much of what an agent gets wrong in Next.js is invisible in the source: a
hydration mismatch, a browser console error, a route that cannot prerender.
`next dev` surfaces these where an agent can read them:

- **Browser errors in the terminal.** `next dev` forwards browser console errors
  and warnings to the terminal output the agent already reads.
- **One dev server per project.** `next dev` writes its PID, port and URL to
  `.next/dev/lock`. An agent that runs `next dev` again gets the existing
  server's URL instead of a second server on another port.
- **Actionable build errors.** With Cache Components enabled, a route that
  cannot prerender prints a menu of labeled fixes (stream behind Suspense, cache
  with `"use cache"`, or allow a blocking route) with a link to an error page
  written for agents. The same text appears in `next build` output in CI.

## Common patterns

### Connect the Next.js MCP server

Next.js 16 and later expose an MCP endpoint at `/_next/mcp` inside the
**development server**. The `next-devtools-mcp` package discovers running dev
servers and connects agents to them. Add it to `.mcp.json` at the project root:

```json file=".mcp.json"
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

Then run `npm run dev`. Tools the agent gains include `get_errors` (build,
runtime and type errors), `get_routes`, `get_page_metadata`,
`get_project_metadata`, `get_logs`, and `get_server_action_by_id`, which maps a
Server Action ID back to its source file. Two more, `get_compilation_issues` and
`compile_route`, report whether code compiles without a full `next build`; they
require Turbopack.

> [!NOTE]
> `@latest` in `.mcp.json` fetches a new version of `next-devtools-mcp` whenever
> the agent starts. Pin a version if your team reviews tool updates.

### Ask the agent to catch up after an upgrade

After `npx next upgrade`, the bundled docs change with the version. Ask the
agent to read what changed in `node_modules/next/dist/docs/` before continuing
work, rather than trusting what it did in the previous version.

### Skills for multi-step migrations

The Next.js repository publishes agent Skills for workflows rather than lookups,
such as adopting Cache Components or Partial Prefetching across an app. They are
installed with the `skills` CLI, for example
`npx skills add vercel/next.js --skill next-dev-loop`. Read a Skill before
running it, as you would any script.

## Security considerations

- The MCP endpoint is part of `next dev`. Do not expose a development server to
  an untrusted network, with or without an agent attached.
- An agent that follows `AGENTS.md` still writes Server Actions and Route
  Handlers, which are public endpoints. Every one needs authentication and
  authorization checks. See
  [Server Actions authorization](../nextjs-security/server-actions-authorization.md).

## Common mistakes

- **Deleting the managed block from every diff.** `next dev` puts it back.
  Commit it once.
- **Editing inside the markers.** Your changes are overwritten. Put project
  instructions outside them.
- **Trusting an agent's Next.js knowledge over the bundled docs.** If its code
  uses `middleware.ts`, synchronous `params`, or a single-argument
  `revalidateTag`, it is working from pre-16 training data. Point it at the
  bundled docs.
- **Running a second `next dev` from the agent** in another terminal instead of
  using the URL the lockfile reports.
- **Expecting the MCP server to work against `next start`.** It connects to the
  development server.
- **Following the 16.1 codemod instructions on 16.3.** The docs are already
  bundled; the `.next-docs/` copy is unnecessary.

## Related topics

- [Installation](./installation.md) — `create-next-app` and its `--no-agents-md`
  flag.
- [Dev and build](./dev-and-build.md) — the dev server, its output directory and
  lockfile.
- [Project structure](./project-structure.md) — where `AGENTS.md`, `CLAUDE.md`
  and `.mcp.json` sit among the other root files.
- [Next.js 15 to 16](../nextjs-migration/next-15-to-16.md) — the changes that make
  agents' training data stale.
- [Server React](../server-react/overview.md) — the React model an agent must
  understand before any framework docs help.
