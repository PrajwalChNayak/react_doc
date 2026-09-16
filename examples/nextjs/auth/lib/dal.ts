import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role } from './definitions';
import { SESSION_COOKIE, decrypt } from './session';
import { findUserById, listAllUsers } from './users';

// The Data Access Layer. Every read of user data goes through this module,
// and every function here authorizes before it returns anything. proxy.ts is
// a convenience for browsers; this file is the security boundary.

export type Session = { userId: string; role: Role };

/**
 * Verifies the session cookie and re-reads the user on the server.
 * Memoized with React cache() so a page, its layout and its components share
 * one verification per request. Returns null instead of redirecting, so Route
 * Handlers can answer 401 rather than a redirect.
 */
export const verifySession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await decrypt(token);
  if (!payload) return null;

  // A valid signature proves we issued the token, not that the user still
  // exists or still has the same access. Look them up on every request.
  const user = await findUserById(payload.userId);
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;

  return { userId: user.id, role: user.role };
});

/** For pages: send signed-out visitors to the login page. */
export async function requireSession(): Promise<Session> {
  const session = await verifySession();
  if (!session) redirect('/login');
  return session;
}

type Permission = 'users:list' | 'dashboard:view';

const permissions: Record<Role, readonly Permission[]> = {
  admin: ['dashboard:view', 'users:list'],
  member: ['dashboard:view'],
};

export function can(session: Session, permission: Permission) {
  return permissions[session.role].includes(permission);
}

export type AuthResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' };

// DTOs: only the fields a caller is allowed to see. Password hashes,
// session versions and internal notes never leave this module.
export type CurrentUserDTO = { id: string; name: string; email: string; role: Role };
export type AdminUserRowDTO = { id: string; name: string; email: string; role: Role };

export const getCurrentUser = cache(async (): Promise<CurrentUserDTO | null> => {
  const session = await verifySession();
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

/** Used by both app/admin/page.tsx and app/api/admin/users/route.ts. */
export async function listUsersForAdmin(): Promise<AuthResult<AdminUserRowDTO[]>> {
  const session = await verifySession();
  if (!session) return { status: 'unauthenticated' };
  if (!can(session, 'users:list')) return { status: 'forbidden' };

  const users = await listAllUsers();
  return {
    status: 'ok',
    data: users.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role })),
  };
}
