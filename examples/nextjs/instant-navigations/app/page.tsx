import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <h1>Instant Navigations</h1>
      <p>
        This app enables <code>cacheComponents</code> and <code>partialPrefetching</code>. Open the{' '}
        <Link href="/store">store</Link>, then click a product. The product name and price appear
        immediately; the inventory count streams in about 1.5 seconds later.
      </p>
    </>
  );
}
