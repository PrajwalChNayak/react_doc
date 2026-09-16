import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Route Handlers and proxy.ts',
  description: 'Route Handlers, CORS, streaming, webhooks and proxy.ts in Next.js 16.3.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', lineHeight: 1.5 }}>
        {children}
      </body>
    </html>
  );
}
