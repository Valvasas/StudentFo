import type { CookieOptionsWithName } from '@supabase/ssr';

/**
 * Atribut cookie sesi Supabase — dipakai SEMUA klien yang menulis cookie
 * (Server Component/Action di `server.ts` dan middleware).
 *
 * Bawaan `@supabase/ssr` adalah `httpOnly: false`, karena pustaka itu juga
 * melayani klien Supabase di browser yang membaca token dari `document.cookie`.
 * Produk ini sengaja TIDAK punya klien browser (ADR-010), jadi tidak ada kode
 * sah yang perlu membaca token itu. Membiarkannya terbaca JavaScript berarti
 * satu celah XSS saja cukup untuk mencuri refresh token — sesi yang bisa
 * diperpanjang penyerang terus-menerus, jauh lebih buruk dari satu kunjungan.
 *
 * Bila suatu hari klien browser ditambahkan (Realtime, dsb.), keputusan ini
 * harus ditinjau ulang lebih dulu, bukan diam-diam dibalik.
 */
export function supabaseCookieOptions(nodeEnv: string | undefined): CookieOptionsWithName {
  return {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: nodeEnv === 'production',
  };
}
