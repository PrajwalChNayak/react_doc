import 'server-only';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { SessionPayload } from './definitions';

export const SESSION_COOKIE = 'session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters. See .env.example.');
  }
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(new Date(payload.expiresAt))
    .sign(getKey());
}

// Returns null for a missing, tampered, expired or malformed token. Never
// throws for bad input, because the input comes from the client.
export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string' || typeof payload.sessionVersion !== 'number') {
      return null;
    }
    return {
      userId: payload.userId,
      sessionVersion: payload.sessionVersion,
      expiresAt: String(payload.expiresAt),
    };
  } catch {
    return null;
  }
}

// Call only from a Server Action or Route Handler: cookies cannot be set while
// a Server Component renders.
export async function createSession(userId: string, sessionVersion: number) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encrypt({ userId, sessionVersion, expiresAt: expiresAt.toISOString() });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Browsers treat http://localhost as secure, but some do not send Secure
    // cookies over plain HTTP. Production must be HTTPS.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
