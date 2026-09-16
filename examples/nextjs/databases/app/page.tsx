import Link from 'next/link';

// Fully static: this page reads no data, so it is prerendered at build time.
export default function HomePage() {
  return (
    <main>
      <h1>Guestbook, twice</h1>
      <p>
        The same guestbook implemented with two ORMs against one PostgreSQL database. Each
        ORM owns its own table and its own migration history.
      </p>
      <ul>
        <li>
          <Link href="/prisma">Prisma ORM 7</Link>: <code>public.guestbook_entries</code>
        </li>
        <li>
          <Link href="/drizzle">Drizzle ORM 0.45</Link>:{' '}
          <code>drizzle_demo.guestbook_entries</code>
        </li>
      </ul>
    </main>
  );
}
