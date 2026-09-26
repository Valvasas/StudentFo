/**
 * Domain types — satu-satunya definisi bentuk data di sisi aplikasi.
 * Setiap konstanta di sini punya pasangan langsung di enum PostgreSQL
 * (supabase/migrations/...0001). Kalau salah satu berubah, yang lain
 * WAJIB ikut berubah di PR yang sama.
 */

export const EVENT_TYPES = [
  'LOMBA',
  'BEASISWA',
  'MAGANG',
  'WORKSHOP',
  'KONFERENSI',
  'PELATIHAN',
  'VOLUNTEER',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  LOMBA: 'Lomba',
  BEASISWA: 'Beasiswa',
  MAGANG: 'Magang',
  WORKSHOP: 'Workshop',
  KONFERENSI: 'Konferensi',
  PELATIHAN: 'Pelatihan',
  VOLUNTEER: 'Volunteer',
};

export const EDUCATION_LEVELS = ['SMA_SMK', 'D3', 'D4_S1', 'S2', 'S3', 'UMUM'] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_LEVEL_LABEL: Record<EducationLevel, string> = {
  SMA_SMK: 'SMA/SMK',
  D3: 'D3',
  D4_S1: 'D4/S1',
  S2: 'S2',
  S3: 'S3',
  UMUM: 'Umum',
};

export const EVENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const DEADLINE_LABELS = ['registration', 'submission', 'final', 'announcement'] as const;
export type DeadlineLabel = (typeof DEADLINE_LABELS)[number];

export const DEADLINE_LABEL_TEXT: Record<DeadlineLabel, string> = {
  registration: 'Pendaftaran',
  submission: 'Pengumpulan karya',
  final: 'Babak final',
  announcement: 'Pengumuman',
};

export const TRACKER_STATUSES = ['SAVED', 'APPLIED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export const TRACKER_STATUS_LABEL: Record<TrackerStatus, string> = {
  SAVED: 'Disimpan',
  APPLIED: 'Sudah Daftar',
  INTERVIEW: 'Wawancara',
  ACCEPTED: 'Diterima',
  REJECTED: 'Ditolak',
};

/**
 * Peran anggota tim. Kolomnya VARCHAR(50) di Postgres (migration 0001),
 * bukan enum — jadi seperti NotificationType, paritas tiga-tempat tidak
 * berlaku. Hanya dua peran yang dikenal aplikasi; nilai lain diperlakukan
 * sebagai 'member'.
 */
export const TEAM_ROLES = ['leader', 'member'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export function toTeamRole(value: string): TeamRole {
  return value === 'leader' ? 'leader' : 'member';
}

export interface TeamMember {
  readonly userId: string;
  readonly fullName: string;
  readonly role: TeamRole;
  readonly joinedAt: string;
}

export interface Team {
  readonly id: string;
  readonly eventId: string;
  readonly createdBy: string | null;
  readonly title: string;
  readonly description: string | null;
  /** Jumlah orang yang dicari, 1..50 (CHECK constraint di migration 0001). */
  readonly slotsNeeded: number;
  readonly createdAt: string;
  /** null kalau event-nya sudah dihapus atau tidak lagi tayang. */
  readonly event: EventSummary | null;
  /**
   * Jumlah anggota, terpisah dari `members`. Tamu yang belum masuk tidak
   * boleh membaca NAMA anggota (view `team_member_profiles` hanya untuk
   * `authenticated`), jadi bagi mereka `members` kosong — tapi jumlahnya
   * tetap harus benar, kalau tidak setiap tim terbaca "0 dari N".
   */
  readonly memberCount: number;
  readonly members: readonly TeamMember[];
}

/** Sisa slot. Ketua ikut dihitung sebagai anggota, jadi tidak pernah negatif. */
export function remainingSlots(team: Pick<Team, 'slotsNeeded' | 'memberCount'>): number {
  return Math.max(team.slotsNeeded - team.memberCount, 0);
}

export interface TrackerItem {
  readonly id: string;
  readonly eventId: string;
  readonly status: TrackerStatus;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly event: EventSummary;
}

/**
 * Jenis notifikasi.
 *
 * Berbeda dari EVENT_TYPES dkk, daftar ini TIDAK punya pasangan enum di
 * PostgreSQL: kolom `notifications.type` sengaja VARCHAR(50) di migration
 * 0001. Jadi aturan paritas tiga-tempat (AGENTS.md §2) tidak berlaku di
 * sini — menambah jenis baru cukup diubah di berkas ini, tanpa migration.
 *
 * Konsekuensinya: nilai tak dikenal bisa saja masuk dari penulis lain.
 * Itu ditangani di `toNotificationType()`, bukan dengan cast diam-diam.
 */
export const NOTIFICATION_TYPES = [
  'DEADLINE_H3',
  'DEADLINE_H1',
  'SYSTEM',
  /** Kabar ke pengirim kiriman komunitas (trigger notify_submission_decision, ADR-037). */
  'SUBMISSION_APPROVED',
  'SUBMISSION_REJECTED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Baris yang tidak dikenal diperlakukan sebagai pengumuman sistem, bukan dibuang. */
export function toNotificationType(value: string): NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value)
    ? (value as NotificationType)
    : 'SYSTEM';
}

