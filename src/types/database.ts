import type {
  ConnectionStatus,
  DeadlineLabel,
  EducationLevel,
  EventStatus,
  EventType,
  ManagerSource,
  ModerationStatus,
  ModerationSubject,
  OrganizerStatus,
  TrackerStatus,
  TrustRequestStatus,
} from './domain';

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

export interface EventDeadlineWithEventRow extends EventDeadlineRow {
  event_id: string;
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
  // Portofolio (migration 20260929100001). VARCHAR + CHECK; mapper tetap
  // menyaring nilai yang tidak dikenal.
  achievement: string | null;
  achievement_note: string | null;
  proof_url: string | null;
  portfolio_visible: boolean | null;
}

/** RPC `public_profile(p_user)` — kolom yang sama dengan network_directory + hubungan. */
export interface PublicProfileRow {
  user_id: string;
  full_name: string;
  headline: string | null;
  education_level: EducationLevel | null;
  major: string | null;
  interests: string[] | null;
  relation: 'self' | 'connected' | 'incoming' | 'outgoing' | null;
}

/** RPC `public_portfolio(p_user)`. */
export interface PublicPortfolioRow {
  event_id: string;
  slug: string;
  title: string;
  organizer: string;
  event_type: EventType;
  tracker_status: TrackerStatus;
  achievement: string | null;
  achievement_note: string | null;
  proof_url: string | null;
  deadline_at: string | null;
  updated_at: string;
  verified_by: string | null;
}

/** RPC `my_result_verifications()` (ADR-047). */
export interface ResultVerificationRow {
  event_id: string;
  status: string;
  org_name: string | null;
  review_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

/** RPC `organizer_pending_verifications()` (ADR-047). */
export interface PendingVerificationRow {
  user_id: string;
  full_name: string;
  education_level: EducationLevel | null;
  major: string | null;
  event_id: string;
  slug: string;
  title: string;
  event_type: EventType;
  achievement: string;
  achievement_note: string | null;
  proof_url: string | null;
  requested_at: string;
}

/** RPC `organizer_event_history()`. BIGINT tiba sebagai number JSON. */
export interface OrganizerHistoryRow {
  event_id: string;
  slug: string;
  title: string;
  event_type: EventType;
  status: EventStatus;
  closed_at: string | null;
  views: number;
  visitors: number;
  saves: number;
  clicks: number;
  applied: number;
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
  submitted_by?: string | null;
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

export interface ModerationLogRow {
  id: number;
  subject_type: ModerationSubject;
  subject_id: string;
  title: string;
  /** TEXT + CHECK daftar tertutup sejak migration 20260928110001. */
  from_status: ModerationStatus | null;
  to_status: ModerationStatus;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  actor: { full_name: string | null } | null;
}

export interface RecommendationSignalRow {
  event_id: string;
  created_at: string;
  interests: string[] | null;
  education_level: EducationLevel | null;
}

/** View `network_directory` (ADR-040) — sengaja tanpa email. */
export interface NetworkDirectoryRow {
  user_id: string;
  full_name: string;
  headline: string | null;
  education_level: EducationLevel | null;
  major: string | null;
  interests: string[] | null;
  updated_at: string;
}

/** View `connection_peers` — pihak lawan dari koneksi milik pemanggil. */
export interface ConnectionPeerRow {
  connection_id: string;
  status: ConnectionStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  is_outgoing: boolean;
  peer_id: string;
  full_name: string;
  headline: string | null;
  education_level: EducationLevel | null;
  major: string | null;
  interests: string[] | null;
}

export interface NetworkProfileRow {
  is_discoverable: boolean;
  headline: string | null;
}

export interface ConnectionPairRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: ConnectionStatus;
}

/** View `blocked_people` — orang yang diblokir pemanggil (ADR-041). */
export interface BlockedPersonRow {
  user_id: string;
  full_name: string;
  created_at: string;
}

/** Tabel `organizer_profiles` (ADR-042). */
export interface OrganizerProfileRow {
  user_id: string;
  org_name: string;
  website: string | null;
  evidence: string;
  status: OrganizerStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  /** Hanya di antrean admin (embed `users!organizer_profiles_user_id_fkey`). */
  applicant?: { full_name: string; email: string | null } | null;
}

/** `event_claims` + judul acara (embed FK `events`). */
export interface EventClaimRow {
  id: string;
  event_id: string;
  user_id: string;
  evidence: string;
  status: TrustRequestStatus;
  review_note: string | null;
  created_at: string;
  event: { id: string; slug: string; title: string; organizer: string } | null;
}

/** `event_revisions` + judul acara (embed FK `events`). */
export interface EventRevisionRow {
  id: string;
  event_id: string;
  proposed_by: string;
  changes: unknown;
  note: string | null;
  status: TrustRequestStatus;
  review_note: string | null;
  created_at: string;
  event: { id: string; slug: string; title: string; organizer: string } | null;
}

export interface EventManagerRow {
  event_id: string;
  source: ManagerSource;
  created_at: string;
}
