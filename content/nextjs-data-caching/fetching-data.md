---
title: Fetching data
description: Load data in Server Components with fetch or a database, avoid waterfalls, stream the slow parts, and know when to fetch on the client.
group: nextjs-data-caching
order: 60
status: current
related: [data-fetching/overview, data-fetching/use-with-promises, nextjs-data-caching/request-memoization, nextjs-data-caching/use-cache]
---

## Overview

In the App Router, the default place to load data is a **Server Component**.
Make the component `async` and `await` what it needs: `fetch`, an ORM, a
database driver, the file system. The code runs only on the server, so
credentials and query logic never reach the browser bundle.

Next.js adds three things on top of React's model:

- **Dynamic by default.** With Cache Components, a `fetch` or query is not cached
  unless it is inside [`"use cache"`](./use-cache.md). Uncached reads must sit
  inside `<Suspense>`, so the rest of the page can still be prerendered.
- **Memoization.** Identical `fetch` calls in one render run once, and React's
  `cache()` does the same for other reads. See
  [Request memoization](./request-memoization.md).
- **Streaming built into routing.** `loading.tsx` and `<Suspense>` boundaries
  let the fast parts of a route arrive first.

For the React-level choice between server fetching, data libraries, `use()` and
Effects, start with [Data fetching overview](../data-fetching/overview.md).

## Why it exists

Fetching on the server removes a round trip: the HTML or RSC payload arrives
with the data already in it, instead of the browser downloading JavaScript and
then asking an API. It also removes an API layer you would otherwise have to
build and secure for your own UI.

The Next.js rules around it exist to keep that from turning into a slow page.
One slow query at the top of a route would block everything below it, so Cache
Components makes you either cache the read or give it a boundary to stream
behind.

## When to use it

- **Data needed for the first render**: page content, navigation, anything
  visible above the fold.
- **Data that requires secrets**: database credentials, private API keys.
- **Data that should be cached and shared**: combine a server fetch with
  `"use cache"`.

## When not to use it

- **Data that changes while the user watches**, such as live prices, chat, or
  polling dashboards. Load the initial state on the server if you like, then keep
  it fresh on the client with a data library. See
  [Data libraries](../ecosystem/data-libraries.md).
- **Data that depends on client-only state**, such as the scroll position, a
  canvas selection, or browser APIs.
- **Infinite scrolling and client-side filtering** of large lists, where the
  client needs its own cache and pagination logic.

## Basic example

```tsx file="app/changelog/page.tsx"
import { Suspense } from 'react';

type Release = { version: string; date: string; notes: string };

async function ReleaseList() {
  const response = await fetch('https://api.example.com/releases');
  if (!response.ok) throw new Error(`Releases request failed with ${response.status}`);
  const releases: Release[] = await response.json();

  return (
    <ol>
      {releases.map((release) => (
        <li key={release.version}>
          <h2>{release.version}</h2>
          <time dateTime={release.date}>{release.date}</time>
          <p>{release.notes}</p>
        </li>
      ))}
    </ol>
  );
}

export default function ChangelogPage() {
  return (
    <main>
      <h1>Changelog</h1>
      <Suspense fallback={<p>Loading releases…</p>}>
        <ReleaseList />
      </Suspense>
    </main>
  );
}
```

The heading and the fallback are prerendered. `ReleaseList` runs on every
request, because nothing marks its `fetch` as cacheable. To cache it instead,
move the fetch into a `"use cache"` function; the boundary is then optional.

## How it works

### With `fetch`

Server-side `fetch` is the Web `fetch` API. With Cache Components you control
caching with `"use cache"`, not with `fetch` options. Two behaviors are specific
to Next.js:

- `GET` requests with the same URL and options are memoized within a render.
- In development, responses can be reused across hot module reloads. A full
  reload clears that. If data looks stale while you edit, reload the page.

### With an ORM or database

Query the database directly from a Server Component or, better, from a data
function the component calls. The function can be cached, memoized or neither,
depending on the data.

```ts file="lib/data/invoices.ts"
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

// Shared reference data: cached for everyone.
export async function getTaxRates() {
  'use cache';
  cacheLife('days');
  cacheTag('tax-rates');
  return db.taxRate.findMany();
}

// Account-specific and must be current: not cached.
export async function getOpenInvoices(accountId: string) {
  return db.invoice.findMany({ where: { accountId, status: 'open' } });
}
```

