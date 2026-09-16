import { Suspense } from 'react';
import { createPrismaEntry } from '@/app/actions';
import { EntryForm } from '@/app/entry-form';
import { EntryList } from '@/app/entry-list';
import { listEntriesWithPrisma } from '@/lib/data/guestbook';

// The heading and form are part of the static shell. The list streams in at
// request time, behind <Suspense>, so `next build` needs no database.
export default function PrismaGuestbookPage() {
  return (
    <main>
      <h1>Guestbook (Prisma ORM 7)</h1>
      <EntryForm action={createPrismaEntry} />
      <Suspense fallback={<p>Loading entries…</p>}>
        <PrismaEntries />
      </Suspense>
    </main>
  );
}

async function PrismaEntries() {
  const entries = await listEntriesWithPrisma();
  return <EntryList entries={entries} />;
}
