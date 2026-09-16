// An in-memory product store, standing in for a database.
//
// It lives in module scope, so it is shared by every request that reaches this
// server process and resets when the process restarts. That is exactly what
// makes caching visible: the store always holds the truth, and the page shows
// whatever the cache last captured from it.

export type Product = {
  id: string;
  name: string;
  priceCents: number;
};

const products = new Map<string, Product>([
  ['p1', { id: 'p1', name: 'Pour-over kettle', priceCents: 4900 }],
  ['p2', { id: 'p2', name: 'Burr grinder', priceCents: 12900 }],
  ['p3', { id: 'p3', name: 'Paper filters (100)', priceCents: 700 }],
]);

let nextId = products.size + 1;

// Simulate the latency of a real database so cache hits are noticeable.
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listProducts(): Promise<Product[]> {
  await delay(300);
  return [...products.values()];
}

export async function insertProduct(name: string, priceCents: number): Promise<Product> {
  await delay(100);
  const product = { id: `p${nextId++}`, name, priceCents };
  products.set(product.id, product);
  return product;
}

export async function updatePrice(id: string, priceCents: number): Promise<Product | null> {
  await delay(100);
  const existing = products.get(id);
  if (!existing) return null;
  const updated = { ...existing, priceCents };
  products.set(id, updated);
  return updated;
}
