import { describe, expect, it } from 'vitest';
import {
  compareTrending,
  jakartaNoonOf,
  latestPerPerson,
  TREND_HALF_LIFE_HOURS,
  TREND_VISITOR_DAILY_CAP,
  TREND_WEIGHTS,
  trendDecay,
  trendScore,
} from './popularity';

const now = new Date('2026-11-16T05:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

describe('trendDecay', () => {
  it('bernilai penuh saat ini, separuh setelah satu paruh waktu, seperempat setelah dua', () => {
    expect(trendDecay(now.toISOString(), now)).toBe(1);
    expect(trendDecay(hoursAgo(TREND_HALF_LIFE_HOURS), now)).toBeCloseTo(0.5, 12);
    expect(trendDecay(hoursAgo(TREND_HALF_LIFE_HOURS * 2), now)).toBeCloseTo(0.25, 12);
  });

  it('sinyal bertanggal depan tidak pernah melebihi 1 (jam server meleset)', () => {
    expect(trendDecay(new Date(now.getTime() + 3_600_000), now)).toBe(1);
  });

  it('di luar jendela 14 hari atau tanggal rusak = 0', () => {
    expect(trendDecay(hoursAgo(14 * 24), now)).toBe(0);
    expect(trendDecay(hoursAgo(14 * 24 - 1), now)).toBeGreaterThan(0);
    expect(trendDecay('bukan-tanggal', now)).toBe(0);
  });
});

describe('trendScore', () => {
  it('menjumlahkan bobot × peluruhan; pengunjung dikalikan jumlahnya', () => {
    const score = trendScore(
      [
        { kind: 'registration', at: now },
        { kind: 'like', at: hoursAgo(72) },
        { kind: 'visitor', at: now, count: 8 },
      ],
      now,
    );
    expect(score).toBeCloseTo(TREND_WEIGHTS.registration + TREND_WEIGHTS.like * 0.5 + TREND_WEIGHTS.visitor * 8, 10);
  });

  it('jumlah nol/negatif tidak menyumbang apa pun', () => {
    expect(trendScore([{ kind: 'visitor', at: now, count: 0 }, { kind: 'visitor', at: now, count: -3 }], now)).toBe(0);
    // Pengunjung anonim dijepit per hari: ribuan "pengunjung unik" palsu = maks 5 poin (ADR-093).
    expect(trendScore([{ kind: 'visitor', at: now, count: 5_000 }], now)).toBe(TREND_WEIGHTS.visitor * TREND_VISITOR_DAILY_CAP);
    expect(trendScore([{ kind: 'visitor', at: now, count: 5_000 }], now)).toBeLessThan(TREND_WEIGHTS.save * 2);
  });

  it('acara baru yang diserbu hari ini mengalahkan acara lama yang ramai dua minggu lalu', () => {
    const fresh = trendScore(Array.from({ length: 4 }, () => ({ kind: 'save' as const, at: hoursAgo(2) })), now);
    const stale = trendScore(Array.from({ length: 30 }, () => ({ kind: 'save' as const, at: hoursAgo(13 * 24) })), now);
    expect(fresh).toBeGreaterThan(stale);
  });
});

describe('latestPerPerson', () => {
  it('menyimpan waktu terakhir per (kegiatan, orang)', () => {
    const map = latestPerPerson([
      { eventId: 'e1', userId: 'u1', at: hoursAgo(10) },
      { eventId: 'e1', userId: 'u1', at: hoursAgo(1) },
      { eventId: 'e1', userId: 'u2', at: hoursAgo(5) },
      { eventId: 'e2', userId: 'u1', at: hoursAgo(3) },
    ]);
    expect(map.get('e1')?.size).toBe(2);
    expect(map.get('e1')?.get('u1')).toBe(hoursAgo(1));
    expect(map.get('e2')?.get('u1')).toBe(hoursAgo(3));
  });
});

describe('jakartaNoonOf', () => {
  it('12:00 WIB = 05:00 UTC; format lain ditolak', () => {
    expect(jakartaNoonOf('2026-11-16')?.toISOString()).toBe('2026-11-16T05:00:00.000Z');
    expect(jakartaNoonOf('16-11-2026')).toBeNull();
  });
});

describe('compareTrending', () => {
  it('skor turun → tenggat terdekat (tanpa tenggat paling akhir) → id', () => {
    const items = [
      { id: 'c', trendScore: 1, primaryDeadlineAt: null },
      { id: 'b', trendScore: 1, primaryDeadlineAt: '2026-12-01T00:00:00Z' },
      { id: 'a', trendScore: 1, primaryDeadlineAt: '2026-12-01T00:00:00Z' },
      { id: 'd', trendScore: 9, primaryDeadlineAt: null },
      { id: 'e', primaryDeadlineAt: '2026-11-20T00:00:00Z' },
    ];
    expect([...items].sort(compareTrending).map((item) => item.id)).toEqual(['d', 'a', 'b', 'c', 'e']);
  });
});

describe('kembaran SQL refresh_event_trends()', () => {
  it('migration terbaru memakai plafon pengunjung yang sama dengan TREND_VISITOR_DAILY_CAP', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../../supabase/migrations/', import.meta.url);
    const latest = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .filter((name) => readFileSync(new URL(name, dir), 'utf8').includes('CREATE OR REPLACE FUNCTION public.refresh_event_trends()'))
      .at(-1)!;
    const sql = readFileSync(new URL(latest, dir), 'utf8');
    expect(sql).toContain(`least(v.visitors, ${TREND_VISITOR_DAILY_CAP})`);
    expect(sql).toContain(`${TREND_HALF_LIFE_HOURS}.0`);
  });
});
