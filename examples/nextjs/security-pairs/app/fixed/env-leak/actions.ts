'use server';

import { createCheckoutSession } from '@/lib/payments';

// The key is used here, on the server. The client only receives the result.
export async function startCheckout(): Promise<{ checkoutId: string }> {
  return createCheckoutSession(4_900);
}
