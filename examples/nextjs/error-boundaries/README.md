# Errors and loading UI in Next.js 16.3

A runnable App Router app for Next.js 16.3.5 that shows each error and loading
convention on its own route. It backs the **Errors and Loading UI** pages of the
Next.js section of this site.

## What it demonstrates

| Route | What happens |
|---|---|
| `/inventory` | An async Server Component fails on every other request. It sits inside a custom boundary built with `catchError` from `next/error` (`app/ui/error-boundary.tsx`). **Try again** calls `retry()`, which re-fetches the Server Component. **Reset (client only)** calls `reset()`, which does not re-fetch, so the error comes straight back. |
| `/reports` | The same kind of failure, caught by a segment `app/reports/error.tsx` that uses the `retry` prop. The heading in `app/reports/layout.tsx` stays visible, because `error.tsx` does not wrap the layout in its own segment. |
| `/invoices/inv-1001` | A valid invoice rendered inside the `catchError` boundary. |
| `/invoices/inv-9999` | `notFound()` is thrown **inside** the `catchError` boundary. The boundary does not catch it: `app/invoices/[invoiceId]/not-found.tsx` renders instead of the error fallback. |
| `/crash` | A page with no `error.tsx` above it fails, so `app/global-error.tsx` replaces the root layout (the navigation bar disappears). Its **Try again** button calls `retry()`. |
| `/dashboard` | A page that waits two seconds behind `app/dashboard/loading.tsx`. |
| `/feed` | Two inline `<Suspense>` boundaries that resolve at different times while the heading paints immediately. |
| any unknown URL | `app/not-found.tsx`. |

## Doc pages it backs

- [Error boundaries](../../../content/nextjs-errors/error-boundaries.md)
- [catchError](../../../content/nextjs-errors/catch-error.md)
- [notFound and redirect](../../../content/nextjs-errors/not-found-and-redirect.md)
- [Loading UI](../../../content/nextjs-errors/loading-ui.md)

## Run it from a fresh clone

Requires Node.js 20.9.0 or later. All example apps share one npm workspace.

```bash
cd examples/nextjs
npm install
npm run dev --workspace @nextjs-examples/error-boundaries
```

Open http://localhost:3000.

Production build and server:

```bash
npm run build --workspace @nextjs-examples/error-boundaries
npm run start --workspace @nextjs-examples/error-boundaries
```

Type-check without building (generates the route types first):

```bash
npm run typecheck --workspace @nextjs-examples/error-boundaries
```

There are no tests in this app.

## How to trigger each error and the retry

The failing routes use per-process counters in `lib/flaky.ts`. Each route fails
on its 1st, 3rd, 5th... server call and succeeds on the 2nd, 4th, 6th... call.
Restarting the server resets the counters.

1. **catchError and `retry()`**: open `/inventory`. The stock levels panel shows
   "Stock levels are unavailable". Click **Try again**: the next server call
   succeeds and the panel shows the stock count. Reload the page to fail again.
   Click **Reset (client only)** instead to see that `reset()` cannot recover
   from a server failure.
2. **Segment `error.tsx`**: open `/reports`. The "Reports" heading from the
   layout stays, and the page area shows the error UI. Click **Try again**.
3. **`notFound()` is not swallowed**: open `/invoices/inv-9999`. You see
   "Invoice not found" from `not-found.tsx`, not the red catchError fallback.
4. **`global-error.tsx`**: open `/crash`. Use a **production build**
   (`npm run build` then `npm run start`) to see it clearly, because in
   `next dev` the Next.js dev overlay can also report the error on top of the
   page. Click **Try again**.
5. **Loading UI**: open `/dashboard` for the `loading.tsx` skeleton, then `/feed`
   for two independent inline fallbacks.

### Development vs production messages

In `next dev` the fallbacks show the original error message, for example
"Inventory service timed out (call 1)". In a production build, errors thrown in
Server Components reach the browser as a generic message plus a `digest`. The
fallbacks print that digest as "Reference", and the full message appears only in
the terminal running `next start`, next to the same digest.

## Environment variables and external services

None. Data lives in memory in `lib/`, so there is no `.env.example`, no database
and no network access.

## Files you will see after running it

`next dev` writes to `.next/dev`, `next build` writes to `.next`, and both
generate `next-env.d.ts`. All three are ignored by the repository root
`.gitignore`.
