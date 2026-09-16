'use client';

import { useEffect } from 'react';

// Expected failures (not signed in, invalid input, not allowed) are returned as
// state by the actions. Only unexpected errors, which are bugs, reach this file.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>The error was logged. Reference: {error.digest ?? 'n/a'}</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
