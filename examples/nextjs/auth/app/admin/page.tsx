import { forbidden, redirect } from 'next/navigation';
import { listUsersForAdmin } from '@/lib/dal';

export default async function AdminPage() {
  // The same DAL function the Route Handler uses, so the page and the API
  // cannot drift apart on who may list users.
  const result = await listUsersForAdmin();
  if (result.status === 'unauthenticated') redirect('/login');
  // Experimental: needs experimental.authInterrupts (see next.config.ts).
  // Renders app/forbidden.tsx with a 403 status.
  if (result.status === 'forbidden') forbidden();

  return (
    <main>
      <h1>Users</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {result.data.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
