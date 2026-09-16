import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Experimental in Next.js 16.3. Enables forbidden() and unauthorized()
    // from next/navigation, which app/admin/page.tsx uses to render
    // app/forbidden.tsx with a 403 status.
    authInterrupts: true,
  },
};

export default nextConfig;
