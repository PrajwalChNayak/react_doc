import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Server Actions example',
  description: 'Todos with Server Actions, validation, authorization and optimistic UI.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto', padding: '0 16px' }}>
        {children}
      </body>
    </html>
  );
}
