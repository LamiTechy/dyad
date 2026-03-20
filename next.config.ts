import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  typedRoutes: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
}
export default nextConfig
