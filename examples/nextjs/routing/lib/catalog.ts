export type Product = { slug: string; name: string; priceCents: number }
export type Photo = { id: string; title: string; color: string }
export type DocPage = { path: string[]; title: string; body: string }

export const products: Product[] = [
  { slug: 'trail-runner', name: 'Trail Runner', priceCents: 12900 },
  { slug: 'city-sneaker', name: 'City Sneaker', priceCents: 8900 },
  { slug: 'rain-shell', name: 'Rain Shell', priceCents: 15900 },
]

export const photos: Photo[] = [
  { id: '1', title: 'Harbor at dawn', color: '#f4a261' },
  { id: '2', title: 'Pine ridge', color: '#2a9d8f' },
  { id: '3', title: 'Night market', color: '#264653' },
]

export const docs: DocPage[] = [
  { path: ['getting-started'], title: 'Getting started', body: 'One segment matched by [...slug].' },
  { path: ['guides', 'routing'], title: 'Routing guide', body: 'Two segments matched by the same catch-all.' },
  { path: ['guides', 'routing', 'parallel-routes'], title: 'Parallel routes', body: 'Three segments, still one page file.' },
]

export function getProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug)
}

export function getPhoto(id: string): Photo | undefined {
  return photos.find((photo) => photo.id === id)
}

export function getDoc(path: string[]): DocPage | undefined {
  return docs.find((doc) => doc.path.join('/') === path.join('/'))
}
