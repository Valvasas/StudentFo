import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import { actionError } from '@/lib/action-feedback';
import { buildDeadlineWeek, DEADLINE_WEEK_DAYS, jakartaDayWindow } from '@/lib/deadline';
import { type AppError, upstreamFailure } from '@/lib/errors';
import {
  BLOCK_LIST_LIMIT,
  clampConnectionLimit,
  connectionCursorOf,
  decodeConnectionCursor,
  encodeConnectionCursor,
  matchesPeopleSearch,
  NETWORK_LIMITS,
  normalizeConnectionSearch,
  rankSuggestions,
  type ConnectionPageRequest,
  type NetworkProfileInput,
  type NetworkViewer,
  type SuggestionCandidate,
} from '@/lib/network';
import { type OrganizerApplicationInput, toStoredRevisionChanges } from '@/lib/organizer';
import { parseEventAnalytics } from '@/lib/organizer-analytics';
import { PORTFOLIO_STATUSES, type PortfolioInput } from '@/lib/portfolio';
import { toStoredPayload } from '@/lib/submission-schema';
import {
  createSupabaseAdminClient,
  createSupabasePublicClient,
  createSupabaseServerClient,
} from '@/lib/supabase/server';
import type {
  AppNotification,
  BlockedPerson,
  Category,
  ConnectionCounts,
  ConnectionPage,
  DeadlineDay,
  EventAnalytics,
  EventClaim,
  EventDetail,
  EventQuery,
  EventRevision,
  EventRevisionChanges,
  EventStatus,
  EventSummary,
  ManagedEvent,
  ModerationLogEntry,
  NetworkEventRef,
  NetworkProfile,
  OrganizerHistoryEntry,
  OrganizerProfile,
  OrganizerStatus,
  Paginated,
  PeopleSuggestion,
  PublicProfile,
  Submission,
  Team,
  TeamLink,
  TeamMember,
  TrackerItem,
  TrackerStatus,
  TrustRequestStatus,
} from '@/types/domain';
import { toNotificationType } from '@/types/domain';
import type {
  BlockedPersonRow,
  CategoryRow,
  ConnectionPairRow,
  ConnectionPeerRow,
  EventClaimRow,
  EventDeadlineRow,
  EventDeadlineWithEventRow,
  EventListingRow,
  EventManagerRow,
  EventRevisionRow,
  ModerationLogRow,
  NetworkDirectoryRow,
  NetworkProfileRow,
  OrganizerProfileRow,
  RecommendationSignalRow,
  NotificationRow,
  SubmissionRow,
  TeamMemberCountRow,
  TeamMemberProfileRow,
  TeamRow,
  OrganizerHistoryRow,
  PublicPortfolioRow,
  PublicProfileRow,
  TrackerRow,
} from '@/types/database';
import {
  chooseCountMode,
  EXACT_COUNT_MAX_ACTIVE,
  type ListingCountMode,
  PUBLIC_STATUSES,
  RELEVANCE_CANDIDATE_WINDOW,
  resolvePaging,
  sortSummaries,
  totalPagesFor,
} from './listing';
import { type CacheLayer, nextDataCache } from './cache';
import type {
  CreateSubmissionInput,
  CalibrationData,
  CreateTeamRepositoryInput,
  RecommendationSignalInput,
  EventRepository,
  OrganizerActor,
  PeopleFilter,
  RepositoryStats,
  ReviewEventInput,
  ReviewSubmissionInput,
  RestoreRejectedInput,
  ReviewTrustInput,
} from './repository';
import {
  CLAIM_COLUMNS,
  DIRECTORY_COLUMNS,
  isUuid,
  keysetAfter,
  LISTING_COLUMNS,
  ORGANIZER_COLUMNS,
  organizerErrorCode,
  peopleSearchTerm,
  REVISION_COLUMNS,
  sanitizeSearchQuery,
  sqlState,
  toDetail,
  toEventClaim,
  toEventRevision,
  toModerationLogEntry,
  toOrganizerProfile,
  toSubmission,
  toSummary,
  toConnection,
  toMutualCounts,
  toNetworkPerson,
  toOrganizerHistoryEntry,
  toPortfolioFields,
  toPublicPortfolioEntry,
  rpcRows,
  toTeamMember,
} from './supabase-mappers';

export { sanitizeSearchQuery } from './supabase-mappers';

const TEAM_COLUMNS = 'id, event_id, created_by, title, description, slots_needed, created_at';
const MS_PER_DAY = 86_400_000;
/** Supabase memotong setiap respons PostgREST di `max_rows` (bawaan 1000). */
const PAGE_SIZE = 1000;
/**
 * Ukuran potongan `.in()`. Filter `in` dikirim di URL GET; 60 UUID ≈ 2,3 KB,
 * jauh di bawah batas panjang URL proxy/CDN di depan PostgREST.
 */
const IN_CHUNK = 60;
/**
 * Batas baca pasangan koneksi untuk MENGECUALIKAN orang dari saran — bukan
 * untuk menampilkan (itu `listConnections`, berhalaman). Di atas batas ini
 * saran bisa memuat orang yang sudah terhubung; mengajaknya berakhir di
 * `connection_exists`, jadi gagalnya aman (ADR-041).
 */
const CONNECTION_READ_LIMIT = 1000;
const PEER_COLUMNS =
  'connection_id, status, message, created_at, responded_at, is_outgoing, peer_id, full_name, headline, education_level, major, interests';
/** Kalibrasi dijalankan manual dan jarang; batas ini hanya pengaman memori. */
const CALIBRATION_ROW_LIMIT = 50_000;
const MANAGED_EVENTS_LIMIT = 200;
/** Riwayat klaim/perubahan milik sendiri — yang lebih lama tetap ada di log admin. */
const TRUST_LIST_LIMIT = 50;

/** Penolakan yang dikenal dari trigger/RPC penyelenggara → kode aksi; sisanya 500. */
function organizerFailure(error: PostgrestError, message: string): AppError {
  const code = organizerErrorCode(error);
  return code ? actionError(code) : upstreamFailure(message, error, 500);
}

/**
 * Baca semua baris per halaman `range()`. `.limit(50_000)` saja TIDAK cukup:
 * PostgREST diam-diam memotong di max_rows, dan hasil terpotong terlihat
 * persis seperti hasil lengkap.
 */
