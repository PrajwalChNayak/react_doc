import { Suspense } from 'react';
import { connection } from 'next/server';
import { wait } from '@/lib/flaky';

async function Headlines() {
  await wait(500);
  return <p>Three new headlines. This section waited half a second.</p>;
}

async function Recommendations() {
  await wait(2500);
  return <p>Five recommendations. This section waited two and a half seconds.</p>;
}

export default async function FeedPage() {
  await connection();

  return (
    <main>
      <h1>Feed</h1>
      <p>This heading is not behind any fallback, so it paints immediately.</p>
      <Suspense fallback={<p>Loading headlines...</p>}>
        <Headlines />
      </Suspense>
      <Suspense fallback={<p>Loading recommendations...</p>}>
        <Recommendations />
      </Suspense>
    </main>
  );
}
