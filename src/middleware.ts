import { NextResponse, type NextRequest } from 'next/server';
import { dataMode, env } from '@/lib/env';
import { buildContentSecurityPolicy, generateNonce, NONCE_HEADER } from '@/lib/security-headers';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV !== 'production',
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  });

  // CSP ditaruh juga di header REQUEST: dari situlah Next.js membaca nonce
  // untuk skrip bawaannya sendiri. Tanpa ini halaman terkirim dengan CSP
  // yang memblokir skrip hidrasinya sendiri.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // Mode data contoh tidak punya sesi Supabase untuk disegarkan, supaya
  // `npm run dev` tanpa kredensial tetap nol-konfigurasi.
  const response =
    dataMode === 'seed'
      ? NextResponse.next({ request: { headers: requestHeaders } })
      : await updateSession(request, requestHeaders);

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Semua rute KECUALI aset statis. Penyegaran token dan CSP harus ikut di
     * navigasi halaman biasa; menjalankannya untuk setiap berkas gambar
     * hanya menambah latensi tanpa manfaat. Prefetch juga dilewati: nonce-nya
     * tidak pernah dipakai, dan menghitung CSP untuknya hanya membuang waktu.
     */
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