async function fetchAllPages<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < CALIBRATION_ROW_LIMIT; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw upstreamFailure('Gagal memuat data kalibrasi.', error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

/**
 * Policy saved_events/application_tracker menolak event yang tidak tayang
 * (WITH CHECK, 42501). Itu keputusan untuk pengguna — "kegiatan tidak
 * tersedia" — bukan kegagalan sistem 500 berpesan "terjadi kesalahan".
 */
function rejectedOrFailed(error: PostgrestError, message: string): AppError {
  return sqlState(error) === '42501' ? actionError('event_unavailable') : upstreamFailure(message, error, 500);
}

/** Kunci cache listing: hanya parameter yang memengaruhi QUERY, dinormalisasi supaya URL berbeda urutan tetap berbagi entri. */
interface ListingFetch {
  readonly includeClosed: boolean;
  readonly search: string;
  readonly types: readonly string[];
  readonly levels: readonly string[];
  readonly categories: readonly string[];
  readonly locations: readonly string[];
  readonly mode: 'online' | 'onsite' | null;
  readonly sort: 'deadline' | 'newest' | 'relevance';
  readonly from: number;
  readonly to: number;
  readonly countMode: ListingCountMode;
}

interface ListingPage {
  readonly rows: EventListingRow[];
  readonly count: number | null;
}

const sortedCopy = (values: readonly string[] | undefined) => [...(values ?? [])].sort();

/**
 * Implementasi produksi di atas PostgREST.
 *
 * Data publik (listing, detail, statistik) dibaca lewat klien anon tanpa
 * cookie dan dibungkus `cacheLayer` (Data Cache Next.js, tag `events`) —
 * dibagi semua pengunjung, dicabut saat moderasi. Yang personal (profil
 * untuk peringkat, simpanan, tracker) tidak pernah masuk cache: peringkat
 * relevansi dihitung SETELAH jendela kandidat diambil dari cache.
 */
export class SupabaseEventRepository implements EventRepository {
  private readonly fetchListingPage: (filters: ListingFetch) => Promise<ListingPage>;
  private readonly fetchDetailBySlug: (slug: string) => Promise<EventDetail | null>;
  private readonly fetchClosingSoon: (limit: number) => Promise<EventSummary[]>;
  private readonly fetchCategories: () => Promise<Category[]>;
  private readonly fetchStats: () => Promise<RepositoryStats>;
  private readonly fetchDeadlineWeek: () => Promise<DeadlineDay[]>;

  constructor(
    cacheLayer: CacheLayer = nextDataCache,
    private readonly exactCountMaxActive: number = EXACT_COUNT_MAX_ACTIVE,
  ) {
    this.fetchListingPage = cacheLayer(queryListingPage, ['events-listing-v1']);
    this.fetchDetailBySlug = cacheLayer(queryDetailBySlug, ['events-detail-v1']);
    this.fetchClosingSoon = cacheLayer(queryClosingSoon, ['events-closing-soon-v1']);
    this.fetchCategories = cacheLayer(queryCategories, ['categories-v1']);
    this.fetchStats = cacheLayer(queryStats, ['events-stats-v1']);
    this.fetchDeadlineWeek = cacheLayer(queryDeadlineWeek, ['events-deadline-week-v1']);
  }

  async listEvents(query: EventQuery): Promise<Paginated<EventSummary>> {
    const paging = resolvePaging(query);
    const sort = query.sort ?? 'relevance';
    // Lihat RELEVANCE_CANDIDATE_WINDOW: peringkat relevansi dihitung atas
    // satu jendela kandidat, bukan per halaman.
    const rankInApp = sort === 'relevance' && paging.offset + paging.pageSize <= RELEVANCE_CANDIDATE_WINDOW;
    const [from, to] = rankInApp
      ? [0, RELEVANCE_CANDIDATE_WINDOW - 1]
      : [paging.offset, paging.offset + paging.pageSize - 1];

    // Ukuran katalog dari statistik yang sudah di-cache — tanpa query tambahan
    // di jalur panas. Lihat EXACT_COUNT_MAX_ACTIVE.
    const countMode = chooseCountMode((await this.fetchStats()).totalActive, this.exactCountMaxActive);
    const { rows, count } = await this.fetchListingPage({
      includeClosed: query.includeClosed ?? false,
      search: query.search ? sanitizeSearchQuery(query.search) : '',
      types: sortedCopy(query.types),
      levels: sortedCopy(query.levels),
      categories: sortedCopy(query.categories),
      locations: sortedCopy(query.locations),
      mode: query.mode ?? null,
      sort,
      from,
      to,
      countMode,
    });

    const total = count ?? rows.length;
    const summaries = rows.map(toSummary);
    const items = rankInApp
      ? sortSummaries(summaries, 'relevance', new Date(), query.profile).slice(
          paging.offset,
          paging.offset + paging.pageSize,
        )
      : summaries;

    return {
      items,
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      totalPages: totalPagesFor(total, paging.pageSize),
    };
  }

  async getEventBySlug(slug: string): Promise<EventDetail | null> {
    return this.fetchDetailBySlug(slug);
  }

  async listClosingSoon(limit: number): Promise<readonly EventSummary[]> {
    return this.fetchClosingSoon(limit);
  }

  async listCategories(): Promise<readonly Category[]> {
    return this.fetchCategories();
  }

  async getStats(): Promise<RepositoryStats> {
    return this.fetchStats();
  }

  async getDeadlineWeek(): Promise<readonly DeadlineDay[]> {
    return this.fetchDeadlineWeek();
  }

  async listByStatus(status: EventStatus, limit: number): Promise<readonly EventDetail[]> {
    // Antrean moderasi berisi baris PENDING yang menurut RLS TIDAK terbaca
    // oleh anon. Dibaca dengan klien admin; otorisasi siapa yang boleh
    // memanggil ini ditegakkan di lapisan rute (lihat src/app/admin).
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('events_listing')
      .select(LISTING_COLUMNS)
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(limit)
      .returns<EventListingRow[]>();

    if (error) throw upstreamFailure('Gagal memuat antrean moderasi.', error);
    if (data.length === 0) return [];

    const { data: deadlineRows, error: deadlineError } = await supabase
      .from('event_deadlines')
      .select('id, event_id, label, deadline_at, is_primary')
      .in(
        'event_id',
        data.map((row) => row.id),
      )
      .order('deadline_at', { ascending: true })
      .returns<EventDeadlineWithEventRow[]>();

    if (deadlineError) throw upstreamFailure('Gagal memuat tenggat antrean moderasi.', deadlineError);
    return data.map((row) =>
      toDetail(
        row,
        deadlineRows.filter((deadline) => deadline.event_id === row.id),
      ),
    );
  }

  async reviewEvent({ eventId, decision, reviewerId, reason }: ReviewEventInput): Promise<void> {
    if (!isUuid(eventId)) return;
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('events')
      .update({
        status: decision,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: decision === 'REJECTED' ? (reason ?? null) : null,
      })
      .eq('id', eventId);

    if (error) throw upstreamFailure('Gagal menyimpan keputusan moderasi.', error);
  }

  async restoreRejected({ subjectType, subjectId, reviewerId }: RestoreRejectedInput): Promise<void> {
    if (!isUuid(subjectId)) throw actionError('moderation_not_rejected');
    // `reviewed_at` diisi supaya trigger log mencatatnya sebagai keputusan
    // manusia beserta namanya, bukan "Sistem".
    const reviewed = { status: 'PENDING', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() };
    const supabase = createSupabaseAdminClient();
    const { data, error } = await (subjectType === 'event'
      ? supabase.from('events').update({ ...reviewed, rejection_reason: null })
      : supabase.from('ugc_submissions').update(reviewed)
    )
      .eq('id', subjectId)
      .eq('status', 'REJECTED')
      .select('id')
      .returns<{ id: string }[]>();

    if (error) throw upstreamFailure('Gagal memulihkan keputusan moderasi.', error);
    if (data.length === 0) throw actionError('moderation_not_rejected');
  }

  // ------------------------------------------------------------------
  // Kiriman komunitas (Phase 3)
  // ------------------------------------------------------------------

  async createSubmission({ submittedByEmail, submittedBy, payload }: CreateSubmissionInput): Promise<void> {
    // Klien pengguna/anon, bukan admin: policy `ugc_public_insert` yang
    // menegakkan status PENDING. Tanpa `.select()` — anon memang tidak boleh
    // membaca tabel ini, dan meminta baris balik akan ditolak RLS.
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('ugc_submissions')
      .insert({
        submitted_by_email: submittedByEmail,
        payload: toStoredPayload(payload),
        // Hanya dikirim bila ada: kolom ini tidak termasuk hak INSERT tamu.
        ...(submittedBy ? { submitted_by: submittedBy } : {}),
      });

    if (error) {
      // Trigger enforce_submission_rate_limit() (migration 0009).
      if (sqlState(error) === 'P0001' && error.message.includes('submission_rate_limited')) {
        throw actionError('submission_rate_limited');
      }
      throw upstreamFailure('Gagal mengirim kegiatan.', error, 500);
    }
  }

  async listSubmissions(status: EventStatus, limit: number): Promise<readonly Submission[]> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('ugc_submissions')
      .select('id, submitted_by_email, submitted_by, payload, status, created_at')
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(limit)
      .returns<SubmissionRow[]>();

    if (error) throw upstreamFailure('Gagal memuat kiriman komunitas.', error);
    return data.map(toSubmission);
  }

  async listMySubmissions(userId: string, limit: number): Promise<readonly Submission[]> {
    if (!isUuid(userId)) return [];
    // Klien admin karena `ugc_submissions` hanya terbaca admin lewat RLS
    // (`ugc_admin_read`) — tabel itu juga memuat `reviewed_by`, identitas
    // moderator yang tidak perlu dibuka ke pengirim lewat policy baru.
    // Penyaringnya `userId` dari sesi server, dan kolomnya dipilih eksplisit.
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('ugc_submissions')
      .select('id, submitted_by_email, submitted_by, payload, status, created_at')
      .eq('submitted_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<SubmissionRow[]>();

    if (error) throw upstreamFailure('Gagal memuat kirimanmu.', error);
    return data.map(toSubmission);
  }

  async reviewSubmission({ submissionId, decision, reviewerId }: ReviewSubmissionInput): Promise<void> {
    if (!isUuid(submissionId)) throw actionError('submission_not_found');
    const supabase = createSupabaseAdminClient();

    if (decision === 'REJECTED') {
      const { data, error } = await supabase
        .from('ugc_submissions')
        .update({ status: 'REJECTED', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
        .eq('id', submissionId)
        .eq('status', 'PENDING')
        .select('id');

      if (error) throw upstreamFailure('Gagal menolak kiriman.', error, 500);
      if (!data?.length) throw actionError('submission_not_found');
      return;
    }

    // Penyalinan ke `events` + tenggat + kategori + penandaan kiriman terjadi
    // di SATU fungsi Postgres (satu transaksi). Dirangkai dari sini sebagai
    // beberapa request terpisah, kegagalan di tengah jalan meninggalkan event
    // tayang tanpa tenggat, atau kiriman yang tetap PENDING padahal eventnya
    // sudah ada.
    const { error } = await supabase.rpc('approve_submission', {
      p_submission_id: submissionId,
      p_reviewer_id: reviewerId,
    });

    if (error) {
      switch (sqlState(error)) {
        case '23505':
          throw actionError('submission_duplicate');
        case 'P0002':
          throw actionError('submission_not_found');
        case '22P02':
        case '22007':
        case '23502':
        case '23514':
          throw actionError('invalid_submission');
        default:
          throw upstreamFailure('Gagal menyetujui kiriman.', error, 500);
      }
    }
  }

  async listModerationLog(limit: number): Promise<readonly ModerationLogEntry[]> {
    // Klien admin: tabelnya hanya terbaca admin (RLS) dan dipanggil dari
    // rute yang sudah melewati checkAdminAccess().
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('moderation_log')
      .select('id, subject_type, subject_id, title, from_status, to_status, actor_id, reason, created_at, actor:users(full_name)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
      .returns<ModerationLogRow[]>();

    if (error) throw upstreamFailure('Gagal memuat riwayat moderasi.', error);
    return data.map(toModerationLogEntry);
  }

  // ------------------------------------------------------------------
  // Saved events & tracker
  // ------------------------------------------------------------------

  /**
   * Ambil ringkasan event untuk sekumpulan id sekaligus, dengan urutan hasil
   * mengikuti urutan `ids`. Event yang tidak (lagi) terbaca lewat RLS
   * dilewati, bukan dijadikan error.
   */
  private async fetchSummariesByIds(ids: readonly string[]): Promise<Map<string, EventSummary>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('events_listing')
      .select(LISTING_COLUMNS)
      .in('id', unique)
      .returns<EventListingRow[]>();

    if (error) throw upstreamFailure('Gagal memuat data kegiatan.', error);
    return new Map(data.map((row) => [row.id, toSummary(row)]));
  }

  async isEventSaved(userId: string, eventId: string): Promise<boolean> {
    if (!isUuid(eventId)) return false;
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from('saved_events')
      .select('event_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_id', eventId);

    return !error && (count ?? 0) > 0;
  }

  async listSavedEventIds(userId: string): Promise<readonly string[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', userId)
      .returns<{ event_id: string }[]>();

    if (error) return [];
    return data.map((row) => row.event_id);
  }

  async saveEvent(userId: string, eventId: string): Promise<void> {
    if (!isUuid(eventId)) throw actionError('event_unavailable');
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('saved_events')
      .upsert({ user_id: userId, event_id: eventId }, { onConflict: 'user_id,event_id', ignoreDuplicates: true });

    if (error) throw rejectedOrFailed(error, 'Gagal menyimpan kegiatan.');
  }

  async unsaveEvent(userId: string, eventId: string): Promise<void> {
    if (!isUuid(eventId)) return;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('saved_events')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId);

    if (error) throw upstreamFailure('Gagal membatalkan simpanan kegiatan.', error, 500);
  }

  async listSavedEvents(userId: string): Promise<readonly EventSummary[]> {
    const supabase = await createSupabaseServerClient();
    const { data: saved, error } = await supabase
      .from('saved_events')
      .select('event_id, saved_at')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false })
      .returns<{ event_id: string }[]>();

    if (error || saved.length === 0) return [];
    const events = await this.fetchSummariesByIds(saved.map((row) => row.event_id));
    return saved.map((row) => events.get(row.event_id)).filter((event): event is EventSummary => !!event);
  }

  async listTrackerItems(userId: string): Promise<readonly TrackerItem[]> {
    const supabase = await createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from('application_tracker')
      .select('id, user_id, event_id, status, notes, created_at, updated_at, achievement, achievement_note, proof_url, portfolio_visible')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .returns<TrackerRow[]>();

    if (error) throw upstreamFailure('Gagal memuat tracker.', error);
    if (rows.length === 0) return [];

    const events = await this.fetchSummariesByIds(rows.map((row) => row.event_id));
    return rows.flatMap((row) => {
      const event = events.get(row.event_id);
      return event
        ? [
            {
              id: row.id,
              eventId: row.event_id,
              status: row.status,
              notes: row.notes,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              ...toPortfolioFields(row),
              event,
            },
          ]
        : [];
    });
  }

  async upsertTrackerItem(
    userId: string,
    eventId: string,
    status: TrackerStatus,
    notes?: string | null,
  ): Promise<void> {
    if (!isUuid(eventId)) throw actionError('event_unavailable');
    const supabase = await createSupabaseServerClient();
    // `updated_at` tidak dikirim: trigger `trg_tracker_touch` yang mengisinya,
    // supaya waktu perubahan tidak bisa dipalsukan dari klien.
    const { error } = await supabase
      .from('application_tracker')
      .upsert(
        { user_id: userId, event_id: eventId, status, ...(notes !== undefined ? { notes } : {}) },
        { onConflict: 'user_id,event_id' },
      );

    if (error) throw rejectedOrFailed(error, 'Gagal memperbarui status tracker.');
  }

  async addTrackerItemIfAbsent(userId: string, eventId: string): Promise<void> {
    if (!isUuid(eventId)) throw actionError('event_unavailable');
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('application_tracker')
      .upsert(
        { user_id: userId, event_id: eventId, status: 'SAVED' },
        { onConflict: 'user_id,event_id', ignoreDuplicates: true },
      );

    if (error) throw rejectedOrFailed(error, 'Gagal menambahkan ke tracker.');
  }

  async removeTrackerItem(userId: string, eventId: string): Promise<void> {
    if (!isUuid(eventId)) return;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('application_tracker')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId);

    if (error) throw upstreamFailure('Gagal menghapus entri tracker.', error, 500);
  }

  // ------------------------------------------------------------------
  // Portofolio & profil publik (ADR-046)
  // ------------------------------------------------------------------

  async updatePortfolioEntry(userId: string, eventId: string, input: PortfolioInput): Promise<void> {
    if (!isUuid(eventId)) throw actionError('portfolio_not_eligible');
    const supabase = await createSupabaseServerClient();
    // Filter status di query: entri SAVED/REJECTED tidak punya portofolio,
    // jadi 0 baris terubah = tidak memenuhi syarat (bukan kegagalan diam).
    const { data, error } = await supabase
      .from('application_tracker')
      .update({
        achievement: input.achievement,
        achievement_note: input.achievementNote,
        proof_url: input.proofUrl,
        portfolio_visible: input.visible,
      })
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .in('status', PORTFOLIO_STATUSES)
      .select('id')
      .returns<{ id: string }[]>();

    if (error) {
      // 23514 = CHECK (hasil/catatan/https) — validator aplikasi seharusnya sudah menahannya.
      if (sqlState(error) === '23514') throw actionError('invalid_portfolio');
      throw rejectedOrFailed(error, 'Gagal menyimpan portofolio.');
    }
    if (data.length === 0) throw actionError('portfolio_not_eligible');
  }

  async getPublicProfile(_viewerId: string, userId: string): Promise<PublicProfile | null> {
    if (!isUuid(userId)) return null;
    // Klien pengguna: aturan kelihatan diperiksa `can_view_profile()` atas
    // auth.uid() pemanggil — viewerId dari aplikasi tidak dipercaya di sini.
    const supabase = await createSupabaseServerClient();
    const [profile, portfolio] = await Promise.all([
      supabase.rpc('public_profile', { p_user: userId }),
      supabase.rpc('public_portfolio', { p_user: userId }),
    ]);
    if (profile.error) throw upstreamFailure('Gagal memuat profil.', profile.error);
    const row = rpcRows<PublicProfileRow>(profile.data)[0];
    if (!row) return null;
    if (portfolio.error) throw upstreamFailure('Gagal memuat portofolio.', portfolio.error);

    return {
      person: {
        userId: row.user_id,
        fullName: row.full_name,
        headline: row.headline,
        educationLevel: row.education_level,
        major: row.major,
        interests: row.interests ?? [],
      },
      relation: row.relation,
      portfolio: rpcRows<PublicPortfolioRow>(portfolio.data).map(toPublicPortfolioEntry),
    };
  }

  // ------------------------------------------------------------------
  // Notifikasi
  //
  // Dibaca lewat klien pengguna, bukan klien admin: policy
  // `notifications_own_read` sudah membatasi ke `auth.uid() = user_id`.
  // Filter `.eq('user_id', ...)` tetap ditulis eksplisit sebagai lapis
  // kedua — kalau suatu saat policy-nya longgar karena salah edit, kueri ini
  // tidak ikut membocorkan baris orang lain.
  // ------------------------------------------------------------------

  async listNotifications(userId: string, limit: number): Promise<readonly AppNotification[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('id, event_id, type, message, is_read, sent_at')
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .limit(limit)
      .returns<NotificationRow[]>();

    if (error || data.length === 0) return [];

    const events = await this.fetchSummariesByIds(
      data.map((row) => row.event_id).filter((id): id is string => !!id),
    ).catch(() => new Map<string, EventSummary>());

    return data.map((row) => {
      const event = row.event_id ? events.get(row.event_id) : undefined;
      return {
        id: row.id,
        type: toNotificationType(row.type),
        message: row.message,
        isRead: row.is_read,
        sentAt: row.sent_at,
        event: event ? { id: event.id, slug: event.slug, title: event.title } : null,
      };
    });
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    // Lonceng adalah hiasan navbar, bukan jalur kritis. Kalau hitungannya
    // gagal, halaman tetap harus tayang — jadi 0, bukan lempar error.
    return error ? 0 : (count ?? 0);
  }

  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    if (!isUuid(notificationId)) return;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw upstreamFailure('Gagal menandai notifikasi.', error, 500);
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw upstreamFailure('Gagal menandai semua notifikasi.', error, 500);
  }

  // ------------------------------------------------------------------
  // Tim lomba (Phase 3)
  //
  // Semua operasi memakai klien PENGGUNA, tidak pernah klien admin. Policy
  // di migration 0003 (`teams_owner_write`, `team_members_self_join`,
  // `team_members_self_leave`) dan pengerasannya di 20260923100001 sudah
  // menegakkan siapa boleh apa; memakai klien admin di sini berarti mematikan
  // seluruh penjagaan itu dan memindahkannya ke kode aplikasi yang jauh lebih
  // gampang salah.
  // ------------------------------------------------------------------

  /**
   * Nama anggota (hanya terbaca pengguna yang masuk) dan jumlah anggota
   * (terbaca siapa pun) diambil terpisah, masing-masing satu query untuk
   * seluruh tim sekaligus — bukan satu query per tim.
   */
  private async hydrateTeams(rows: readonly TeamRow[]): Promise<readonly Team[]> {
    if (rows.length === 0) return [];
    const supabase = await createSupabaseServerClient();
    const teamIds = rows.map((row) => row.id);

    const [membersResult, countsResult, events] = await Promise.all([
      supabase
        .from('team_member_profiles')
        .select('team_id, user_id, role, joined_at, full_name')
        .in('team_id', teamIds)
        .order('joined_at', { ascending: true })
        .returns<TeamMemberProfileRow[]>(),
      supabase
        .from('team_member_counts')
        .select('team_id, member_count')
        .in('team_id', teamIds)
        .returns<TeamMemberCountRow[]>(),
      this.fetchSummariesByIds(rows.map((row) => row.event_id)),
    ]);

    // Tamu tidak punya hak baca view nama anggota — itu disengaja, bukan
    // kegagalan. Daftar nama kosong; jumlahnya tetap dari `team_member_counts`.
    const membersByTeam = new Map<string, TeamMember[]>();
    for (const row of membersResult.error ? [] : membersResult.data) {
      const list = membersByTeam.get(row.team_id) ?? [];
      list.push(toTeamMember(row));
      membersByTeam.set(row.team_id, list);
    }
    const counts = new Map(
      (countsResult.error ? [] : countsResult.data).map((row) => [row.team_id, Number(row.member_count)]),
    );

    return rows.map((row) => {
      const members = membersByTeam.get(row.id) ?? [];
      return {
        id: row.id,
        eventId: row.event_id,
        createdBy: row.created_by,
        title: row.title,
        description: row.description,
        slotsNeeded: row.slots_needed,
        createdAt: row.created_at,
        event: events.get(row.event_id) ?? null,
        memberCount: counts.get(row.id) ?? members.length,
        members,
      };
    });
  }

  async listTeams(eventId?: string): Promise<readonly Team[]> {
    if (eventId !== undefined && !isUuid(eventId)) return [];
    const supabase = await createSupabaseServerClient();
    let builder = supabase.from('teams').select(TEAM_COLUMNS).order('created_at', { ascending: false }).limit(60);
    if (eventId) builder = builder.eq('event_id', eventId);

    const { data, error } = await builder.returns<TeamRow[]>();
    if (error) throw upstreamFailure('Gagal memuat daftar tim.', error);
    return this.hydrateTeams(data);
  }

  async getTeamById(teamId: string): Promise<Team | null> {
    if (!isUuid(teamId)) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('teams').select(TEAM_COLUMNS).eq('id', teamId).maybeSingle<TeamRow>();

    if (error) throw upstreamFailure('Gagal memuat tim.', error);
    if (!data) return null;

    const [team] = await this.hydrateTeams([data]);
    return team ?? null;
  }

  async createTeam(input: CreateTeamRepositoryInput): Promise<string> {
    const supabase = await createSupabaseServerClient();

    // Tim + ketua dibuat dalam satu transaksi di database (migration
    // 20260930100002). Dua request terpisah pernah bisa meninggalkan tim
    // tanpa ketua kalau request kedua dan DELETE kompensasinya sama-sama
    // gagal. Pembuat = `auth.uid()` di SQL; `input.createdBy` hanya dipakai
    // mode seed.
    const { data, error } = await supabase.rpc('create_team_with_leader', {
      p_event_id: input.eventId,
      p_title: input.title,
      p_description: input.description,
      p_slots_needed: input.slotsNeeded,
    });

    if (error || typeof data !== 'string') {
      // 42501 = ditolak RLS. Policy insert `teams` mensyaratkan event
      // berstatus APPROVED — penolakan itu yang muncul di sini.
      if (sqlState(error) === '42501') throw actionError('event_unavailable');
      throw upstreamFailure('Gagal membuat tim.', error, 500);
    }

    return data;
  }

  async joinTeam(actorId: string, _actorName: string, teamId: string): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) throw actionError('team_not_found');
    if (team.members.some((member) => member.userId === actorId)) return;
    // Pemeriksaan awal demi pesan yang jelas. Penjaga sebenarnya adalah
    // trigger `enforce_team_capacity` (migration 20260923100001), yang
    // mengunci baris tim sehingga dua orang yang menekan "gabung" bersamaan
    // untuk slot terakhir tidak bisa lolos keduanya.
    if (team.memberCount >= team.slotsNeeded) throw actionError('team_full');

    const supabase = await createSupabaseServerClient();
    // `actorName` tidak dipakai di jalur Supabase: nama diambil dari tabel
    // `users` lewat view `team_member_profiles`, bukan dari input pemanggil.
    // Menyimpan nama kiriman klien akan membuat orang bisa tampil dengan
    // nama siapa pun di daftar anggota.
    const { error } = await supabase
      .from('team_members')
      .upsert({ team_id: teamId, user_id: actorId, role: 'member' }, { onConflict: 'team_id,user_id', ignoreDuplicates: true });

    if (error) {
      if (sqlState(error) === 'P0001' && error.message.includes('team_full')) throw actionError('team_full');
      throw upstreamFailure('Gagal bergabung ke tim.', error, 500);
    }
  }

  async leaveTeam(actorId: string, teamId: string): Promise<void> {
    if (!isUuid(teamId)) return;
    const supabase = await createSupabaseServerClient();
    const { data: team } = await supabase
      .from('teams')
      .select('created_by')
      .eq('id', teamId)
      .maybeSingle<{ created_by: string | null }>();
    // Paritas dengan mode seed: ketua keluar = tim tanpa pengelola.
    if (team?.created_by === actorId) throw actionError('leader_cannot_leave');

    const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', actorId);
    if (error) throw upstreamFailure('Gagal keluar dari tim.', error, 500);
  }

  /**
   * Pastikan pemanggil adalah ketua tim, atau lempar error.
   *
   * Policy `team_members_self_leave` dan `teams_owner_*` sudah menolak
   * penghapusan oleh orang lain — tapi penolakan RLS berbentuk "0 baris
   * terpengaruh", bukan error. Tanpa pemeriksaan eksplisit ini, pengguna
   * yang menekan "Keluarkan" di tim orang lain akan melihat halaman muat
   * ulang seolah berhasil, padahal tidak ada yang berubah.
   *
   * Pemeriksaan ini TIDAK menggantikan RLS; ia hanya menerjemahkan
   * penolakan senyap jadi pesan yang bisa dibaca.
   */
  private async assertTeamLeader(actorId: string, teamId: string): Promise<void> {
    if (!isUuid(teamId)) throw actionError('team_not_found');
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('teams')
      .select('created_by')
      .eq('id', teamId)
      .maybeSingle<{ created_by: string | null }>();

    if (error) throw upstreamFailure('Gagal memuat tim.', error);
    if (!data) throw actionError('team_not_found');
    if (data.created_by !== actorId) throw actionError('team_forbidden');
  }

  async removeTeamMember(actorId: string, teamId: string, memberId: string): Promise<void> {
    await this.assertTeamLeader(actorId, teamId);
    if (memberId === actorId) throw actionError('leader_cannot_be_removed');
    if (!isUuid(memberId)) return;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', memberId);
    if (error) throw upstreamFailure('Gagal mengeluarkan anggota.', error, 500);
  }

  async deleteTeam(actorId: string, teamId: string): Promise<void> {
    await this.assertTeamLeader(actorId, teamId);

    const supabase = await createSupabaseServerClient();
    // `team_members` ikut terhapus lewat ON DELETE CASCADE (migration 0001).
    const { error } = await supabase.from('teams').delete().eq('id', teamId).eq('created_by', actorId);
    if (error) throw upstreamFailure('Gagal membubarkan tim.', error, 500);
  }

  // ------------------------------------------------------------------
  // Koneksi (ADR-040). RLS + trigger migration 20260927100001 adalah
  // penjaga terakhirnya; pemeriksaan di sini ada supaya pelanggaran
  // muncul sebagai kode yang bisa dijelaskan ke pengguna, bukan 42501.
  // ------------------------------------------------------------------

  async getNetworkProfile(userId: string): Promise<NetworkProfile> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('network_profiles')
      .select('is_discoverable, headline')
      .eq('user_id', userId)
      .maybeSingle<NetworkProfileRow>();
    if (error) throw upstreamFailure('Gagal memuat pengaturan jaringan.', error);
    return { discoverable: data?.is_discoverable ?? false, headline: data?.headline ?? null };
  }

  async updateNetworkProfile(actor: NetworkViewer, input: NetworkProfileInput): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const values = { is_discoverable: input.discoverable, headline: input.headline };
    // UPDATE lalu INSERT, bukan upsert: upsert PostgREST menulis ulang SEMUA
    // kolom payload (termasuk user_id) di ON CONFLICT, dan hak UPDATE
    // sengaja hanya diberikan untuk dua kolom.
    const updated = await supabase.from('network_profiles').update(values).eq('user_id', actor.id).select('user_id');
    if (updated.error) throw upstreamFailure('Gagal menyimpan pengaturan jaringan.', updated.error, 500);
    if (updated.data.length > 0) return;

    const inserted = await supabase.from('network_profiles').insert({ user_id: actor.id, ...values });
    if (!inserted.error) return;
    if (sqlState(inserted.error) === '23505') {
      const retry = await supabase.from('network_profiles').update(values).eq('user_id', actor.id);
      if (!retry.error) return;
    }
    throw upstreamFailure('Gagal menyimpan pengaturan jaringan.', inserted.error, 500);
  }

  async listConnections(_userId: string, page: ConnectionPageRequest): Promise<ConnectionPage> {
    // `connection_peers` sudah memfilter ke auth.uid() pemanggil; parameter
    // userId ada untuk kontrak yang sama dengan mode seed.
    const limit = clampConnectionLimit(page.limit);
    const after = page.cursor === null ? null : decodeConnectionCursor(page.cursor);
    if (page.cursor !== null && !after) throw actionError('invalid_request');

    const supabase = await createSupabaseServerClient();
    // Urutan = compareConnections(): status turun ('PENDING' dulu), lalu
    // created_at & id turun. Satu baris ekstra = penanda "masih ada".
    let query = supabase
      .from('connection_peers')
      .select(PEER_COLUMNS)
      .order('status', { ascending: false })
      .order('created_at', { ascending: false })
      .order('connection_id', { ascending: false })
      .limit(limit + 1);
    if (after) query = query.or(keysetAfter(after));
    if (page.kind === 'accepted') query = query.eq('status', 'ACCEPTED');
    if (page.kind === 'incoming') query = query.eq('status', 'PENDING').eq('is_outgoing', false);
    if (page.kind === 'outgoing') query = query.eq('status', 'PENDING').eq('is_outgoing', true);
    // Dinormalisasi ulang di sini, bukan dipercaya dari pemanggil: nilainya
    // masuk ke pola `ilike`, dan `%`/`_`/`*` di sana adalah wildcard.
    const search = normalizeConnectionSearch(page.search);
    if (search) query = query.ilike('full_name', `%${search}%`);
    const { data, error } = await query.returns<ConnectionPeerRow[]>();
    if (error) throw upstreamFailure('Gagal memuat koneksi.', error);

    const items = data.slice(0, limit).map(toConnection);
    const last = items.at(-1);
    return { items, nextCursor: data.length > limit && last ? encodeConnectionCursor(connectionCursorOf(last)) : null };
  }

  async countConnections(userId: string): Promise<ConnectionCounts> {
    const supabase = await createSupabaseServerClient();
    // Tabel `connections` (bukan view): RLS sudah membatasi ke baris
    // pemanggil, dan ketiganya dilayani indeks (addressee|requester, status).
    const count = () => supabase.from('connections').select('id', { count: 'exact', head: true });
    const [accepted, incoming, outgoing] = await Promise.all([
      count().eq('status', 'ACCEPTED'),
      count().eq('status', 'PENDING').eq('addressee_id', userId),
      count().eq('status', 'PENDING').eq('requester_id', userId),
    ]);
    for (const result of [accepted, incoming, outgoing]) {
      if (result.error) throw upstreamFailure('Gagal menghitung koneksi.', result.error);
    }
    return { accepted: accepted.count ?? 0, incoming: incoming.count ?? 0, outgoing: outgoing.count ?? 0 };
  }

  private async relatedUserIds(userId: string): Promise<Set<string>> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .limit(CONNECTION_READ_LIMIT)
      .returns<ConnectionPairRow[]>();
    if (error) throw upstreamFailure('Gagal memuat koneksi.', error);
    const related = new Set<string>([userId]);
    for (const row of data) related.add(row.requester_id === userId ? row.addressee_id : row.requester_id);
    return related;
  }

  private async directoryWindow(viewer: NetworkViewer, filter: PeopleFilter): Promise<NetworkDirectoryRow[]> {
    const supabase = await createSupabaseServerClient();
    const window = NETWORK_LIMITS.candidateWindow;
    const base = () =>
      supabase.from('network_directory').select(DIRECTORY_COLUMNS).neq('user_id', viewer.id).order('updated_at', { ascending: false }).limit(window);

    let query = base();
    if (filter.interest) query = query.contains('interests', [filter.interest]);
    const term = peopleSearchTerm(filter.search);
    if (term) query = query.or(`full_name.ilike.*${term}*,major.ilike.*${term}*,headline.ilike.*${term}*`);
    const narrowed = Boolean(filter.interest || term);
    // Tanpa saringan: utamakan orang dengan minat yang sama supaya jendela
    // 200 baris tidak habis oleh orang yang sekadar paling baru aktif.
    if (!narrowed && viewer.interests.length > 0) query = query.overlaps('interests', [...viewer.interests]);

    const { data, error } = await query.returns<NetworkDirectoryRow[]>();
    if (error) throw upstreamFailure('Gagal memuat saran koneksi.', error);
    if (narrowed || viewer.interests.length === 0 || data.length >= filter.limit) return data;

    const fallback = await base().returns<NetworkDirectoryRow[]>();
    if (fallback.error) throw upstreamFailure('Gagal memuat saran koneksi.', fallback.error);
    const seen = new Set(data.map((row) => row.user_id));
    return [...data, ...fallback.data.filter((row) => !seen.has(row.user_id))];
  }

  async suggestPeople(viewer: NetworkViewer, filter: PeopleFilter): Promise<readonly PeopleSuggestion[]> {
    const [rows, related] = await Promise.all([this.directoryWindow(viewer, filter), this.relatedUserIds(viewer.id)]);
    const people = rows
      .filter((row) => !related.has(row.user_id))
      .map(toNetworkPerson)
      .filter((person) => matchesPeopleSearch(person, filter.search));
    if (people.length === 0) return [];

    const supabase = await createSupabaseServerClient();
    const candidateIds = people.map((person) => person.userId);
    const [mutualResult, sharedByPerson] = await Promise.all([
      supabase.rpc('mutual_connection_counts', { p_candidates: candidateIds }),
      this.sharedTeamEvents(filter.viewerEvents, new Set(candidateIds)),
    ]);
    // Koneksi bersama hanya menambah bobot; kegagalannya tidak boleh
    // menghapus seluruh daftar saran.
    if (mutualResult.error) console.error('[network] mutual_connection_counts gagal:', mutualResult.error);
    const mutual = toMutualCounts(mutualResult.error ? null : mutualResult.data);

    const candidates: SuggestionCandidate[] = people.map((person) => ({
      person,
      mutualCount: mutual.get(person.userId) ?? 0,
      sharedEvents: sharedByPerson.get(person.userId) ?? [],
    }));
    return rankSuggestions(viewer, candidates, filter.limit);
  }

  /** Mulai dari kegiatan pembaca (jumlahnya kecil), bukan dari kandidat (bisa 200). */
  private async sharedTeamEvents(
    viewerEvents: readonly NetworkEventRef[],
    candidates: ReadonlySet<string>,
  ): Promise<Map<string, NetworkEventRef[]>> {
    const result = new Map<string, NetworkEventRef[]>();
    const eventIds = viewerEvents.map((event) => event.id).filter(isUuid).slice(0, IN_CHUNK);
    if (eventIds.length === 0) return result;

    const supabase = await createSupabaseServerClient();
    const teams = await supabase.from('teams').select('id, event_id').in('event_id', eventIds).limit(500).returns<{ id: string; event_id: string }[]>();
    if (teams.error || teams.data.length === 0) return result;
    const eventByTeam = new Map(teams.data.map((row) => [row.id, row.event_id]));
    const eventRefs = new Map(viewerEvents.map((event) => [event.id, event]));

    for (const teamIds of chunks([...eventByTeam.keys()], IN_CHUNK)) {
      const members = await supabase.from('team_member_profiles').select('team_id, user_id').in('team_id', teamIds).returns<{ team_id: string; user_id: string }[]>();
      if (members.error) return result;
      for (const row of members.data) {
        const event = eventRefs.get(eventByTeam.get(row.team_id) ?? '');
        if (!event || !candidates.has(row.user_id)) continue;
        const list = result.get(row.user_id) ?? [];
        if (!list.some((known) => known.id === event.id)) list.push(event);
        result.set(row.user_id, list);
      }
    }
    return result;
  }

  async requestConnection(actor: NetworkViewer, targetId: string, message: string | null): Promise<'requested' | 'accepted'> {
    if (actor.id === targetId) throw actionError('connection_self');
    if (!isUuid(targetId)) throw actionError('person_unavailable');
    const supabase = await createSupabaseServerClient();

    const existing = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .or(`and(requester_id.eq.${actor.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${actor.id})`)
      .maybeSingle<ConnectionPairRow>();
    if (existing.error) throw upstreamFailure('Gagal memeriksa koneksi.', existing.error);
    if (existing.data) {
      if (existing.data.status === 'PENDING' && existing.data.addressee_id === actor.id) {
        await this.respondToConnection(actor.id, existing.data.id, 'accept');
        return 'accepted';
      }
      throw actionError('connection_exists');
    }

    const { error } = await supabase.from('connections').insert({ requester_id: actor.id, addressee_id: targetId, message });
    if (!error) return 'requested';
    if (sqlState(error) === '23505') throw actionError('connection_exists');
    // 42501 = policy insert menolak: target tidak (lagi) bisa ditemukan, atau
    // salah satu pihak memblokir. Sengaja satu kode: yang diblokir tidak
    // boleh bisa menyimpulkan bahwa ia diblokir.
    if (sqlState(error) === '42501' || error.message?.includes('connection_blocked')) throw actionError('person_unavailable');
    if (error.message?.includes('connection_rate_limited')) throw actionError('connection_rate_limited');
    throw upstreamFailure('Gagal mengirim ajakan.', error, 500);
  }

  async respondToConnection(actorId: string, connectionId: string, decision: 'accept' | 'decline'): Promise<void> {
    if (!isUuid(connectionId)) throw actionError('connection_not_found');
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .eq('id', connectionId)
      .maybeSingle<ConnectionPairRow>();
    if (error) throw upstreamFailure('Gagal memuat ajakan.', error);
    if (!data) throw actionError('connection_not_found');
    if (data.addressee_id !== actorId) throw actionError('connection_forbidden');
    if (data.status !== 'PENDING') return;

    const result =
      decision === 'accept'
        ? await supabase.from('connections').update({ status: 'ACCEPTED' }).eq('id', connectionId)
        : await supabase.from('connections').delete().eq('id', connectionId);
    if (result.error) throw upstreamFailure('Gagal menjawab ajakan.', result.error, 500);
  }

  async removeConnection(actorId: string, connectionId: string): Promise<void> {
    if (!isUuid(connectionId)) throw actionError('connection_not_found');
    const supabase = await createSupabaseServerClient();
    // RLS menyembunyikan baris orang lain, jadi "bukan pihaknya" dan "tidak
    // ada" sama-sama 0 baris — sengaja tidak dibedakan (tidak membocorkan id).
    // Kolom di filter `or` WAJIB ikut di `select`: PostgREST 12 menolak
    // DELETE…RETURNING yang memfilter kolom di luar daftar select (42703) —
    // tertangkap integration test, tidak oleh mode seed.
    const { data, error } = await supabase
      .from('connections')
      .delete()
      .eq('id', connectionId)
      .or(`requester_id.eq.${actorId},addressee_id.eq.${actorId}`)
      .select('id, requester_id, addressee_id');
    if (error) throw upstreamFailure('Gagal memutus koneksi.', error, 500);
    if (data.length === 0) throw actionError('connection_not_found');
  }

  async blockPerson(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) throw actionError('block_self');
    if (!isUuid(targetId)) throw actionError('block_unavailable');
    const supabase = await createSupabaseServerClient();
    // Cek dulu, bukan hanya andalkan 23505: setelah blokir pertama koneksinya
    // hilang, jadi blokir ulang orang tersembunyi akan ditolak policy (42501)
    // alih-alih bentrok PK — padahal hasilnya sudah sesuai keinginan.
    const existing = await supabase.from('connection_blocks').select('blocked_id').eq('blocker_id', actorId).eq('blocked_id', targetId).maybeSingle();
    if (existing.error) throw upstreamFailure('Gagal memeriksa blokir.', existing.error);
    if (existing.data) return;

    const { error } = await supabase.from('connection_blocks').insert({ blocker_id: actorId, blocked_id: targetId });
    if (!error || sqlState(error) === '23505') return;
    // 42501 = policy: target tidak pernah terlihat; 23503 = pengguna tidak ada.
    if (sqlState(error) === '42501' || sqlState(error) === '23503') throw actionError('block_unavailable');
    throw upstreamFailure('Gagal memblokir.', error, 500);
  }

  async unblockPerson(actorId: string, targetId: string): Promise<void> {
    if (!isUuid(targetId)) throw actionError('block_not_found');
    const supabase = await createSupabaseServerClient();
    // Kolom filter wajib ada di select (PostgREST 12, lihat removeConnection).
    const { data, error } = await supabase
      .from('connection_blocks')
      .delete()
      .eq('blocker_id', actorId)
      .eq('blocked_id', targetId)
      .select('blocker_id, blocked_id');
    if (error) throw upstreamFailure('Gagal membuka blokir.', error, 500);
    if (data.length === 0) throw actionError('block_not_found');
  }

  async listBlockedPeople(_userId: string): Promise<readonly BlockedPerson[]> {
    // View sudah memfilter ke auth.uid() pemanggil (pola connection_peers).
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('blocked_people')
      .select('user_id, full_name, created_at')
      .order('created_at', { ascending: false })
      .order('user_id', { ascending: true })
      .limit(BLOCK_LIST_LIMIT)
      .returns<BlockedPersonRow[]>();
    if (error) throw upstreamFailure('Gagal memuat daftar blokir.', error);
    return data.map((row) => ({ userId: row.user_id, fullName: row.full_name, blockedAt: row.created_at }));
  }

  async listTeamLinks(userIds: readonly string[], limit: number): Promise<readonly TeamLink[]> {
    const ids = [...new Set(userIds)].filter(isUuid);
    if (ids.length === 0) return [];
    const supabase = await createSupabaseServerClient();

    const memberships: { team_id: string; user_id: string }[] = [];
    for (const part of chunks(ids, IN_CHUNK)) {
      const { data, error } = await supabase
        .from('team_member_profiles')
        .select('team_id, user_id')
        .in('user_id', part)
        .limit(limit)
        .returns<{ team_id: string; user_id: string }[]>();
      // Tamu tidak punya hak baca view ini; peta tetap jalan tanpa simpul kegiatan.
      if (error) return [];
      memberships.push(...data);
      if (memberships.length >= limit) break;
    }
    const kept = memberships.slice(0, limit);
    if (kept.length === 0) return [];

    const teamIds = [...new Set(kept.map((row) => row.team_id))];
    const eventByTeam = new Map<string, string>();
    for (const part of chunks(teamIds, IN_CHUNK)) {
      const { data, error } = await supabase.from('teams').select('id, event_id').in('id', part).returns<{ id: string; event_id: string }[]>();
      if (error) throw upstreamFailure('Gagal memuat tim.', error);
      for (const row of data) eventByTeam.set(row.id, row.event_id);
    }
    const events = await this.fetchSummariesByIds([...eventByTeam.values()]);

    return kept.flatMap((row) => {
      const event = events.get(eventByTeam.get(row.team_id) ?? '');
      return event
        ? [{ userId: row.user_id, teamId: row.team_id, event: { id: event.id, slug: event.slug, title: event.title, eventType: event.eventType } }]
        : [];
    });
  }

  // ------------------------------------------------------------------
  // Penyelenggara & analitik (ADR-042/043)
  //
  // Operasi pemilik lewat klien pengguna — RLS, hak per kolom, dan trigger
  // di migration 20260928110001 yang menegakkan aturannya; pemeriksaan di
  // sini hanya untuk pesan yang ramah. Antrean & keputusan admin lewat
  // service_role, dipanggil HANYA setelah checkAdminAccess().
  // ------------------------------------------------------------------

  private async orgNamesOf(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    for (const part of chunks([...new Set(userIds)].filter(isUuid), IN_CHUNK)) {
      const { data, error } = await supabase
        .from('organizer_profiles')
        .select('user_id, org_name')
        .in('user_id', part)
        .returns<Pick<OrganizerProfileRow, 'user_id' | 'org_name'>[]>();
      if (error) throw upstreamFailure('Gagal memuat nama lembaga.', error);
      for (const row of data) names.set(row.user_id, row.org_name);
    }
    return names;
  }

  async getOrganizerProfile(userId: string): Promise<OrganizerProfile | null> {
    if (!isUuid(userId)) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('organizer_profiles')
      .select(ORGANIZER_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle<OrganizerProfileRow>();
    if (error) throw upstreamFailure('Gagal memuat profil penyelenggara.', error);
    return data ? toOrganizerProfile(data) : null;
  }

  async applyAsOrganizer(actor: OrganizerActor, input: OrganizerApplicationInput): Promise<void> {
    const existing = await this.getOrganizerProfile(actor.id);
    if (existing?.status === 'REVOKED') throw actionError('organizer_revoked');
    if (
      existing &&
      existing.orgName === input.orgName &&
      existing.website === input.website &&
      existing.evidence === input.evidence
    ) {
      return;
    }

    const supabase = await createSupabaseServerClient();
    const fields = { org_name: input.orgName, website: input.website, evidence: input.evidence };
    // Status tidak dikirim: kolomnya tidak termasuk hak tulis klien, dan
    // trigger mengembalikannya ke PENDING bila identitas berubah.
    const { error } = existing
      ? await supabase.from('organizer_profiles').update(fields).eq('user_id', actor.id)
      : await supabase.from('organizer_profiles').insert({ user_id: actor.id, ...fields });
    if (error) throw organizerFailure(error, 'Gagal menyimpan pengajuan penyelenggara.');
  }

  async listManagedEvents(userId: string): Promise<readonly ManagedEvent[]> {
    if ((await this.getOrganizerProfile(userId))?.status !== 'VERIFIED') return [];
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('event_managers')
      .select('event_id, source, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MANAGED_EVENTS_LIMIT)
      .returns<EventManagerRow[]>();
    if (error) throw upstreamFailure('Gagal memuat acara yang dikelola.', error);

    const events = await this.fetchSummariesByIds(data.map((row) => row.event_id));
    return data.flatMap((row) => {
      const event = events.get(row.event_id);
      return event ? [{ event, source: row.source, since: row.created_at }] : [];
    });
  }

  async claimEvent(actorId: string, eventId: string, evidence: string): Promise<void> {
    if (!isUuid(eventId)) throw actionError('event_unavailable');
    if ((await this.getOrganizerProfile(actorId))?.status !== 'VERIFIED') throw actionError('organizer_not_verified');
    const supabase = await createSupabaseServerClient();

    const managed = await supabase
      .from('event_managers')
      .select('event_id')
      .eq('event_id', eventId)
      .eq('user_id', actorId)
      .maybeSingle();
    if (managed.error) throw upstreamFailure('Gagal memeriksa klaim.', managed.error);
    if (managed.data) throw actionError('claim_already_managed');

    const { error } = await supabase.from('event_claims').insert({ event_id: eventId, user_id: actorId, evidence });
    if (!error) return;
    // 23505 = idx_event_claims_one_pending; 42501 = policy (acara tidak tayang).
    if (sqlState(error) === '23505') throw actionError('claim_exists');
    if (sqlState(error) === '42501' || sqlState(error) === '23503') throw actionError('event_unavailable');
    throw organizerFailure(error, 'Gagal mengirim klaim.');
  }

  async listMyClaims(userId: string): Promise<readonly EventClaim[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('event_claims')
      .select(CLAIM_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(TRUST_LIST_LIMIT)
      .returns<EventClaimRow[]>();
    if (error) throw upstreamFailure('Gagal memuat klaim.', error);
    const profile = await this.getOrganizerProfile(userId);
    const names = new Map<string, string>(profile ? [[userId, profile.orgName]] : []);
    return data.map((row) => toEventClaim(row, names));
  }

  async proposeEventRevision(
    actorId: string,
    eventId: string,
    changes: EventRevisionChanges,
    note: string | null,
  ): Promise<void> {
    if (!isUuid(eventId)) throw actionError('not_event_manager');
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('event_revisions').insert({
      event_id: eventId,
      proposed_by: actorId,
      changes: toStoredRevisionChanges(changes),
      note,
    });
    if (!error) return;
    // 42501 = policy `manages_event()`: bukan pengelola, atau verifikasi dicabut.
    if (sqlState(error) === '42501') throw actionError('not_event_manager');
    if (sqlState(error) === '23514') throw actionError('invalid_revision');
    throw organizerFailure(error, 'Gagal mengirim permintaan perubahan.');
  }

  async listEventRevisions(actorId: string, eventId: string): Promise<readonly EventRevision[]> {
    if (!isUuid(eventId)) return [];
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('event_revisions')
      .select(REVISION_COLUMNS)
      .eq('event_id', eventId)
      .eq('proposed_by', actorId)
      .order('created_at', { ascending: false })
      .limit(TRUST_LIST_LIMIT)
      .returns<EventRevisionRow[]>();
    if (error) throw upstreamFailure('Gagal memuat riwayat perubahan.', error);
    const profile = await this.getOrganizerProfile(actorId);
    const names = new Map<string, string>(profile ? [[actorId, profile.orgName]] : []);
    return data.flatMap((row) => toEventRevision(row, names) ?? []);
  }

  async getEventAnalytics(_actorId: string, eventId: string, days: number): Promise<EventAnalytics> {
    if (!isUuid(eventId)) throw actionError('not_event_manager');
    // Klien pengguna: `event_analytics()` memeriksa manages_event() atas
    // auth.uid() pemanggil — actorId dari aplikasi tidak dipercaya di sini.
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('event_analytics', { p_event: eventId, p_days: days });
    if (error) {
      if (sqlState(error) === '42501') throw actionError('not_event_manager');
      throw organizerFailure(error, 'Gagal memuat analitik acara.');
    }
    const analytics = parseEventAnalytics(data);
    if (!analytics) throw upstreamFailure('Bentuk analitik acara tidak dikenali.', data, 500);
    return analytics;
  }

  async listOrganizerHistory(_userId: string): Promise<readonly OrganizerHistoryEntry[]> {
    // Klien pengguna: fungsi membaca auth.uid() sendiri dan hanya berlaku
    // selama pemanggil VERIFIED — sama dengan manages_event().
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('organizer_event_history');
    if (error) throw organizerFailure(error, 'Gagal memuat riwayat acara.');
    return rpcRows<OrganizerHistoryRow>(data).map(toOrganizerHistoryEntry);
  }

  async recordEventView(eventId: string, visitorHash: string): Promise<void> {
    if (!isUuid(eventId) || !/^[0-9a-f]{64}$/.test(visitorHash)) return;
    const { error } = await createSupabaseAdminClient().rpc('record_event_view', {
      p_event: eventId,
      p_visitor_hash: visitorHash,
    });
    if (error) throw upstreamFailure('Gagal mencatat kunjungan.', error, 500);
  }

  async listVerifiedOrganizers(eventIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>();
    // Klien publik: view-nya memang untuk anon, dan tanpa cookie.
    const supabase = createSupabasePublicClient();
    for (const part of chunks([...new Set(eventIds)].filter(isUuid), IN_CHUNK)) {
      const { data, error } = await supabase
        .from('verified_event_organizers')
        .select('event_id, org_name')
        .in('event_id', part)
        .returns<{ event_id: string; org_name: string }[]>();
      // Lencana hiasan kepercayaan, bukan jalur kritis: gagal = tanpa lencana.
      if (error) {
        console.error('[organizer] verified_event_organizers gagal:', error);
        return result;
      }
      for (const row of data) if (!result.has(row.event_id)) result.set(row.event_id, row.org_name);
    }
    return result;
  }

  async listOrganizerApplications(status: OrganizerStatus, limit: number): Promise<readonly OrganizerProfile[]> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('organizer_profiles')
      // Dua FK ke users (user_id, reviewed_by) → embed wajib menyebut FK-nya.
      .select(`${ORGANIZER_COLUMNS}, applicant:users!organizer_profiles_user_id_fkey(full_name, email)`)
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(limit)
      .returns<OrganizerProfileRow[]>();
    if (error) throw upstreamFailure('Gagal memuat antrean penyelenggara.', error);
    return data.map(toOrganizerProfile);
  }

  async reviewOrganizer({
    userId,
    decision,
    reviewerId,
    note,
  }: ReviewTrustInput<'VERIFIED' | 'REJECTED' | 'REVOKED'> & { userId: string }): Promise<void> {
    if (!isUuid(userId)) throw actionError('organizer_not_found');
    const { error } = await createSupabaseAdminClient().rpc('review_organizer', {
      p_user_id: userId,
      p_decision: decision,
      p_reviewer: reviewerId,
      p_note: note,
    });
    if (error) throw organizerFailure(error, 'Gagal menyimpan keputusan penyelenggara.');
  }

  async listClaims(status: TrustRequestStatus, limit: number): Promise<readonly EventClaim[]> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('event_claims')
      .select(CLAIM_COLUMNS)
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(limit)
      .returns<EventClaimRow[]>();
    if (error) throw upstreamFailure('Gagal memuat antrean klaim.', error);
    const names = await this.orgNamesOf(supabase, data.map((row) => row.user_id));
    return data.map((row) => toEventClaim(row, names));
  }

  async reviewClaim({
    claimId,
    decision,
    reviewerId,
    note,
  }: ReviewTrustInput<'APPROVED' | 'REJECTED'> & { claimId: string }): Promise<void> {
    if (!isUuid(claimId)) throw actionError('claim_not_found');
    const { error } = await createSupabaseAdminClient().rpc('review_event_claim', {
      p_claim_id: claimId,
      p_decision: decision,
      p_reviewer: reviewerId,
      p_note: note,
    });
    if (error) throw organizerFailure(error, 'Gagal menyimpan keputusan klaim.');
  }

  async listRevisions(status: TrustRequestStatus, limit: number): Promise<readonly EventRevision[]> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('event_revisions')
      .select(REVISION_COLUMNS)
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(limit)
      .returns<EventRevisionRow[]>();
    if (error) throw upstreamFailure('Gagal memuat antrean perubahan acara.', error);
    const names = await this.orgNamesOf(supabase, data.map((row) => row.proposed_by));
    return data.flatMap((row) => toEventRevision(row, names) ?? []);
  }

  async reviewRevision({
    revisionId,
    decision,
    reviewerId,
    note,
  }: ReviewTrustInput<'APPROVED' | 'REJECTED'> & { revisionId: string }): Promise<void> {
    if (!isUuid(revisionId)) throw actionError('revision_not_found');
    const { error } = await createSupabaseAdminClient().rpc('review_event_revision', {
      p_revision_id: revisionId,
      p_decision: decision,
      p_reviewer: reviewerId,
      p_note: note,
    });
    if (!error) return;
    // Nilai JSONB yang tidak bisa di-cast (mis. jenjang tak dikenal) = baris
    // yang ditulis di luar aplikasi; jawabannya tetap "tolak permintaan ini".
    if (sqlState(error) === '22P02' || sqlState(error) === '22007' || sqlState(error) === '23514') {
      throw actionError('revision_rejected_by_db');
    }
    throw organizerFailure(error, 'Gagal menyimpan keputusan perubahan acara.');
  }

  async listOrganizerStatuses(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, Pick<OrganizerProfile, 'orgName' | 'status'>>> {
    const result = new Map<string, Pick<OrganizerProfile, 'orgName' | 'status'>>();
    const supabase = createSupabaseAdminClient();
    for (const part of chunks([...new Set(userIds)].filter(isUuid), IN_CHUNK)) {
      const { data, error } = await supabase
        .from('organizer_profiles')
        .select('user_id, org_name, status')
        .in('user_id', part)
        .returns<Pick<OrganizerProfileRow, 'user_id' | 'org_name' | 'status'>[]>();
      if (error) throw upstreamFailure('Gagal memuat status penyelenggara.', error);
      for (const row of data) result.set(row.user_id, { orgName: row.org_name, status: row.status });
    }
    return result;
  }

  async consumeRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      const { data, error } = await createSupabaseAdminClient().rpc('consume_rate_limit', {
        p_bucket: bucket,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error) throw error;
      return data === true;
    } catch (error) {
      // Fail OPEN, dengan sadar: pembatas yang rusak (mis. service role key
      // belum diisi) tidak boleh mengunci SEMUA orang dari halaman masuk.
      // Lapisan lain tetap berjalan: batas bawaan Supabase Auth, CAPTCHA,
      // dan trigger batas kiriman di Postgres. Log-nya wajib dipantau.
      console.error('[rate-limit] consume_rate_limit gagal, permintaan diloloskan:', error);
      return true;
    }
  }

  async recordRecommendationSignal(input: RecommendationSignalInput): Promise<void> {
    if (!isUuid(input.eventId)) return;
    // service_role: tabelnya sengaja tanpa jalur tulis dari browser (ADR-032).
    const { error } = await createSupabaseAdminClient()
      .from('recommendation_signals')
      .insert({
        event_id: input.eventId,
        kind: input.kind,
        user_id: input.userId,
        interests: [...input.interests].slice(0, 20),
        education_level: input.educationLevel,
      });
    if (error) throw upstreamFailure('Gagal mencatat sinyal rekomendasi.', error, 500);
  }

  async listCalibrationData(since: Date): Promise<CalibrationData> {
    const supabase = createSupabaseAdminClient();
    const [signals, events] = await Promise.all([
      fetchAllPages<RecommendationSignalRow>((from, to) =>
        supabase
          .from('recommendation_signals')
          .select('event_id, created_at, interests, education_level')
          .gte('created_at', since.toISOString())
          .order('id', { ascending: true })
          .range(from, to)
          .returns<RecommendationSignalRow[]>(),
      ),
      fetchAllPages<EventListingRow>((from, to) =>
        supabase
          .from('events_listing')
          .select(LISTING_COLUMNS)
          .in('status', [...PUBLIC_STATUSES])
          .order('id', { ascending: true })
          .range(from, to)
          .returns<EventListingRow[]>(),
      ),
    ]);

    return {
      signals: signals.map((row) => ({
        eventId: row.event_id,
        createdAt: row.created_at,
        interests: row.interests ?? [],
        educationLevel: row.education_level,
      })),
      events: events.map(toSummary),
    };
  }
}

