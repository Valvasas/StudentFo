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
  /** Pendaftaran internal & pembayaran (fungsi review/submit di migration 20261014100001, ADR-056). */
  'REGISTRATION_CONFIRMED',
  'REGISTRATION_REJECTED',
  'PAYMENT_REJECTED',
  'PAYMENT_SUBMITTED',
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

/**
 * Lencana otoritas penyelenggara (ADR-049) — DIBERIKAN MODERATOR, bukan
 * diklaim penyelenggara. VARCHAR + CHECK di Postgres (migration
 * 20261003100001), bukan enum; pipeline tidak pernah menulisnya, jadi
 * paritas tiga tempat tidak berlaku — cukup sama dengan CHECK itu.
 *
 * Berbeda dari "penyelenggara terverifikasi" ADR-042 (sebuah AKUN yang
 * boleh mengelola acara): lencana ini menjawab "siapa otoritas di balik
 * acara ini", dan bisa diberikan walau penyelenggaranya tidak punya akun.
 */
export const VERIFICATION_BADGES = ['OFFICIAL_GOV', 'CAMPUS_VERIFIED', 'COMMUNITY'] as const;
export type VerificationBadge = (typeof VERIFICATION_BADGES)[number];

export const VERIFICATION_BADGE_LABEL: Record<VerificationBadge, string> = {
  OFFICIAL_GOV: 'Instansi resmi',
  CAMPUS_VERIFIED: 'Kampus terverifikasi',
  COMMUNITY: 'Komunitas terperiksa',
};

/** Penjelasan tooltip — apa yang SUDAH dicek moderator, bukan janji kualitas acara. */
export const VERIFICATION_BADGE_DESCRIPTION: Record<VerificationBadge, string> = {
  OFFICIAL_GOV:
    'Diselenggarakan kementerian, lembaga, atau BUMN. Moderator mencocokkan pengumuman ini dengan kanal resmi instansinya.',
  CAMPUS_VERIFIED:
    'Diselenggarakan perguruan tinggi atau unit resminya. Moderator mencocokkan pengumuman dengan domain atau akun resmi kampus.',
  COMMUNITY:
    'Diselenggarakan komunitas atau organisasi mahasiswa. Moderator memeriksa identitas penyelenggara, tapi bukan lembaga resmi.',
};

export function toVerificationBadge(value: string | null | undefined): VerificationBadge | null {
  return (VERIFICATION_BADGES as readonly string[]).includes(value ?? '') ? (value as VerificationBadge) : null;
}

/** Saringan biaya di /events. `null` di data (biaya belum diketahui) tidak masuk keduanya. */
export const COST_FILTERS = ['free', 'paid'] as const;
export type CostFilter = (typeof COST_FILTERS)[number];

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
  /** `null` = biaya belum diketahui (mis. hasil scraping) — UI tidak menebak "Gratis". */
  readonly isFree: boolean | null;
  /** Rupiah utuh; hanya untuk kegiatan berbayar. `null` = nominal belum diumumkan. */
  readonly priceAmount: number | null;
  /** Akhir masa promosi berbayar; `null` = tidak berpromosi. Lihat `isPromoted()`. */
  readonly featuredUntil: string | null;
  readonly verificationBadge: VerificationBadge | null;
}

/** Bentuk lengkap untuk halaman detail. */
export interface EventDetail extends EventSummary {
  readonly description: string | null;
  readonly registrationLink: string;
  readonly sourceUrl: string;
  readonly deadlines: readonly EventDeadline[];
  /** Buku panduan resmi, selalu https (CHECK di migration 20261003100001). */
  readonly guidebookUrl: string | null;
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
  /** `null` = pengirim memilih "belum tahu". Disalin ke `events.is_free` saat disetujui. */
  readonly isFree: boolean | null;
  readonly priceAmount: number | null;
  readonly guidebookUrl: string | null;
  /**
   * Bahan verifikasi untuk moderator — TIDAK pernah disalin ke `events`
   * dan tidak pernah tampil publik (bisa berupa nomor WhatsApp pribadi).
   */
  readonly organizerContact: string | null;
  readonly proofLink: string | null;
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
  readonly cost?: CostFilter;
  readonly page?: number;
  readonly pageSize?: number;
  readonly profile?: UserProfile | null;
  /**
   * Angkat kegiatan berpromosi aktif ke puncak (ADR-049). OPT-IN, bukan
   * bawaan: daftar yang menyatakan fakta ("tenggat terdekat", "sesuai
   * minatmu", hitungan) tidak boleh diam-diam disisipi iklan. Hanya daftar
   * jelajah utama yang memintanya.
   */
  readonly promoted?: boolean;
}

