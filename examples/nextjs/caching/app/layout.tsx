import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Caching example',
  description: 'Cache Components, use cache, cacheLife, cacheTag, updateTag and revalidateTag.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        {children}
      </body>
    </html>
  );
}
