import * as z from 'zod';

export const LoginFormSchema = z.object({
  email: z.email({ error: 'Enter a valid email address.' }).trim(),
  password: z.string().min(1, { error: 'Enter your password.' }),
});

export type LoginFormState =
  | {
      errors?: { email?: string[]; password?: string[] };
      message?: string;
    }
  | undefined;

export type Role = 'admin' | 'member';

// What the signed cookie carries. Deliberately minimal: no email, no name and
// no role. The role is looked up on every request in lib/dal.ts, so demoting a
// user takes effect immediately instead of when their cookie expires.
export type SessionPayload = {
  userId: string;
  // Bumped in the user store to revoke every existing session for a user.
  sessionVersion: number;
  expiresAt: string;
};
