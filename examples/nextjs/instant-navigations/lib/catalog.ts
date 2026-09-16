import { cacheLife, cacheTag } from 'next/cache';

export type Product = {
  slug: string;
  name: string;
  price: number;
  description: string;
  stock: number;
};

// Stands in for a database. The catalog changes rarely, so it is cached.
// Inventory changes constantly, so it is read at request time.
const PRODUCTS: Product[] = [
  {
    slug: 'trail-runner',
    name: 'Trail Runner',
    price: 129,
    description: 'A lightweight shoe with a grippy outsole for loose terrain.',
    stock: 12,
  },
  {
    slug: 'rain-shell',
    name: 'Rain Shell',
    price: 189,
    description: 'A packable waterproof jacket with taped seams.',
    stock: 4,
  },
  {
    slug: 'summit-pack',
    name: 'Summit Pack',
    price: 149,
    description: 'A 28-liter daypack with a hydration sleeve.',
    stock: 0,
  },
];

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function getProducts(): Promise<Product[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('products');
  return PRODUCTS;
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  'use cache';
  cacheLife('hours');
  cacheTag('products', `product-${slug}`);
  return PRODUCTS.find((product) => product.slug === slug);
}

// Deliberately uncached and slow. Callers must run it after `connection()`
// and inside a <Suspense> boundary.
export async function getLiveInventory(slug: string): Promise<number> {
  await wait(1500);
  return PRODUCTS.find((product) => product.slug === slug)?.stock ?? 0;
}
