import type { EntryDTO } from '@/lib/data/guestbook';

export function EntryList({ entries }: { entries: EntryDTO[] }) {
  if (entries.length === 0) {
    return <p>No entries yet. Be the first.</p>;
  }

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id}>
          <strong>{entry.name}</strong>{' '}
          <time dateTime={entry.createdAt}>{entry.createdAt.slice(0, 10)}</time>
          <br />
          {entry.message}
        </li>
      ))}
    </ul>
  );
}
