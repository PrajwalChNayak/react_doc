import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getServerEnv } from './env';

export const SESSION_COOKIE = 'session';

// A deliberately small signed-cookie session: "<userId>.<hex HMAC of userId>".
// It exists to show the difference between the optimistic check in proxy.ts
// (is a cookie present?) and the real check here (is the cookie authentic?).
// Use an auth library or the patterns in the Authentication docs for real apps.

function sign(userId: string): string {
  return createHmac('sha256', getServerEnv().SESSION_SECRET).update(userId).digest('hex');
}

export function createSessionValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function verifySessionValue(value: string | undefined): { userId: string } | null {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const userId = value.slice(0, separator);
  const received = Buffer.from(value.slice(separator + 1), 'hex');
  const expected = Buffer.from(sign(userId), 'hex');

  // timingSafeEqual throws on different lengths, so compare lengths first.
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }
  return { userId };
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  return verifySessionValue(cookieStore.get(SESSION_COOKIE)?.value);
}
