/**
 * Bentuk coretan stabilo gambar tangan (ADR-095), viewBox 0 0 120 24,
 * `preserveAspectRatio="none"` (direntang selebar kata). Salinan ber-encode
 * ada di `--marker-swipe` (`globals.css`) karena latar CSS tidak bisa membaca
 * modul ini — ubah keduanya bersamaan.
 */
export const MARKER_SWIPE = {
  viewBox: '0 0 120 24',
  /** Coretan utama: ujung pahat, naik sedikit ke kanan. */
  base: 'M4.2 8.6C20 7.4 41 7.6 62 6.2C82 5 99 5.4 115.6 3.8C117.8 3.6 119.2 4.8 118.8 7L117.6 16.4C117.2 18.4 115.8 19.2 113.4 19.2C94 19.4 74 20.2 54 21C36 21.6 20 21.8 5.8 22.6C3.2 22.8 1.6 21.6 2 19.4L2.8 11C3 9.6 3.4 8.7 4.2 8.6Z',
  /** Tarikan kedua yang lebih pekat di bagian bawah. */
  pass: 'M7 17.6C30 16.8 58 17.2 86 15.6C96 15 104 15 110 14.4L110.6 17.4C90 18.4 60 19.6 30 20.2C20 20.4 12 20.8 7.4 21Z',
} as const;