/** Satu pengingat tenggat yang siap dikirim ke kanal luar (ADR-051). */
export interface DeadlineDispatch {
  readonly notificationId: string;
  readonly type: Extract<NotificationType, 'DEADLINE_H3' | 'DEADLINE_H1'>;
  readonly message: string;
  readonly createdAt: string;
  readonly recipient: {
    readonly userId: string;
    /** `null` di mode seed (tidak ada tabel users). */
    readonly email: string | null;
    readonly fullName: string | null;
  };
  readonly event: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly organizer: string;
    readonly deadlineAt: string;
    readonly daysLeft: number;
  };
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

/**
 * Pencocokan tim (ADR-057). Kolom `team_seekers.skills/seeking` VARCHAR[] +
 * CHECK di Postgres, bukan enum: daftar ini HARUS sama dengan CHECK di
 * migration 20261020100001 (uji `100_team_matching`), dan menambah slug baru =
 * migration baru, bukan hanya mengedit konstanta ini. Pipeline tidak menyentuhnya.
 */
export const SKILL_DOMAINS = ['teknis', 'desain', 'bisnis', 'riset', 'komunikasi', 'sains'] as const;
export type SkillDomain = (typeof SKILL_DOMAINS)[number];

export const SKILL_DOMAIN_LABEL: Record<SkillDomain, string> = {
  teknis: 'Teknis',
  desain: 'Desain',
  bisnis: 'Bisnis',
  riset: 'Riset',
  komunikasi: 'Komunikasi',
  sains: 'Sains & sosial',
};

export const TEAM_SKILLS = [
  { slug: 'web-aplikasi', label: 'Pemrograman web & aplikasi', domain: 'teknis' },
  { slug: 'data-ai', label: 'Data & kecerdasan buatan', domain: 'teknis' },
  { slug: 'iot-elektronika', label: 'IoT & elektronika', domain: 'teknis' },
  { slug: 'ui-ux', label: 'Desain UI/UX', domain: 'desain' },
  { slug: 'grafis', label: 'Desain grafis & ilustrasi', domain: 'desain' },
  { slug: 'video', label: 'Video & animasi', domain: 'desain' },
  { slug: 'manajemen-proyek', label: 'Manajemen proyek', domain: 'bisnis' },
  { slug: 'pemasaran', label: 'Pemasaran & media sosial', domain: 'bisnis' },
  { slug: 'kewirausahaan', label: 'Bisnis & keuangan', domain: 'bisnis' },
  { slug: 'riset-kualitatif', label: 'Riset kualitatif', domain: 'riset' },
  { slug: 'statistik', label: 'Statistik & riset kuantitatif', domain: 'riset' },
  { slug: 'penulisan-ilmiah', label: 'Penulisan ilmiah', domain: 'riset' },
  { slug: 'presentasi', label: 'Presentasi & public speaking', domain: 'komunikasi' },
  { slug: 'penulisan-kreatif', label: 'Penulisan kreatif & konten', domain: 'komunikasi' },
  { slug: 'debat', label: 'Debat & negosiasi', domain: 'komunikasi' },
  { slug: 'sains-lab', label: 'Sains & eksperimen lab', domain: 'sains' },
  { slug: 'kesehatan-lingkungan', label: 'Kesehatan & lingkungan', domain: 'sains' },
  { slug: 'hukum-kebijakan', label: 'Hukum & kebijakan', domain: 'sains' },
] as const satisfies readonly { slug: string; label: string; domain: SkillDomain }[];

export type TeamSkillSlug = (typeof TEAM_SKILLS)[number]['slug'];
export const TEAM_SKILL_SLUGS = TEAM_SKILLS.map((skill) => skill.slug) as readonly TeamSkillSlug[];

export function skillLabel(slug: string): string {
  return TEAM_SKILLS.find((skill) => skill.slug === slug)?.label ?? slug;
}

export function skillDomain(slug: string): SkillDomain | null {
  return TEAM_SKILLS.find((skill) => skill.slug === slug)?.domain ?? null;
}

/** Batas yang sama dengan CHECK di `team_seekers` — dipakai validasi form dan uji paritas. */
export const SEEKER_LIMITS = { skills: 6, seeking: 6, pitchMax: 140, cityMax: 60 } as const;

/** Kartu pemain milik sendiri (`team_seekers`). Bawaan: TERTUTUP — tidak ada yang dicocokkan tanpa memilihnya. */
export interface TeamSeekerProfile {
  readonly open: boolean;
  /** Nama kota dari `REGIONS`; null = belum diisi (jarak tidak bisa dihitung). */
  readonly city: string | null;
  /** Yang kamu bawa ke tim. */
  readonly skills: readonly TeamSkillSlug[];
  /** Yang kamu cari dari rekan. */
  readonly seeking: readonly TeamSkillSlug[];
  /** Bersedia kerja jarak jauh / daring bersama rekan di kota lain. */
  readonly remoteOk: boolean;
  readonly pitch: string | null;
  readonly updatedAt: string;
}

export type TeamSeekerInput = Omit<TeamSeekerProfile, 'updatedAt'>;

