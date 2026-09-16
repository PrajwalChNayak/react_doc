import { z } from 'zod';

// Shared by both Server Actions. The limits match the column sizes in
// prisma/schema.prisma and lib/db/schema.ts.
export const guestbookEntrySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Enter your name.' })
    .max(80, { error: 'Keep your name under 80 characters.' }),
  message: z
    .string()
    .trim()
    .min(1, { error: 'Write a message.' })
    .max(500, { error: 'Keep your message under 500 characters.' }),
});

export type GuestbookEntryInput = z.infer<typeof guestbookEntrySchema>;

export type FormState = {
  ok: boolean;
  message: string | null;
  fieldErrors: { name?: string[]; message?: string[] };
};

export const initialFormState: FormState = { ok: false, message: null, fieldErrors: {} };
