'use client';

import { useEffect } from 'react';

export default function ReportsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Send this to your error reporting service. The digest matches the server log entry.
    console.error('Reports segment failed', error.digest ?? error.message);
  }, [error]);

  return (
    <div role="alert">
      <p>The report could not be loaded.</p>
      {error.digest ? <p style={{ fontSize: 12 }}>Reference: {error.digest}</p> : null}
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
