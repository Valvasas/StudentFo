import type { ActionErrorCode } from '@/lib/action-feedback';
import { fromStoredPayload } from '@/lib/submission-schema';
import type { ConnectionCursor } from '@/lib/network';
import { fromStoredRevisionChanges } from '@/lib/organizer';
import type {
  Connection,
  DeadlineDispatch,
  EventClaim,
  EventDetail,
  EventRevision,
  EventSummary,
  ModerationLogEntry,
  Achievement,
  NetworkPerson,
  OrganizerHistoryEntry,
  OrganizerProfile,
  PortfolioEntry,
  PortfolioFields,
  Submission,
  TeamMember,
} from '@/types/domain';
import { ACHIEVEMENTS, toTeamRole, toVerificationBadge } from '@/types/domain';
import type {
  ConnectionPeerRow,
  EventClaimRow,
  EventDeadlineRow,
  EventListingRow,
  EventRevisionRow,
  ModerationLogRow,
  NetworkDirectoryRow,
  NotificationDispatchRow,
  OrganizerHistoryRow,
  OrganizerProfileRow,
  PublicPortfolioRow,
  SubmissionRow,
  TeamMemberProfileRow,
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

export const ORGANIZER_COLUMNS = 'user_id, org_name, website, evidence, status, review_note, reviewed_at, created_at';
export const CLAIM_COLUMNS = 'id, event_id, user_id, evidence, status, review_note, created_at, event:events(id, slug, title, organizer)';
export const REVISION_COLUMNS =
  'id, event_id, proposed_by, changes, note, status, review_note, created_at, event:events(id, slug, title, organizer)';

export function toOrganizerProfile(row: OrganizerProfileRow): OrganizerProfile {
  return {
    userId: row.user_id,
    orgName: row.org_name,
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
