import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';

// One PrismaClient (and so one pg pool) per server process.
//
// In `next dev`, editing a file re-evaluates this module. Without the
// globalThis cache every save would open a new pool and leak the old one's
// connections until Postgres runs out. In production the module is evaluated
// once per process, so the cache is skipped.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  // Prisma ORM 7 talks to Postgres through the `pg` driver. The adapter
  // accepts pg pool options; `max` caps connections for this process.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
