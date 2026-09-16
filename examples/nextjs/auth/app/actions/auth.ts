'use server';

import * as z from 'zod';
import { redirect } from 'next/navigation';
import { LoginFormSchema, type LoginFormState } from '@/lib/definitions';
import { createSession, deleteSession } from '@/lib/session';
import { checkCredentials } from '@/lib/users';

export async function login(_state: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = LoginFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const user = await checkCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    // One message for "no such user" and "wrong password".
    return { message: 'Invalid email or password.' };
  }

  // A fresh token on every login, so a token issued before login is never reused.
  await createSession(user.id, user.sessionVersion);
  // redirect() throws, so it stays outside any try/catch.
  redirect('/dashboard');
}

export async function logout() {
  await deleteSession();
  redirect('/login');
}
