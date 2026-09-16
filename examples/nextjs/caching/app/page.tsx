import { Suspense } from 'react';
import { connection } from 'next/server';
import { getCatalog } from '@/lib/products';
import { addProduct, changePrice } from './actions';

const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Cached: part of the prerendered shell, refreshed by cacheLife or a tag.
async function Catalog() {
  const { products, cachedAt } = await getCatalog();

  return (
    <section>
      <h2>Catalog</h2>
      <p>
        Cache entry filled at <time dateTime={cachedAt} data-testid="cached-at">{cachedAt}</time>
      </p>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            {product.name}: {price.format(product.priceCents / 100)}
            <form action={changePrice} style={{ display: 'inline', marginLeft: 8 }}>
              <input type="hidden" name="id" value={product.id} />
              <input name="price" type="number" min="0" step="0.01" required aria-label={`New price for ${product.name}`} />
              <button type="submit">Change price (revalidateTag)</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Dynamic: runs on every request, streamed behind a Suspense fallback.
async function RequestTime() {
  await connection();
  const now = new Date().toISOString();
  return (
    <p>
      This request was rendered at <time dateTime={now} data-testid="request-time">{now}</time>
    </p>
  );
}

export default function Page() {
  return (
    <main>
      <h1>Cache Components</h1>

      <Suspense fallback={<p>Loading request time…</p>}>
        <RequestTime />
      </Suspense>

      <Catalog />

      <section>
        <h2>Add a product (updateTag)</h2>
        <form action={addProduct}>
          <input name="name" placeholder="Name" required maxLength={80} />{' '}
          <input name="price" type="number" min="0" step="0.01" placeholder="Price in USD" required />{' '}
          <button type="submit">Add</button>
        </form>
      </section>
    </main>
  );
}
