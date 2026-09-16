import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>Auth example</h1>
      <p>Sign in as the admin or the member described in README.md, then compare what each can reach.</p>
      <ul>
        <li>
          <Link href="/login">Sign in</Link>
        </li>
        <li>
          <Link href="/dashboard">Dashboard</Link> (any signed-in user)
        </li>
        <li>
          <Link href="/admin">Admin</Link> (admins only)
        </li>
      </ul>
    </main>
  );
}
