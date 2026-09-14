import 'server-only';
import { AppError, ERROR_CODES, forbidden, notFound, validationFailed } from '@/lib/errors';
import { rankEvents } from '@/lib/recommendation';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  AppNotification,
  Category,
  EventDetail,
  EventQuery,
  EventStatus,
  EventSummary,
  Paginated,
  Team,
  TeamMember,
  TrackerItem,
  TrackerStatus,
} from '@/types/domain';
import { toNotificationType, toTeamRole } from '@/types/domain';
import type {
  CategoryRow,
  EventDeadlineRow,
  EventListingRow,
  NotificationRow,
  TeamMemberProfileRow,
  TeamRow,
  TrackerRow,
} from '@/types/database';
import {
  type CreateTeamRepositoryInput,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type EventRepository,
  type RepositoryStats,
  type ReviewEventInput,
} from './repository';

const LISTING_COLUMNS =
  'id, slug, title, organizer, description, event_type, registration_link, source_url, education_levels, location, is_online, status, saved_count, created_at, primary_deadline_at, primary_deadline_label, category_slugs';

function toSummary(row: EventListingRow): EventSummary {
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

/** Implementasi produksi di atas PostgREST. */
export class SupabaseEventRepository implements EventRepository {
  async listEvents(query: EventQuery): Promise<Paginated<EventSummary>> {
    const supabase = await createSupabaseServerClient();
    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(query.page ?? 1, 1);
    const from = (page - 1) * pageSize;

    let builder = supabase
      .from('events_listing')
      .select(LISTING_COLUMNS, { count: 'exact' })
      .eq('status', 'APPROVED');

    const search = query.search ? sanitizeSearchQuery(query.search) : '';
    if (search) {
      builder = builder.textSearch('search_vector', search, {
        type: 'websearch',
        config: 'indonesian',
      });
    }
    if (query.types?.length) builder = builder.in('event_type', [...query.types]);
    if (query.levels?.length) builder = builder.overlaps('education_levels', [...query.levels]);
    if (query.categories?.length) builder = builder.overlaps('category_slugs', [...query.categories]);
    if (!query.includeClosed) {
      // Tenggat yang sudah lewat disembunyikan. `or` dipakai supaya event
      // yang tenggatnya belum diumumkan (NULL) tetap ikut tampil — kalau
      // difilter dengan perbandingan biasa, seluruh baris NULL hilang diam-diam.
      builder = builder.or(`primary_deadline_at.gte.${new Date().toISOString()},primary_deadline_at.is.null`);
    }

    builder =
      query.sort === 'deadline'
        ? builder.order('primary_deadline_at', { ascending: true, nullsFirst: false })
        : builder.order('created_at', { ascending: false });

    const { data, error, count } = await builder.range(from, from + pageSize - 1).returns<EventListingRow[]>();

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat daftar event.', 502, {
        cause: error,
      });
    }

    const total = count ?? data.length;
    let items = data.map(toSummary);
    if ((!query.sort || query.sort === 'relevance') && query.profile) {
      items = rankEvents(items, query.profile, new Date()).map((s) => s.event);
    }

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async getEventBySlug(slug: string): Promise<EventDetail | null> {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from('events_listing')
      .select(LISTING_COLUMNS)
      .eq('slug', slug)
      .maybeSingle<EventListingRow>();

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat detail event.', 502, {
        cause: error,
      });
    }
    if (!data) return null;

    const { data: deadlineRows, error: deadlineError } = await supabase
      .from('event_deadlines')
      .select('id, label, deadline_at, is_primary')
      .eq('event_id', data.id)
      .order('deadline_at', { ascending: true })
      .returns<EventDeadlineRow[]>();

    if (deadlineError) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat tenggat event.', 502, {
        cause: deadlineError,
      });
    }

    return {
      ...toSummary(data),
      description: data.description,
      registrationLink: data.registration_link,
      sourceUrl: data.source_url,
      deadlines: deadlineRows.map((row) => ({
        id: row.id,
        label: row.label,
        deadlineAt: row.deadline_at,
        isPrimary: row.is_primary,
      })),
    };
  }

  async listClosingSoon(limit: number): Promise<readonly EventSummary[]> {
    const supabase = await createSupabaseServerClient();
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 86_400_000);

    const { data, error } = await supabase
      .from('events_listing')
      .select(LISTING_COLUMNS)
      .eq('status', 'APPROVED')
      .gte('primary_deadline_at', now.toISOString())
      .lte('primary_deadline_at', horizon.toISOString())
      .order('primary_deadline_at', { ascending: true })
      .limit(limit)
      .returns<EventListingRow[]>();

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat sorotan.', 502, { cause: error });
    }
    return data.map(toSummary);
  }

  async listCategories(): Promise<readonly Category[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug')
      .order('name', { ascending: true })
      .returns<CategoryRow[]>();

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat kategori.', 502, { cause: error });
    }
    return data;
  }

  async getStats(): Promise<RepositoryStats> {
    const supabase = await createSupabaseServerClient();
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

    // head:true -> hanya minta jumlah baris, tidak menarik datanya.
    const [active, closing, added, organizerRes] = await Promise.all([
      supabase.from('events_listing').select('id', { count: 'exact', head: true }).eq('status', 'APPROVED'),
      supabase
        .from('events_listing')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'APPROVED')
        .gte('primary_deadline_at', now.toISOString())
        .lte('primary_deadline_at', weekAhead),
      supabase
        .from('events_listing')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'APPROVED')
        .gte('created_at', weekAgo),
      supabase.rpc('get_distinct_organizer_count'),
    ]);

    const organizerCount = organizerRes.error ? 0 : ((organizerRes.data as number | null) ?? 0);

    return {
      totalActive: active.count ?? 0,
      closingThisWeek: closing.count ?? 0,
      addedThisWeek: added.count ?? 0,
      organizerCount,
    };
  }

  async listByStatus(status: EventStatus, limit: number): Promise<readonly EventSummary[]> {
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

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat antrean moderasi.', 502, {
        cause: error,
      });
    }
    return data.map(toSummary);
  }

  async reviewEvent({ eventId, decision, reviewerId, reason }: ReviewEventInput): Promise<void> {
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

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal menyimpan keputusan moderasi.', 502, {
        cause: error,
      });
    }
  }

  async isEventSaved(userId: string, eventId: string): Promise<boolean> {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from('saved_events')
      .select('event_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_id', eventId);

    if (error) return false;
    return (count ?? 0) > 0;
  }

  async listSavedEventIds(userId: string): Promise<readonly string[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', userId);

    if (error || !data) return [];
    return data.map((row: { event_id: string }) => row.event_id);
  }

  async saveEvent(userId: string, eventId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('saved_events')
      .upsert({ user_id: userId, event_id: eventId }, { onConflict: 'user_id,event_id' });

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal menyimpan kegiatan.', 500, {
        cause: error,
      });
    }
  }

  async unsaveEvent(userId: string, eventId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('saved_events')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId);

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal membatalkan simpanan kegiatan.', 500, {
        cause: error,
      });
    }
  }

  async listSavedEvents(userId: string): Promise<readonly EventSummary[]> {
    const supabase = await createSupabaseServerClient();
    const { data: saved, error: savedError } = await supabase
      .from('saved_events')
      .select('event_id, saved_at')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });

    if (savedError || !saved || saved.length === 0) return [];
    const eventIds = saved.map((s: { event_id: string }) => s.event_id);

    const { data, error } = await supabase
      .from('events_listing')
      .select(LISTING_COLUMNS)
      .in('id', eventIds)
      .returns<EventListingRow[]>();

    if (error || !data) return [];
    const map = new Map(data.map((r) => [r.id, toSummary(r)]));
    return eventIds
      .map((id: string) => map.get(id))
      .filter((ev): ev is EventSummary => Boolean(ev));
  }

  async listTrackerItems(userId: string): Promise<readonly TrackerItem[]> {
    const supabase = await createSupabaseServerClient();
    const { data: trackerRows, error: trackerError } = await supabase
      .from('application_tracker')
      .select('id, user_id, event_id, status, notes, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .returns<TrackerRow[]>();

    if (trackerError || !trackerRows || trackerRows.length === 0) return [];
    const eventIds = trackerRows.map((r) => r.event_id);

    const { data: eventRows, error: eventsError } = await supabase
      .from('events_listing')
      .select(LISTING_COLUMNS)
      .in('id', eventIds)
      .returns<EventListingRow[]>();

    if (eventsError || !eventRows) return [];
    const eventMap = new Map(eventRows.map((r) => [r.id, toSummary(r)]));

    const items: TrackerItem[] = [];
    for (const row of trackerRows) {
      const event = eventMap.get(row.event_id);
      if (event) {
        items.push({
          id: row.id,
          eventId: row.event_id,
          status: row.status,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          event,
        });
      }
    }
    return items;
  }

  async upsertTrackerItem(
    userId: string,
    eventId: string,
    status: TrackerStatus,
    notes?: string | null,
  ): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const payload: {
      user_id: string;
      event_id: string;
      status: TrackerStatus;
      notes?: string | null;
      updated_at: string;
    } = {
      user_id: userId,
      event_id: eventId,
      status,
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) {
      payload.notes = notes;
    }

    const { error } = await supabase
      .from('application_tracker')
      .upsert(payload, { onConflict: 'user_id,event_id' });

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memperbarui status tracker.', 500, {
        cause: error,
      });
    }
  }

  async removeTrackerItem(userId: string, eventId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('application_tracker')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId);

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal menghapus entri tracker.', 500, {
        cause: error,
      });
    }
  }

  /**
   * Notifikasi dibaca lewat klien pengguna, bukan klien admin: policy
   * `notifications_own_read` sudah membatasi ke `auth.uid() = user_id`.
   * Filter `.eq('user_id', ...)` di bawah tetap ditulis eksplisit sebagai
   * lapis kedua — kalau suatu saat policy-nya longgar karena salah edit,
   * kueri ini tidak ikut membocorkan baris orang lain.
   */
  async listNotifications(userId: string, limit: number): Promise<readonly AppNotification[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('id, event_id, type, message, is_read, sent_at')
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .limit(limit)
      .returns<NotificationRow[]>();

    if (error || !data || data.length === 0) return [];

    const eventIds = [...new Set(data.map((row) => row.event_id).filter((id): id is string => !!id))];
    const eventMap = new Map<string, { id: string; slug: string; title: string }>();

    if (eventIds.length > 0) {
      const { data: eventRows } = await supabase
        .from('events_listing')
        .select('id, slug, title')
        .in('id', eventIds)
        .returns<Pick<EventListingRow, 'id' | 'slug' | 'title'>[]>();

      for (const row of eventRows ?? []) {
        eventMap.set(row.id, { id: row.id, slug: row.slug, title: row.title });
      }
    }

    return data.map((row) => ({
      id: row.id,
      type: toNotificationType(row.type),
      message: row.message,
      isRead: row.is_read,
      sentAt: row.sent_at,
      event: row.event_id ? (eventMap.get(row.event_id) ?? null) : null,
    }));
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
    if (error) return 0;
    return count ?? 0;
  }

  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal menandai notifikasi.', 500, {
        cause: error,
      });
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal menandai semua notifikasi.', 500, {
        cause: error,
      });
    }
  }

  // ------------------------------------------------------------------
  // Tim lomba (Phase 3)
  //
  // Semua operasi memakai klien PENGGUNA, tidak pernah klien admin. Policy
  // di migration 0003 (`teams_owner_write`, `team_members_self_join`,
  // `team_members_self_leave`) sudah menegakkan siapa boleh apa; memakai
  // klien admin di sini berarti mematikan seluruh penjagaan itu dan
  // memindahkannya ke kode aplikasi yang jauh lebih gampang salah.
  // ------------------------------------------------------------------

  /** Ambil anggota untuk sekumpulan tim sekaligus — hindari N+1 query. */
  private async fetchMembers(teamIds: readonly string[]): Promise<Map<string, TeamMember[]>> {
    const byTeam = new Map<string, TeamMember[]>();
    if (teamIds.length === 0) return byTeam;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('team_member_profiles')
      .select('team_id, user_id, role, joined_at, full_name')
      .in('team_id', [...teamIds])
      .order('joined_at', { ascending: true })
      .returns<TeamMemberProfileRow[]>();

    if (error || !data) return byTeam;

    for (const row of data) {
      const list = byTeam.get(row.team_id) ?? [];
      list.push({
        userId: row.user_id,
        fullName: row.full_name,
        role: toTeamRole(row.role),
        joinedAt: row.joined_at,
      });
      byTeam.set(row.team_id, list);
    }
    return byTeam;
  }

  private async hydrateTeams(rows: readonly TeamRow[]): Promise<readonly Team[]> {
    if (rows.length === 0) return [];
    const supabase = await createSupabaseServerClient();

    const eventIds = [...new Set(rows.map((row) => row.event_id))];
    const [membersByTeam, eventsResult] = await Promise.all([
      this.fetchMembers(rows.map((row) => row.id)),
      supabase
        .from('events_listing')
        .select(LISTING_COLUMNS)
        .in('id', eventIds)
        .returns<EventListingRow[]>(),
    ]);

    const eventMap = new Map((eventsResult.data ?? []).map((row) => [row.id, toSummary(row)]));

    return rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      createdBy: row.created_by,
      title: row.title,
      description: row.description,
      slotsNeeded: row.slots_needed,
      createdAt: row.created_at,
      event: eventMap.get(row.event_id) ?? null,
      members: membersByTeam.get(row.id) ?? [],
    }));
  }

  async listTeams(eventId?: string): Promise<readonly Team[]> {
    const supabase = await createSupabaseServerClient();
    let builder = supabase
      .from('teams')
      .select('id, event_id, created_by, title, description, slots_needed, created_at')
      .order('created_at', { ascending: false })
      .limit(60);

    if (eventId) builder = builder.eq('event_id', eventId);

    const { data, error } = await builder.returns<TeamRow[]>();
    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat daftar tim.', 502, {
        cause: error,
      });
    }
    return this.hydrateTeams(data ?? []);
  }

  async getTeamById(teamId: string): Promise<Team | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('teams')
      .select('id, event_id, created_by, title, description, slots_needed, created_at')
      .eq('id', teamId)
      .maybeSingle<TeamRow>();

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat tim.', 502, { cause: error });
    }
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
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal membuat tim.', 500, { cause: error });
    }

    // Pembuat langsung didaftarkan sebagai ketua. Kalau langkah ini gagal,
    // timnya dihapus lagi: tim tanpa ketua tidak bisa dikelola siapa pun,
    // dan `teams_owner_write` membuat hanya pembuatnya yang bisa
    // membereskannya — yaitu request yang sedang gagal ini.
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: data.id, user_id: input.createdBy, role: 'leader' });

    if (memberError) {
      await supabase.from('teams').delete().eq('id', data.id);
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal membuat tim.', 500, {
        cause: memberError,
      });
    }

    return data.id;
  }

  async joinTeam(actorId: string, _actorName: string, teamId: string): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) throw notFound('Tim yang kamu cari tidak ditemukan.');
    if (team.members.some((member) => member.userId === actorId)) return;

    /**
     * Batas jumlah anggota ditegakkan di sini, BUKAN di database: tidak ada
     * CHECK constraint yang bisa menghitung baris di tabel lain.
     *
     * Konsekuensinya jujur: dua orang yang menekan "gabung" pada detik yang
     * sama untuk slot terakhir bisa lolos keduanya. Yang dipertaruhkan cuma
     * satu anggota berlebih di tim beranggota belasan — ketua bisa
     * mengeluarkannya. Menutup celah ini butuh penguncian baris atau trigger
     * penghitung, dan itu harga yang tidak sepadan untuk fitur ini.
     */
    if (team.members.length >= team.slotsNeeded) {
      throw validationFailed('Tim ini sudah penuh.');
    }

    const supabase = await createSupabaseServerClient();

    // `actorName` tidak dipakai di jalur Supabase: nama diambil dari tabel
    // `users` lewat view `team_member_profiles`, bukan dari input pemanggil.
    // Menyimpan nama kiriman klien akan membuat orang bisa tampil dengan
    // nama siapa pun di daftar anggota.
    const { error } = await supabase
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: actorId, role: 'member' },
        { onConflict: 'team_id,user_id', ignoreDuplicates: true },
      );

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal bergabung ke tim.', 500, {
        cause: error,
      });
    }
  }

  async leaveTeam(actorId: string, teamId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', actorId);

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal keluar dari tim.', 500, {
        cause: error,
      });
    }
  }

  /**
   * Pastikan pemanggil adalah ketua tim, atau lempar error.
   *
   * Policy `team_members_self_leave` dan `teams_owner_write` sudah menolak
   * penghapusan oleh orang lain — tapi penolakan RLS berbentuk "0 baris
   * terpengaruh", bukan error. Tanpa pemeriksaan eksplisit ini, pengguna
   * yang menekan "Keluarkan" di tim orang lain akan melihat halaman muat
   * ulang seolah berhasil, padahal tidak ada yang berubah.
   *
   * Pemeriksaan ini TIDAK menggantikan RLS; ia hanya menerjemahkan
   * penolakan senyap jadi pesan yang bisa dibaca.
   */
  private async assertTeamLeader(actorId: string, teamId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('teams')
      .select('created_by')
      .eq('id', teamId)
      .maybeSingle<{ created_by: string | null }>();

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat tim.', 502, { cause: error });
    }
    if (!data) throw notFound('Tim yang kamu cari tidak ditemukan.');
    if (data.created_by !== actorId) throw forbidden('Hanya ketua tim yang bisa melakukan ini.');
  }

  async removeTeamMember(actorId: string, teamId: string, memberId: string): Promise<void> {
    await this.assertTeamLeader(actorId, teamId);
    if (memberId === actorId) {
      throw validationFailed('Ketua tidak bisa dikeluarkan dari timnya sendiri.');
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', memberId);

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal mengeluarkan anggota.', 500, {
        cause: error,
      });
    }
  }

  async deleteTeam(actorId: string, teamId: string): Promise<void> {
    await this.assertTeamLeader(actorId, teamId);

    const supabase = await createSupabaseServerClient();
    // `team_members` ikut terhapus lewat ON DELETE CASCADE (migration 0001).
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)
      .eq('created_by', actorId);

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal membubarkan tim.', 500, {
        cause: error,
      });
    }
  }
}
