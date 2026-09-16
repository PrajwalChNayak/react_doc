import { Suspense } from 'react';
import { connection } from 'next/server';
import ErrorBoundary from '@/app/ui/error-boundary';
import { failEveryOtherCall } from '@/lib/flaky';

async function StockLevels() {
  const attempt = await failEveryOtherCall('inventory', 'Inventory service timed out');
  return <p>42 units in stock. Loaded on server call {attempt}.</p>;
}

export default async function InventoryPage() {
  // Render at request time, so every visit and every retry() runs the fetch again.
  await connection();

  return (
    <main>
      <h1>Inventory</h1>
      <p>This heading is outside the boundary and never disappears.</p>
      <ErrorBoundary title="Stock levels are unavailable">
        <Suspense fallback={<p>Loading stock levels...</p>}>
          <StockLevels />
        </Suspense>
      </ErrorBoundary>
    </main>
  );
}
