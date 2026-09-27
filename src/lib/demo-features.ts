import { dataMode } from '@/lib/env';

/**
 * Fitur yang baru ada antarmukanya (ADR-039): Pesan, Ruang diskusi, Data
 * diri & dokumen, pengaturan privasi per kolom, formulir persiapan
 * pendaftaran. Belum ada tabel & RLS-nya, jadi isinya disimpan di peramban
 * pengunjung dan diisi data contoh.
 *
 * Hanya tampil di mode data contoh. Di produksi, data contoh yang tampil
 * seperti percakapan sungguhan adalah kerugian nyata bagi yang mempercayainya
 * (alasan yang sama dengan DemoBanner) — halamannya menampilkan "segera
 * hadir" dan tautannya disembunyikan sampai backend-nya ada.
 */
export const demoFeaturesEnabled = dataMode === 'seed';
