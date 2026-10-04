import { rankEvents } from '@/lib/recommendation';
import type { CostFilter, EventQuery, EventStatus, EventSummary, Paginated, UserProfile } from '@/types/domain';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './repository';

/**
 * Aturan listing yang WAJIB identik di semua implementasi repository.
 *
 * Sebelumnya tiap implementasi menulis ulang clamp halaman, pengurutan, dan
 * pengecekan status publik sendiri-sendiri — dan di situlah keduanya mulai
 * berbeda perilaku tanpa ketahuan. Satu modul, satu sumber kebenaran.
 */

/** Status yang boleh terlihat publik — cermin policy `events_public_read`. */
export const PUBLIC_STATUSES: readonly EventStatus[] = ['APPROVED', 'EXPIRED'];

export function isPubliclyVisible(event: Pick<EventSummary, 'status'>): boolean {
  return PUBLIC_STATUSES.includes(event.status);
}

export interface Paging {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export function resolvePaging(query: Pick<EventQuery, 'page' | 'pageSize'>): Paging {
  const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(query.page ?? 1), 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(Math.ceil(total / pageSize), 1);
}

/** Paginasi atas daftar yang sudah lengkap di memori. Halaman di luar batas dijepit ke halaman terakhir. */
export function paginate<T>(items: readonly T[], paging: Paging): Paginated<T> {
  const totalPages = totalPagesFor(items.length, paging.pageSize);
  const page = Math.min(paging.page, totalPages);
  const start = (page - 1) * paging.pageSize;
  return {
    items: items.slice(start, start + paging.pageSize),
    total: items.length,
    page,
    pageSize: paging.pageSize,
    totalPages,
  };
}

/**
 * Promosi berbayar sedang berjalan DAN kegiatannya masih bisa diikuti.
 * Cermin kolom `events_listing.is_promoted` (migration 20261003100001) —
 * ubah keduanya bersamaan. Membandingkan waktu persis (bukan hari kalender
 * WIB) supaya sama dengan SQL; promosi bukan label H-n yang dibaca pengguna.
 */
export function isPromoted(
  event: Pick<EventSummary, 'featuredUntil' | 'status' | 'primaryDeadlineAt'>,
  now: Date,
): boolean {
  if (!event.featuredUntil || event.status !== 'APPROVED') return false;
  const at = now.getTime();
  if (new Date(event.featuredUntil).getTime() <= at) return false;
  return event.primaryDeadlineAt === null || new Date(event.primaryDeadlineAt).getTime() >= at;
}

/**
 * Pengurutan bersama untuk semua implementasi repository.
 *  - relevance : skor §6 (personalized kalau profil ada, cold-start kalau null)
 *  - deadline  : tenggat terdekat dulu; yang tanpa tenggat ditaruh terakhir
 *                supaya tidak "menyelinap" ke puncak lewat nilai 0
 *  - newest    : entri terbaru dulu
 *
 * `promoted` = kegiatan berpromosi aktif dipindah ke puncak dengan urutan
 * relatif yang sama (partisi stabil), lalu sisanya dalam urutan aslinya.
 * Iklan tidak pernah mengubah SKOR — kegiatan berpromosi yang tidak relevan
 * tetap dinilai tidak relevan, hanya posisinya yang dibeli.
 */
export function sortSummaries<T extends EventSummary>(
  events: readonly T[],
  sort: NonNullable<EventQuery['sort']>,
  now: Date,
  profile?: UserProfile | null,
  promoted = false,
): T[] {
  const sorted = orderBy(events, sort, now, profile);
  if (!promoted) return sorted;
  return [...sorted.filter((event) => isPromoted(event, now)), ...sorted.filter((event) => !isPromoted(event, now))];
}

function orderBy<T extends EventSummary>(
  events: readonly T[],
  sort: NonNullable<EventQuery['sort']>,
  now: Date,
  profile?: UserProfile | null,
): T[] {
  if (sort === 'newest') {
    return [...events].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  if (sort === 'deadline') {
    return [...events].sort((a, b) => {
      const left = a.primaryDeadlineAt ? new Date(a.primaryDeadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
      const right = b.primaryDeadlineAt ? new Date(b.primaryDeadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (left !== right) return left - right;
      return a.id.localeCompare(b.id);
    });
  }

  return rankEvents(events, profile ?? null, now).map((scored) => scored.event as T);
}

/** Saringan biaya; `isFree === null` (belum diketahui) tidak pernah lolos. Cermin `p_cost` di RPC. */
export function matchesCost(event: Pick<EventSummary, 'isFree'>, cost: CostFilter | undefined): boolean {
  if (!cost) return true;
  return cost === 'free' ? event.isFree === true : event.isFree === false;
}

/**
 * Di atas jumlah event aktif ini, total listing memakai perkiraan planner
 * (`count: 'planned'`), bukan COUNT(*) sungguhan. Diukur (ADR-035): count
 * exact lewat PostgREST menambah ±100 ms di 50.000 event dan ±550 ms bila
 * digabung urutan tenggat (join events × event_deadlines dua kali); di
 * 20.000 event seluruh listing masih ≤ 130 ms. Total pasti lebih penting
 * untuk paginasi selama murah, jadi ambangnya sengaja tinggi.
 *
 * Bukan `count: 'estimated'` bawaan PostgREST: ambang di sana = `max_rows`
 * Supabase (1000), sehingga katalog 1.001 event sudah mendapat total
 * perkiraan — dan perkiraan planner untuk kueri FTS bisa meleset jauh.
 */
export const EXACT_COUNT_MAX_ACTIVE = 20_000;

export type ListingCountMode = 'exact' | 'planned';

export function chooseCountMode(totalActive: number, threshold = EXACT_COUNT_MAX_ACTIVE): ListingCountMode {
  return totalActive > threshold ? 'planned' : 'exact';
}
