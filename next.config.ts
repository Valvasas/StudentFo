import type { NextConfig } from 'next';

/**
 * Security headers dipasang di level framework, bukan diserahkan ke hosting.
 * Alasan: kalau deploy pindah dari Vercel ke mana pun, header ini tetap ikut.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes sengaja tidak diaktifkan: href dinamis di produk ini dibangun
  // dari slug (`/events/${slug}`), dan typedRoutes menolak template string
  // semacam itu — biayanya lebih besar daripada manfaatnya di sini.
  experimental: {
    // Tree-shake barrel import lucide-react supaya bundle tidak membengkak.
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
