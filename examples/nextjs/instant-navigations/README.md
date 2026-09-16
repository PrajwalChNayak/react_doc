# Instant Navigations example

A small store built on Next.js 16.3.5. It turns on the **opt-in** Instant Navigations
behaviors (`cacheComponents: true` and `partialPrefetching: true`). Next.js plans to make
these behaviors the default in a future major version. They are not the default in 16.3.

## What it demonstrates

- `/store` lists products from a cached function (`"use cache"` + `cacheLife('hours')`). The
  whole listing is part of the static shell.
- `/store/[slug]` has two parts:
  - **Instantly visible:** the product name, price and description. They come from a cached
    lookup, sit inside their own `<Suspense>` boundary, and are prerendered for every slug in
    `generateStaticParams`.
  - **Streams in later:** live inventory. It calls `await connection()` and then waits
    1.5 seconds, inside a second `<Suspense>` boundary with a "Checking inventory…" fallback.
- The store links use `<Link prefetch={true}>`. The detail page reads `params`, which the
  shared App Shell cannot include, so per-link prefetching is what makes the product name
  ready before the click.
- `e2e/instant-navigation.spec.ts` uses `instant()` from `@next/playwright` to check what is
  visible right away and what arrives later, both for a client navigation and for an initial
  page load.

## Doc pages it backs

- [Instant Navigations overview](../../../content/nextjs-instant-navigations/overview.md)
- [Partial Prefetching](../../../content/nextjs-instant-navigations/partial-prefetching.md)
- [Link prefetching](../../../content/nextjs-instant-navigations/link-prefetching.md)
- [Instant Insights and the Navigation Inspector](../../../content/nextjs-instant-navigations/devtools.md)

## Run it from a fresh clone

No environment variables and no external services are needed.

```bash
cd examples/nextjs
npm install
npm run build --workspace @nextjs-examples/instant-navigations
npm run test:e2e --workspace @nextjs-examples/instant-navigations
```

`test:e2e` builds the app again and starts `next start` on port 3130 itself (see
`playwright.config.ts`). It uses a production server because automatic prefetching does not
run in `next dev`.

### Browsers

Playwright needs a Chromium-based browser. Either download Playwright's Chromium once:

```bash
npx playwright install chromium
```

or use a Chrome that is already installed:

```bash
PW_CHANNEL=chrome npm run test:e2e --workspace @nextjs-examples/instant-navigations
```

In PowerShell: `$env:PW_CHANNEL='chrome'; npm run test:e2e --workspace @nextjs-examples/instant-navigations`

### Why the test server sets `INSTANT_TESTING=1`

In `next dev`, the testing API that `instant()` relies on is always available. Under
`next start` it is off unless `experimental.exposeTestingApiInProductionBuild` is `true`.
That option is **Experimental**. `next.config.ts` turns it on only when `INSTANT_TESTING=1`,
and only `playwright.config.ts` sets that variable. Never set it on a deployment that real
users can reach.

## Inspect it in the Next.js DevTools

```bash
npm run dev --workspace @nextjs-examples/instant-navigations
```

1. Open http://localhost:3000/store.
2. Open the Next.js DevTools from the on-screen indicator that `next dev` shows (bottom left
   by default) and select **Navigation Inspector**.
3. Turn on **Pause on navigations**. The panel shows "Awaiting navigation...".
4. Click a product. The page freezes at the shell. You see the product name and the
   "Checking inventory…" fallback. Click **Resume** to let inventory stream in.
5. Refresh a product page with the toggle still on to see the static shell of a page load.
   Turn the toggle off when you are done.

Instant Insights (validation of every page in development) is on by default in a Cache
Components app. If you move the `connection()` call out of its `<Suspense>` boundary, the
dev overlay reports a blocking route and offers fixes.

**Known issue:** the DevTools and `instant()` use a `next-instant-navigation-testing` cookie.
Cookies are scoped to the domain, not the port, so other projects on `localhost` share it.
Clear the cookie or close the Navigation Inspector when you switch projects.

## Type-check

```bash
npm run typecheck --workspace @nextjs-examples/instant-navigations
```
