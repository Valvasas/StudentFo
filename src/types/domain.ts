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

/**
 * Hasil kegiatan di portofolio (ADR-046) — DILAPORKAN SENDIRI oleh pemilik.
 * Kolomnya VARCHAR + CHECK di Postgres, bukan enum, jadi paritas tiga-tempat
 * (AGENTS.md §2) tidak berlaku: pipeline tidak pernah menyentuhnya. Daftar
 * ini tetap harus sama dengan CHECK di migration 20260929100001.
 */
export const ACHIEVEMENTS = ['PESERTA', 'FINALIS', 'JUARA_HARAPAN', 'JUARA_3', 'JUARA_2', 'JUARA_1', 'PENERIMA', 'BERSERTIFIKAT'] as const;
export type Achievement = (typeof ACHIEVEMENTS)[number];

export interface PortfolioFields {
  readonly achievement: Achievement | null;
  readonly achievementNote: string | null;
  readonly proofUrl: string | null;
  /** null = ikut aturan bawaan per jenis kegiatan (`defaultPortfolioVisible`). */
  readonly portfolioVisible: boolean | null;
}

export interface TrackerItem extends PortfolioFields {
  readonly id: string;
  readonly eventId: string;
  readonly status: TrackerStatus;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly event: EventSummary;
}

/** Satu baris portofolio seperti yang boleh dilihat orang lain. */
export interface PortfolioEntry {
  readonly eventId: string;
  readonly slug: string;
  readonly title: string;
  readonly organizer: string;
  readonly eventType: EventType;
  readonly status: TrackerStatus;
  readonly achievement: Achievement | null;
  readonly achievementNote: string | null;
  readonly proofUrl: string | null;
  readonly deadlineAt: string | null;
}

/** Hubungan pembaca dengan pemilik profil (`public_profile().relation`). */
export type ProfileRelation = 'self' | 'connected' | 'incoming' | 'outgoing' | null;

export interface PublicProfile {
  readonly person: NetworkPerson;
  readonly relation: ProfileRelation;
  readonly portfolio: readonly PortfolioEntry[];
}

/** Rekap acara yang dikelola dan sudah tutup (`organizer_event_history()`). */
export interface OrganizerHistoryEntry {
  readonly eventId: string;
  readonly slug: string;
  readonly title: string;
  readonly eventType: EventType;
  readonly status: EventStatus;
  readonly closedAt: string | null;
  readonly views: number;
  readonly visitors: number;
  readonly saves: number;
  readonly clicks: number;
  readonly applied: number;
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
  /** Jaringan (trigger notify_connection_change, ADR-040). */
  'CONNECTION_REQUEST',
  'CONNECTION_ACCEPTED',
  /** Keputusan moderator untuk penyelenggara (RPC review_*, ADR-042). */
  'ORGANIZER_VERIFIED',
  'ORGANIZER_REJECTED',
  'ORGANIZER_REVOKED',
  'CLAIM_APPROVED',
  'CLAIM_REJECTED',
  'REVISION_APPROVED',
  'REVISION_REJECTED',
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
  /** Akun yang masuk saat mengirim (null = tamu) — antrean menandai penyelenggara terverifikasi. */
  readonly submittedBy: string | null;
  readonly status: EventStatus;
  readonly createdAt: string;
  readonly payload: SubmissionPayload | null;
}

/** Status yang bisa muncul di log moderasi — status acara + status penyelenggara (ADR-042). */
export const MODERATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'VERIFIED', 'REVOKED'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const MODERATION_SUBJECTS = ['event', 'submission', 'organizer', 'claim', 'revision'] as const;
export type ModerationSubject = (typeof MODERATION_SUBJECTS)[number];