// ----------------------------------------------------------------------
// Query data publik — fungsi modul (bukan method) supaya bisa dibungkus
// Data Cache: tanpa `this`, tanpa cookie, hanya argumen yang bisa diserialkan.
// ----------------------------------------------------------------------

async function queryListingPage(filters: ListingFetch): Promise<ListingPage> {
  const supabase = createSupabasePublicClient();
  let builder = supabase.from('events_listing').select(LISTING_COLUMNS, { count: filters.countMode });

  if (filters.includeClosed) {
    // EXPIRED ikut: begitu job expiry harian berjalan, event yang tenggatnya
    // lewat berpindah ke status itu. Menyaring `status = APPROVED` saja
    // membuat "tampilkan yang sudah ditutup" tidak pernah menampilkan apa pun.
    builder = builder.in('status', [...PUBLIC_STATUSES]);
  } else {
    // Tenggat yang sudah lewat disembunyikan. `or` dipakai supaya event
    // yang tenggatnya belum diumumkan (NULL) tetap ikut tampil — kalau
    // difilter dengan perbandingan biasa, seluruh baris NULL hilang diam-diam.
    builder = builder
      .eq('status', 'APPROVED')
      .or(`primary_deadline_at.gte.${new Date().toISOString()},primary_deadline_at.is.null`);
  }

  if (filters.search) {
    builder = builder.textSearch('search_vector', filters.search, { type: 'websearch', config: 'indonesian' });
  }
  if (filters.types.length) builder = builder.in('event_type', [...filters.types]);
  if (filters.levels.length) builder = builder.overlaps('education_levels', [...filters.levels]);
  if (filters.categories.length) builder = builder.overlaps('category_slugs', [...filters.categories]);
  if (filters.locations.length) builder = builder.in('location', [...filters.locations]);
  if (filters.mode) builder = builder.eq('is_online', filters.mode === 'online');

  builder =
    filters.sort === 'deadline'
      ? builder.order('primary_deadline_at', { ascending: true, nullsFirst: false }).order('id')
      : builder.order('created_at', { ascending: false }).order('id');

  const { data, error, count } = await builder.range(filters.from, filters.to).returns<EventListingRow[]>();
  if (error) throw upstreamFailure('Gagal memuat daftar event.', error);
  return { rows: data, count };
}

