'use client';

import { useEffect } from 'react';

/**
 * Bawa halaman ke atas, tempat kabar hasil aksi tampil.
 *
 * Pengalihan dari Server Action menjaga posisi gulir lama (Next menerapkan
 * pohon baru langsung tanpa langkah "gulir ke segmen yang berubah"): orang
 * yang mengirim formulir dari bagian bawah mendarat di tengah halaman
 * pendaftaran, melewatkan kode & kabarnya. Pemanggil memberi `key` baru di
 * setiap render server supaya ini berjalan sekali per kedatangan.
 */
export function ScrollToTop() {
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, []);
  return null;
}
