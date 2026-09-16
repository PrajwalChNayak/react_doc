# Minimal Next.js 16.3 app

The smallest correct App Router app for Next.js 16.3.5. It backs the
**Getting Started** pages of the Next.js section of this site.

## What it demonstrates

- A root layout (`app/layout.tsx`) that renders `<html>` and `<body>`, typed with
  the generated global `LayoutProps<'/'>`, exactly as `create-next-app` writes it.
- A home page (`app/page.tsx`) that is an async Server Component.
- One dynamic route (`app/blog/[slug]/page.tsx`) that **awaits `params`**, typed
  with the generated global `PageProps<'/blog/[slug]'>`, prerenders known slugs
  with `generateStaticParams`, and calls `notFound()` for unknown ones.
- A typed, empty `next.config.ts`.
- The `@/*` import alias from the `create-next-app` `tsconfig.json`.

It deliberately has **no Tailwind CSS, no ESLint and no `AGENTS.md`**.
`create-next-app` adds Tailwind CSS, ESLint and `AGENTS.md` by default; this app
leaves them out so every file in it is one you need to understand.

## Doc pages it backs

- [Introduction](../../../content/nextjs-getting-started/introduction.md)
- [Installation](../../../content/nextjs-getting-started/installation.md)
- [Project structure](../../../content/nextjs-getting-started/project-structure.md)
- [Dev and build](../../../content/nextjs-getting-started/dev-and-build.md)
- [TypeScript](../../../content/nextjs-getting-started/typescript.md)

## Run it from a fresh clone

Requires Node.js 20.9.0 or later. All example apps share one npm workspace.

```bash
cd examples/nextjs
npm install
npm run dev --workspace @nextjs-examples/minimal
```

Open http://localhost:3000, then http://localhost:3000/blog/hello-next.
http://localhost:3000/blog/does-not-exist renders the built-in 404 page.

Production build and server:

```bash
npm run build --workspace @nextjs-examples/minimal
npm run start --workspace @nextjs-examples/minimal
```

Type-check without building (generates the route types first):

```bash
npm run typecheck --workspace @nextjs-examples/minimal
```

There are no tests in this app.

## Environment variables and external services

None. The posts live in memory in `lib/posts.ts`, so there is no `.env.example`,
no database and no network access.

## Files you will see after running it

`next dev` writes to `.next/dev`, `next build` writes to `.next`, and both
generate `next-env.d.ts`. All three are ignored by the repository root
`.gitignore`. If `next dev` detects an AI coding agent, it may also create
`AGENTS.md` and `CLAUDE.md`; delete them or commit them, as you prefer.
