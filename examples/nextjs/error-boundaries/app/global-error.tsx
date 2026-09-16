'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('Root error boundary', error.digest ?? error.message);
  }, [error]);

  // global-error replaces the root layout, so it renders its own <html> and <body>.
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <title>Something went wrong</title>
        <h1>Something went wrong</h1>
        <p>The navigation bar is gone because the root layout was replaced.</p>
        {error.digest ? <p style={{ fontSize: 12 }}>Reference: {error.digest}</p> : null}
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
