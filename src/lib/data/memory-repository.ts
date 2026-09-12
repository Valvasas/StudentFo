import { getDeadlineState } from '@/lib/deadline';
import { rankEvents } from '@/lib/recommendation';
import type {
  Category,
  EventDetail,
  EventQuery,
  EventStatus,
  EventSummary,
  Paginated,
} from '@/types/domain';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type EventRepository,
  type RepositoryStats,
  type ReviewEventInput,
} from './repository';
import { SEED_CATEGORIES, SEED_EVENTS, type SeedEvent } from './seed-data';

const MS_PER_DAY = 86_400_000;

function isoOffsetDays(days: number, base: Date): string {
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString();
}

/**
 * Tenggat contoh dipatok ke 23:59 WIB pada hari yang dituju, bukan ke jam
 * berjalan. Tenggat sungguhan hampir selalu berakhir di penghujung hari;
 * menampilkan "pukul 02.09 WIB" membuat data contoh terasa palsu dan
 * menyembunyikan kesalahan pembulatan hari kalau ada.
 */
function deadlineIso(days: number, base: Date): string {
  const target = new Date(base.getTime() + days * MS_PER_DAY);
  // 23:59 WIB (UTC+7) = 16:59 UTC pada hari kalender WIB yang sama.
  const wibDate = new Date(target.getTime() + 7 * 3_600_000);
  return new Date(
    Date.UTC(wibDate.getUTCFullYear(), wibDate.getUTCMonth(), wibDate.getUTCDate(), 16, 59, 0),
  ).toISOString();
}

/** Normalisasi untuk pencarian: buang diakritik & rapikan spasi. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDetail(seed: SeedEvent, base: Date): EventDetail {
  const deadlines = seed.deadlines.map((deadline, index) => ({
    id: `${seed.id}-d${index}`,
    label: deadline.label,
    deadlineAt: deadlineIso(deadline.inDays, base),
    isPrimary: deadline.isPrimary,
  }));
  const primary = deadlines.find((deadline) => deadline.isPrimary) ?? null;

  return {
    id: seed.id,
    slug: seed.slug,
    title: seed.title,
    organizer: seed.organizer,
    description: seed.description,
    eventType: seed.eventType,
    educationLevels: seed.educationLevels,
    categorySlugs: seed.categorySlugs,
    location: seed.location,
    isOnline: seed.isOnline,
    status: seed.status,
    savedCount: seed.savedCount,
    createdAt: isoOffsetDays(-seed.createdDaysAgo, base),
    primaryDeadlineAt: primary?.deadlineAt ?? null,
    primaryDeadlineLabel: primary?.label ?? null,
    registrationLink: `https://example.org/daftar/${seed.slug}`,
    sourceUrl: `https://example.org/sumber/${seed.slug}`,
    deadlines,
  };
}

/** Cocok kalau SEMUA kata kunci muncul di judul/penyelenggara/deskripsi. */
export function matchesSearch(event: EventDetail, search: string): boolean {
  const terms = normalize(search).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(`${event.title} ${event.organizer} ${event.description ?? ''}`);
  return terms.every((term) => haystack.includes(term));
}

function hasOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.some((value) => b.includes(value));
}

/**
 * Implementasi in-memory.
 *
 * Dipakai saat kredensial Supabase belum dipasang, dan sebagai baseline
 * pembanding saat menguji perilaku implementasi Supabase. Mutasi (approve/
 * reject) memang hanya bertahan selama proses hidup — itu disengaja, dan
 * dinyatakan terang-terangan di UI lewat penanda "Data contoh".
 */
export class MemoryEventRepository implements EventRepository {
  private readonly events: EventDetail[];

  constructor(base: Date = new Date()) {
    this.events = SEED_EVENTS.map((seed) => buildDetail(seed, base));
  }

  private publicEvents(includeClosed: boolean, now: Date): EventDetail[] {
    return this.events.filter((event) => {
      if (event.status !== 'APPROVED' && event.status !== 'EXPIRED') return false;
      if (includeClosed) return true;
      return getDeadlineState(event.primaryDeadlineAt, now).urgency !== 'closed';
    });
  }

  async listEvents(query: EventQuery): Promise<Paginated<EventSummary>> {
    const now = new Date();
    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(query.page ?? 1, 1);

    let results = this.publicEvents(query.includeClosed ?? false, now);

    if (query.search?.trim()) {
      const search = query.search;
      results = results.filter((event) => matchesSearch(event, search));
    }
    if (query.types?.length) {
      results = results.filter((event) => query.types!.includes(event.eventType));
    }
    if (query.categories?.length) {
      results = results.filter((event) => hasOverlap(query.categories!, event.categorySlugs));
    }
    if (query.levels?.length) {
      results = results.filter((event) => hasOverlap(query.levels!, event.educationLevels));
    }

    const sorted = sortSummaries(results, query.sort ?? 'relevance', now);
    const total = sorted.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return {
      items: sorted.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  async getEventBySlug(slug: string): Promise<EventDetail | null> {
    const event = this.events.find((candidate) => candidate.slug === slug);
    if (!event) return null;
    // Entri PENDING/REJECTED tidak boleh bocor lewat tebakan slug.
    if (event.status !== 'APPROVED' && event.status !== 'EXPIRED') return null;
    return event;
  }

  async listClosingSoon(limit: number): Promise<readonly EventSummary[]> {
    const now = new Date();
    return this.publicEvents(false, now)
      .filter((event) => {
        const state = getDeadlineState(event.primaryDeadlineAt, now);
        return state.daysLeft !== null && state.daysLeft <= 30;
      })
      .sort(
        (a, b) =>
          new Date(a.primaryDeadlineAt ?? 0).getTime() - new Date(b.primaryDeadlineAt ?? 0).getTime(),
      )
      .slice(0, limit);
  }

  async listCategories(): Promise<readonly Category[]> {
    return SEED_CATEGORIES.map((category) => ({ ...category }));
  }

  async getStats(): Promise<RepositoryStats> {
    const now = new Date();
    const active = this.publicEvents(false, now);
    const closingThisWeek = active.filter((event) => {
      const days = getDeadlineState(event.primaryDeadlineAt, now).daysLeft;
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const addedThisWeek = active.filter(
      (event) => now.getTime() - new Date(event.createdAt).getTime() <= 7 * MS_PER_DAY,
    ).length;

    return {
      totalActive: active.length,
      closingThisWeek,
      addedThisWeek,
      organizerCount: new Set(active.map((event) => event.organizer)).size,
    };
  }

  async listByStatus(status: EventStatus, limit: number): Promise<readonly EventSummary[]> {
    return this.events.filter((event) => event.status === status).slice(0, limit);
  }

  async reviewEvent({ eventId, decision }: ReviewEventInput): Promise<void> {
    const index = this.events.findIndex((event) => event.id === eventId);
    if (index === -1) return;
    const current = this.events[index];
    if (!current) return;
    this.events[index] = { ...current, status: decision };
  }
}

/**
 * Pengurutan bersama untuk semua implementasi repository.
 *  - relevance : skor §6 (cold-start, karena Phase 1 belum punya sesi user)
 *  - deadline  : tenggat terdekat dulu; yang tanpa tenggat ditaruh terakhir
 *                supaya tidak "menyelinap" ke puncak lewat nilai 0
 *  - newest    : entri terbaru dulu
 */
export function sortSummaries<T extends EventSummary>(
  events: readonly T[],
  sort: NonNullable<EventQuery['sort']>,
  now: Date,
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

  return rankEvents(events, null, now).map((scored) => scored.event as T);
}
