import { z } from 'zod';
import type { AchievementFacts } from '@/lib/achievements';
import type { ActionErrorCode } from '@/lib/action-feedback';
import { fromStoredPayload } from '@/lib/submission-schema';
import type { ConnectionCursor } from '@/lib/network';
import { fromStoredRevisionChanges } from '@/lib/organizer';
import { parseStoredOutboundConfig } from '@/lib/outbound-survey';
import { parseStoredFields } from '@/lib/registration-form';
import type {
  AnswerValue,
  Connection,
  CronJobHealth,
  EventQuestion,
  DeadlineDispatch,
  EventClaim,
  EventDetail,
  EventPhoto,
  EventRegistration,
  EventRevision,
  EventSummary,
  ModerationLogEntry,
  Achievement,
  NetworkPerson,
  OrganizerHistoryEntry,
  OrganizerProfile,
  OrganizerType,
  EducationLevel,
  OutboundSurveyConfig,
  PublicProfileDetails,
  OutboundSurveyRecord,
  LobbyIntent,
  LobbyMember,
  PortfolioEntry,
  PortfolioFields,
  TeamCandidate,
  TeamSeekerProfile,
  TeamSkillSlug,
  RegistrationForm,
  RegistrationStats,
  RegistrationStatus,
  Submission,
  TeamMember,
  AdminUserSummary,
  ContentReport,
} from '@/types/domain';
import {
  ACHIEVEMENTS,
  EDUCATION_LEVELS,
  EVENT_STATUSES,
  EVENT_TYPES,
  ORGANIZER_STATUSES,
  LOBBY_INTENTS,
  ORGANIZER_TYPES,
  REGISTRATION_STATUSES,
  TEAM_SKILL_SLUGS,
  toTeamRole,
  toVerificationBadge,
} from '@/types/domain';
import type {
  ConnectionPeerRow,
  CronJobHealthRow,
  EventQuestionRow,
  EventClaimRow,
  EventDeadlineRow,
  EventListingRow,
  EventPhotoRow,
  EventRegistrationRow,
  EventRevisionRow,
  ModerationLogRow,
  NetworkDirectoryRow,
  NotificationDispatchRow,
  OrganizerHistoryRow,
  OrganizerProfileRow,
  PublicPortfolioRow,
  RegistrationFormRow,
  RegistrationStatsRow,
  SubmissionRow,
  TeamCandidateRow,
  TeamMemberProfileRow,
  TeamSeekerRow,
  AdminUserRow,
  ContentReportRow,
  LobbyRosterRow,
  OutboundSurveyConfigRow,
  PublicProfileDetailsRow,
  OutboundSurveyRow,
} from '@/types/database';

/**
 * Pemetaan baris PostgREST → bentuk domain, dipisah dari
 * `supabase-repository.ts` (yang `server-only`) supaya bisa diuji langsung.
 */

export const LISTING_COLUMNS =
  'id, slug, title, organizer, description, event_type, registration_link, source_url, education_levels, location, is_online, status, saved_count, created_at, primary_deadline_at, primary_deadline_label, category_slugs, is_free, price_amount, is_featured, featured_until, verification_badge, guidebook_url';

/** NUMERIC dari PostgREST: angka JSON, atau string bila presisinya melebihi double. */
function toPriceAmount(value: number | string | null): number | null {
  if (value === null) return null;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function toSummary(row: EventListingRow): EventSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    organizer: row.organizer,
    eventType: row.event_type,
    educationLevels: row.education_levels ?? [],
    categorySlugs: row.category_slugs ?? [],
    location: row.location,
    isOnline: row.is_online,
    status: row.status,
    savedCount: row.saved_count,
    createdAt: row.created_at,
    primaryDeadlineAt: row.primary_deadline_at,
    primaryDeadlineLabel: row.primary_deadline_label,
    isFree: row.is_free,
    priceAmount: row.is_free === false ? toPriceAmount(row.price_amount) : null,
    featuredUntil: row.is_featured ? row.featured_until : null,
    verificationBadge: toVerificationBadge(row.verification_badge),
  };
}

