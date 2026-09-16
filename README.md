# React 19 Documentation

A hand-built static documentation site for **React 19.2.8**, with a separate
**Next.js 16.3.5** area layered on top, published to GitHub Pages from `docs/`.

The Next.js pages explain what the framework adds (routing, rendering, caching,
Server Actions, backend features, databases, auth, security, performance and
deployment) and link back to the React pages for every underlying concept. The
minimum safe Next.js version they document is **16.3.3** (August 2026 security
release).

Content is Markdown in `content/`. The generator is plain Node ESM with **no npm
dependencies**, so `node scripts/build.mjs` works on a fresh clone with no
install step.

```bash
node scripts/build.mjs
```

Then open `docs/index.html`, or serve it the way Pages will:

```bash
node scripts/serve.mjs
```

---

## Layout

```
content/          Markdown source, one directory per group (`nextjs-*` groups are the Next.js area)
examples/nextjs/  Runnable Next.js 16.3 example apps (one npm workspace)
docs/             Generated site — this is what GitHub Pages serves
legacy/           The previous documentation, archived verbatim under a banner
scripts/
  build.mjs         Generator: content/ -> docs/
  check.mjs         Links, anchors, front matter, page shape, removed-API grep
  check-examples.mjs  Type-checks every JSX/TSX example against real React 19, and every
                      Next.js ts/tsx example against real next@16.3.5 (with `next typegen`)
  check-deps.mjs    Every package the Next.js pages and apps name exists, is compatible, and
                    respects the next >= 16.3.3 security floor (needs network)
  check-apps.mjs    Installs examples/nextjs, then typechecks, builds and tests each app
  serve.mjs         Static preview server
  lib/              Markdown parser and syntax highlighter
  assets/           styles.css and app.js, copied into docs/assets/
CONTRIBUTING.md   Authoring conventions and the verified React version facts
```

`docs/` is generated. Never edit it by hand — edit `content/` and rebuild.

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | Generate `docs/` from `content/`. No dependencies needed. |
| `npm run check` | Validate links, heading anchors, front matter, required sections, orphans, and grep for removed/deprecated React APIs outside labelled blocks. |
| `npm run check:examples` | Extract every `jsx`/`tsx` block and compile it against the real `react` and `@types/react` for 19.2.8. Next.js `ts`/`tsx` blocks compile against the real `next@16.3.5`, with route types from `next typegen`. |
| `npm run check:deps` | Query npm for every package named by the Next.js pages and example apps: exists, pinned version is stable and not deprecated, peer ranges accept `next@16.3.5` / `react@19.2.8`, and nothing pins `next` below 16.3.3. |
| `npm run check:apps` | Install `examples/nextjs`, then run `typecheck`, `build` and `test` for each app sequentially. Add `-- --e2e` for Playwright browser tests. |
| `npm run verify` | All three, in order. |
| `npm run serve` | Serve `docs/` at `http://localhost:4173`. |

`build` and `check` need nothing installed. `check:examples` needs `node_modules`,
because it compiles against the real React and Next.js type definitions:

```bash
npm install
```

## What the site has

- Grouped sidebar with the active page highlighted, and a mobile drawer
- Client-side search over titles, headings and body text (`Ctrl`/`Cmd` + `K`, or `/`)
- Light / dark / system theming, applied before first paint so there is no flash
- Automatic table of contents with scroll-spy
- Breadcrumbs, previous/next links, copy buttons, syntax highlighting
- Callouts, tabs, comparison tables
- Live React examples in a sandboxed iframe, created lazily, each with a
  Preview / Code tab pair
- Responsive to 320px, skip link, visible focus styles, full keyboard operation
- A print stylesheet

## Live examples

A fenced block tagged `live` renders as a Preview / Code pair. The preview runs
in a `sandbox="allow-scripts"` iframe that loads React 19.2.8 from `esm.sh` and
compiles the JSX with Babel standalone, so it is isolated from the page around
it. Iframes are created only when the example scrolls into view.

Examples that cannot run safely or self-containedly — Server Components, SSR,
anything needing a bundler or a server — are marked `static="reason"` and stay
static. No preview is ever faked.

## Next.js example apps

Next.js pages need a server, so they never use live previews. Each Next.js
topic that benefits from running code points to an app in `examples/nextjs/`.
Every app has its own `package.json` and `README.md` with exact commands. The
directory is one npm workspace, so a single install serves all of them:

```bash
cd examples/nextjs && npm install
```

```bash
npm run dev --workspace @nextjs-examples/routing
```

Some apps need external services (the `databases` app needs PostgreSQL, and
includes a `docker-compose.yml`). `security-pairs` contains **intentionally
vulnerable routes**. Run it locally only. Never deploy it.

## Publishing to GitHub Pages

1. Build and verify, then commit the generated `docs/` directory (it is tracked
   on purpose — Pages serves it directly):

   ```bash
   npm run build
   ```

2. Commit and push to `main`:

   ```bash
   git add -A && git commit -m "Build docs" && git push origin main
   ```

3. In the repository on GitHub, go to **Settings -> Pages**.

4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.

5. Set **Branch** to `main` and the folder to **`/docs`**, then press **Save**.

6. Wait for the Pages build to finish, then open
   `https://<your-username>.github.io/<repository-name>/`.

Every link in the site is relative and `docs/.nojekyll` is generated on each
build, so the site works from a repository subpath and Jekyll does not touch it.

To publish a change: edit `content/`, run `npm run build`, commit `content/` and
`docs/` together, and push.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) first. It carries the authoring
conventions and the verified React version facts that every page is written
against. Both check scripts enforce it.

## The archived documentation

The previous documentation is preserved in [`legacy/`](./legacy/). Nothing was
deleted. Every archived page carries a banner marking it as pre-React-19 and
linking to its current replacement, and
[`content/migration/legacy-archive.md`](./content/migration/legacy-archive.md)
maps each archived file to the page that supersedes it.