/** Satu baris log moderasi append-only (tabel `moderation_log`). */
export interface ModerationLogEntry {
  readonly id: string;
  readonly subjectType: ModerationSubject;
  readonly subjectId: string;
  /** Judul saat keputusan dibuat — event bisa diganti judulnya kemudian. */
  readonly title: string;
  /** null = baris langsung terbit tanpa melewati antrean (mis. hasil kiriman). */
  readonly fromStatus: ModerationStatus | null;
  readonly toStatus: ModerationStatus;
  /** null = perubahan di luar aplikasi (job expiry, SQL manual). */
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
}

/**
 * Penyelenggara terverifikasi (ADR-042). Status VARCHAR+CHECK, bukan enum —
 * paritasnya dengan migration 20260928110001 saja (pipeline tidak menyentuhnya).
 */
export const ORGANIZER_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'REVOKED'] as const;
export type OrganizerStatus = (typeof ORGANIZER_STATUSES)[number];

export interface OrganizerProfile {
  readonly userId: string;
  readonly orgName: string;
  readonly website: string | null;
  /** Bukti peran — hanya untuk pemiliknya & admin, tidak pernah publik. */
  readonly evidence: string;
  readonly status: OrganizerStatus;
  readonly reviewNote: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  /** Hanya terisi di antrean admin: nama & email akun pengaju. */
  readonly applicant?: { readonly fullName: string; readonly email: string | null };
}

export const TRUST_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type TrustRequestStatus = (typeof TRUST_REQUEST_STATUSES)[number];

/** "Acara ini milik lembaga kami" — disetujui admin → hak kelola. */
export interface EventClaim {
  readonly id: string;
  readonly event: Pick<EventSummary, 'id' | 'slug' | 'title' | 'organizer'>;
  readonly userId: string;
  /** Nama lembaga pengklaim (antrean admin & riwayat pemilik). */
  readonly orgName: string | null;
  readonly evidence: string;
  readonly status: TrustRequestStatus;
  readonly reviewNote: string | null;
  readonly createdAt: string;
}

/**
 * Kolom yang boleh diubah lewat permintaan perubahan. Judul & nama
 * penyelenggara sengaja tidak termasuk (identitas acara + dedup_hash).
 */
export interface EventRevisionChanges {
  readonly description?: string | null;
  readonly registrationLink?: string;
  readonly location?: string | null;
  readonly isOnline?: boolean;
  readonly educationLevels?: readonly EducationLevel[];
  /** ISO — tenggat pendaftaran utama yang baru. */
  readonly deadlineAt?: string;
}

export interface EventRevision {
  readonly id: string;
  readonly event: Pick<EventSummary, 'id' | 'slug' | 'title' | 'organizer'>;
  readonly proposedBy: string;
  readonly orgName: string | null;
  readonly changes: EventRevisionChanges;
  readonly note: string | null;
  readonly status: TrustRequestStatus;
  readonly reviewNote: string | null;
  readonly createdAt: string;
}

export const MANAGER_SOURCES = ['SUBMISSION', 'CLAIM', 'ADMIN'] as const;
export type ManagerSource = (typeof MANAGER_SOURCES)[number];

export interface ManagedEvent {
  readonly event: EventSummary;
  readonly source: ManagerSource;
  readonly since: string;
}

export interface AnalyticsDay {
  /** `YYYY-MM-DD` hari kalender WIB. */
  readonly day: string;
  readonly views: number;
  readonly visitors: number;
  readonly saves: number;
  readonly clicks: number;
}

export interface AnalyticsBucket {
  readonly label: string;
  readonly count: number;
}

/** Laporan dasbor penyelenggara (ADR-043) — bentuk sama di kedua repository. */
export interface EventAnalytics {
  readonly days: number;
  readonly series: readonly AnalyticsDay[];
  readonly totals: {
    readonly views: number;
    readonly visitors: number;
    readonly saves: number;
    readonly clicks: number;
    /** Pelacak berstatus sudah daftar / wawancara / diterima. */
    readonly applied: number;
  };
  readonly audience: {
    /** Kelompok di bawah ambang ini disembunyikan (k-anonimitas). */
    readonly minGroup: number;
    readonly levels: readonly AnalyticsBucket[];
    readonly interests: readonly AnalyticsBucket[];
    /** Jumlah penyimpan di kelompok jenjang yang disembunyikan. */
    readonly hidden: number;
  };
  readonly benchmark: {
    /** Median kunjungan acara lain berjenis sama pada rentang yang sama. */
    readonly medianViews: number;
    readonly peers: number;
  };
}