export function toDetail(row: EventListingRow, deadlines: readonly EventDeadlineRow[]): EventDetail {
  return {
    ...toSummary(row),
    description: row.description,
    registrationLink: row.registration_link,
    sourceUrl: row.source_url,
    guidebookUrl: row.guidebook_url,
    deadlines: deadlines.map((deadline) => ({
      id: deadline.id,
      label: deadline.label,
      deadlineAt: deadline.deadline_at,
      isPrimary: deadline.is_primary,
    })),
  };
}

/**
 * Baris antrean dispatch → payload kanal luar. Jenis selain H-3/H-1 dibuang
 * (bukan dipaksa): RPC hanya mengklaim dua jenis itu, jadi baris lain berarti
 * kontrak SQL ↔ TS sudah bergeser — lebih aman tidak dikirim.
 */
export function toDeadlineDispatch(row: NotificationDispatchRow): DeadlineDispatch[] {
  if (row.notification_type !== 'DEADLINE_H3' && row.notification_type !== 'DEADLINE_H1') return [];
  return [
    {
      notificationId: row.notification_id,
      type: row.notification_type,
      message: row.message,
      createdAt: row.created_at,
      recipient: { userId: row.user_id, email: row.user_email, fullName: row.user_full_name },
      event: {
        id: row.event_id,
        slug: row.event_slug,
        title: row.event_title,
        organizer: row.event_organizer,
        deadlineAt: row.deadline_at,
        daysLeft: row.days_left,
      },
    },
  ];
}

export function toTeamMember(row: TeamMemberProfileRow): TeamMember {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    role: toTeamRole(row.role),
    joinedAt: row.joined_at,
  };
}

export function toSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    submittedByEmail: row.submitted_by_email,
    submittedBy: row.submitted_by ?? null,
    status: row.status,
    createdAt: row.created_at,
    payload: fromStoredPayload(row.payload),
    rejectionReason: row.rejection_reason ?? null,
  };
}

/**
 * Bersihkan query pencarian sebelum diserahkan ke Postgres FTS.
 *
 * `websearch_to_tsquery` memang sudah toleran terhadap input manusia, tapi
 * karakter operator yang lolos tetap bisa membuat query gagal total dan
 * memunculkan halaman error alih-alih "tidak ada hasil". Untuk kotak
 * pencarian, kegagalan diam yang benar adalah "nol hasil", bukan 500.
 */
