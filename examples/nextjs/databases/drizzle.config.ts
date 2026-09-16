import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit reads this file for `generate` (diff the TypeScript schema
// against the last snapshot in ./drizzle) and `migrate` (apply pending SQL
// files). The Next.js app never imports it.
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  // Only look at the schema Drizzle owns; public belongs to Prisma here.
  schemaFilter: ['drizzle_demo'],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