Authorization belongs in these functions, not only in the page. See
[Data access layer](../nextjs-auth/data-access-layer.md). Connection handling
is covered in [Databases and ORMs](../nextjs-databases/overview.md).

### Sequential and parallel requests

Two `await`s in a row run one after the other, even when neither needs the
other's result:

```text
const artist = await getArtist(id);   // 300 ms
const albums = await getAlbums(id);   // then another 300 ms
```

Start independent requests first, then await them together:

```tsx file="app/artists/[id]/page.tsx"
import { Suspense } from 'react';
import { getAlbums, getArtist } from '@/lib/data/music';

type Album = { id: string; title: string };

async function ArtistProfile({ params }: Pick<PageProps<'/artists/[id]'>, 'params'>) {
  const { id } = await params;

  // Both requests start now and run at the same time.
  const [artist, albums] = await Promise.all([getArtist(id), getAlbums(id)]);

  return (
    <>
      <h1>{artist.name}</h1>
      <ul>
        {albums.map((album: Album) => (
          <li key={album.id}>{album.title}</li>
        ))}
      </ul>
    </>
  );
}

export default function ArtistPage({ params }: PageProps<'/artists/[id]'>) {
  return (
    <Suspense fallback={<p>Loading artist…</p>}>
      <ArtistProfile params={params} />
    </Suspense>
  );
}
```

If one request fails, `Promise.all` rejects. Use `Promise.allSettled` when the
page can render with partial data.

Sequential requests are right when one genuinely depends on the other, such as
loading playlists for an artist ID you looked up first. Put the dependent part in
its own component behind `<Suspense>`, so the first result can render while the
second loads.

Separately, Next.js renders a route's layouts and page in parallel, so a layout
and a page that each fetch their own data do not wait for each other.

### Preloading

When a component renders only after some other blocking work, its request starts
late. A **preload** function starts it early. The component then reads the
request that is already in flight, which only works if the read is deduplicated:
a memoized `fetch`, a function wrapped in React's `cache()`, or a `"use cache"`
function.

```tsx file="app/items/[id]/item-details.tsx"
import { cache } from 'react';
import { db } from '@/lib/db';

const getItem = cache(async (id: string) => db.item.findById(id));

export function preloadItem(id: string) {
  void getItem(id);
}

export async function ItemDetails({ id }: { id: string }) {
  const item = await getItem(id);
  return (
    <section>
      <h2>{item.name}</h2>
      <p>{item.description}</p>
    </section>
  );
}
```

```tsx file="app/items/[id]/page.tsx"
import { Suspense } from 'react';
import { checkAvailability } from '@/lib/data/inventory';
import { ItemDetails, preloadItem } from './item-details';

async function Item({ params }: Pick<PageProps<'/items/[id]'>, 'params'>) {
  const { id } = await params;

  preloadItem(id); // starts the item query now
  const available = await checkAvailability(id); // runs at the same time

  return available ? <ItemDetails id={id} /> : <p>This item is unavailable.</p>;
}

export default function ItemPage({ params }: PageProps<'/items/[id]'>) {
  return (
    <Suspense fallback={<p>Loading item…</p>}>
      <Item params={params} />
    </Suspense>
  );
}
```

Keep the preload function next to the component that consumes the data, so the
two move together.

### Streaming the slow parts

There are two ways to stream, and they differ in granularity:

| | `loading.tsx` | `<Suspense>` |
|---|---|---|
| Wraps | The whole page segment below the layout | Exactly the subtree you choose |
| Shows immediately | The layout and the loading UI | Everything outside the boundary |
| Covers uncached reads in the layout | No | Yes, if you put the boundary there |

A `loading.tsx` wraps the page, not its own layout. A layout that reads
`cookies()` or uncached data blocks navigation, and Cache Components reports it.
Move the read into a `<Suspense>` boundary inside the layout, or into the page.
File-level details are on [Loading UI](../nextjs-errors/loading-ui.md), and the
rendering side is on [Streaming](../nextjs-rendering/streaming.md).

Bots and crawlers do not receive a stream. Next.js waits for the full page and
sends the finished HTML.

## Server and client implications

### Passing a promise to a Client Component

A Server Component can start a request, **not await it**, and pass the promise
to a Client Component, which reads it with React's `use()`. The server does not
block on the data, and the client component still suspends until it arrives. The
React side, including why the promise must come from the server rather than be
created during a client render, is on
[use with promises](../data-fetching/use-with-promises.md).

