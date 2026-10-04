/**
 * Preferensi sidebar akun (ADR-052): dilipat jadi rel ikon atau terbuka.
 *
 * Disimpan di cookie, bukan localStorage: server yang merender sidebar sudah
 * dalam keadaan yang benar, jadi tidak ada kedip "terbuka lalu menutup" saat
 * halaman dimuat, dan sakelarnya bisa berupa <form> biasa yang tetap bekerja
 * tanpa JavaScript.
 */
export const ACCOUNT_SIDEBAR_COOKIE = 'sf_sidebar';
export const ACCOUNT_SIDEBAR_MAX_AGE = 60 * 60 * 24 * 365;

export function isSidebarCollapsed(value: string | undefined): boolean {
  return value === 'collapsed';
}
