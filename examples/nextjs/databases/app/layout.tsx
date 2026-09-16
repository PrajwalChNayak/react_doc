import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Databases example',
  description: 'Prisma ORM 7 and Drizzle ORM with PostgreSQL in Next.js 16.3.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Home</Link> · <Link href="/prisma">Prisma</Link> ·{' '}
          <Link href="/drizzle">Drizzle</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
