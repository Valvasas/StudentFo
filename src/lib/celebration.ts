import type { ActionNoticeCode } from '@/lib/action-feedback';
import type { AuthNoticeCode } from '@/lib/auth-messages';

/**
 * Momen yang dirayakan dengan animasi (ADR-055) — DAFTAR TERTUTUP, sama
 * seperti kode notice-nya. Hanya hasil yang ditunggu orang: akun jadi,
 * pendaftaran tercatat, kiriman/ajakan terkirim, diterima. Kabar netral atau
 * sensitif (memblokir orang, memutus koneksi, kiriman ditolak) sengaja TIDAK
 * ada di sini — konfeti di atas "koneksi diputus" itu ejekan.
 *
 * Teks perayaan hanya judul pendek; kalimat lengkapnya tetap `FormAlert`
 * yang dibacakan pembaca layar. `team_created` tidak ada karena halaman tim
 * sudah punya perayaan sendiri yang memuat tindakan lanjutan.
 */

export type CelebrationArt = 'party' | 'plane' | 'trophy' | 'connect';

export interface Celebration {
  readonly stamp: string;
  readonly title: string;
  readonly art: CelebrationArt;
  /** Konfeti hanya untuk momen besar; "terkirim" cukup pesawat kertas. */
  readonly confetti: boolean;
}

type CelebratedCode = Extract<
  ActionNoticeCode | AuthNoticeCode,
  | 'check_email'
  | 'email_confirmed'
  | 'submission_received'
  | 'tracker_applied'
  | 'tracker_accepted'
  | 'connection_requested'
  | 'connection_accepted'
  | 'connection_matched'
  | 'organizer_applied'
  | 'claim_submitted'
  | 'revision_submitted'
>;

export const CELEBRATIONS: Readonly<Record<CelebratedCode, Celebration>> = {
  check_email: { stamp: 'AKUN DIBUAT', title: 'Tinggal konfirmasi emailmu', art: 'plane', confetti: true },
  email_confirmed: { stamp: 'SELAMAT DATANG', title: 'Akunmu sudah aktif!', art: 'party', confetti: true },
  submission_received: { stamp: 'TERKIRIM', title: 'Kirimanmu sudah di antrean', art: 'plane', confetti: false },
  tracker_applied: { stamp: 'TERCATAT', title: 'Pendaftaran tercatat — semangat!', art: 'party', confetti: true },
  tracker_accepted: { stamp: 'DITERIMA', title: 'Selamat, kamu diterima!', art: 'trophy', confetti: true },
  connection_requested: { stamp: 'TERKIRIM', title: 'Ajakan sedang terbang ke tujuannya', art: 'plane', confetti: false },
  connection_accepted: { stamp: 'TERHUBUNG', title: 'Kalian sekarang terhubung', art: 'connect', confetti: true },
  connection_matched: { stamp: 'COCOK!', title: 'Ternyata kalian saling mengajak', art: 'connect', confetti: true },
  organizer_applied: { stamp: 'TERKIRIM', title: 'Pengajuan penyelenggara terkirim', art: 'plane', confetti: false },
  claim_submitted: { stamp: 'TERKIRIM', title: 'Klaim acara terkirim', art: 'plane', confetti: false },
  revision_submitted: { stamp: 'TERKIRIM', title: 'Permintaan perubahan terkirim', art: 'plane', confetti: false },
};

export function celebrationFor(code: string | null): Celebration | null {
  return code !== null && Object.hasOwn(CELEBRATIONS, code) ? CELEBRATIONS[code as CelebratedCode] : null;
}
