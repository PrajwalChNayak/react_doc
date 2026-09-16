import { integer, pgSchema, timestamp, varchar } from 'drizzle-orm/pg-core';

// Drizzle's schema is TypeScript. drizzle-kit diffs it to produce the SQL in
// ./drizzle, and drizzle-orm infers row types from it.
//
// This file has no `server-only` import because drizzle-kit loads it outside
// Next.js. It holds table definitions only, never credentials.
export const drizzleDemo = pgSchema('drizzle_demo');

export const guestbookEntries = drizzleDemo.table('guestbook_entries', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 80 }).notNull(),
  message: varchar('message', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GuestbookEntry = typeof guestbookEntries.$inferSelect;
export type NewGuestbookEntry = typeof guestbookEntries.$inferInsert;
