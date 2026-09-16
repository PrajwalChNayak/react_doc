import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>Errors and loading UI</h1>
      <ul>
        <li>
          <Link href="/inventory">/inventory</Link>: a Server Component that fails every other request, inside a{' '}
          <code>catchError</code> boundary whose button calls <code>retry()</code>.
        </li>
        <li>
          <Link href="/reports">/reports</Link>: the same kind of failure caught by a segment <code>error.tsx</code>.
          The layout above it stays on screen.
        </li>
        <li>
          <Link href="/invoices/inv-9999">/invoices/inv-9999</Link>: <code>notFound()</code> thrown inside a{' '}
          <code>catchError</code> boundary. The boundary lets it through and <code>not-found.tsx</code> renders.
        </li>
        <li>
          <Link href="/crash">/crash</Link>: an error with no <code>error.tsx</code> above it, so{' '}
          <code>global-error.tsx</code> replaces the root layout.
        </li>
        <li>
          <Link href="/dashboard">/dashboard</Link>: a slow page with a <code>loading.tsx</code> fallback.
        </li>
        <li>
          <Link href="/feed">/feed</Link>: a similar wait split into two inline <code>&lt;Suspense&gt;</code>{' '}
          boundaries.
        </li>
      </ul>
    </main>
  );
}