export const EVENT_MODES = ['online', 'onsite'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const SORT_OPTIONS = ['relevance', 'deadline', 'newest'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export interface EventQuery {
  readonly search?: string;
  readonly types?: readonly EventType[];
  readonly categories?: readonly string[];
  readonly levels?: readonly EducationLevel[];
  /** Nama kota persis seperti kolom `location` (dipilih dari pemilih lokasi). */
  readonly locations?: readonly string[];
  /** `online` = hanya daring, `onsite` = hanya tatap muka; kosong = keduanya. */
  readonly mode?: EventMode;
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

/**
 * Status koneksi antar pengguna (tabel `connections`, ADR-040). Kolomnya
 * VARCHAR + CHECK, bukan enum Postgres — paritasnya hanya dengan migration
 * `20260927100001_network.sql`, tidak dengan pipeline. Menolak permintaan
 * MENGHAPUS barisnya, jadi tidak ada status "ditolak".
 */
export const CONNECTION_STATUSES = ['PENDING', 'ACCEPTED'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Profil yang terlihat oleh orang lain di fitur Koneksi — tidak pernah memuat email. */
export interface NetworkPerson {
  readonly userId: string;
  readonly fullName: string;
  readonly headline: string | null;
  readonly educationLevel: EducationLevel | null;
  readonly major: string | null;
  /** Slug kategori, sama dengan `users.interests`. */
  readonly interests: readonly string[];
}

export interface Connection {
  readonly id: string;
  /** Pihak lawan dari sudut pandang pembaca. */
  readonly person: NetworkPerson;
  readonly status: ConnectionStatus;
  /** `incoming` = pembaca yang diajak; `outgoing` = pembaca yang mengajak. */
  readonly direction: 'incoming' | 'outgoing';
  readonly message: string | null;
  readonly createdAt: string;
  readonly respondedAt: string | null;
}

/** Satu halaman `listConnections` — kursor keyset, bukan offset (ADR-041). */
export interface ConnectionPage {
  readonly items: readonly Connection[];
  /** Kursor opak untuk halaman berikutnya; null = tidak ada lagi. */
  readonly nextCursor: string | null;
}

/** Jumlah per kelompok, terpisah dari halaman supaya angka di halaman tetap benar walau daftar dipotong. */
export interface ConnectionCounts {
  readonly accepted: number;
  readonly incoming: number;
  readonly outgoing: number;
}

/** Orang yang diblokir pembaca. Nama saja — cukup untuk mengenali siapa yang mau dibuka blokirnya. */
export interface BlockedPerson {
  readonly userId: string;
  readonly fullName: string;
  readonly blockedAt: string;
}

/** Pengaturan jaringan milik pengguna sendiri. Bawaan: tidak bisa ditemukan (opt-in). */
export interface NetworkProfile {
  readonly discoverable: boolean;
  readonly headline: string | null;
}

/** Kegiatan yang timnya diikuti seseorang — dipakai alasan saran & simpul graf. */
export interface NetworkEventRef {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly eventType: EventType;
}

export interface TeamLink {
  readonly userId: string;
  readonly teamId: string;
  readonly event: NetworkEventRef;
}

export interface PeopleSuggestion {
  readonly person: NetworkPerson;
  readonly score: number;
  readonly sharedInterests: readonly string[];
  readonly mutualCount: number;
  /** Kegiatan yang disimpan/dilacak pembaca DAN timnya diikuti orang ini. */
  readonly sharedEvents: readonly NetworkEventRef[];
  readonly sameMajor: boolean;
  readonly sameLevel: boolean;
}
