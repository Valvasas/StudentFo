/**
 * Validasi tujuan redirect setelah masuk/daftar.
 *
 * Parameter `?next=` datang dari URL — artinya dari pihak yang tidak
 * dipercaya. Kalau nilainya dipakai apa adanya, halaman masuk kita berubah
 * jadi open redirect: penyerang mengirim `/login?next=https://situs-palsu`,
 * korban masuk dengan kredensial ASLI di domain kita, lalu dilempar ke
 * halaman tiruan yang meminta "verifikasi ulang". Domain kita yang
 * memberikan kepercayaan awalnya.
 *
 * Aturan: hanya path internal yang diterima. Apa pun yang meragukan
 * dikembalikan ke `fallback`, tidak pernah memicu error.
 */

const MAX_LENGTH = 512;

export function safeNextPath(
  input: string | string[] | null | undefined,
  fallback = '/',
): string {
  // Query string bisa mengirim kunci yang sama berkali-kali (`?next=a&next=b`);
  // yang pertama yang dipakai, sisanya diabaikan.
  const value = Array.isArray(input) ? input[0] : input;
  if (!value || value.length > MAX_LENGTH) return fallback;

  // Harus path absolut internal. Menolak `https://...`, `//evil.com`
  // (protocol-relative), dan `/\evil.com` (dinormalisasi jadi `//` oleh
  // sebagian browser).
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;

  // `\r`/`\n` di nilai header Location adalah vektor response splitting;
  // `\t` dipakai untuk menyelundupkan skema (`java\tscript:`).
  if (value.includes('\r') || value.includes('\n') || value.includes('\t')) return fallback;

  // `:` sebelum `/` berikutnya berarti ada skema yang diselipkan.
  if (value.includes('://')) return fallback;

  return value;
}

export const ORGANIZER_HOME_PATH = '/penyelenggara';
export const ORGANIZER_LOGIN_PATH = '/penyelenggara/masuk';
export const ORGANIZER_REGISTER_PATH = '/penyelenggara/daftar';

/** Pintu akun mana yang dipakai: penyelenggara punya halaman masuk & daftar sendiri (ADR-063). */
export type AuthAudience = 'participant' | 'organizer';

export function parseAuthAudience(value: unknown): AuthAudience {
  return value === 'organizer' ? 'organizer' : 'participant';
}

/** Tujuan bawaan setelah masuk lewat pintu tertentu. */
export function audienceHome(audience: AuthAudience): string {
  return audience === 'organizer' ? ORGANIZER_HOME_PATH : '/';
}

export function audienceLoginPath(audience: AuthAudience): string {
  return audience === 'organizer' ? ORGANIZER_LOGIN_PATH : '/login';
}

function isOrganizerPath(path: string): boolean {
  const pathname = path.split(/[?#]/)[0] ?? '';
  return pathname === ORGANIZER_HOME_PATH || pathname.startsWith(`${ORGANIZER_HOME_PATH}/`);
}

/**
 * Bangun tautan masuk tanpa `?next=` yang sama dengan tujuan bawaan. Tujuan
 * di dalam studio diarahkan ke pintu penyelenggara, supaya tamu yang membuka
 * tautan acara dari email panitia tidak mendarat di halaman masuk peserta.
 */
export function loginHref(next?: string | string[] | null): string {
  const target = safeNextPath(next);
  const audience: AuthAudience = isOrganizerPath(target) ? 'organizer' : 'participant';
  const path = audienceLoginPath(audience);
  return target === audienceHome(audience) ? path : `${path}?next=${encodeURIComponent(target)}`;
}

/**
 * Halaman asal dari header Referer — untuk aksi kecil di navbar yang tidak
 * tahu di halaman mana ia dirender (layout tidak menerima pathname), supaya
 * pengguna tetap di tempatnya. Hanya Referer dari host yang SAMA dengan
 * permintaan ini yang dipakai, dan tetap lewat `safeNextPath`; selain itu
 * `fallback`. Referer bisa dikosongkan peramban — itu bukan galat.
 */
export function refererPath(referer: string | null | undefined, host: string | null | undefined, fallback = '/'): string {
  if (!referer || !host) return fallback;
  try {
    const url = new URL(referer);
    if (url.host !== host) return fallback;
    return safeNextPath(`${url.pathname}${url.search}`, fallback);
  } catch {
    return fallback;
  }
}