async function queryDetailBySlug(slug: string): Promise<EventDetail | null> {
  const supabase = createSupabasePublicClient();

  const { data, error } = await supabase
    .from('events_listing')
    .select(LISTING_COLUMNS)
    .eq('slug', slug)
    .in('status', [...PUBLIC_STATUSES])
    .maybeSingle<EventListingRow>();

  if (error) throw upstreamFailure('Gagal memuat detail event.', error);
  if (!data) return null;

  const { data: deadlineRows, error: deadlineError } = await supabase
    .from('event_deadlines')
    .select('id, label, deadline_at, is_primary')
    .eq('event_id', data.id)
    .order('deadline_at', { ascending: true })
    .returns<EventDeadlineRow[]>();

  if (deadlineError) throw upstreamFailure('Gagal memuat tenggat event.', deadlineError);
  return toDetail(data, deadlineRows);
}

async function queryClosingSoon(limit: number): Promise<EventSummary[]> {
  const supabase = createSupabasePublicClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * MS_PER_DAY);

  const { data, error } = await supabase
    .from('events_listing')
    .select(LISTING_COLUMNS)
    .eq('status', 'APPROVED')
    .gte('primary_deadline_at', now.toISOString())
    .lte('primary_deadline_at', horizon.toISOString())
    .order('primary_deadline_at', { ascending: true })
    .limit(limit)
    .returns<EventListingRow[]>();

  if (error) throw upstreamFailure('Gagal memuat sorotan.', error);
  return data.map(toSummary);
}

