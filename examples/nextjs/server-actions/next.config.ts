import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // A todo is at most 120 characters. The default limit is 1MB; lowering it
      // rejects oversized POSTs to this app's actions before they are parsed.
      bodySizeLimit: '100kb',
    },
  },
};

export default nextConfig;
