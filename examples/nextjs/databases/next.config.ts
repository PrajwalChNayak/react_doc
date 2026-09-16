import type { NextConfig } from 'next';

// Cache Components makes uncached work run at request time by default. The
// guestbook pages read the database after `await io()` inside <Suspense>,
// so `next build` prerenders the shell and never opens a database connection.
// `pg`, `@prisma/client` and `prisma` are already on Next.js's built-in
// `serverExternalPackages` list, so no bundler configuration is needed.
const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
