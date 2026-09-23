import { rankEvents } from '@/lib/recommendation';
import type { EventQuery, EventStatus, EventSummary, Paginated, UserProfile } from '@/types/domain';
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
 * Pengurutan bersama untuk semua implementasi repository.
 *  - relevance : skor §6 (personalized kalau profil ada, cold-start kalau null)
 *  - deadline  : tenggat terdekat dulu; yang tanpa tenggat ditaruh terakhir
 *                supaya tidak "menyelinap" ke puncak lewat nilai 0
 *  - newest    : entri terbaru dulu
 */
export function sortSummaries<T extends EventSummary>(
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

/**
 * Berapa kandidat yang diperingkat untuk urutan `relevance` di database.
 *
 * Skor rekomendasi (§6) dihitung di aplikasi, bukan di SQL, jadi ia hanya
 * bisa memeringkat baris yang sudah ditarik. Memeringkat per halaman (12
 * baris) membuat halaman 1 hanya "12 terbaru yang diurutkan ulang" — bukan
 * 12 paling relevan. Jendela ini menarik kandidat terbaru sekali, memeringkat
 * semuanya, lalu memotong halaman dari hasil peringkat.
 *
 * Halaman di luar jendela jatuh ke urutan terbaru. Itu trade-off sadar:
 * pengguna praktis tidak membuka halaman ke-21, dan menarik seluruh tabel per
 * request tidak berskala.
 */
export const RELEVANCE_CANDIDATE_WINDOW = 240;
