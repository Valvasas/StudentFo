import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import { actionError } from '@/lib/action-feedback';
import { buildDeadlineWeek, DEADLINE_WEEK_DAYS, jakartaDayWindow } from '@/lib/deadline';
import { upstreamFailure } from '@/lib/errors';
import { toStoredPayload } from '@/lib/submission-schema';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  AppNotification,
  Category,
  DeadlineDay,
  EventDetail,
  EventQuery,
  EventStatus,
  EventSummary,
  ModerationLogEntry,
  Paginated,
  Submission,
  Team,
  TeamMember,
  TrackerItem,
  TrackerStatus,
} from '@/types/domain';
import { toNotificationType } from '@/types/domain';
import type {
  CategoryRow,
  EventDeadlineRow,
  EventDeadlineWithEventRow,
  EventListingRow,
  ModerationLogRow,
  RecommendationSignalRow,
  NotificationRow,
  SubmissionRow,
  TeamMemberCountRow,
  TeamMemberProfileRow,
  TeamRow,
  TrackerRow,
} from '@/types/database';
import {
  PUBLIC_STATUSES,
  RELEVANCE_CANDIDATE_WINDOW,
  resolvePaging,
  sortSummaries,
  totalPagesFor,
} from './listing';
import type {
  CreateSubmissionInput,
  CalibrationData,
  CreateTeamRepositoryInput,
  RecommendationSignalInput,
  EventRepository,
  RepositoryStats,
  ReviewEventInput,
  ReviewSubmissionInput,
} from './repository';
import {
  isUuid,
  LISTING_COLUMNS,
  sanitizeSearchQuery,
  sqlState,
  toDetail,
  toModerationLogEntry,
  toSubmission,
  toSummary,
  toTeamMember,
} from './supabase-mappers';

export { sanitizeSearchQuery } from './supabase-mappers';

const TEAM_COLUMNS = 'id, event_id, created_by, title, description, slots_needed, created_at';
const MS_PER_DAY = 86_400_000;
/** Supabase memotong setiap respons PostgREST di `max_rows` (bawaan 1000). */
const PAGE_SIZE = 1000;
/** Kalibrasi dijalankan manual dan jarang; batas ini hanya pengaman memori. */
const CALIBRATION_ROW_LIMIT = 50_000;

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

