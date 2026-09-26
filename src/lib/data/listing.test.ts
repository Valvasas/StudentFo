import { describe, expect, it } from 'vitest';
import type { EventSummary } from '@/types/domain';
import {
  chooseCountMode,
  EXACT_COUNT_MAX_ACTIVE,
  isPubliclyVisible,
  paginate,
  resolvePaging,
  sortSummaries,
} from './listing';

function summary(id: string, overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id,
    slug: id,
    title: id,
    organizer: 'Penyelenggara',
    eventType: 'LOMBA',
    educationLevels: [],
    categorySlugs: [],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    primaryDeadlineAt: null,
    primaryDeadlineLabel: null,
    ...overrides,
  };
}

describe('resolvePaging', () => {
  it('menjepit ukuran halaman ke 1..48 dan halaman minimal 1', () => {
    expect(resolvePaging({})).toEqual({ page: 1, pageSize: 12, offset: 0 });
    expect(resolvePaging({ page: 3, pageSize: 500 })).toEqual({ page: 3, pageSize: 48, offset: 96 });
    expect(resolvePaging({ page: -2, pageSize: 0 })).toEqual({ page: 1, pageSize: 1, offset: 0 });
    expect(resolvePaging({ page: 2.7 })).toMatchObject({ page: 2 });
  });
});

describe('paginate', () => {
  it('memotong halaman dan menjepit halaman di luar batas ke halaman terakhir', () => {
    const items = Array.from({ length: 5 }, (_, index) => index);
    expect(paginate(items, resolvePaging({ page: 2, pageSize: 2 }))).toEqual({
      items: [2, 3],
      total: 5,
      page: 2,
      pageSize: 2,
      totalPages: 3,
    });
    expect(paginate(items, resolvePaging({ page: 99, pageSize: 2 })).items).toEqual([4]);
  });

  it('daftar kosong tetap punya satu halaman', () => {
    expect(paginate([], resolvePaging({}))).toMatchObject({ totalPages: 1, page: 1, items: [] });
  });
});

describe('sortSummaries', () => {
  const now = new Date('2026-01-10T00:00:00Z');

  it('deadline: terdekat dulu, tanpa tenggat di akhir', () => {
    const sorted = sortSummaries(
      [
        summary('tanpa'),
        summary('jauh', { primaryDeadlineAt: '2026-03-01T00:00:00Z' }),
        summary('dekat', { primaryDeadlineAt: '2026-01-15T00:00:00Z' }),
      ],
      'deadline',
      now,
    );
    expect(sorted.map((event) => event.id)).toEqual(['dekat', 'jauh', 'tanpa']);
  });

  it('newest: terbaru dulu', () => {
    const sorted = sortSummaries(
      [
        summary('lama', { createdAt: '2025-12-01T00:00:00Z' }),
        summary('baru', { createdAt: '2026-01-05T00:00:00Z' }),
      ],
      'newest',
      now,
    );
    expect(sorted.map((event) => event.id)).toEqual(['baru', 'lama']);
  });
});

describe('isPubliclyVisible', () => {
  it('hanya APPROVED dan EXPIRED — cermin policy events_public_read', () => {
    expect(isPubliclyVisible({ status: 'APPROVED' })).toBe(true);
    expect(isPubliclyVisible({ status: 'EXPIRED' })).toBe(true);
    expect(isPubliclyVisible({ status: 'PENDING' })).toBe(false);
    expect(isPubliclyVisible({ status: 'REJECTED' })).toBe(false);
  });
});

describe('chooseCountMode', () => {
  it('exact sampai ambang (inklusif), planned di atasnya', () => {
    expect(chooseCountMode(0)).toBe('exact');
    expect(chooseCountMode(EXACT_COUNT_MAX_ACTIVE)).toBe('exact');
    expect(chooseCountMode(EXACT_COUNT_MAX_ACTIVE + 1)).toBe('planned');
    expect(chooseCountMode(50, 10)).toBe('planned');
  });
});
