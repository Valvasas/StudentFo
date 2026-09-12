import { describe, expect, it } from 'vitest';
import {
  categoryMatch,
  educationMatch,
  isColdStart,
  popularityBoost,
  rankEvents,
  recencyBoost,
} from './recommendation';
import type { EventSummary } from '@/types/domain';

const NOW = new Date('2026-01-10T00:00:00Z');

function makeEvent(overrides: Partial<EventSummary> & { id: string }): EventSummary {
  return {
    slug: `slug-${overrides.id}`,
    title: 'Event',
    organizer: 'Penyelenggara',
    eventType: 'LOMBA',
    educationLevels: ['D4_S1'],
    categorySlugs: ['teknologi'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 0,
    createdAt: NOW.toISOString(),
    primaryDeadlineAt: null,
    primaryDeadlineLabel: null,
    ...overrides,
  };
}

describe('recencyBoost', () => {
  it('bernilai 1 untuk event yang baru masuk', () => {
    expect(recencyBoost(NOW.toISOString(), NOW)).toBe(1);
  });

  it('turun separuh setelah 14 hari', () => {
    expect(recencyBoost('2025-12-27T00:00:00Z', NOW)).toBeCloseTo(0.5, 5);
  });

  it('tidak pernah negatif atau NaN untuk input rusak', () => {
    expect(recencyBoost('tanggal-rusak', NOW)).toBe(0);
    expect(recencyBoost('2027-01-01T00:00:00Z', NOW)).toBe(1);
  });
});

describe('categoryMatch', () => {
  it('menghitung proporsi minat yang tersentuh', () => {
    expect(categoryMatch(['teknologi', 'desain'], ['teknologi'])).toBe(0.5);
    expect(categoryMatch(['teknologi'], ['teknologi', 'bisnis'])).toBe(1);
  });

  it('aman saat minat kosong', () => {
    expect(categoryMatch([], ['teknologi'])).toBe(0);
  });
});

describe('educationMatch', () => {
  it('memberi nilai penuh untuk jenjang yang disebut eksplisit', () => {
    expect(educationMatch('D4_S1', ['D4_S1', 'S2'])).toBe(1);
  });

  it('memberi nilai separuh untuk event terbuka umum', () => {
    expect(educationMatch('SMA_SMK', ['UMUM'])).toBe(0.5);
    expect(educationMatch('SMA_SMK', [])).toBe(0.5);
  });

  it('memberi nol kalau jenjang tidak termasuk', () => {
    expect(educationMatch('SMA_SMK', ['S2', 'S3'])).toBe(0);
  });
});

describe('popularityBoost', () => {
  it('meredam dominasi satu event viral', () => {
    // Tanpa log: 10/2000 = 0.005 (praktis nol). Dengan log: jauh lebih adil.
    expect(popularityBoost(10, 2000)).toBeGreaterThan(0.3);
    expect(popularityBoost(2000, 2000)).toBe(1);
  });

  it('mengembalikan 0 saat belum ada yang menyimpan apa pun', () => {
    expect(popularityBoost(0, 0)).toBe(0);
  });
});

describe('isColdStart', () => {
  it('true untuk profil null atau tidak lengkap', () => {
    expect(isColdStart(null)).toBe(true);
    expect(isColdStart({ interests: [], educationLevel: 'D4_S1' })).toBe(true);
    expect(isColdStart({ interests: ['teknologi'], educationLevel: null })).toBe(true);
  });

  it('false hanya kalau dua-duanya terisi', () => {
    expect(isColdStart({ interests: ['teknologi'], educationLevel: 'D4_S1' })).toBe(false);
  });
});

describe('rankEvents', () => {
  it('memakai jalur cold-start dan tetap mengembalikan hasil untuk user baru', () => {
    const events = [
      makeEvent({ id: 'a', createdAt: '2025-12-01T00:00:00Z', savedCount: 100 }),
      makeEvent({ id: 'b', createdAt: NOW.toISOString(), savedCount: 0 }),
    ];
    const ranked = rankEvents(events, null, NOW);
    expect(ranked).toHaveLength(2);
    expect(ranked.every((item) => item.personalized === false)).toBe(true);
    // Yang baru menang lewat recency meski belum punya simpanan sama sekali.
    expect(ranked[0]?.event.id).toBe('b');
  });

  it('mengangkat event yang cocok minat saat profil lengkap', () => {
    const events = [
      makeEvent({ id: 'baru-tidak-relevan', categorySlugs: ['olahraga'], educationLevels: ['S3'] }),
      makeEvent({
        id: 'relevan',
        categorySlugs: ['teknologi'],
        educationLevels: ['D4_S1'],
        createdAt: '2025-12-01T00:00:00Z',
      }),
    ];
    const ranked = rankEvents(events, { interests: ['teknologi'], educationLevel: 'D4_S1' }, NOW);
    expect(ranked[0]?.event.id).toBe('relevan');
    expect(ranked[0]?.personalized).toBe(true);
  });

  it('urutannya deterministik untuk skor yang sama', () => {
    const events = [makeEvent({ id: 'z' }), makeEvent({ id: 'a' })];
    const first = rankEvents(events, null, NOW).map((item) => item.event.id);
    const second = rankEvents([...events].reverse(), null, NOW).map((item) => item.event.id);
    expect(first).toEqual(second);
  });

  it('mengembalikan array kosong tanpa error untuk input kosong', () => {
    expect(rankEvents([], null, NOW)).toEqual([]);
  });
});
