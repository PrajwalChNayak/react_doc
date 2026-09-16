import Link from 'next/link';
import { getProducts } from '@/lib/catalog';

export default async function StorePage() {
  // Cached, so the whole listing is part of the static shell and the App Shell.
  const products = await getProducts();

  return (
    <>
      <h1>Store</h1>
      <ul>
        {products.map((product) => (
          <li key={product.slug}>
            {/*
              prefetch={true} opts each link into per-link prefetching. The
              detail page reads `params`, which the shared App Shell cannot
              carry, so this is what makes the cached product name available
              before the click.
            */}
            <Link href={`/store/${product.slug}`} prefetch={true}>
              {product.name}
            </Link>{' '}
            ${product.price}
          </li>
        ))}
      </ul>
    </>
  );
}
