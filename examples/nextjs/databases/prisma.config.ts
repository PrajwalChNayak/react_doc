import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma ORM 7 reads its CLI configuration from this file. It no longer loads
// .env on its own, hence the dotenv import above.
//
// `process.env` rather than the `env()` helper: `env()` throws when the
// variable is missing, and `prisma generate` (run on postinstall and prebuild)
// must work on a machine or CI step that has no database URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