export function sanitizeSearchQuery(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[<>()\[\]{}\\:&|!*']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id dari URL/form dicek bentuknya SEBELUM sampai ke Postgres. Tanpa ini,
 * `/teams/abc` membuat Postgres melempar "invalid input syntax for type
 * uuid", yang berujung halaman error 502 — padahal jawaban yang benar
 * adalah 404 biasa.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Kode SQLSTATE dari error PostgREST, kalau ada. */
/**
 * Kolom yang dibaca/ditulis belum ada: Postgres `42703` (SELECT lewat
 * PostgREST) atau `PGRST204` (kolom tidak ada di cache skema, saat UPDATE).
 * Dipakai fitur yang boleh tayang lebih dulu daripada migration-nya.
 */
export function isMissingColumnError(error: unknown): boolean {
  const code = sqlState(error);
  return code === '42703' || code === 'PGRST204';
}

/**
 * Tabel/fungsi belum ada — kode tayang sebelum migration-nya (urutan deploy):
 * Postgres `42P01`/`42883`, atau PostgREST `PGRST205` (tabel) / `PGRST202`
 * (fungsi) tidak ada di cache skema.
 */
export function isMissingRelationError(error: unknown): boolean {
  const code = sqlState(error);
  return code === '42P01' || code === '42883' || code === 'PGRST205' || code === 'PGRST202';
}

export function sqlState(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function toModerationLogEntry(row: ModerationLogRow): ModerationLogEntry {
  return {
    id: String(row.id),
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    title: row.title,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorId: row.actor_id,
    actorName: row.actor?.full_name ?? null,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export const DIRECTORY_COLUMNS = 'user_id, full_name, headline, education_level, major, interests, updated_at';

export function toNetworkPerson(row: NetworkDirectoryRow): NetworkPerson {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    headline: row.headline,
    educationLevel: row.education_level,
    major: row.major,
    interests: row.interests ?? [],
  };
}

/**
 * Filter PostgREST `or=(…)` untuk baris SETELAH kursor dalam urutan
 * (status, created_at, connection_id) menurun — keyset, jadi halaman tetap
 * stabil walau ada koneksi baru di antara dua permintaan. Nilai kursor
 * sudah divalidasi ketat `decodeConnectionCursor()`; stempel waktu dikutip
 * karena memuat `.` dan `:` yang bermakna di sintaks filter.
 */
export function keysetAfter({ status, createdAt, id }: ConnectionCursor): string {
  const at = `"${createdAt}"`;
  return [
    `status.lt.${status}`,
    `and(status.eq.${status},created_at.lt.${at})`,
    `and(status.eq.${status},created_at.eq.${at},connection_id.lt.${id})`,
  ].join(',');
}

export function toConnection(row: ConnectionPeerRow): Connection {
  return {
    id: row.connection_id,
    person: {
      userId: row.peer_id,
      fullName: row.full_name,
      headline: row.headline,
      educationLevel: row.education_level,
      major: row.major,
      interests: row.interests ?? [],
    },
    status: row.status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING',
    direction: row.is_outgoing ? 'outgoing' : 'incoming',
    message: row.message,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

/**
 * Kata kunci pencarian orang untuk filter `ilike` di dalam `or=(…)`
 * PostgREST. Hanya huruf/angka/tanda hubung: koma dan kurung memecah
 * sintaks `or`, dan `%`/`_` adalah wildcard `ilike`. Hanya kata PERTAMA yang
 * dikirim ke database — kata lainnya disaring `matchesPeopleSearch()` di
 * atas jendela kandidat, jadi hasilnya tetap "semua kata cocok".
 */
export function peopleSearchTerm(search: string): string | null {
  const first = sanitizeSearchQuery(search)
    .split(' ')
    .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ''))
    .find((word) => word.length >= 2);
  return first ?? null;
}

/** Kolom sebelum migration 20261108100001 — cadangan bila kode tayang lebih dulu dari migration-nya. */
export const LEGACY_ORGANIZER_COLUMNS = 'user_id, org_name, website, evidence, status, review_note, reviewed_at, created_at';
export const ORGANIZER_COLUMNS = `${LEGACY_ORGANIZER_COLUMNS}, org_type, contact_role`;
export const CLAIM_COLUMNS = 'id, event_id, user_id, evidence, status, review_note, created_at, event:events(id, slug, title, organizer)';
export const REVISION_COLUMNS =
  'id, event_id, proposed_by, changes, note, status, review_note, created_at, event:events(id, slug, title, organizer)';

export function toOrganizerProfile(row: OrganizerProfileRow): OrganizerProfile {
  return {
    userId: row.user_id,
    orgName: row.org_name,
    orgType: (ORGANIZER_TYPES as readonly string[]).includes(row.org_type ?? '') ? (row.org_type as OrganizerType) : null,
    contactRole: row.contact_role ?? null,
    website: row.website,
    evidence: row.evidence,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    ...(row.applicant ? { applicant: { fullName: row.applicant.full_name, email: row.applicant.email } } : {}),
  };
}

function eventRefOf(row: { event_id: string; event: EventClaimRow['event'] }): EventClaim['event'] {
  return row.event ?? { id: row.event_id, slug: '', title: '(acara dihapus)', organizer: '' };
}

export function toEventClaim(row: EventClaimRow, orgNames: ReadonlyMap<string, string>): EventClaim {
  return {
    id: row.id,
    event: eventRefOf(row),
    userId: row.user_id,
    orgName: orgNames.get(row.user_id) ?? null,
    evidence: row.evidence,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

/**
 * `null` bila `changes` tidak lolos skema: baris itu ditulis di luar
 * aplikasi (siapa pun yang memegang sesi pengelola bisa INSERT langsung).
 * Tidak ditampilkan ke moderator sebagai "tanpa perubahan" — itu menyesatkan.
 */
export function toEventRevision(row: EventRevisionRow, orgNames: ReadonlyMap<string, string>): EventRevision | null {
  const changes = fromStoredRevisionChanges(row.changes);
  if (!changes) return null;
  return {
    id: row.id,
    event: eventRefOf(row),
    proposedBy: row.proposed_by,
    orgName: orgNames.get(row.proposed_by) ?? null,
    changes,
    note: row.note,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

/**
 * Pesan RAISE dari trigger/RPC migration 20260928110001 → kode aksi
 * tertutup (ADR-019). `null` = bukan penolakan yang dikenal → kegagalan sistem.
 */
export function organizerErrorCode(
  error: { code?: string; message?: string } | null,
): Exclude<ActionErrorCode, 'unknown'> | null {
  const message = error?.message ?? '';
  if (/organizer_rate_limited|claim_rate_limited|revision_rate_limited/.test(message)) return 'organizer_rate_limited';
  if (message.includes('organizer_invalid_transition')) return 'organizer_invalid_transition';
  if (message.includes('organizer_not_found')) return 'organizer_not_found';
  if (message.includes('claim_not_found')) return 'claim_not_found';
  if (message.includes('claim_not_verified')) return 'organizer_not_verified';
  if (message.includes('revision_not_found')) return 'revision_not_found';
  if (/revision_invalid_link|revision_deadline_past|revision_not_manager/.test(message)) return 'revision_rejected_by_db';
  if (message.includes('analytics_forbidden')) return 'not_event_manager';
  return null;
}

const publicBadgeFactsSchema = z.object({
  registrations: z.array(
    z.object({
      event_type: z.enum(EVENT_TYPES),
      event_status: z.enum(EVENT_STATUSES),
      deadline_at: z.string().nullable(),
      confirmed_at: z.string(),
    }),
  ),
  approved_submissions: z.number().int().nonnegative(),
  organizer_status: z.enum(ORGANIZER_STATUSES).nullable(),
  organizer_reviewed_at: z.string().nullable(),
  hosted_closed_at: z.array(z.string().nullable()),
});

/**
 * Hasil `public_badge_facts()` (ADR-072) → bahan `evaluateBadges`. JSONB =
 * tak dipercaya: bentuk asing → null (lencananya tidak tampil), bukan galat.
 * Id acara sengaja tidak diserahkan SQL; diganti id buatan per baris.
 */
export function toPublicBadgeFacts(raw: unknown): AchievementFacts | null {
  const parsed = publicBadgeFactsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const facts = parsed.data;
  return {
    registrations: facts.registrations.map((row, index) => ({
      eventId: `publik-${index + 1}`,
      eventType: row.event_type,
      eventStatus: row.event_status,
      deadlineAt: row.deadline_at,
      status: 'CONFIRMED',
      confirmedAt: row.confirmed_at,
    })),
    managedEventIds: [],
    approvedSubmissions: facts.approved_submissions,
    organizerStatus: facts.organizer_status,
    organizerReviewedAt: facts.organizer_reviewed_at,
    hostedEventClosedAt: facts.hosted_closed_at,
  };
}

/** Galat bernama dari RPC lobi (migration 20261108100003) → kode tertutup. */
export function lobbyErrorCode(error: { code?: string; message?: string } | null): Exclude<ActionErrorCode, 'unknown'> | null {
  if (isMissingRelationError(error)) return 'lobby_unavailable';
  const message = error?.message ?? '';
  for (const code of ['lobby_forbidden', 'lobby_closed', 'lobby_invite_invalid', 'lobby_rate_limited'] as const) {
    if (message.includes(code)) return code;
  }
  // CHECK `lobby_members.note` (> 160) / `intent` — hanya bisa lolos bila validasi aplikasi dilewati.
  if (sqlState(error) === '23514') return 'invalid_lobby';
  return null;
}

export const OUTBOUND_SURVEY_COLUMNS =
  'event_id, signed_in, skipped, education_level, region_code, institution_id, institution, answers, created_at, event:events(title, slug)';

const answerValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const storedAnswers = z.record(answerValue);

/** Baris asing (nilai di luar daftar, mis. ditulis SQL editor) dibuang, bukan dipercaya. */
export function toOutboundSurveyRecord(row: OutboundSurveyRow): OutboundSurveyRecord | null {
  if (row.education_level !== null && !(EDUCATION_LEVELS as readonly string[]).includes(row.education_level)) return null;
  const answers = storedAnswers.safeParse(row.answers ?? {});
  if (!answers.success) return null;
  return {
    eventId: row.event_id,
    eventTitle: row.event?.title ?? null,
    eventSlug: row.event?.slug ?? null,
    signedIn: row.signed_in,
    skipped: row.skipped,
    educationLevel: row.education_level as EducationLevel | null,
    regionCode: row.region_code,
    institutionId: row.institution_id,
    institution: row.institution,
    answers: answers.data,
    createdAt: row.created_at,
  };
}

export const OUTBOUND_CONFIG_COLUMNS = 'ask_education, ask_region, ask_institution, questions, updated_at';

export function toOutboundSurveyConfig(row: OutboundSurveyConfigRow): OutboundSurveyConfig {
  return parseStoredOutboundConfig({
    askEducation: row.ask_education,
    askRegion: row.ask_region,
    askInstitution: row.ask_institution,
    questions: row.questions,
    updatedAt: row.updated_at,
  });
}

export function toPublicProfileDetails(row: PublicProfileDetailsRow): PublicProfileDetails {
  return {
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    // Pertahanan kedua: apa pun yang dikembalikan RPC, kecamatan tidak sampai ke tampilan.
    regionCode: row.region_code ? row.region_code.slice(0, 5) : null,
    studyFields: row.study_fields ?? [],
    username: row.username,
    bio: row.bio,
  };
}

export function toLobbyMemberRow(row: LobbyRosterRow): LobbyMember | null {
  if (!(LOBBY_INTENTS as readonly string[]).includes(row.intent)) return null;
  const relation = row.relation === 'connected' || row.relation === 'pending' ? row.relation : 'none';
  return { userId: row.user_id, fullName: row.full_name, intent: row.intent as LobbyIntent, note: row.note, joinedAt: row.joined_at, relation };
}

/**
 * Hasil RPC `mutual_connection_counts` → peta userId → jumlah. Diperiksa
 * bentuknya saat runtime: klien Supabase di repo ini tidak diberi tipe
 * skema, jadi `data` RPC tidak punya jaminan bentuk apa pun.
 */
export function toMutualCounts(data: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  if (!Array.isArray(data)) return counts;
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const { user_id: userId, mutual_count: count } = row as Record<string, unknown>;
    if (typeof userId === 'string' && (typeof count === 'number' || typeof count === 'string')) {
      const value = Number(count);
      if (Number.isFinite(value)) counts.set(userId, value);
    }
  }
  return counts;
}

/** Nilai di luar daftar (CHECK diubah tanpa aplikasi) diperlakukan sebagai "belum diisi", bukan dilempar ke UI. */
export function toAchievement(value: string | null): Achievement | null {
  return value !== null && (ACHIEVEMENTS as readonly string[]).includes(value) ? (value as Achievement) : null;
}

export function toPortfolioFields(row: {
  achievement: string | null;
  achievement_note: string | null;
  proof_url: string | null;
  portfolio_visible: boolean | null;
}): PortfolioFields {
  return {
    achievement: toAchievement(row.achievement),
    achievementNote: row.achievement_note,
    proofUrl: row.proof_url,
    portfolioVisible: row.portfolio_visible,
  };
}

export function toPublicPortfolioEntry(row: PublicPortfolioRow): PortfolioEntry {
  return {
    eventId: row.event_id,
    slug: row.slug,
    title: row.title,
    organizer: row.organizer,
    eventType: row.event_type,
    status: row.tracker_status,
    achievement: toAchievement(row.achievement),
    achievementNote: row.achievement_note,
    proofUrl: row.proof_url,
    deadlineAt: row.deadline_at,
  };
}

export function toOrganizerHistoryEntry(row: OrganizerHistoryRow): OrganizerHistoryEntry {
  return {
    eventId: row.event_id,
    slug: row.slug,
    title: row.title,
    eventType: row.event_type,
    status: row.status,
    closedAt: row.closed_at,
    views: Number(row.views),
    visitors: Number(row.visitors),
    saves: Number(row.saves),
    clicks: Number(row.clicks),
    applied: Number(row.applied),
  };
}

/**
 * Baris dari RPC `RETURNS TABLE`. Tanpa skema tergenerasi supabase-js
 * mengetik hasil `rpc()` sebagai objek tunggal; PostgREST sebenarnya selalu
 * mengirim array untuk fungsi bertipe tabel. Bentuk barisnya tetap kontrak
 * eksplisit di `src/types/database.ts` — setara `.returns<Row[]>()` pada query tabel.
 */
export function rpcRows<Row>(data: unknown): readonly Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

// ------------------------------------------------------------------
// Pencocokan tim (ADR-057)
// ------------------------------------------------------------------

export const SEEKER_COLUMNS = 'is_open, city, skills, seeking, remote_ok, pitch, updated_at';

/**
 * Slug di luar katalog dibuang, tidak dipercaya: CHECK di database menjamin
 * katalog, tetapi katalog yang kelak diperluas migration lebih dulu daripada
 * kode ini tidak boleh membuat satu baris menjatuhkan seluruh daftar.
 */
export function toSkillSlugs(values: readonly string[] | null): readonly TeamSkillSlug[] {
  return [...new Set((values ?? []).filter((value): value is TeamSkillSlug => TEAM_SKILL_SLUGS.includes(value as TeamSkillSlug)))];
}

export function toSeekerProfile(row: TeamSeekerRow): TeamSeekerProfile {
  return {
    open: row.is_open,
    city: row.city,
    skills: toSkillSlugs(row.skills),
    seeking: toSkillSlugs(row.seeking),
    remoteOk: row.remote_ok,
    pitch: row.pitch,
    updatedAt: row.updated_at,
  };
}

export function toTeamCandidate(row: TeamCandidateRow): TeamCandidate {
  return {
    person: {
      userId: row.user_id,
      fullName: row.full_name,
      headline: row.headline,
      educationLevel: row.education_level,
      major: row.major,
      interests: row.interests ?? [],
    },
    city: row.city,
    skills: toSkillSlugs(row.skills),
    seeking: toSkillSlugs(row.seeking),
    remoteOk: row.remote_ok,
    pitch: row.pitch,
    portfolio: {
      count: row.portfolio_count ?? 0,
      // 'NONE' dan nilai asing sama-sama berarti "tanpa hasil yang dilaporkan".
      achievements: (row.portfolio_achievements ?? []).map(toAchievement),
    },
    relation: row.relation,
  };
}

// ------------------------------------------------------------------
// Formulir pendaftaran, pembayaran, galeri (ADR-056)
// ------------------------------------------------------------------

export const REGISTRATION_FORM_COLUMNS = 'event_id, is_open, intro, fields, capacity, fee_amount, payment_instructions, updated_at';
export const REGISTRATION_COLUMNS =
  'id, code, event_id, user_id, full_name, email, answers, status, fee_amount, proof_path, proof_uploaded_at, review_note, reviewed_at, created_at, updated_at';
export const PHOTO_COLUMNS = 'id, event_id, storage_path, content_type, width, height, caption, created_at';
/** Dengan tanda poster (migration 20261109100002); `PHOTO_COLUMNS` tetap untuk basis data lama. */
export const PHOTO_COLUMNS_WITH_POSTER = `${PHOTO_COLUMNS}, is_poster`;

export function toRegistrationForm(row: RegistrationFormRow, activeCount: number): RegistrationForm {
  return {
    eventId: row.event_id,
    isOpen: row.is_open,
    intro: row.intro,
    fields: parseStoredFields(row.fields),
    capacity: row.capacity,
    feeAmount: row.fee_amount,
    paymentInstructions: row.payment_instructions,
    activeCount,
    updatedAt: row.updated_at,
  };
}

function toRegistrationStatus(value: string): RegistrationStatus {
  return (REGISTRATION_STATUSES as readonly string[]).includes(value) ? (value as RegistrationStatus) : 'REJECTED';
}

/** Jawaban JSONB → hanya nilai berbentuk sah; sisanya dibuang (data tanpa skema DB). */
export function toAnswers(value: unknown): Record<string, AnswerValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const answers: Record<string, AnswerValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') answers[key] = item;
    else if (Array.isArray(item) && item.every((entry) => typeof entry === 'string')) answers[key] = item as string[];
  }
  return answers;
}

export function toEventRegistration(row: EventRegistrationRow, events: ReadonlyMap<string, EventSummary>): EventRegistration {
  const event = events.get(row.event_id);
  return {
    id: row.id,
    code: row.code,
    event: {
      id: row.event_id,
      slug: event?.slug ?? '',
      title: event?.title ?? '(acara tidak lagi tayang)',
      organizer: event?.organizer ?? '',
      primaryDeadlineAt: event?.primaryDeadlineAt ?? null,
      eventType: event?.eventType ?? null,
      status: event?.status ?? null,
    },
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    answers: toAnswers(row.answers),
    status: toRegistrationStatus(row.status),
    feeAmount: row.fee_amount,
    proofUploadedAt: row.proof_uploaded_at,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toRegistrationStats(row: RegistrationStatsRow): RegistrationStats {
  return {
    eventId: row.event_id,
    total: Number(row.total),
    confirmed: Number(row.confirmed),
    awaitingPayment: Number(row.awaiting_payment),
    paymentReview: Number(row.payment_review),
    recent: Number(row.recent),
  };
}

export function toEventPhoto(row: EventPhotoRow): EventPhoto {
  return {
    id: row.id,
    eventId: row.event_id,
    width: row.width,
    height: row.height,
    caption: row.caption,
    createdAt: row.created_at,
    isPoster: row.is_poster === true,
  };
}

/** Penolakan yang dikenal dari RPC pendaftaran/galeri → kode aksi; sisanya null (500). */
export function registrationErrorCode(
  error: { code?: string; message?: string } | null,
): Exclude<ActionErrorCode, 'unknown'> | null {
  const message = error?.message ?? '';
  for (const code of [
    'registration_closed',
    'registration_full',
    'registration_exists',
    'registration_not_found',
    'registration_invalid_transition',
    'registration_rate_limited',
    'review_note_required',
    'invalid_registration',
    'gallery_full',
  ] as const) {
    if (message.includes(code)) return code;
  }
  if (message.includes('registration_requires_login')) return 'registration_closed';
  return null;
}

export function toContentReport(
  row: ContentReportRow,
  events: ReadonlyMap<string, { slug: string; title: string }>,
  names: ReadonlyMap<string, string>,
  questions: ReadonlyMap<string, { excerpt: string; eventSlug: string }> = new Map(),
): ContentReport {
  const event = row.subject_type === 'event' ? events.get(row.subject_id) : undefined;
  const question = row.subject_type === 'question' ? questions.get(row.subject_id) : undefined;
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectLabel:
      row.subject_type === 'event' ? (event?.title ?? null) : row.subject_type === 'question' ? (question?.excerpt ?? null) : (names.get(row.subject_id) ?? null),
    subjectSlug: event?.slug ?? question?.eventSlug ?? null,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporterName: row.reporter_id ? (names.get(row.reporter_id) ?? null) : null,
    createdAt: row.created_at,
  };
}

export function toEventQuestion(row: EventQuestionRow): EventQuestion {
  return {
    id: row.id,
    body: row.body,
    authorFirstName: row.author_first_name,
    isMine: row.is_mine,
    createdAt: row.created_at,
    answer: row.answer,
    answeredAs: row.answered_as,
    answeredAt: row.answered_at,
  };
}

export function toCronJobHealth(row: CronJobHealthRow): CronJobHealth {
  return {
    jobName: row.jobname,
    schedule: row.schedule,
    active: row.active,
    lastStartedAt: row.last_started_at,
    lastStatus: row.last_status,
    lastMessage: row.last_message,
    runs7d: row.runs_7d,
    failures7d: row.failures_7d,
    overdue: row.overdue,
  };
}

export function toAdminUserSummary(row: AdminUserRow): AdminUserSummary {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    suspendedAt: row.suspended_at,
    suspensionReason: row.suspension_reason,
  };
}

/** Penolakan RPC media (ADR-079) → kode aksi; `null` = galat tak dikenal (500). */
export function mediaErrorCode(error: unknown): Exclude<ActionErrorCode, 'unknown'> | null {
  if (isMissingRelationError(error)) return 'media_unavailable';
  const state = sqlState(error);
  if (state === '23514') return 'invalid_video_url';
  if (state === '42501') return 'not_event_manager';
  const message = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : '';
  for (const code of ['photo_not_found', 'not_event_manager', 'event_unavailable', 'video_rate_limited'] as const) {
    if (message.includes(code)) return code;
  }
  return null;
}
