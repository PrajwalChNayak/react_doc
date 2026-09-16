import { Suspense } from 'react';
import { createDrizzleEntry } from '@/app/actions';
import { EntryForm } from '@/app/entry-form';
import { EntryList } from '@/app/entry-list';
import { listEntriesWithDrizzle } from '@/lib/data/guestbook';

export default function DrizzleGuestbookPage() {
  return (
    <main>
      <h1>Guestbook (Drizzle ORM)</h1>
      <EntryForm action={createDrizzleEntry} />
      <Suspense fallback={<p>Loading entries…</p>}>
        <DrizzleEntries />
      </Suspense>
    </main>
  );
}

async function DrizzleEntries() {
  const entries = await listEntriesWithDrizzle();
  return <EntryList entries={entries} />;
}
