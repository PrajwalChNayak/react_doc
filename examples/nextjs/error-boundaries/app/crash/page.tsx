import { connection } from 'next/server';
import { failEveryOtherCall } from '@/lib/flaky';

// There is no app/error.tsx and no app/crash/error.tsx, so an error here
// reaches app/global-error.tsx, which replaces the root layout.
export default async function CrashPage() {
  await connection();
  const attempt = await failEveryOtherCall('crash', 'Unhandled failure with no segment boundary');

  return (
    <main>
      <h1>Recovered</h1>
      <p>The page rendered on server call {attempt}.</p>
    </main>
  );
}
