import { z } from 'zod';
import type { AnalyticsDay, EventAnalytics } from '@/types/domain';

/**
 * Analitik acara untuk penyelenggara (ADR-043) — logika murni yang dipakai
 * kedua repository dan halaman dasbor.
 */

/**
 * Ambang k-anonimitas: kelompok audiens di bawah ini disembunyikan. HARUS
 * sama dengan konstanta `k` di `event_analytics()` (migration 20260928120001).
 */
export const ANALYTICS_MIN_GROUP = 5;
export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseAnalyticsRange(raw: string | undefined): AnalyticsRange {
  const value = Number(raw);
  return (ANALYTICS_RANGES as readonly number[]).includes(value) ? (value as AnalyticsRange) : 30;
}

const count = z.number().int().nonnegative().catch(0);
const bucket = z.object({ label: z.string().max(60), count });

const analyticsSchema = z.object({
  days: z.number().int().positive(),
  series: z.array(
    z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      views: count,
      visitors: count,
      saves: count,
      clicks: count,
    }),
  ),
  totals: z.object({ views: count, visitors: count, saves: count, clicks: count, applied: count }),
  audience: z.object({
    minGroup: z.number().int().positive(),
    levels: z.array(bucket),
    interests: z.array(bucket),
    hidden: count,
  }),
  benchmark: z.object({ medianViews: z.number().nonnegative().catch(0), peers: count }),
});

