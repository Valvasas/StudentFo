import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { LEADERBOARD_RESULTS, type LeaderboardCounts, type LeaderboardRange, type LeaderboardResult } from '@/types/domain';

/**
 * Peringkat kampus & mahasiswa (ADR-098). Bobot di sini = SATU-SATUNYA
 * salinan TypeScript dari `leaderboard_weight()` (migration
 * 20261125100001) — `leaderboard.test.ts` membaca berkas SQL itu dan gagal
 * bila keduanya berbeda. Mode seed menghitung skornya di sini; produksi di SQL.
 */
export const LEADERBOARD_WEIGHTS: Readonly<Record<LeaderboardResult, number>> = {
  JUARA_1: 10,
  JUARA_2: 8,
  JUARA_3: 6,
  JUARA_HARAPAN: 4,
  FINALIS: 2,
};

export const LEADERBOARD_RESULT_LABEL: Readonly<Record<LeaderboardResult, string>> = {
  JUARA_1: 'Juara 1',
  JUARA_2: 'Juara 2',
  JUARA_3: 'Juara 3',
  JUARA_HARAPAN: 'Juara harapan',
  FINALIS: 'Finalis',
};

export const EMPTY_COUNTS: LeaderboardCounts = { JUARA_1: 0, JUARA_2: 0, JUARA_3: 0, JUARA_HARAPAN: 0, FINALIS: 0 };

export function scoreOf(counts: LeaderboardCounts): number {
  return LEADERBOARD_RESULTS.reduce((total, result) => total + counts[result] * LEADERBOARD_WEIGHTS[result], 0);
}

/** Rumus yang DITAMPILKAN di halaman — dibangun dari bobot yang sama, tidak ditulis ulang. */
export function formulaText(): string {
  return LEADERBOARD_RESULTS.map((result) => `${LEADERBOARD_WEIGHTS[result]} × ${LEADERBOARD_RESULT_LABEL[result]}`).join(' + ');
}

/**
 * Urutan seri: skor → Juara 1 terbanyak → jumlah orang → nama. Sama dengan
 * ORDER BY `campus_leaderboard()`; dipakai mode seed dan untuk
 * mengurutkan ulang setelah saringan jenis tempat studi di aplikasi.
 */
export function compareStandings(
  a: { readonly score: number; readonly counts: LeaderboardCounts; readonly people?: number; readonly name: string },
  b: { readonly score: number; readonly counts: LeaderboardCounts; readonly people?: number; readonly name: string },
): number {
  return b.score - a.score || b.counts.JUARA_1 - a.counts.JUARA_1 || (b.people ?? 0) - (a.people ?? 0) || a.name.localeCompare(b.name, 'id');
}

export const LEADERBOARD_TABS = ['kampus', 'sekolah', 'mahasiswa'] as const;
export type LeaderboardTab = (typeof LEADERBOARD_TABS)[number];

export const LEADERBOARD_TAB_LABEL: Readonly<Record<LeaderboardTab, string>> = {
  kampus: 'Kampus',
  sekolah: 'Sekolah',
  mahasiswa: 'Pelajar & mahasiswa',
};

/** `semua`, `12-bulan`, atau tahun kalender 4 digit. */
export type LeaderboardPeriod = 'semua' | '12-bulan' | `${number}`;

export interface LeaderboardQuery {
  readonly tab: LeaderboardTab;
  readonly period: LeaderboardPeriod;
  /** Slug bidang (`categories`); null = semua bidang. */
  readonly category: string | null;
}

export const DEFAULT_LEADERBOARD_QUERY: LeaderboardQuery = { tab: 'kampus', period: 'semua', category: null };

/** Tahun yang bisa dipilih: tahun ini dan dua tahun sebelumnya (WIB). */
export function periodYears(now: Date = new Date()): readonly number[] {
  const year = new Date(now.getTime() + 7 * 3_600_000).getUTCFullYear();
  return [year, year - 1, year - 2];
}

export function parseLeaderboardQuery(params: RawSearchParams, now: Date = new Date()): LeaderboardQuery {
  const tab = firstParam(params.tab);
  const period = firstParam(params.periode);
  const category = firstParam(params.bidang);
  const years = periodYears(now).map(String);
  return {
    tab: LEADERBOARD_TABS.find((candidate) => candidate === tab) ?? 'kampus',
    period: period === '12-bulan' ? '12-bulan' : period && years.includes(period) ? (period as `${number}`) : 'semua',
    category: category && /^[a-z0-9-]{1,50}$/.test(category) ? category : null,
  };
}

/** Bentuk kanonik: nilai bawaan tidak ditulis (satu kombinasi = satu URL, pola search-params). */
export function leaderboardHref(query: LeaderboardQuery, overrides: Partial<LeaderboardQuery> = {}): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (merged.tab !== 'kampus') params.set('tab', merged.tab);
  if (merged.period !== 'semua') params.set('periode', merged.period);
  if (merged.category) params.set('bidang', merged.category);
  const text = params.toString();
  return text ? `/leaderboard?${text}` : '/leaderboard';
}

/**
 * Rentang tanggal prestasi (WIB) untuk SQL. Tahun = 1 Jan 00.00 WIB s.d.
 * 1 Jan tahun berikutnya; 12 bulan = 365 hari terakhir.
 */
export function leaderboardRange(query: Pick<LeaderboardQuery, 'period' | 'category'>, now: Date = new Date()): LeaderboardRange {
  const category = query.category;
  if (query.period === 'semua') return { since: null, until: null, category };
  if (query.period === '12-bulan') return { since: new Date(now.getTime() - 365 * 86_400_000).toISOString(), until: null, category };
  const year = Number(query.period);
  const startOf = (value: number) => new Date(Date.UTC(value, 0, 1) - 7 * 3_600_000).toISOString();
  return { since: startOf(year), until: startOf(year + 1), category };
}

/** Akumulasi hasil per kelompok (mode seed): satu orang dihitung sekali per lomba sudah dijamin kunci (user, event). */
export function addResult(counts: LeaderboardCounts, result: LeaderboardResult): LeaderboardCounts {
  return { ...counts, [result]: counts[result] + 1 };
}
