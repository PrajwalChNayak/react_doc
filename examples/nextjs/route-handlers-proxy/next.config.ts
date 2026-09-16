import type { NextConfig } from 'next';

// Every default in Next.js 16.3 is what this app wants: the Node.js runtime for
// Route Handlers and proxy.ts, and Turbopack for dev and build.
//
// Cache Components is not enabled. Every GET handler in this app reads the
// request (URL, headers or cookies), so each one would still run per request if
// you turned `cacheComponents: true` on.
const nextConfig: NextConfig = {};

export default nextConfig;
