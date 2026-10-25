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
  // Optimizer gambar hanya untuk foto galeri (ADR-056) — tanpa daftar ini
  // `/_next/image` mau mengubah ukuran rute lokal APA PUN, termasuk rute yang
  // mahal dirender, sehingga jadi pengganda beban bagi siapa saja.
  images: {
    localPatterns: [{ pathname: '/media/foto/**', search: '' }],
  },
  poweredByHeader: false,
  // typedRoutes sengaja tidak diaktifkan: href dinamis di produk ini dibangun
  // dari slug (`/events/${slug}`), dan typedRoutes menolak template string
  // semacam itu — biayanya lebih besar daripada manfaatnya di sini.
  experimental: {
    // Tree-shake barrel import lucide-react supaya bundle tidak membengkak.
    optimizePackageImports: ['lucide-react'],
    // middleware.ts cocok dengan semua rute, dan Next menyalin badan permintaan
    // untuknya dengan plafon bawaan 10 MB — sisanya DIPOTONG sebelum sampai ke
    // Server Action (multipart rusak). Harus sama dengan bodySizeLimit di bawah.
    middlewareClientMaxBodySize: '32mb',
    serverActions: {
      allowedOrigins: serverActionOrigins(),
      // Bawaan 1 MB menolak satu foto ponsel pun. 32 MB = GALLERY_LIMITS.perUpload
      // (6) × IMAGE_LIMITS.maxBytes (5 MB) + ruang untuk overhead multipart:
      // unggahan tanpa JavaScript yang lolos batas per berkas tidak boleh
      // berakhir di halaman 413 mentah (dengan JS foto diperkecil di peramban
      // ke ±0,5 MB). Batas per berkas, jenis, & jumlah tetap diperiksa di
      // Server Action — ini hanya plafon ukuran badan permintaan (ADR-056).
      bodySizeLimit: '32mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Peramban lama, crawler, dan sebagian WebView meminta `/favicon.ico`
  // langsung tanpa membaca <link rel="icon">. Ikon dibangkitkan `app/icon.tsx`
  // (tanpa berkas biner di repo); PNG di alamat .ico diterima semua peramban.
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/icon/32' }];
  },
};

export default nextConfig;
