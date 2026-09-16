import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Type-check every <Link href> and router.push() against the real route tree.
  typedRoutes: true,
}

export default nextConfig
