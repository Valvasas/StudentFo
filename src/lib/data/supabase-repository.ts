import 'server-only';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { rankEvents } from '@/lib/recommendation';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  Category,
  EventDetail,
  EventQuery,
  EventStatus,
  EventSummary,
  Paginated,
} from '@/types/domain';
import type { CategoryRow, EventDeadlineRow, EventListingRow } from '@/types/database';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type EventRepository,
  type RepositoryStats,
  type ReviewEventInput,
} from './repository';

const LISTING_COLUMNS =
  'id, slug, title, organizer, description, event_type, registration_link, source_url, education_levels, location, is_online, status, saved_count, created_at, primary_deadline_at, primary_deadline_label, category_slugs';

/**
 * Batas kandidat yang diberi skor untuk sort 'relevance'.
 *
 * `rankEvents()` (§6) berjalan di memori Node, bukan di SQL — jadi hanya
 * sejumlah kandidat TERBARU ini yang diambil dan diberi skor per request,
 * bukan seluruh tabel `events`. Untuk skala Phase 1/2 (target §8: ~100
 * event aktif, lalu 500 DAU) ini jauh di atas cukup. Begitu jumlah event
 * APPROVED mendekati angka ini, pindahkan skoring ke fungsi SQL/RPC —
 * mengambil 500 baris ke memori pada setiap request beranda tidak akan
 * lagi murah.
 *
 * PENTING kalau menambah pemanggil baru: jangan pakai sort default
 * ('relevance') untuk kebutuhan yang harus menjangkau SEMUA baris (contoh:
 * sitemap). Di atas limit ini, halaman relevance selanjutnya akan kosong
 * meski `totalPages` bilang masih ada — pakai 'newest' atau 'deadline',
 * yang keduanya tetap paginasi murni di sisi database tanpa batas ini.
 */
const RANKING_CANDIDATE_LIMIT = 500;

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

    // 'deadline' dan 'newest' murni paginasi di sisi database — cepat di
    // skala berapa pun, tidak ada baris yang perlu ditarik ke memori Node.
    if (query.sort === 'deadline' || query.sort === 'newest') {
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
      return {
        items: data.map(toSummary),
        total,
        page,
        pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      };
    }

    // 'relevance' (default): skoring §6 (category/education match + recency,
    // dengan fallback cold-start recency+popularity) berjalan di app, bukan
    // di SQL, jadi paginasinya juga harus di app — ambil kandidat TERBARU
    // sebanyak RANKING_CANDIDATE_LIMIT, beri skor, baru potong sesuai halaman
    // yang diminta. Sebelumnya kode ini malah cuma `order('created_at')`
    // langsung, jadi "Paling relevan" tidak pernah berbeda dari "Terbaru" —
    // seluruh algoritma rekomendasi ada tapi tidak pernah terpanggil.
    const { data, error, count } = await builder
      .order('created_at', { ascending: false })
      .limit(RANKING_CANDIDATE_LIMIT)
      .returns<EventListingRow[]>();

    if (error) {
      throw new AppError(ERROR_CODES.UPSTREAM_FAILURE, 'Gagal memuat daftar event.', 502, { cause: error });
    }

    const total = count ?? data.length;
    const candidatesTruncated = total > RANKING_CANDIDATE_LIMIT;

    // Fase 1 belum punya sesi user di jalur baca publik (auth baru masuk di
    // Fase 2) — profil selalu null di sini, yang membuat rankEvents otomatis
    // memilih jalur cold-start (§6: recency + popularity). Begitu Fase 2
    // aktif, ganti `null` dengan profil user yang sedang login.
    const ranked = rankEvents(data.map(toSummary), null);
    const items = ranked.slice(from, from + pageSize).map((scored) => scored.event);

    return {
      items,
      total,
      page,
      pageSize,
      // Dibatasi ke jendela kandidat yang benar-benar diberi skor. Tanpa
      // ini, `totalPages` bisa menjanjikan halaman lebih jauh yang akan
      // selalu kosong begitu jumlah event APPROVED melewati batas kandidat.
      totalPages: candidatesTruncated
        ? Math.max(Math.ceil(RANKING_CANDIDATE_LIMIT / pageSize), 1)
        : Math.max(Math.ceil(total / pageSize), 1),
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
    const [active, closing, added] = await Promise.all([
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
    ]);

    return {
      totalActive: active.count ?? 0,
      closingThisWeek: closing.count ?? 0,
      addedThisWeek: added.count ?? 0,
      organizerCount: 0, // DISTINCT organizer butuh RPC; belum diperlukan di Phase 1.
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
}
