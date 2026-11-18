'use client';

import { useState } from 'react';

import { startCheckout } from './actions';

// FIXED. The Client Component never reads the key. It calls a Server Action,
// and the only thing it knows about the key is whether payments are configured.
export function PaymentsWidget({ configured }: { configured: boolean }) {
  const [checkoutId, setCheckoutId] = useState<string | null>(null);

  return (
    <button
      type="button"
      disabled={!configured}
      onClick={async () => {
        const result = await startCheckout();
        setCheckoutId(result.checkoutId);
      }}
    >
      {checkoutId ? `Checkout ${checkoutId}` : 'Pay now'}
    </button>
  );
}
