import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getLiveInventory, getProduct, getProducts } from '@/lib/catalog';

type Params = PageProps<'/store/[slug]'>['params'];

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((product) => ({ slug: product.slug }));
}

export default function ProductPage({ params }: PageProps<'/store/[slug]'>) {
  // The page itself does not await params. Everything that depends on the URL
  // sits inside a boundary, so the route's App Shell stays shareable.
  return (
    <article>
      <p>
        <Link href="/store">Back to the store</Link>
      </p>
      <Suspense fallback={<p>Loading product…</p>}>
        <ProductInfo params={params} />
      </Suspense>
      <Suspense fallback={<p>Checking inventory…</p>}>
        <Inventory params={params} />
      </Suspense>
    </article>
  );
}

async function ProductInfo({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  return (
    <>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      <p>{product.description}</p>
    </>
  );
}

async function Inventory({ params }: { params: Params }) {
  const { slug } = await params;
  // Inventory must be fresh on every request: defer to request time.
  await connection();
  const count = await getLiveInventory(slug);

  return <p>{count > 0 ? `${count} in stock` : 'Out of stock'}</p>;
}
