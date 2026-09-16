import { cacheLife, cacheTag } from 'next/cache';
import { listProducts } from './store';

export const PRODUCTS_TAG = 'products';

// The cached read. Every caller shares one entry until the `catalog` profile
// says it is time to refresh, or a Server Action invalidates the tag.
export async function getCatalog() {
  'use cache';
  cacheLife('catalog');
  cacheTag(PRODUCTS_TAG);

  const products = await listProducts();

  // Captured once per cache entry, so it tells you when the entry was filled.
  const cachedAt = new Date().toISOString();

  return { products, cachedAt };
}
