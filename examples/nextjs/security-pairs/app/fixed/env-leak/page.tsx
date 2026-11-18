import { connection } from 'next/server';

import { isPaymentsConfigured } from '@/lib/payments';

import { PaymentsWidget } from './payments-widget';

export default async function FixedEnvLeakPage() {
  // Read the environment at request time, not at build time.
  await connection();

  return (
    <main>
      <h1>Checkout (fixed)</h1>
      <p>The payments key stays on the server.</p>
      <PaymentsWidget configured={isPaymentsConfigured()} />
    </main>
  );
}
