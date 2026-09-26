/**
 * Content-Security-Policy per request.
 *
 * Nonce, bukan hash: Next.js menyisipkan skrip inline (payload RSC
 * `self.__next_f.push(...)`) yang isinya berbeda di setiap halaman, jadi
 * daftar hash tidak mungkin ditulis di depan. Konsekuensinya setiap halaman
 * wajib dirender dinamis — nonce yang ikut tersimpan di HTML statis sama
 * saja dengan nonce yang bocor. Caching dilakukan di lapisan data
 * (`unstable_cache`), bukan di keluaran HTML.
 *
 * `'strict-dynamic'` membuat skrip yang dimuat oleh skrip bernonce ikut
 * dipercaya (chunk Next.js), sementara `'self'` dan `https:` di belakangnya
 * hanya berlaku untuk browser lama yang belum mengenal `strict-dynamic` —
 * browser modern mengabaikan keduanya begitu `strict-dynamic` ada.
 */
export interface CspInput {
  readonly nonce: string;
  readonly isDev: boolean;
  /** Origin Supabase; tujuan redirect alur OAuth dari form tanpa JavaScript. */
  readonly supabaseUrl?: string | undefined;
}

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const GOOGLE_ACCOUNTS_ORIGIN = 'https://accounts.google.com';

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({ nonce, isDev, supabaseUrl }: CspInput): string {
  const supabaseOrigin = originOf(supabaseUrl);

  const directives: Record<string, readonly string[]> = {
    'default-src': ["'self'"],
    // `unsafe-eval` hanya di dev: React memakai eval untuk stack trace
    // komponen saat pengembangan. Build produksi tidak membutuhkannya.
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      'https:',
      TURNSTILE_ORIGIN,
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Atribut `style=` (tinggi batang pita "Minggu ini", jeda animasi kartu)
    // tidak bisa diberi nonce. Injeksi CSS jauh lebih sempit dampaknya
    // daripada injeksi skrip, jadi `unsafe-inline` di sini harga yang diterima.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", TURNSTILE_ORIGIN, ...(isDev ? ['ws:'] : [])],
    'frame-src': [TURNSTILE_ORIGIN],
    // Chrome menerapkan form-action juga pada REDIRECT hasil kirim form. Masuk
    // dengan Google tanpa JavaScript = POST → Supabase → Google, jadi kedua
    // origin itu harus ada di sini atau tombolnya diam-diam tidak berbuat apa-apa.
    'form-action': ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : []), GOOGLE_ACCOUNTS_ORIGIN],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    ...(isDev ? {} : { 'upgrade-insecure-requests': [] }),
  };

  return Object.entries(directives)
    .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

/**
 * HSTS dua tahun + subdomain + preload. Hanya dikirim di produksi: di
 * `localhost` header ini tidak berguna, dan di domain staging berbasis HTTP
 * ia mengunci browser penguji ke HTTPS selama dua tahun.
 *
 * `preload` di header BELUM mendaftarkan domain ke daftar preload browser —
 * itu langkah manual di hstspreload.org yang praktis tidak bisa dibatalkan.
 * Lakukan hanya setelah SEMUA subdomain melayani HTTPS.
 */
export const HSTS_VALUE = 'max-age=63072000; includeSubDomains; preload';

export const STATIC_SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Tetap dikirim walau CSP punya frame-ancestors: browser lama hanya kenal ini.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Header request tempat middleware menitipkan nonce untuk layout. */
export const NONCE_HEADER = 'x-nonce';
