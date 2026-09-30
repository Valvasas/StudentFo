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

/**
 * Origin tambahan untuk Server Action. Next.js sudah menolak POST Server
 * Action yang header `Origin`-nya tidak sama dengan `Host`/`X-Forwarded-Host`
 * — itu pertahanan CSRF-nya, dan berlaku tanpa daftar ini. Daftar ini untuk
 * deploy di balik proxy/CDN yang meneruskan `Host` internal (mis. nama
 * container) alih-alih domain publik: tanpa itu SEMUA form ditolak di
 * produksi padahal jalan di lokal.
 */
function serverActionOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return [];
  try {
    return [new URL(raw).host];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  // Build mandiri (`.next/standalone/server.js` + node_modules minimal) untuk
  // image container — lihat Dockerfile. Tidak mengubah `next start` dan
  // tidak berpengaruh di Vercel.
  output: 'standalone',
  // e2e mode Supabase (scripts/e2e-supabase.sh) membangun ke folder terpisah
  // supaya tidak menimpa build mode seed yang dipakai audit aksesibilitas.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes sengaja tidak diaktifkan: href dinamis di produk ini dibangun
  // dari slug (`/events/${slug}`), dan typedRoutes menolak template string
  // semacam itu — biayanya lebih besar daripada manfaatnya di sini.
  experimental: {
    // Tree-shake barrel import lucide-react supaya bundle tidak membengkak.
    optimizePackageImports: ['lucide-react'],
    serverActions: {
      allowedOrigins: serverActionOrigins(),
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