/** Implementasi produksi di atas PostgREST. */
export class SupabaseEventRepository implements EventRepository {
  async listEvents(query: EventQuery): Promise<Paginated<EventSummary>> {
    const supabase = await createSupabaseServerClient();
    const now = new Date();
    const paging = resolvePaging(query);
    const sort = query.sort ?? 'relevance';
    // Lihat RELEVANCE_CANDIDATE_WINDOW: peringkat relevansi dihitung atas
    // satu jendela kandidat, bukan per halaman.
    const rankInApp = sort === 'relevance' && paging.offset + paging.pageSize <= RELEVANCE_CANDIDATE_WINDOW;

    let builder = supabase.from('events_listing').select(LISTING_COLUMNS, { count: 'exact' });

    if (query.includeClosed) {
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
        .or(`primary_deadline_at.gte.${now.toISOString()},primary_deadline_at.is.null`);
    }

    const search = query.search ? sanitizeSearchQuery(query.search) : '';
    if (search) {
      builder = builder.textSearch('search_vector', search, { type: 'websearch', config: 'indonesian' });
    }
    if (query.types?.length) builder = builder.in('event_type', [...query.types]);
    if (query.levels?.length) builder = builder.overlaps('education_levels', [...query.levels]);
    if (query.categories?.length) builder = builder.overlaps('category_slugs', [...query.categories]);

    builder =
      sort === 'deadline'
        ? builder.order('primary_deadline_at', { ascending: true, nullsFirst: false }).order('id')
        : builder.order('created_at', { ascending: false }).order('id');

    const [from, to] = rankInApp
      ? [0, RELEVANCE_CANDIDATE_WINDOW - 1]
      : [paging.offset, paging.offset + paging.pageSize - 1];

    const { data, error, count } = await builder.range(from, to).returns<EventListingRow[]>();
    if (error) throw upstreamFailure('Gagal memuat daftar event.', error);

    const total = count ?? data.length;
    const summaries = data.map(toSummary);
    const items = rankInApp
      ? sortSummaries(summaries, 'relevance', now, query.profile).slice(
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
    const supabase = await createSupabaseServerClient();

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

  async listClosingSoon(limit: number): Promise<readonly EventSummary[]> {
    const supabase = await createSupabaseServerClient();
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

  async listCategories(): Promise<readonly Category[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug')
      .order('name', { ascending: true })
      .returns<CategoryRow[]>();

    if (error) throw upstreamFailure('Gagal memuat kategori.', error);
    return data;
  }

  async getStats(): Promise<RepositoryStats> {
    const supabase = await createSupabaseServerClient();
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

  async getDeadlineWeek(): Promise<readonly DeadlineDay[]> {
    const supabase = await createSupabaseServerClient();
    const now = new Date();
    const window = jakartaDayWindow(now, DEADLINE_WEEK_DAYS);

    // Hanya kolom tanggal yang ditarik; pengelompokan per hari WIB dilakukan
    // oleh fungsi yang sama dengan mode seed supaya aturannya tidak bercabang.
    const { data, error } = await supabase
      .from('events_listing')
      .select('primary_deadline_at')
      .eq('status', 'APPROVED')
      .gte('primary_deadline_at', window.startIso)
      .lt('primary_deadline_at', window.endIso)
      .limit(2000)
      .returns<Pick<EventListingRow, 'primary_deadline_at'>[]>();

    // Pita ini hiasan beranda, bukan jalur kritis: gagal = pita kosong.
    if (error) return buildDeadlineWeek([], now);
    return buildDeadlineWeek(
      data.map((row) => row.primary_deadline_at).filter((value): value is string => value !== null),
      now,
    );
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

  // ------------------------------------------------------------------
  // Kiriman komunitas (Phase 3)
  // ------------------------------------------------------------------

  async createSubmission({ submittedByEmail, payload }: CreateSubmissionInput): Promise<void> {
    // Klien pengguna/anon, bukan admin: policy `ugc_public_insert` yang
    // menegakkan status PENDING. Tanpa `.select()` — anon memang tidak boleh
    // membaca tabel ini, dan meminta baris balik akan ditolak RLS.
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('ugc_submissions')
      .insert({ submitted_by_email: submittedByEmail, payload: toStoredPayload(payload) });

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
      .select('id, submitted_by_email, payload, status, created_at')
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(limit)
      .returns<SubmissionRow[]>();

    if (error) throw upstreamFailure('Gagal memuat kiriman komunitas.', error);
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

    if (error) throw upstreamFailure('Gagal menyimpan kegiatan.', error, 500);
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
      .select('id, user_id, event_id, status, notes, created_at, updated_at')
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

    if (error) throw upstreamFailure('Gagal memperbarui status tracker.', error, 500);
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

    if (error) throw upstreamFailure('Gagal menambahkan ke tracker.', error, 500);
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

    const { data, error } = await supabase
      .from('teams')
      .insert({
        event_id: input.eventId,
        created_by: input.createdBy,
        title: input.title,
        description: input.description,
        slots_needed: input.slotsNeeded,
      })
      .select('id')
      .single<{ id: string }>();

    if (error || !data) {
      // 42501 = ditolak RLS. Sejak 20260923100001, policy insert `teams`
      // mensyaratkan event berstatus APPROVED — penolakan itu yang muncul di sini.
      if (sqlState(error) === '42501') throw actionError('event_unavailable');
      throw upstreamFailure('Gagal membuat tim.', error, 500);
    }

    // Pembuat langsung didaftarkan sebagai ketua. Kalau langkah ini gagal,
    // timnya dihapus lagi: tim tanpa ketua tidak bisa dikelola siapa pun,
    // dan `teams_owner_*` membuat hanya pembuatnya yang bisa
    // membereskannya — yaitu request yang sedang gagal ini.
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: data.id, user_id: input.createdBy, role: 'leader' });

    if (memberError) {
      await supabase.from('teams').delete().eq('id', data.id);
      throw upstreamFailure('Gagal membuat tim.', memberError, 500);
    }

    return data.id;
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
