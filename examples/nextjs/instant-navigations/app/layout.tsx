import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Instant Navigations example',
  description: 'Partial Prefetching, a cached product shell, and streamed inventory.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 720, padding: 16 }}>
        <header>
          <nav style={{ display: 'flex', gap: 16 }}>
            <Link href="/">Home</Link>
            <Link href="/store">Store</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