async function queryCategories(): Promise<Category[]> {
  const { data, error } = await createSupabasePublicClient()
    .from('categories')
    .select('id, name, slug')
    .order('name', { ascending: true })
    .returns<CategoryRow[]>();

  if (error) throw upstreamFailure('Gagal memuat kategori.', error);
  return data;
}

async function queryStats(): Promise<RepositoryStats> {
  const supabase = createSupabasePublicClient();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * MS_PER_DAY).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
  const approved = () =>
    supabase.from('events_listing').select('id', { count: 'exact', head: true }).eq('status', 'APPROVED');

  // head:true -> hanya minta jumlah baris, tidak menarik datanya.
  const [active, closing, added, organizerRes] = await Promise.all([
    approved(),
    approved().gte('primary_deadline_at', now.toISOString()).lte('primary_deadline_at', weekAhead),
    approved().gte('created_at', weekAgo),
    supabase.rpc('get_distinct_organizer_count'),
  ]);

  return {
    totalActive: active.count ?? 0,
    closingThisWeek: closing.count ?? 0,
    addedThisWeek: added.count ?? 0,
    organizerCount: organizerRes.error ? 0 : ((organizerRes.data as number | null) ?? 0),
  };
}

async function queryDeadlineWeek(): Promise<DeadlineDay[]> {
  const now = new Date();
  const window = jakartaDayWindow(now, DEADLINE_WEEK_DAYS);

  // Hanya kolom tanggal yang ditarik; pengelompokan per hari WIB dilakukan
  // oleh fungsi yang sama dengan mode seed supaya aturannya tidak bercabang.
  const { data, error } = await createSupabasePublicClient()
    .from('events_listing')
    .select('primary_deadline_at')
    .eq('status', 'APPROVED')
    .gte('primary_deadline_at', window.startIso)
    .lt('primary_deadline_at', window.endIso)
    .limit(2000)
    .returns<Pick<EventListingRow, 'primary_deadline_at'>[]>();

  // Pita ini hiasan beranda, bukan jalur kritis: gagal = pita kosong.
  if (error) return [...buildDeadlineWeek([], now)];
  return [
    ...buildDeadlineWeek(
      data.map((row) => row.primary_deadline_at).filter((value): value is string => value !== null),
      now,
    ),
  ];
}
