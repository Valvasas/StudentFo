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
}

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}
