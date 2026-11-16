/**
 * "Lagi ramai" (ADR-092): seberapa hidup sebuah kegiatan BELAKANGAN INI.
 *
 *   skor = Σ bobot(sinyal) × 2^(−umur_jam / 72)   untuk sinyal ≤ 14 hari terakhir
 *
 * Bobot mengikuti kekuatan niat sekaligus biaya memalsukannya: mendaftar
 * lewat formulir StudentFo (6) > klik "Daftar" ke tautan resmi (4) > simpan
 * (3) > berkomentar (2) > suka (1) > pengunjung unik harian (0,25). Klik
 * Daftar & komentar dihitung SEKALI per orang (waktu terakhirnya) — klik
 * berulang atau banjir komentar dari satu akun tidak menaikkan skor.
 *
 * Peluruhan eksponensial (paruh waktu 3 hari), bukan total seumur acara:
 * acara lama dengan ribuan simpanan tidak boleh memaku puncak selamanya
 * (rich-get-richer, ADR-026), dan acara baru yang mendadak diserbu bisa naik
 * dalam hitungan jam. Hanya kegiatan yang MASIH bisa diikuti yang dinilai.
 *
 * KEMBARAN SQL: `refresh_event_trends()` (migration 20261116100001) —
 * bobot, paruh waktu, jendela, dan aturan "sekali per orang" harus sama.
 * Produksi menghitung ulang tiap 15 menit (pg_cron); mode seed menghitung
 * saat dibaca. Uji paritasnya: `popularity.test.ts` + `119_event_engagement.test.sql`.
 */

export const TREND_WEIGHTS = {
  registration: 6,
  click: 4,
  save: 3,
  comment: 2,
  like: 1,
  visitor: 0.25,
} as const;

export type TrendKind = keyof typeof TREND_WEIGHTS;

export const TREND_HALF_LIFE_HOURS = 72;
export const TREND_WINDOW_DAYS = 14;

/**
 * Ambang bagian "Lagi ramai" di beranda: di bawah ini kegiatan belum cukup
 * ramai untuk disebut ramai (≈ satu simpanan + satu suka minggu ini). Bagian
 * berisi kegiatan tanpa interaksi sama sekali = klaim palsu, jadi bagiannya
 * disembunyikan.
 */
export const TREND_MIN_SCORE = 1;

const MS_PER_HOUR = 3_600_000;
const WINDOW_MS = TREND_WINDOW_DAYS * 24 * MS_PER_HOUR;

export interface TrendSignal {
  readonly kind: TrendKind;
  readonly at: string | Date;
  /** Kelipatan bobot — dipakai pengunjung harian (jumlah pengunjung unik hari itu). */
  readonly count?: number;
}

/**
 * Faktor peluruhan satu sinyal: 1 untuk "baru saja" (juga sinyal bertanggal
 * depan — jam server yang meleset tidak boleh menghasilkan bobot > 1), 0
 * untuk yang di luar jendela 14 hari atau tanggal tak terbaca.
 */
export function trendDecay(at: string | Date, now: Date = new Date()): number {
  const time = typeof at === 'string' ? Date.parse(at) : at.getTime();
  if (Number.isNaN(time)) return 0;
  const ageMs = now.getTime() - time;
  if (ageMs >= WINDOW_MS) return 0;
  const ageHours = Math.max(ageMs, 0) / MS_PER_HOUR;
  return Math.pow(2, -ageHours / TREND_HALF_LIFE_HOURS);
}

export function trendScore(signals: readonly TrendSignal[], now: Date = new Date()): number {
  let score = 0;
  for (const signal of signals) {
    const count = signal.count ?? 1;
    if (!(count > 0)) continue;
    score += TREND_WEIGHTS[signal.kind] * count * trendDecay(signal.at, now);
  }
  return score;
}

/**
 * Tengah hari WIB dari hari kalender `YYYY-MM-DD` — "waktu" pengunjung harian
 * (`event_daily_stats` hanya menyimpan per hari). Cermin
 * `(day::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Jakarta'` di SQL.
 */
export function jakartaNoonOf(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  // 12:00 WIB = 05:00 UTC (WIB tanpa musim panas).
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 5, 0, 0));
}

/**
 * Sinyal "sekali per orang": dari banyak kejadian per (kegiatan, orang),
 * simpan waktu TERAKHIR saja. Cermin `GROUP BY event_id, user_id` + `max()`.
 */
export function latestPerPerson<T extends { readonly eventId: string; readonly userId: string; readonly at: string }>(
  rows: readonly T[],
): Map<string, Map<string, string>> {
  const byEvent = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const people = byEvent.get(row.eventId) ?? new Map<string, string>();
    const previous = people.get(row.userId);
    if (!previous || Date.parse(row.at) > Date.parse(previous)) people.set(row.userId, row.at);
    byEvent.set(row.eventId, people);
  }
  return byEvent;
}

/** Pengurutan "Lagi ramai": skor turun, lalu tenggat terdekat, lalu id — sama dengan ORDER BY di listing Supabase. */
export function compareTrending(
  a: { readonly trendScore?: number; readonly primaryDeadlineAt: string | null; readonly id: string },
  b: { readonly trendScore?: number; readonly primaryDeadlineAt: string | null; readonly id: string },
): number {
  const scoreDiff = (b.trendScore ?? 0) - (a.trendScore ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  const left = a.primaryDeadlineAt ? Date.parse(a.primaryDeadlineAt) : Number.MAX_SAFE_INTEGER;
  const right = b.primaryDeadlineAt ? Date.parse(b.primaryDeadlineAt) : Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
