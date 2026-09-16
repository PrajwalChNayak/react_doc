import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Security pairs (intentionally vulnerable demo)',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '2rem auto', padding: '0 1rem' }}>
        <p role="alert" style={{ background: '#fee2e2', color: '#7f1d1d', padding: '0.75rem', borderRadius: 6 }}>
          <strong>Intentionally insecure demo.</strong> Every route under <code>/vulnerable</code> and{' '}
          <code>/api/vulnerable</code> is exploitable on purpose. Never deploy this app.
        </p>
        {children}
      </body>
    </html>
  );
}
