import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import { can, getCurrentUser, requireSession } from '@/lib/dal';

export default async function DashboardPage() {
  // proxy.ts only saw that *a* cookie exists. This verifies it.
  const session = await requireSession();
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <main>
      <h1>Welcome, {user.name}</h1>
      <p>
        Signed in as {user.email} with the {user.role} role.
      </p>
      {/* Hiding the link is UX. /admin and /api/admin/users check the role themselves. */}
      {can(session, 'users:list') && (
        <p>
          <Link href="/admin">Manage users</Link>
        </p>
      )}
      <form action={logout}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