/** JSON dari RPC = batas kepercayaan; bentuk yang salah jadi null, bukan grafik rusak. */
export function parseEventAnalytics(raw: unknown): EventAnalytics | null {
  const parsed = analyticsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export interface FunnelStep {
  readonly key: 'visitors' | 'saves' | 'clicks' | 'applied';
  readonly label: string;
  readonly value: number;
  /** Persentase dari langkah pertama (0..100), dibulatkan satu desimal. */
  readonly ofFirst: number;
}

/**
 * Corong: pengunjung unik → simpan → klik "Daftar" → tandai sudah daftar.
 * Langkah bisa lebih besar dari langkah sebelumnya (orang menyimpan dari
 * kartu tanpa membuka detail), jadi persentase dipotong di 100 — angka di
 * atas 100% membingungkan dan tidak membantu keputusan.
 */
export function buildFunnel(totals: EventAnalytics['totals']): FunnelStep[] {
  const base = totals.visitors;
  const pct = (value: number) => (base > 0 ? Math.min(100, Math.round((value / base) * 1000) / 10) : 0);
  return [
    { key: 'visitors', label: 'Pengunjung unik', value: totals.visitors, ofFirst: base > 0 ? 100 : 0 },
    { key: 'saves', label: 'Menyimpan', value: totals.saves, ofFirst: pct(totals.saves) },
    { key: 'clicks', label: 'Klik "Daftar"', value: totals.clicks, ofFirst: pct(totals.clicks) },
    { key: 'applied', label: 'Menandai sudah daftar', value: totals.applied, ofFirst: pct(totals.applied) },
  ];
}

export interface TrendSummary {
  readonly current: number;
  readonly previous: number;
  /** null = periode sebelumnya nol (persentase tidak bermakna). */
  readonly changePct: number | null;
}

/** Bandingkan paruh akhir rentang dengan paruh sebelumnya (mis. 15 hari vs 15 hari). */
export function trendOf(series: readonly AnalyticsDay[], key: 'views' | 'visitors' | 'saves' | 'clicks'): TrendSummary {
  const half = Math.floor(series.length / 2);
  const sum = (days: readonly AnalyticsDay[]) => days.reduce((total, day) => total + day[key], 0);
  const current = sum(series.slice(series.length - half));
  const previous = sum(series.slice(series.length - half * 2, series.length - half));
  return { current, previous, changePct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null };
}

/** Posisi terhadap median acara sejenis: "2,1× median" dst. null bila tidak ada pembanding. */
export function benchmarkRatio(analytics: EventAnalytics): number | null {
  const { medianViews, peers } = analytics.benchmark;
  if (peers < 3 || medianViews <= 0) return null;
  const windowViews = analytics.series.reduce((total, day) => total + day.views, 0);
  return Math.round((windowViews / medianViews) * 10) / 10;
}

export interface AnalyticsInsight {
  readonly key: string;
  readonly tone: 'good' | 'attention' | 'info';
  readonly title: string;
  readonly body: string;
}

/** Di bawah ini persentase terlalu goyah untuk disimpulkan. */
const INSIGHT_MIN_VISITORS = 30;

/**
 * Saran yang bisa ditindaklanjuti, diturunkan dari angka yang SAMA dengan
 * yang tampil di dasbor — tidak ada angka tersembunyi. Aturannya sengaja
 * sederhana dan bisa dijelaskan; lebih baik diam daripada menyimpulkan dari
 * sampel kecil.
 */
export function insightsOf(
  analytics: EventAnalytics,
  context: { readonly daysLeft: number | null; readonly isClosed: boolean },
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  const windowVisitors = analytics.series.reduce((total, day) => total + day.visitors, 0);
  const windowSaves = analytics.series.reduce((total, day) => total + day.saves, 0);
  const windowClicks = analytics.series.reduce((total, day) => total + day.clicks, 0);

  if (context.isClosed) {
    insights.push({
      key: 'closed',
      tone: 'info',
      title: 'Pendaftaran sudah ditutup',
      body: 'Kalau pendaftaran diperpanjang, ajukan tenggat baru lewat form perubahan — acara tayang kembali setelah dicek moderator.',
    });
  } else if (context.daysLeft !== null && context.daysLeft <= 7) {
    insights.push({
      key: 'deadline-near',
      tone: 'attention',
      title: context.daysLeft <= 0 ? 'Tenggat hari ini' : `Tenggat tinggal ${context.daysLeft} hari`,
      body: 'Orang yang menyimpan acara ini mendapat pengingat tenggat otomatis. Ini saat terbaik membagikan ulang tautan halaman acaranya.',
    });
  }

  if (windowVisitors < INSIGHT_MIN_VISITORS) {
    insights.push({
      key: 'low-reach',
      tone: 'attention',
      title: 'Jangkauan masih kecil',
      body: 'Bagikan tautan halaman acara di StudentFo (bukan langsung formulirnya): pengunjung bisa menyimpan, dapat pengingat, dan mencari tim.',
    });
    return insights;
  }

  const saveRate = windowSaves / windowVisitors;
  const clickPerSave = windowSaves > 0 ? windowClicks / windowSaves : null;
  if (saveRate >= 0.08 && clickPerSave !== null && clickPerSave < 0.35) {
    insights.push({
      key: 'saves-not-clicks',
      tone: 'attention',
      title: 'Banyak yang menyimpan, sedikit yang klik daftar',
      body: 'Peminatnya ada tapi ragu. Perjelas syarat, biaya, dan alur seleksi di deskripsi — ajukan lewat form perubahan.',
    });
  }

  const trend = trendOf(analytics.series, 'visitors');
  if (trend.changePct !== null && trend.previous >= 10 && Math.abs(trend.changePct) >= 25) {
    const up = trend.changePct > 0;
    insights.push({
      key: up ? 'trend-up' : 'trend-down',
      tone: up ? 'good' : 'attention',
      title: up ? `Pengunjung naik ${trend.changePct}%` : `Pengunjung turun ${Math.abs(trend.changePct)}%`,
      body: up
        ? 'Dibanding paruh sebelumnya di rentang ini. Pertahankan kanal promosi yang sedang berjalan.'
        : 'Dibanding paruh sebelumnya di rentang ini. Pertimbangkan promosi ulang, terutama menjelang tenggat.',
    });
  }

  const ratio = benchmarkRatio(analytics);
  if (ratio !== null && (ratio >= 1.5 || ratio <= 0.5)) {
    insights.push({
      key: ratio >= 1.5 ? 'above-peers' : 'below-peers',
      tone: ratio >= 1.5 ? 'good' : 'info',
      title: ratio >= 1.5 ? `${ratio.toLocaleString('id-ID')}× median acara sejenis` : 'Di bawah median acara sejenis',
      body:
        ratio >= 1.5
          ? 'Kunjunganmu jauh di atas acara berjenis sama pada rentang ini.'
          : 'Judul yang spesifik dan deskripsi lengkap (hadiah, syarat, tahapan) membantu acara ditemukan lewat pencarian.',
    });
  }

  return insights;
}

/** Sembunyikan kelompok kecil — dipakai mode seed supaya perilakunya identik dengan SQL. */
export function kAnonymize(
  counts: ReadonlyMap<string, number>,
  limit?: number,
): { buckets: { label: string; count: number }[]; hidden: number } {
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = entries.filter(([, value]) => value >= ANALYTICS_MIN_GROUP);
  const hidden = entries.filter(([, value]) => value < ANALYTICS_MIN_GROUP).reduce((total, [, value]) => total + value, 0);
  return {
    buckets: (limit === undefined ? shown : shown.slice(0, limit)).map(([label, value]) => ({ label, count: value })),
    hidden,
  };
}
