'use client';

import { useEffect } from 'react';

/**
 * Sudah ada halaman yang dilukis di peramban ini? Variabel modul = hidup
 * selama tab terbuka di klien; di server tidak pernah diubah (efek tidak
 * jalan di server), jadi HTML server selalu tanpa animasi.
 */
let firstPagePainted = false;

/**
 * Pembungkus setiap halaman yang dipasang ULANG di setiap navigasi (beda
 * dengan layout yang bertahan), jadi animasi masuknya berjalan sekali per
 * pindah halaman (ADR-055).
 *
 * Bukan `loading.tsx` dan tidak memasang Suspense: status HTTP, `notFound()`,
 * dan HTML tanpa JavaScript tidak berubah (lihat catatan soft-404 di
 * `src/app/events/page.tsx`). Animasinya hanya opasitas — alasannya di
 * `page-enter`, globals.css §9.
 *
 * Muatan PERTAMA tidak dipudarkan (ADR-099): di sana lukisan pertama peramban
 * sudah merupakan "masuknya", dan halaman yang mulai dari opasitas 0 menunda
 * pencatatan LCP ±0,3 dtk di ponsel lambat. Pudar hanya untuk navigasi klien,
 * yang memang butuh tanda "halaman berganti".
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const animate = firstPagePainted;
  useEffect(() => {
    firstPagePainted = true;
  }, []);
  return <div className={animate ? 'page-enter' : undefined}>{children}</div>;
}
