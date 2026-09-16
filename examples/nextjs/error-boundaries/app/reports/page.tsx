import { connection } from 'next/server';
import { failEveryOtherCall } from '@/lib/flaky';

export default async function ReportsPage() {
  await connection();
  const attempt = await failEveryOtherCall('reports', 'Report query failed');

  return <p>Quarterly revenue: $1.2M. Loaded on server call {attempt}.</p>;
}
