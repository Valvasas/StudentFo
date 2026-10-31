import type { ModerationStatus, ModerationSubject, ReportReason, ReportSubject } from '@/types/domain';

/** Label log moderasi — satu sumber untuk /admin/riwayat dan beranda admin. */
export const MODERATION_STATUS_TEXT: Record<ModerationStatus, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  EXPIRED: 'Kedaluwarsa',
  VERIFIED: 'Terverifikasi',
  REVOKED: 'Dicabut',
  OPEN: 'Terbuka',
  RESOLVED: 'Ditindak',
  DISMISSED: 'Diabaikan',
  ACTIVE: 'Aktif',
  SUSPENDED: 'Ditangguhkan',
  DELETED: 'Dihapus',
};

export const MODERATION_STATUS_VARIANT: Record<ModerationStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  VERIFIED: 'success',
  REVOKED: 'danger',
  OPEN: 'warning',
  RESOLVED: 'success',
  DISMISSED: 'neutral',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  DELETED: 'neutral',
};

export const MODERATION_SUBJECT_TEXT: Record<ModerationSubject, string> = {
  event: 'Kegiatan',
  submission: 'Kiriman',
  organizer: 'Penyelenggara',
  claim: 'Klaim acara',
  revision: 'Perubahan acara',
  user: 'Pengguna',
  report: 'Laporan',
  question: 'Pertanyaan',
};

export const REPORT_REASON_TEXT: Record<ReportReason, { label: string; hint: string }> = {
  scam: { label: 'Penipuan', hint: 'Meminta uang, data, atau transfer yang mencurigakan' },
  misleading: { label: 'Info salah atau menyesatkan', hint: 'Tenggat, biaya, syarat, atau penyelenggara tidak sesuai sumber resmi' },
  inappropriate: { label: 'Konten tidak pantas', hint: 'SARA, pornografi, judi, atau konten melanggar hukum lain' },
  harassment: { label: 'Pelecehan atau intimidasi', hint: 'Ajakan berulang yang tidak diinginkan, ancaman, kata-kata kasar' },
  spam: { label: 'Spam atau promosi', hint: 'Jualan, skema berantai, atau pesan massal' },
  impersonation: { label: 'Menyamar', hint: 'Mengaku sebagai orang, kampus, atau lembaga lain' },
  other: { label: 'Lainnya', hint: 'Jelaskan di kolom keterangan' },
};

/** Alasan yang masuk akal per jenis subjek — urutan = yang paling sering lebih dulu. */
export const REPORT_REASONS_FOR: Record<ReportSubject, readonly ReportReason[]> = {
  event: ['scam', 'misleading', 'impersonation', 'inappropriate', 'spam', 'other'],
  user: ['harassment', 'scam', 'impersonation', 'spam', 'inappropriate', 'other'],
  question: ['harassment', 'spam', 'inappropriate', 'scam', 'misleading', 'other'],
};
