# Caching example (Cache Components)

A one-page product catalog for Next.js 16.3.5 that makes the Cache Components
model visible. Every cached value carries the time it was cached, and a separate
dynamic section shows the time of the current request, so you can see which
parts of the page come from a cache and which run on every request.

## What it demonstrates

- `cacheComponents: true` in `next.config.ts`, plus a **custom `cacheLife`
  profile** named `catalog`, declared in the same file.
- A `"use cache"` data function (`lib/products.ts`) that calls
  `cacheLife('catalog')` and `cacheTag('products')`, and returns the catalog
  together with the time the cache entry was filled.
- A page (`app/page.tsx`) with a **cached part** (the catalog, prerendered into
  the static shell) and a **dynamic part** (`await connection()` behind
  `<Suspense>`, rendered on every request).
- Two Server Actions (`app/actions.ts`):
  - `addProduct` calls **`updateTag('products')`**: read-your-own-writes. The
    action's response already contains the new product.
  - `changePrice` calls **`revalidateTag('products', 'max')`**:
    stale-while-revalidate. The change appears on a later request, not
    immediately.
- An in-memory data store (`lib/store.ts`). No database, no external services.

## Doc pages it backs

- [The caching model](../../../content/nextjs-data-caching/caching-model.md)
- [use cache](../../../content/nextjs-data-caching/use-cache.md)
- [cacheLife and cacheTag](../../../content/nextjs-data-caching/cache-life-and-tags.md)
- [Revalidation](../../../content/nextjs-data-caching/revalidation.md)

## Run it from a fresh clone

Requires Node.js 20.9.0 or later. All example apps share one npm workspace.
No environment variables and no external services are needed.

```bash
cd examples/nextjs
npm install
npm run build --workspace @nextjs-examples/caching
npm run start --workspace @nextjs-examples/caching
```

Open http://localhost:3000.

Use the production build (`build` then `start`) to observe the behavior below.
The store lives in the server's memory, so restarting the server resets the
catalog. For editing the code, run the development server instead:

```bash
npm run dev --workspace @nextjs-examples/caching
```

Type-check without building:

```bash
npm run typecheck --workspace @nextjs-examples/caching
```

## How to observe it

1. **Cached vs dynamic.** Reload the page a few times. "This request was
   rendered at" changes on every reload. "Cache entry filled at" does not: the
   catalog comes from the static shell and the `use cache` entry.
2. **`updateTag` (read-your-own-writes).** Add a product with the form at the
   bottom. When the form submits, the new product is in the list and "Cache
   entry filled at" has moved to the current time, with no reload.
3. **`revalidateTag(tag, 'max')` (stale-while-revalidate).** Type a new price
   next to a product and press "Change price". The list does not change,
   because this action marks the entry stale without re-rendering the page.
   Reload once: you still see the old price and the old "Cache entry filled
   at", and that request starts a background refresh. Reload again: the new
   price and a new timestamp appear.
4. **Time-based revalidation.** The `catalog` profile sets `revalidate` to 30
   minutes. A request more than 30 minutes after the entry was filled is served
   the cached catalog and refreshes it in the background.
