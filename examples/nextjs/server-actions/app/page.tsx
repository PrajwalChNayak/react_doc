import { DEMO_USERS, getSessionUser } from '@/lib/session';
import { listTodos } from '@/lib/todos';
import { signIn, signOut } from './actions';
import { Todos } from './todos';
import type { TodoView } from './todo-types';

export default async function HomePage() {
  // Reading cookies makes this page render at request time, which is what an
  // in-memory, uncached store needs.
  const [user, records] = await Promise.all([getSessionUser(), listTodos()]);

  // Pass the Client Component only what it renders, not the stored records.
  const todos: TodoView[] = records.map((record) => ({
    id: record.id,
    text: record.text,
    ownerName: record.ownerName,
    isMine: record.ownerId === user?.id,
  }));

  return (
    <main>
      <h1>Server Actions</h1>

      <section aria-labelledby="session-heading">
        <h2 id="session-heading">Session</h2>
        {user ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>
              Signed in as <strong>{user.name}</strong> ({user.role})
            </span>
            <form action={signOut}>
              <button type="submit">Sign out</button>
            </form>
          </div>
        ) : (
          <p>Not signed in.</p>
        )}

        {/* A Server Component form: it posts to the server with or without JavaScript. */}
        <form action={signIn} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <label htmlFor="user-id">Sign in as</label>
          <select id="user-id" name="userId" defaultValue={user?.id ?? 'ada'}>
            {DEMO_USERS.map((demoUser) => (
              <option key={demoUser.id} value={demoUser.id}>
                {demoUser.name} ({demoUser.role})
              </option>
            ))}
          </select>
          <button type="submit">Sign in</button>
        </form>
      </section>

      <Todos todos={todos} viewerName={user?.name ?? null} />
    </main>
  );
}
