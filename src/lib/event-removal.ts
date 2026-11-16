/**
 * Menghapus postingan kegiatan (ADR-092 #1) — DUA tahap seperti "Sampah"
 * Gmail, karena menghapus itu sendiri bisa salah tekan:
 *
 *   1. Hapus (turunkan): status REJECTED + alasan, langsung hilang dari
 *      katalog, halaman, pencarian, sitemap. Bisa diurungkan / ditayangkan
 *      lagi kapan saja dari "Kelola postingan".
 *   2. Hapus permanen: hanya untuk yang SUDAH diturunkan, tanpa pendaftar
 *      aktif, ketik HAPUS. Baris + foto + komentar + pendaftaran batal lenyap;
 *      Riwayat moderasi tetap mencatatnya.
 *
 * Kenapa tidak langsung hapus permanen: kegiatan hasil penelusuran otomatis
 * yang dihapus barisnya akan dimasukkan lagi oleh scraper malam berikutnya
 * (dedup_hash ikut hilang) — status "diturunkan" justru yang mencegahnya.
 */

export const TAKEDOWN_REASONS = [
  { key: 'salah-posting', label: 'Salah posting / data keliru' },
  { key: 'duplikat', label: 'Duplikat postingan lain' },
  { key: 'dibatalkan', label: 'Kegiatan dibatalkan penyelenggara' },
  { key: 'melanggar', label: 'Penipuan / melanggar ketentuan' },
  { key: 'lainnya', label: 'Lainnya' },
] as const;

export type TakedownReasonKey = (typeof TAKEDOWN_REASONS)[number]['key'];

const REASON_MAX = 500;
const DETAILS_MAX = 300;

/**
 * Alasan yang tersimpan di `rejection_reason` & Riwayat moderasi. "Lainnya"
 * wajib keterangan — alasan kosong tidak bisa dipertanggungjawabkan.
 * null = isian tidak sah.
 */
export function takedownReasonText(preset: string, details: string): string | null {
  const reason = TAKEDOWN_REASONS.find((item) => item.key === preset);
  if (!reason) return null;
  const note = details.replace(/\s+/g, ' ').trim().slice(0, DETAILS_MAX);
  if (reason.key === 'lainnya' && note.length < 5) return null;
  return `Dihapus admin — ${reason.label}${note ? `: ${note}` : ''}`.slice(0, REASON_MAX);
}

/** Frasa hapus permanen — sengaja berbeda dari "HAPUS AKUN" supaya dua aksi berbahaya tidak tertukar. */
export const EVENT_DELETE_PHRASE = 'HAPUS';

export function isEventDeleteConfirmed(raw: string | null | undefined): boolean {
  return (raw ?? '').trim().toUpperCase() === EVENT_DELETE_PHRASE;
}
