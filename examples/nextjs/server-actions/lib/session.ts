import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

// A deliberately small fake session so the demo needs no database or auth
// provider. The cookie holds a user id plus an HMAC signature, so a visitor
// cannot edit the cookie to become someone else. It is still a demo: use a real
// session library (see the Authentication pages) in an application.

export type Role = 'user' | 'admin';

export type SessionUser = {
  id: string;
  name: string;
  role: Role;
};

export const DEMO_USERS = [
  { id: 'ada', name: 'Ada', role: 'user' },
  { id: 'grace', name: 'Grace', role: 'user' },
  { id: 'admin', name: 'Admin', role: 'admin' },
] as const satisfies readonly SessionUser[];

export type DemoUserId = (typeof DEMO_USERS)[number]['id'];

const SESSION_COOKIE = 'demo_session';

// A random secret per server process. Restarting the server signs everyone out,
// which matches the in-memory todo store being reset on restart.
const globalForSession = globalThis as typeof globalThis & {
  demoSessionSecret?: Buffer;
};
const secret = (globalForSession.demoSessionSecret ??= randomBytes(32));

function sign(userId: string): string {
  return createHmac('sha256', secret).update(userId).digest('base64url');
}

function verify(value: string): string | null {
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const userId = value.slice(0, separator);
  const given = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(userId));

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  return userId;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const userId = verify(raw);
  const user = DEMO_USERS.find((candidate) => candidate.id === userId);
  return user ? { id: user.id, name: user.name, role: user.role } : null;
}

// Cookies can only be written in a Server Action or Route Handler.
export async function startSession(userId: DemoUserId): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
