import { connection } from 'next/server';
import { wait } from '@/lib/flaky';

export default async function DashboardPage() {
  await connection();
  await wait(2000);

  return (
    <main>
      <h1>Dashboard</h1>
      <div style={{ height: 96, boxSizing: 'border-box', borderRadius: 8, border: '1px solid #d1d5db', padding: '1rem' }}>
        1,204 active users. The whole page waited two seconds behind loading.tsx.
      </div>
    </main>
  );
}
