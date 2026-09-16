import Link from 'next/link';

export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>Nothing matches this URL.</p>
      <Link href="/">Back to the examples</Link>
    </main>
  );
}
