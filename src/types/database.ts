import type { DeadlineLabel, EducationLevel, EventStatus, EventType, TrackerStatus } from './domain';

/**
 * Bentuk baris sebagaimana dikembalikan PostgREST.
 *
 * Ditulis tangan dan sengaja dibatasi pada kolom yang benar-benar
 * di-SELECT. Di proyek dengan DB aktif, berkas ini bisa diganti hasil
 * `supabase gen types typescript`; sampai saat itu, ini adalah kontrak
 * eksplisit antara SQL dan TypeScript — jauh lebih baik daripada `any`
 * yang menyembunyikan salah ketik nama kolom sampai runtime.
 */
export interface EventListingRow {
  id: string;
  slug: string;
  title: string;
  organizer: string;
  description: string | null;
  event_type: EventType;
  registration_link: string;
  source_url: string;
  education_levels: EducationLevel[] | null;
  location: string | null;
  is_online: boolean;
  status: EventStatus;
  saved_count: number;
  created_at: string;
  primary_deadline_at: string | null;
  primary_deadline_label: DeadlineLabel | null;
  category_slugs: string[] | null;
}

export interface EventDeadlineRow {
  id: string;
  label: DeadlineLabel;
  deadline_at: string;
  is_primary: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
}

export interface UserProfileRow {
  full_name: string;
  role: 'USER' | 'ADMIN';
  education_level: EducationLevel | null;
  major: string | null;
  interests: string[] | null;
}

export interface SavedEventRow {
  user_id: string;
  event_id: string;
  saved_at: string;
}

export interface TrackerRow {
  id: string;
  user_id: string;
  event_id: string;
  status: TrackerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamRow {
  id: string;
  event_id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  slots_needed: number;
  created_at: string;
}

/** Baris dari view `team_member_profiles` (migration 0007). */
export interface TeamMemberProfileRow {
  team_id: string;
  user_id: string;
  /** VARCHAR(50) tanpa enum — disempitkan lewat `toTeamRole()`. */
  role: string;
  joined_at: string;
  full_name: string;
}

/** Baris dari view `team_member_counts` (migration 20260923100001). */
export interface TeamMemberCountRow {
  team_id: string;
  member_count: number;
}

/**
 * `payload` sengaja `unknown`: kolomnya JSONB tanpa skema dan bisa ditulis
 * siapa pun lewat PostgREST (policy `ugc_public_insert`). Dibaca lewat
 * `fromStoredPayload()` yang memvalidasinya, tidak pernah di-cast.
 */
export interface SubmissionRow {
  id: string;
  submitted_by_email: string;
  payload: unknown;
  status: EventStatus;
  created_at: string;
}

/**
 * `type` sengaja `string`, bukan NotificationType: kolomnya VARCHAR(50) di
 * Postgres, jadi database tidak menjamin nilainya ada di daftar yang dikenal
 * aplikasi. Menyempitkannya di sini sama dengan berbohong pada type checker.
 * Penyempitan dilakukan sekali lewat `toNotificationType()` saat memetakan.
 */
export interface NotificationRow {
  id: string;
  event_id: string | null;
  type: string;
  message: string;
  is_read: boolean;
  sent_at: string;
}
