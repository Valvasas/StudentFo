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
 * KENAPA BUKAN H-0: pada hari-H notifikasi sering datang setelah jam
 * kerja penyelenggara. Peringatan yang tiba ketika sudah tidak bisa
 * ditindaklanjuti bukan bantuan, hanya rasa bersalah.
 *
 * Fungsi di berkas ini murni dan menerima `now` sebagai parameter supaya
 * bisa diuji deterministik. Aturan yang sama DIDUPLIKASI di SQL (lihat
 * migration `..._deadline_notifications.sql`) karena produsen notifikasi
 * di produksi berjalan di dalam database, bukan di Node — kalau salah satu
 * diubah, yang lain wajib ikut berubah di PR yang sama.
 */
export const DEADLINE_NOTIFICATION_DAYS = [3, 1] as const;

/** null artinya hari ini bukan titik pengingat untuk tenggat tersebut. */
export function notificationTypeForDaysLeft(daysLeft: number | null): NotificationType | null {
  if (daysLeft === 3) return 'DEADLINE_H3';
  if (daysLeft === 1) return 'DEADLINE_H1';
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
 */
export function buildDeadlineMessage(eventTitle: string, type: NotificationType): string {
  if (type === 'DEADLINE_H1') {
    return `Terakhir — pendaftaran ${eventTitle} ditutup besok.`;
  }
  if (type === 'DEADLINE_H3') {
    return `Pendaftaran ${eventTitle} ditutup 3 hari lagi.`;
  }
  return eventTitle;
}
