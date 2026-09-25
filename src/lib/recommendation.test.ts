import { describe, expect, it } from 'vitest';
import {
  COLD_START_WEIGHTS,
  PERSONAL_WEIGHTS,
  categoryMatch,
  deadlineFit,
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

/** Tenggat n hari kalender WIB dari NOW (NOW = 10 Jan 2026 07:00 WIB), pukul 23:59 WIB. */
function deadlineInDays(n: number): string {
  return new Date(Date.UTC(2026, 0, 10 + n, 16, 59, 0)).toISOString();
}

describe('deadlineFit', () => {
  it('nilai penuh untuk jendela 1..14 hari', () => {
    expect(deadlineFit(deadlineInDays(1), NOW)).toBe(1);
    expect(deadlineFit(deadlineInDays(14), NOW)).toBe(1);
  });

  it('hari-H diturunkan, bukan diangkat (sering sudah tak sempat)', () => {
    expect(deadlineFit(deadlineInDays(0), NOW)).toBe(0.6);
  });

  it('meluruh separuh setiap 14 hari setelah jendela', () => {
    expect(deadlineFit(deadlineInDays(28), NOW)).toBeCloseTo(0.5, 5);
    expect(deadlineFit(deadlineInDays(42), NOW)).toBeCloseTo(0.25, 5);
  });

  it('nol untuk kegiatan yang sudah ditutup', () => {
    expect(deadlineFit(deadlineInDays(-1), NOW)).toBe(0);
  });

  it('netral-rendah untuk tenggat kosong atau rusak', () => {
    expect(deadlineFit(null, NOW)).toBe(0.3);
    expect(deadlineFit('bukan-tanggal', NOW)).toBe(0.3);
  });
});

describe('bobot skor', () => {
  // Kalau bobot tidak berjumlah 1, skor bisa melewati clamp dan urutan
  // di puncak diam-diam ditentukan oleh pembulatan, bukan relevansi.
  it.each([
    ['personal', PERSONAL_WEIGHTS],
    ['cold start', COLD_START_WEIGHTS],
  ])('bobot %s berjumlah 1', (_, weights) => {
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('rankEvents — faktor tenggat', () => {
  const profile = { interests: ['teknologi'], educationLevel: 'D4_S1' as const };

  it('yang tutup 5 hari lagi mengalahkan yang tutup 90 hari lagi, sinyal lain setara', () => {
    const events = [
      makeEvent({ id: 'jauh', primaryDeadlineAt: deadlineInDays(90) }),
      makeEvent({ id: 'dekat', primaryDeadlineAt: deadlineInDays(5) }),
    ];
    expect(rankEvents(events, profile, NOW)[0]?.event.id).toBe('dekat');
    expect(rankEvents(events, null, NOW)[0]?.event.id).toBe('dekat');
  });

  it('kecocokan minat tetap sinyal terkuat: tenggat mendesak tidak menenggelamkannya', () => {
    const events = [
      makeEvent({ id: 'mendesak-tak-relevan', categorySlugs: ['olahraga'], primaryDeadlineAt: deadlineInDays(3) }),
      makeEvent({ id: 'relevan-santai', categorySlugs: ['teknologi'], primaryDeadlineAt: deadlineInDays(60) }),
    ];
    expect(rankEvents(events, profile, NOW)[0]?.event.id).toBe('relevan-santai');
  });
});
