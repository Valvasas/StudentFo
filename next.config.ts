import type { NextConfig } from 'next';
import { HSTS_VALUE, STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

/**
 * Security headers dipasang di level framework, bukan diserahkan ke hosting.
 * Alasan: kalau deploy pindah dari Vercel ke mana pun, header ini tetap ikut.
 * CSP tidak di sini karena nonce-nya berbeda per request — lihat middleware.
 */
const securityHeaders = [
  ...STATIC_SECURITY_HEADERS,
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: HSTS_VALUE }]
    : []),
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
