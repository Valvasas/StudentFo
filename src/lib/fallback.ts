import { unstable_rethrow } from 'next/navigation';

/**
 * Jalankan pemuatan data untuk bagian PENDUKUNG halaman (navbar, lencana,
 * hitungan) dan kembalikan `fallback` kalau gagal.
 *
 * Navbar dirender di root layout. Satu query yang melempar di sana
 * menjatuhkan root layout, dan `error.tsx` — yang dirender DI DALAM layout
 * itu — ikut tidak bisa tampil: seluruh situs jadi halaman error hanya
 * karena lonceng notifikasi tidak bisa menghitung. Lebih baik lencananya
 * kosong sesaat.
 *
 * `unstable_rethrow` wajib di depan: `redirect()`, `notFound()`, dan sinyal
 * render dinamis Next.js juga berupa exception, dan menelannya membuat
 * halaman diam-diam salah alih-alih gagal dengan benar.
 *
 * JANGAN dipakai untuk data inti halaman — menampilkan "0 hasil" saat
 * database mati itu bohong; di sana biarkan error naik ke `error.tsx`.
 */
export async function withFallback<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[fallback] ${label} gagal dimuat, memakai nilai cadangan:`, error);
    return fallback;
  }
}
