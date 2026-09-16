import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const orderEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['order.paid', 'order.refunded']),
  data: z.object({ orderId: z.string().min(1) }),
});

export type OrderEvent = z.infer<typeof orderEventSchema>;

// Header format: "sha256=<hex digest of the raw body>".
export function isValidSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;

  const received = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();

  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Idempotency: providers retry, so the same event id can arrive more than once.
// In-memory for the demo. Use a unique constraint in your database in production.
const globalForEvents = globalThis as typeof globalThis & { __processedEvents?: Set<string> };
const processedEvents = globalForEvents.__processedEvents ?? new Set<string>();
globalForEvents.__processedEvents = processedEvents;

export function markEventReceived(eventId: string): boolean {
  if (processedEvents.has(eventId)) return false;
  processedEvents.add(eventId);
  return true;
}

export async function fulfillOrder(event: OrderEvent): Promise<void> {
  // Stand-in for slow work: emails, inventory, a call to another service.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log(`[webhook] processed ${event.type} for ${event.data.orderId} (${event.id})`);
}
