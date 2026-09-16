'use server';

import { z } from 'zod';
import { refresh } from 'next/cache';
import { createEntryWithDrizzle, createEntryWithPrisma } from '@/lib/data/guestbook';
import { guestbookEntrySchema, type FormState, type GuestbookEntryInput } from '@/lib/validation';

// Server Actions are public HTTP endpoints. Validate everything that arrives
// in FormData before it reaches the database.
//
// A real guestbook would also check who is signing it (see the auth pages);
// this example is about the database layer, so it accepts anonymous entries.

async function handle(
  formData: FormData,
  write: (input: GuestbookEntryInput) => Promise<void>,
): Promise<FormState> {
  const parsed = guestbookEntrySchema.safeParse({
    name: formData.get('name'),
    message: formData.get('message'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: 'Fix the highlighted fields.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await write(parsed.data);
  } catch (error) {
    console.error('Guestbook insert failed', error);
    return { ok: false, message: 'Could not save your entry. Try again.', fieldErrors: {} };
  }

  // The lists are read at request time (not cached), so there is no cache tag
  // to invalidate. refresh() tells the client router to re-render the page.
  refresh();
  return { ok: true, message: 'Thanks for signing!', fieldErrors: {} };
}

export async function createPrismaEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  return handle(formData, createEntryWithPrisma);
}

export async function createDrizzleEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  return handle(formData, createEntryWithDrizzle);
}