/** Rujukan minimal ke event — cukup untuk judul & tautan di menu lonceng. */
export interface NotificationEventRef {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

export interface AppNotification {
  readonly id: string;
  readonly type: NotificationType;
  readonly message: string;
  readonly isRead: boolean;
  readonly sentAt: string;
  /** null kalau notifikasinya bukan tentang satu event tertentu. */
  readonly event: NotificationEventRef | null;
}

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface EventDeadline {
  readonly id: string;
  readonly label: DeadlineLabel;
  readonly deadlineAt: string; // ISO 8601, selalu UTC
  readonly isPrimary: boolean;
}

/** Bentuk ringkas untuk kartu & listing. */
export interface EventSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly organizer: string;
  readonly eventType: EventType;
  readonly educationLevels: readonly EducationLevel[];
  readonly categorySlugs: readonly string[];
  readonly location: string | null;
  readonly isOnline: boolean;
  readonly status: EventStatus;
  readonly savedCount: number;
  readonly createdAt: string;
  readonly primaryDeadlineAt: string | null;
  readonly primaryDeadlineLabel: DeadlineLabel | null;
}

/** Bentuk lengkap untuk halaman detail. */
export interface EventDetail extends EventSummary {
  readonly description: string | null;
  readonly registrationLink: string;
  readonly sourceUrl: string;
  readonly deadlines: readonly EventDeadline[];
}

/** Profil yang dipakai algoritma rekomendasi (§6). */
export interface UserProfile {
  readonly interests: readonly string[];
  readonly educationLevel: EducationLevel | null;
}

/** Satu kolom pita "Minggu ini": jumlah tenggat yang jatuh pada satu hari kalender WIB. */
export interface DeadlineDay {
  /** `YYYY-MM-DD` dalam zona Asia/Jakarta. */
  readonly date: string;
  readonly count: number;
}

/**
 * Kiriman kegiatan dari komunitas (tabel `ugc_submissions`, Phase 3).
 *
 * Kolom `payload` di Postgres berupa JSONB tanpa skema, jadi bentuk di bawah
 * ini adalah KONTRAK aplikasi, bukan jaminan database. Baris yang payload-nya
 * tidak lolos validasi tetap ditampilkan ke admin (`payload: null`) supaya
 * bisa ditolak — bukan dibuang diam-diam.
 */
export interface SubmissionPayload {
  readonly title: string;
  readonly organizer: string;
  readonly description: string | null;
  readonly eventType: EventType;
  readonly registrationLink: string;
  readonly sourceUrl: string | null;
  readonly educationLevels: readonly EducationLevel[];
  readonly categorySlugs: readonly string[];
  readonly location: string | null;
  readonly isOnline: boolean;
  /** ISO 8601 UTC — tenggat pendaftaran, dijadikan tenggat utama saat disetujui. */
  readonly deadlineAt: string;
}

export interface Submission {
  readonly id: string;
  readonly submittedByEmail: string;
  readonly status: EventStatus;
  readonly createdAt: string;
  readonly payload: SubmissionPayload | null;
}

/** Satu baris log moderasi append-only (tabel `moderation_log`). */
export interface ModerationLogEntry {
  readonly id: string;
  readonly subjectType: 'event' | 'submission';
  readonly subjectId: string;
  /** Judul saat keputusan dibuat — event bisa diganti judulnya kemudian. */
  readonly title: string;
  /** null = baris langsung terbit tanpa melewati antrean (mis. hasil kiriman). */
  readonly fromStatus: EventStatus | null;
  readonly toStatus: EventStatus;
  /** null = perubahan di luar aplikasi (job expiry, SQL manual). */
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
}

export const SORT_OPTIONS = ['relevance', 'deadline', 'newest'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export interface EventQuery {
  readonly search?: string;
  readonly types?: readonly EventType[];
  readonly categories?: readonly string[];
  readonly levels?: readonly EducationLevel[];
  readonly sort?: SortOption;
  readonly includeClosed?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
  readonly profile?: UserProfile | null;
}

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}
