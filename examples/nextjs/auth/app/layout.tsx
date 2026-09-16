import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auth example',
  description: 'Sessions, a Data Access Layer and role checks in Next.js 16.3.',
};

// No session read here. Layouts are not re-rendered on client navigation, so
// an auth check in a layout does not protect the pages beneath it.
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
