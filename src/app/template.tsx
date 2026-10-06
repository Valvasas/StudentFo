/**
 * Pembungkus setiap halaman yang dipasang ULANG di setiap navigasi (beda
 * dengan layout yang bertahan), jadi animasi masuknya berjalan sekali per
 * pindah halaman (ADR-055).
 *
 * Bukan `loading.tsx` dan tidak memasang Suspense: status HTTP, `notFound()`,
 * dan HTML tanpa JavaScript tidak berubah (lihat catatan soft-404 di
 * `src/app/events/page.tsx`). Animasinya hanya opasitas — alasannya di
 * `page-enter`, globals.css §9.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
