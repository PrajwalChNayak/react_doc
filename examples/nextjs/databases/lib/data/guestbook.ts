import 'server-only';
import { desc } from 'drizzle-orm';
import { io } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { prisma } from '@/lib/db/prisma';
import { guestbookEntries } from '@/lib/db/schema';
import type { GuestbookEntryInput } from '@/lib/validation';

// The data access layer: every query in the app goes through this module.
// It returns plain DTOs (no ORM objects), so pages can pass the result to
// Client Components without leaking extra columns.

export type EntryDTO = { id: number; name: string; message: string; createdAt: string };

const PAGE_SIZE = 20;

export async function listEntriesWithPrisma(): Promise<EntryDTO[]> {
  // With Cache Components, io() stops prerendering here, so `next build` never
  // starts the query and needs no database. At request time it resolves
  // immediately. The 16.3 docs prefer it to connection(), which would also
  // block prefetching.
  await io();
  const rows = await prisma.guestbookEntry.findMany({
    select: { id: true, name: true, message: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
  });
  return rows.map(
    (row: { id: number; name: string; message: string; createdAt: Date }) => ({
      id: row.id,
      name: row.name,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    }),
  );
}

export async function listEntriesWithDrizzle(): Promise<EntryDTO[]> {
  await io();
  const rows = await db
    .select({
      id: guestbookEntries.id,
      name: guestbookEntries.name,
      message: guestbookEntries.message,
      createdAt: guestbookEntries.createdAt,
    })
    .from(guestbookEntries)
    .orderBy(desc(guestbookEntries.createdAt))
    .limit(PAGE_SIZE);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

// Inputs are already validated by the caller. Both ORMs send the values as
// bound parameters, never as SQL text.
export async function createEntryWithPrisma(input: GuestbookEntryInput) {
  await prisma.guestbookEntry.create({ data: input });
}

export async function createEntryWithDrizzle(input: GuestbookEntryInput) {
  await db.insert(guestbookEntries).values(input);
}
