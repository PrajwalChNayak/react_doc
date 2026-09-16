'use server';

import { revalidateTag, updateTag } from 'next/cache';
import { PRODUCTS_TAG } from '@/lib/products';
import { insertProduct, updatePrice } from '@/lib/store';

function parsePriceCents(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string') return null;
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 100000) return null;
  return Math.round(dollars * 100);
}

// Read-your-own-writes: the person who adds a product sees it in the response
// to this action, because updateTag expires the entry immediately.
export async function addProduct(formData: FormData) {
  const name = formData.get('name');
  const priceCents = parsePriceCents(formData.get('price'));
  if (typeof name !== 'string' || name.trim() === '' || name.length > 80 || priceCents === null) {
    return;
  }

  await insertProduct(name.trim(), priceCents);
  updateTag(PRODUCTS_TAG);
}

// Stale-while-revalidate: the entry is marked stale. The next request is still
// served the old catalog and triggers a background refresh; the request after
// that sees the new price.
export async function changePrice(formData: FormData) {
  const id = formData.get('id');
  const priceCents = parsePriceCents(formData.get('price'));
  if (typeof id !== 'string' || priceCents === null) {
    return;
  }

  await updatePrice(id, priceCents);
  revalidateTag(PRODUCTS_TAG, 'max');
}
