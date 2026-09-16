import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Instant Navigations are opt-in in 16.3 and need both flags.
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Experimental. Exposes the instant() testing API in `next start` so the
    // Playwright suite can run against a production build. playwright.config.ts
    // sets INSTANT_TESTING=1 for its own server only. Never enable this on a
    // deployment that real users reach.
    exposeTestingApiInProductionBuild: process.env.INSTANT_TESTING === '1',
  },
};

export default nextConfig;
