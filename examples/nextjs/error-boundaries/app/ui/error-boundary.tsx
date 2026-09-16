'use client';

import { catchError, type ErrorInfo } from 'next/error';

type FallbackProps = {
  title: string;
};

function ErrorFallback({ title }: FallbackProps, { error, retry, reset }: ErrorInfo) {
  // `error` is typed `unknown`: anything can be thrown. Narrow before reading it.
  const message = error instanceof Error ? error.message : 'Unknown error';
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined;

  return (
    <section role="alert" style={{ border: '1px solid #f87171', borderRadius: 8, padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p>{message}</p>
      {digest ? <p style={{ fontSize: 12 }}>Reference: {digest}</p> : null}
      {/* retry() re-fetches and re-renders the Server Components inside the boundary. */}
      <button type="button" onClick={() => retry()}>
        Try again
      </button>{' '}
      {/* reset() only clears the client error state. It cannot fix a server failure. */}
      <button type="button" onClick={() => reset()}>
        Reset (client only)
      </button>
    </section>
  );
}

export default catchError(ErrorFallback);