```tsx file="app/reviews/page.tsx"
import { Suspense } from 'react';
import { getReviews } from '@/lib/data/reviews';
import { ReviewList } from './review-list';

export default function ReviewsPage() {
  // Started here, not awaited.
  const reviews = getReviews();

  return (
    <main>
      <h1>Reviews</h1>
      <Suspense fallback={<p>Loading reviews…</p>}>
        <ReviewList reviews={reviews} />
      </Suspense>
    </main>
  );
}
```

```tsx file="app/reviews/review-list.tsx"
'use client';

import { use, useState } from 'react';

type Review = { id: string; author: string; rating: number; text: string };

export function ReviewList({ reviews }: { reviews: Promise<Review[]> }) {
  const allReviews = use(reviews);
  const [minRating, setMinRating] = useState(1);
  const visible = allReviews.filter((review) => review.rating >= minRating);

  return (
    <section>
      <label>
        Minimum rating{' '}
        <select value={minRating} onChange={(event) => setMinRating(Number(event.target.value))}>
          {[1, 2, 3, 4, 5].map((rating) => (
            <option key={rating} value={rating}>
              {rating}
            </option>
          ))}
        </select>
      </label>
      <ul>
        {visible.map((review) => (
          <li key={review.id}>
            {review.author} ({review.rating}/5): {review.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

The resolved value crosses the server-client boundary, so it must be
serializable.

### Fetching on the client

Fetch in a Client Component when the data is interactive: it refreshes while the
user watches, depends on client state, or is paginated in the browser. Use a data
library such as TanStack Query or SWR rather than `useEffect`. A client fetch
goes to an endpoint you expose, usually a
[Route Handler](../nextjs-backend/route-handlers.md), and that endpoint needs
its own authorization.

## Caching implications

- **Uncached is the default.** Every `fetch` and query you add runs per request
  until you put it in `"use cache"`.
- **Caching moves reads into the shell.** A read inside a long-lived
  `"use cache"` function no longer needs a `<Suspense>` boundary, because it is
  resolved at build time.
- **Client data libraries have their own cache.** Do not also cache the same
  data with `"use cache"` and expect them to agree. Pick one owner for each piece
  of data.

## Common patterns

### Fetch where the data is used

Because reads are memoized, a component deep in the tree can call
`getCurrentUser()` itself instead of receiving it through five layers of props.

### Push the slow read to the smallest boundary

Wrap only the component that waits, not the page. The rest of the route stays
in the static shell and appears instantly.

### Cache reference data, stream personal data

Lists of categories, countries or plans go in `"use cache"`. The signed-in
user's orders go behind `<Suspense>`. See
[The caching model](./caching-model.md).

## Security considerations

- **Server Components are not an authorization boundary on their own.** Check
  the session in the data function, so every caller is protected.
- **Return only what the UI needs.** Whatever a Server Component passes to a
  Client Component, including a resolved promise, is sent to the browser.
- **Never cache per-user data in plain `"use cache"`** under a key that does not
  include the user.

## Common mistakes

**Awaiting independent requests one after another.** Start them together and
use `Promise.all`.

**Awaiting a slow request at the top of a layout.** Every page below it waits.
Move it into a component inside `<Suspense>`.

**Fetching your own Route Handler from a Server Component.** It adds an HTTP
round trip to your own server. Call the data function directly.

**Expecting `fetch` to be cached.** With Cache Components it is not, unless it
runs inside `"use cache"`.

**Creating a promise in a Client Component render and passing it to `use()`.** It
is recreated on every render. Create it in a Server Component or a cache.

**Preloading with a function that is not memoized.** The component then sends a
second request instead of reusing the first.

**Fetching with `useEffect` for data a Server Component could load.** It costs a
render, a request and a loading state that server fetching avoids.

## Related topics

- [Data fetching overview (React)](../data-fetching/overview.md): the React
  choices this page applies to Next.js.
- [use with promises (React)](../data-fetching/use-with-promises.md): reading a
  server-started promise in a Client Component.
- [Data libraries (React)](../ecosystem/data-libraries.md): when and how to fetch
  on the client.
- [Request memoization](./request-memoization.md): why fetching where the data
  is used does not duplicate requests.
- [use cache](./use-cache.md): turning any read on this page into a cached one.
