import { fromStoredPayload } from '@/lib/submission-schema';
import type {
  Connection,
  EventDetail,
  EventSummary,
  ModerationLogEntry,
  NetworkPerson,
  Submission,
  TeamMember,
} from '@/types/domain';
import { toTeamRole } from '@/types/domain';
import type {
  ConnectionPeerRow,
  EventDeadlineRow,
  EventListingRow,
  ModerationLogRow,
  NetworkDirectoryRow,
  SubmissionRow,
  TeamMemberProfileRow,
} from '@/types/database';

/**
 * Pemetaan baris PostgREST → bentuk domain, dipisah dari
 * `supabase-repository.ts` (yang `server-only`) supaya bisa diuji langsung.
 */

export const LISTING_COLUMNS =
  'id, slug, title, organizer, description, event_type, registration_link, source_url, education_levels, location, is_online, status, saved_count, created_at, primary_deadline_at, primary_deadline_label, category_slugs';

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
  };
}

export function toDetail(row: EventListingRow, deadlines: readonly EventDeadlineRow[]): EventDetail {
  return {
    ...toSummary(row),
    description: row.description,
    registrationLink: row.registration_link,
    sourceUrl: row.source_url,
    deadlines: deadlines.map((deadline) => ({
      id: deadline.id,
      label: deadline.label,
      deadlineAt: deadline.deadline_at,
      isPrimary: deadline.is_primary,
    })),
  };
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
