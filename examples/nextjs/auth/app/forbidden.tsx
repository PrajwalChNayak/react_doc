import Link from 'next/link';

export default function Forbidden() {
  return (
    <main>
      <h1>403: Forbidden</h1>
      <p>Your account does not have access to this page.</p>
      <Link href="/dashboard">Back to the dashboard</Link>
    </main>
  );
}
