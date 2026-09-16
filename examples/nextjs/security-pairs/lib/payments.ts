import 'server-only';

// FIXED side of the env-leak pair. The key has no NEXT_PUBLIC_ prefix, so
// Next.js never inlines it into browser JavaScript, and `server-only` turns an
// accidental import from a Client Component into a build error.
function paymentsSecretKey(): string {
  const key = process.env.PAYMENTS_SECRET_KEY;
  if (!key) throw new Error('PAYMENTS_SECRET_KEY is not set');
  return key;
}

export function isPaymentsConfigured(): boolean {
  return Boolean(process.env.PAYMENTS_SECRET_KEY);
}

export async function createCheckoutSession(amountCents: number): Promise<{ checkoutId: string }> {
  // A real app would call the payment provider here with the key in an
  // Authorization header. The demo only proves the key is available server-side.
  const key = paymentsSecretKey();
  return { checkoutId: `demo_${amountCents}_${key.length}` };
}
