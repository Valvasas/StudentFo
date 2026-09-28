import { describe, expect, it } from 'vitest';
import type { AnalyticsDay, EventAnalytics } from '@/types/domain';
import {
  ANALYTICS_MIN_GROUP,
  benchmarkRatio,
  buildFunnel,
  insightsOf,
  kAnonymize,
  parseAnalyticsRange,
  parseEventAnalytics,
  trendOf,
} from './organizer-analytics';

const day = (index: number, views: number): AnalyticsDay => ({
  day: `2026-09-${String(index + 1).padStart(2, '0')}`,
  views,
  visitors: views,
  saves: 0,
  clicks: 0,
});

const base: EventAnalytics = {
  days: 4,
  series: [day(0, 10), day(1, 10), day(2, 30), day(3, 30)],
  totals: { views: 80, visitors: 200, saves: 50, clicks: 20, applied: 5 },
  audience: { minGroup: 5, levels: [], interests: [], hidden: 0 },
  benchmark: { medianViews: 40, peers: 12 },
};

describe('parseEventAnalytics', () => {
  it('menerima bentuk RPC yang sah', () => {
    expect(parseEventAnalytics(JSON.parse(JSON.stringify(base)))).toEqual(base);
  });

  it('bentuk rusak → null (bukan grafik ngawur); angka negatif dinolkan', () => {
    expect(parseEventAnalytics({ days: 30 })).toBeNull();
    expect(parseEventAnalytics(null)).toBeNull();
    const negative = parseEventAnalytics({ ...base, totals: { ...base.totals, views: -5 } });
    expect(negative?.totals.views).toBe(0);
  });
});

describe('buildFunnel', () => {
  it('persentase dari pengunjung unik, dipotong di 100', () => {
    const steps = buildFunnel({ views: 0, visitors: 200, saves: 50, clicks: 20, applied: 5 });
    expect(steps.map((step) => step.ofFirst)).toEqual([100, 25, 10, 2.5]);
    expect(buildFunnel({ views: 0, visitors: 10, saves: 30, clicks: 0, applied: 0 })[1]!.ofFirst).toBe(100);
  });

  it('tanpa pengunjung = semua 0, bukan NaN', () => {
    expect(buildFunnel({ views: 0, visitors: 0, saves: 3, clicks: 0, applied: 0 }).every((step) => step.ofFirst === 0)).toBe(true);
  });
});

describe('trendOf', () => {
  it('paruh akhir vs paruh sebelumnya', () => {
    expect(trendOf(base.series, 'views')).toEqual({ current: 60, previous: 20, changePct: 200 });
  });

  it('periode sebelumnya nol → changePct null', () => {
    expect(trendOf([day(0, 0), day(1, 5)], 'views').changePct).toBeNull();
  });
});

describe('benchmarkRatio', () => {
  it('kunjungan rentang ÷ median acara sejenis', () => {
    expect(benchmarkRatio(base)).toBe(2);
  });

  it('pembanding terlalu sedikit → null (angka tanpa makna tidak ditampilkan)', () => {
    expect(benchmarkRatio({ ...base, benchmark: { medianViews: 40, peers: 2 } })).toBeNull();
    expect(benchmarkRatio({ ...base, benchmark: { medianViews: 0, peers: 20 } })).toBeNull();
  });
});

describe('kAnonymize', () => {
  it(`kelompok < ${ANALYTICS_MIN_GROUP} disembunyikan dan dijumlah sebagai "hidden"`, () => {
    const result = kAnonymize(new Map([['D4_S1', 12], ['S2', 3], ['SMA_SMK', 5], ['D3', 1]]));
    expect(result).toEqual({ buckets: [{ label: 'D4_S1', count: 12 }, { label: 'SMA_SMK', count: 5 }], hidden: 4 });
  });
});

describe('insightsOf', () => {
  const open: Parameters<typeof insightsOf>[1] = { daysLeft: 20, isClosed: false };
  const keys = (analytics: EventAnalytics, context = open) => insightsOf(analytics, context).map((insight) => insight.key);

  it('sampel kecil → hanya saran jangkauan, tanpa menyimpulkan persentase', () => {
    const tiny = { ...base, series: [day(0, 2), day(1, 3)], benchmark: { medianViews: 1, peers: 10 } };
    expect(keys(tiny)).toEqual(['low-reach']);
  });

  it('tren naik tajam & jauh di atas median → sinyal baik', () => {
    expect(keys(base)).toEqual(['trend-up', 'above-peers']);
  });

  it('banyak simpan tapi sedikit klik → saran memperjelas deskripsi', () => {
    const series = [0, 1, 2, 3].map((index) => ({ ...day(index, 25), saves: 3, clicks: 0 }));
    expect(keys({ ...base, series, benchmark: { medianViews: 0, peers: 0 } })).toEqual(['saves-not-clicks']);
  });

  it('tenggat dekat & acara ditutup punya saran sendiri', () => {
    expect(keys(base, { daysLeft: 3, isClosed: false })[0]).toBe('deadline-near');
    expect(keys(base, { daysLeft: null, isClosed: true })[0]).toBe('closed');
  });
});

describe('parseAnalyticsRange', () => {
  it('hanya 7/30/90; selain itu 30', () => {
    expect(parseAnalyticsRange('7')).toBe(7);
    expect(parseAnalyticsRange('90')).toBe(90);
    expect(parseAnalyticsRange('365')).toBe(30);
    expect(parseAnalyticsRange(undefined)).toBe(30);
  });
});
