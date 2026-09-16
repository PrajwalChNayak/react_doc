import 'server-only';
import { z } from 'zod';

// Server-only configuration, validated once on first use.
//
// Parsing lazily (inside a function, not at module scope) keeps `next build`
// working on a machine that has no secrets: the build imports route modules,
// but no handler runs until a request arrives.
const serverEnvSchema = z.object({
  WEBHOOK_SECRET: z.string().min(16, 'WEBHOOK_SECRET must be at least 16 characters'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    // Fail loudly on the server. Never echo the values themselves.
    throw new Error(
      `Invalid server environment: ${JSON.stringify(z.flattenError(result.error).fieldErrors)}`,
    );
  }
  cached = result.data;
  return cached;
}
