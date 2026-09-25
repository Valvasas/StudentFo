import { daysUntil } from '@/lib/deadline';
import type { NotificationType } from '@/types/domain';

/**
 * Aturan kapan notifikasi tenggat dikirim — Phase 2.
 *
 * KENAPA HANYA DUA TITIK (H-3 dan H-1), bukan hitung mundur harian:
 * notifikasi harian untuk belasan kegiatan yang disimpan akan membuat
 * lonceng selalu penuh, dan pengguna berhenti membukanya dalam hitungan
 * hari. Dua titik memberi satu peringatan saat masih sempat menyiapkan
 * berkas (H-3) dan satu peringatan terakhir (H-1).
 *
 * KENAPA H-0 HANYA SUSULAN: pada hari-H notifikasi sering datang setelah
 * jam kerja penyelenggara. H-0 hanya dipakai kalau H-1 terlewat (penjadwal
 * telat), karena peringatan terlambat masih lebih baik daripada tidak ada.
 *
 * Fungsi di berkas ini murni dan menerima `now` sebagai parameter supaya
 * bisa diuji deterministik. Aturan yang sama DIDUPLIKASI di SQL (lihat
 * migration `..._deadline_notifications.sql`) karena produsen notifikasi
 * di produksi berjalan di dalam database, bukan di Node — kalau salah satu
 * diubah, yang lain wajib ikut berubah di PR yang sama.
 */
/**
 * REVISI (migration 20260925100001, audit P4): rentang, bukan titik persis.
 * Penjadwal bisa telat atau terlewat sehari; dengan titik persis, satu run
 * yang terlewat berarti pengingat hilang permanen. Dalam operasi normal
 * hasilnya tetap dua notifikasi (H-3 lalu H-1) karena dedupe per
 * (pengguna, kegiatan, tipe); H-2 dan H-0 hanya menjadi jalur susulan.
 */
export const DEADLINE_H3_RANGE = { min: 2, max: 3 } as const;
export const DEADLINE_H1_RANGE = { min: 0, max: 1 } as const;

/** null artinya hari ini tidak ada pengingat untuk tenggat tersebut. */
export function notificationTypeForDaysLeft(daysLeft: number | null): NotificationType | null {
  if (daysLeft === null) return null;
  if (daysLeft >= DEADLINE_H3_RANGE.min && daysLeft <= DEADLINE_H3_RANGE.max) return 'DEADLINE_H3';
  if (daysLeft >= DEADLINE_H1_RANGE.min && daysLeft <= DEADLINE_H1_RANGE.max) return 'DEADLINE_H1';
  return null;
}

export function notificationTypeForDeadline(
  deadlineIso: string | null,
  now: Date = new Date(),
): NotificationType | null {
  if (!deadlineIso) return null;
  return notificationTypeForDaysLeft(daysUntil(deadlineIso, now));
}

/**
 * Pesan ditulis lengkap dengan judul kegiatan, bukan "Ada tenggat besok".
 * Notifikasi sering dibaca di daftar tanpa konteks; pesan yang tidak
 * menyebut kegiatannya memaksa pengguna membuka satu per satu.
 *
 * Menyebut sisa hari yang SEBENARNYA: notifikasi susulan H-2 yang berbunyi
 * "3 hari lagi" adalah informasi salah. Teksnya identik dengan SQL.
 */
export function buildDeadlineMessage(eventTitle: string, daysLeft: number): string {
  if (daysLeft <= 0) return `Hari terakhir — pendaftaran ${eventTitle} ditutup hari ini.`;
  if (daysLeft === 1) return `Terakhir — pendaftaran ${eventTitle} ditutup besok.`;
  return `Pendaftaran ${eventTitle} ditutup ${daysLeft} hari lagi.`;
}
