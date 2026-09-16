import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';

import { findUser, type User } from './store';

export const SESSION_COOKIE = 'demo_session';

// FAKE SESSION, FOR THIS DEMO ONLY. The cookie value is the user ID in plain
// text, so anyone can forge it. That is deliberate: every pair in this app is
// about *authorization* (what a signed-in user may do), so authentication is
// reduced to "which user does the cookie name". A real app verifies a signed or
// encrypted session here.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const userId = (await cookies()).get(SESSION_COOKIE)?.value;
  return userId ? findUser(userId) : null;
});
