/**
 * Apakah gerak harus dikurangi. Aturan global reduced-motion di globals.css
 * hanya menjangkau animasi/transisi CSS; gerak yang digerakkan JS (seret kartu,
 * balik kartu, petunjuk geser) wajib bertanya di sini — media query OS DAN
 * pilihan "Kurangi gerak" di Personalisasi (`data-motion='reduce'`, ADR-055).
 * Di server selalu `false`: hanya dipanggil dari penangan peristiwa dan efek.
 */
export function isMotionReduced(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
}
