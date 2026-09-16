import { after } from 'next/server';
import { getServerEnv } from '@/lib/env';
import {
  fulfillOrder,
  isValidSignature,
  markEventReceived,
  orderEventSchema,
} from '@/lib/webhooks';

// POST /api/webhooks/orders
// Header: x-signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with WEBHOOK_SECRET>

export async function POST(request: Request) {
  // 1. Read the raw body once, as text. The signature covers these exact bytes.
  //    Re-serializing parsed JSON would not reproduce them.
  const rawBody = await request.text();

  // 2. Verify before parsing or trusting anything in the payload.
  const signature = request.headers.get('x-signature');
  if (!isValidSignature(rawBody, signature, getServerEnv().WEBHOOK_SECRET)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Parse and validate the shape.
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Body must be valid JSON' }, { status: 400 });
  }
  const parsed = orderEventSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Unsupported event' }, { status: 422 });
  }
  const event = parsed.data;

  // 4. Idempotency: acknowledge a duplicate delivery without redoing the work.
  if (!markEventReceived(event.id)) {
    return Response.json({ received: true, duplicate: true });
  }

  // 5. Acknowledge quickly, then do the slow part after the response is sent.
  after(() => fulfillOrder(event));

  return Response.json({ received: true }, { status: 202 });
}
