import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Error boundaries example',
  description: 'catchError, error.tsx, global-error.tsx, not-found.tsx and loading UI in Next.js 16.3.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <Link href="/">Home</Link>
          <Link href="/inventory">catchError</Link>
          <Link href="/reports">error.tsx</Link>
          <Link href="/invoices/inv-1001">Invoice</Link>
          <Link href="/invoices/inv-9999">Missing invoice</Link>
          <Link href="/crash">global-error</Link>
          <Link href="/dashboard">loading.tsx</Link>
          <Link href="/feed">Inline Suspense</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
