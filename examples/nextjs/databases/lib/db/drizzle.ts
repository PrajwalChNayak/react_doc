import 'server-only';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// One pg Pool per server process, cached on globalThis in development so hot
// reloads in `next dev` reuse it instead of opening a new pool on every save.
const globalForDrizzle = globalThis as unknown as {
  drizzlePool?: Pool;
};

const pool =
  globalForDrizzle.drizzlePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDrizzle.drizzlePool = pool;
}

// The Pool does not connect until the first query, so importing this module
// during `next build` is safe.
export const db: NodePgDatabase<typeof schema> = drizzle({ client: pool, schema });