/** Ringkasan portofolio PUBLIK seseorang — aturan visibilitas sama dengan `public_portfolio()`. */
export interface PortfolioDigest {
  readonly count: number;
  /** Capaian tiap entri publik (terbaru dulu, maks. 10); null = ikut serta tanpa hasil yang dilaporkan. */
  readonly achievements: readonly (Achievement | null)[];
}

/** Hubungan pembaca dengan kandidat — kandidat yang sudah terhubung tidak ditawarkan lagi. */
export type CandidateRelation = 'connected' | 'incoming' | 'outgoing' | null;

/** Orang yang membuka kartu pemainnya, dilihat oleh pembaca. Tidak pernah memuat email. */
export interface TeamCandidate {
  readonly person: NetworkPerson;
  readonly city: string | null;
  readonly skills: readonly TeamSkillSlug[];
  readonly seeking: readonly TeamSkillSlug[];
  readonly remoteOk: boolean;
  readonly pitch: string | null;
  readonly portfolio: PortfolioDigest;
  readonly relation: CandidateRelation;
}

/**
 * Formulir pendaftaran internal (ADR-056). Jenis kolom disimpan di JSONB
 * `event_registration_forms.fields`, bukan enum Postgres — paritasnya dengan
 * `isFormField()` di `lib/registration-form.ts`, tidak dengan pipeline.
 */
export const FORM_FIELD_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'url',
  'select',
  'multi_select',
  'checkbox',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_FIELD_TYPE_LABEL: Record<FormFieldType, string> = {
  short_text: 'Jawaban singkat',
  long_text: 'Paragraf',
  email: 'Email',
  phone: 'Nomor telepon',
  number: 'Angka',
  date: 'Tanggal',
  url: 'Tautan',
  select: 'Pilihan ganda',
  multi_select: 'Kotak centang',
  checkbox: 'Persetujuan',
};

export interface FormField {
  /** Stabil antar-penyuntingan (`f_…`): jawaban lama tetap cocok dengan kolomnya walau label diganti. */
  readonly id: string;
  readonly type: FormFieldType;
  readonly label: string;
  readonly help: string | null;
  readonly required: boolean;
  /** Hanya untuk `select` & `multi_select`. */
  readonly options: readonly string[];
}

export interface RegistrationForm {
  readonly eventId: string;
  readonly isOpen: boolean;
  readonly intro: string | null;
  readonly fields: readonly FormField[];
  /** null = tanpa batas kuota. */
  readonly capacity: number | null;
  /** Rupiah utuh; null = gratis. */
  readonly feeAmount: number | null;
  /** Rekening/e-wallet/QRIS tujuan — ditampilkan ke pendaftar saja. */
  readonly paymentInstructions: string | null;
  /** Pendaftar aktif (bukan dibatalkan/ditolak) — untuk sisa kuota. */
  readonly activeCount: number;
  readonly updatedAt: string;
}

export type AnswerValue = string | number | boolean | readonly string[];

/**
 * Status pendaftaran internal. VARCHAR + CHECK (migration 20261014100001),
 * bukan enum — pipeline tidak pernah menyentuhnya.
 */
export const REGISTRATION_STATUSES = ['AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED', 'REJECTED', 'CANCELLED'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  AWAITING_PAYMENT: 'Menunggu pembayaran',
  PAYMENT_REVIEW: 'Pembayaran diperiksa',
  CONFIRMED: 'Terkonfirmasi',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
};

export interface EventRegistration {
  readonly id: string;
  /** Kode yang disebut peserta ke panitia, mis. `SF-7F3A09C2`. */
  readonly code: string;
  readonly event: Pick<EventSummary, 'id' | 'slug' | 'title' | 'organizer' | 'primaryDeadlineAt'>;
  readonly userId: string;
  /** Salinan saat mendaftar — penyelenggara tidak membaca tabel `users`. */
  readonly fullName: string;
  readonly email: string;
  readonly answers: Readonly<Record<string, AnswerValue>>;
  readonly status: RegistrationStatus;
  /** Biaya saat mendaftar (perubahan biaya kemudian tidak menagih ulang). */
  readonly feeAmount: number | null;
  readonly proofUploadedAt: string | null;
  readonly reviewNote: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Ringkasan per acara untuk dasbor penyelenggara. */
export interface RegistrationStats {
  readonly eventId: string;
  readonly total: number;
  readonly confirmed: number;
  readonly awaitingPayment: number;
  readonly paymentReview: number;
  /** Masuk 7 hari terakhir. */
  readonly recent: number;
}

export interface EventPhoto {
  readonly id: string;
  readonly eventId: string;
  readonly width: number;
  readonly height: number;
  readonly caption: string | null;
  readonly createdAt: string;
}

/** Isi berkas yang disajikan rute `/media/*`. */
export interface StoredFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}
