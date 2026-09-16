import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Opt in to Cache Components: nothing is cached unless you say so.
  cacheComponents: true,
  cacheLife: {
    // A custom profile for the product catalog. Every value is in seconds.
    catalog: {
      stale: 300, // the browser may reuse the result for 5 minutes
      revalidate: 1800, // after 30 minutes, the next request refreshes it in the background
      expire: 86400, // after a day without traffic, the next request waits for fresh data
    },
  },
};

export default nextConfig;
