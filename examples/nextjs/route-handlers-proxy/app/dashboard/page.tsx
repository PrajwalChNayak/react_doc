import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function DashboardPage() {
  // proxy.ts only checked that a cookie exists. This is the real check:
  // a forged or tampered cookie passes proxy.ts and is rejected here.
  const session = await getSession();
  if (!session) {
    redirect('/login?returnTo=/dashboard&reason=invalid-session');
  }

  const requestId = (await headers()).get('x-request-id');

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {session.userId}.</p>
      <p>
        Request id from proxy.ts: <code>{requestId}</code>
      </p>
    </main>
  );
}
