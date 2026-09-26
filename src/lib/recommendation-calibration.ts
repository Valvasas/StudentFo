/**
 * Kalibrasi bobot rekomendasi dari sinyal nyata (ADR-032).
 *
 * Data masuk: sinyal niat (simpan / klik "Daftar") beserta profil saat itu,
 * dan riwayat event. Untuk setiap sinyal, kandidat yang TAYANG pada saat itu
 * direkonstruksi; event yang dipilih = positif, sampel event lain = negatif.
 * Komponen skor dihitung dengan fungsi yang SAMA dengan `rankEvents()`, lalu
 * regresi logistik kecil memperkirakan kontribusi tiap komponen.
 *
 * Batasan yang disadari (dicetak juga di laporan skrip):
 *  - Bias posisi tidak dikoreksi: kartu teratas lebih sering diklik karena
 *    posisinya, dan posisinya ditentukan bobot lama. Saran bobot cenderung
 *    MEMPERKUAT bobot yang sedang berlaku — perlakukan sebagai arah, bukan angka final.
 *  - Popularitas memakai `savedCount` saat ini, bukan saat sinyal terjadi.
 *  - "Tayang" diperkirakan dari created_at & tenggat; event yang pernah
 *    PENDING/REJECTED sebentar tetap dihitung kandidat.
 */

import { jakartaDayNumber } from '@/lib/deadline';
import {
  categoryMatch,
  COLD_START_WEIGHTS,
  deadlineFitForDays,
  educationMatch,
  PERSONAL_WEIGHTS,
  popularityBoost,
  recencyBoost,
} from '@/lib/recommendation';
import type { EducationLevel } from '@/types/domain';

export interface CalibrationEvent {
  readonly id: string;
  readonly createdAt: string;
  readonly primaryDeadlineAt: string | null;
  readonly categorySlugs: readonly string[];
  readonly educationLevels: readonly EducationLevel[];
  readonly savedCount: number;
}

export interface CalibrationSignal {
  readonly eventId: string;
  readonly createdAt: string;
  readonly interests: readonly string[];
  readonly educationLevel: EducationLevel | null;
}

type PersonalKey = keyof typeof PERSONAL_WEIGHTS;
type ColdStartKey = keyof typeof COLD_START_WEIGHTS;

interface TrainingRow<K extends string> {
  readonly features: Readonly<Record<K, number>>;
  readonly chosen: boolean;
}

export interface WeightSuggestion<K extends string> {
  /** Jumlah sinyal (positif) yang dipakai. */
  readonly signals: number;
  readonly sufficient: boolean;
  readonly current: Readonly<Record<K, number>>;
  /** Koefisien positif dinormalisasi berjumlah 1; null kalau data belum cukup. */
  readonly suggested: Readonly<Record<K, number>> | null;
  /** Rata-rata komponen pada pilihan dikurangi rata-rata pada kandidat lain. */
  readonly lift: Readonly<Record<K, number>>;
}

export interface CalibrationReport {
  readonly personal: WeightSuggestion<PersonalKey>;
  readonly coldStart: WeightSuggestion<ColdStartKey>;
}

/**
 * Di bawah ini, variansi taksiran lebih besar daripada selisih antarbobot
 * yang ingin diukur — saran bobot tidak dicetak sama sekali.
 */
export const MIN_SIGNALS_FOR_SUGGESTION = 200;

export interface CalibrationOptions {
  readonly negativesPerSignal?: number;
  readonly seed?: number;
  readonly minSignals?: number;
}

/** PRNG deterministik: laporan yang sama untuk data yang sama. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Fisher-Yates parsial: hanya `count` langkah pertama, bukan mengacak seluruh pool. */
function sample<T>(items: T[], count: number, random: () => number): T[] {
  const take = Math.min(count, items.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(random() * (items.length - i));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items.slice(0, take);
}

/**
 * Event dengan waktu yang sudah diurai SEKALI. Tanpa ini setiap pasangan
 * sinyal × event mengurai tanggal dan memanggil Intl lagi: 5.000 sinyal ×
 * 2.000 event butuh 72 detik; dengan praproses ini di bawah 1 detik.
 */
interface PreparedEvent {
  readonly event: CalibrationEvent;
  readonly createdMs: number;
  /** Nomor hari WIB tenggat; null = tanpa tenggat. */
  readonly deadlineDay: number | null;
}

function prepare(event: CalibrationEvent): PreparedEvent {
  const deadline = event.primaryDeadlineAt ? new Date(event.primaryDeadlineAt) : null;
  return {
    event,
    createdMs: new Date(event.createdAt).getTime(),
    deadlineDay: deadline && !Number.isNaN(deadline.getTime()) ? jakartaDayNumber(deadline) : null,
  };
}

interface SignalMoment {
  readonly at: Date;
  readonly atMs: number;
  readonly day: number;
}

function daysLeft(prepared: PreparedEvent, moment: SignalMoment): number | null {
  return prepared.deadlineDay === null ? null : prepared.deadlineDay - moment.day;
}

/** Sama dengan `deadlineFit(...) > 0` di peringkat: sudah terbit dan belum lewat hari tenggatnya (WIB). */
function wasVisible(prepared: PreparedEvent, moment: SignalMoment): boolean {
  if (prepared.createdMs > moment.atMs) return false;
  return deadlineFitForDays(daysLeft(prepared, moment)) > 0;
}

function personalFeatures(prepared: PreparedEvent, signal: CalibrationSignal, moment: SignalMoment): Record<PersonalKey, number> {
  const { event } = prepared;
  return {
    category: categoryMatch(signal.interests, event.categorySlugs),
    education: educationMatch(signal.educationLevel, event.educationLevels),
    deadline: deadlineFitForDays(daysLeft(prepared, moment)),
    recency: recencyBoost(event.createdAt, moment.at),
  };
}

function coldStartFeatures(prepared: PreparedEvent, maxSaved: number, moment: SignalMoment): Record<ColdStartKey, number> {
  return {
    recency: recencyBoost(prepared.event.createdAt, moment.at),
    popularity: popularityBoost(prepared.event.savedCount, maxSaved),
    deadline: deadlineFitForDays(daysLeft(prepared, moment)),
  };
}

/** Selesaikan A·x = b (A simetris positif-definit kecil) dengan eliminasi Gauss berpivot. */
function solve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i] ?? 0]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const lead = a[col]![col]!;
    if (Math.abs(lead) < 1e-12) continue;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row]![col]! / lead;
      for (let k = col; k <= n; k += 1) a[row]![k]! -= factor * a[col]![k]!;
    }
  }
  return a.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

/**
 * Regresi logistik dengan Newton-Raphson (IRLS) + ridge kecil. Bukan gradient
 * descent: untuk 4–5 parameter Newton konvergen dalam ±10 iterasi, sedangkan
 * gradient descent butuh ribuan — pada data produksi (puluhan ribu sinyal ×
 * 21 baris) itu berarti puluhan detik CPU per buka halaman laporan.
 * Fitur 0..1 sehingga tidak perlu standardisasi; intersep menyerap base rate.
 */
export function fitLogistic<K extends string>(
  rows: readonly TrainingRow<K>[],
  keys: readonly K[],
  { maxIterations = 25, ridge = 1e-3, tolerance = 1e-8 } = {},
): Record<K, number> {
  const p = keys.length + 1;
  const n = rows.length;
  const zero = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  if (n === 0) return zero;

  // Matriks desain datar: [1, f1..fk] per baris — akses objek per iterasi terlalu mahal.
  const x = new Float64Array(n * p);
  const y = new Float64Array(n);
  rows.forEach((row, i) => {
    x[i * p] = 1;
    keys.forEach((key, j) => {
      x[i * p + j + 1] = row.features[key];
    });
    y[i] = row.chosen ? 1 : 0;
  });

  let beta = new Array<number>(p).fill(0);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const gradient = new Array<number>(p).fill(0);
    const hessian = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    for (let i = 0; i < n; i += 1) {
      let z = 0;
      for (let j = 0; j < p; j += 1) z += beta[j]! * x[i * p + j]!;
      const mu = 1 / (1 + Math.exp(-z));
      const w = Math.max(mu * (1 - mu), 1e-10);
      const residual = y[i]! - mu;
      for (let j = 0; j < p; j += 1) {
        const xij = x[i * p + j]!;
        gradient[j]! += residual * xij;
        for (let k = j; k < p; k += 1) hessian[j]![k]! += w * xij * x[i * p + k]!;
      }
    }
    for (let j = 0; j < p; j += 1) {
      for (let k = 0; k < j; k += 1) hessian[j]![k] = hessian[k]![j]!;
      // Ridge tidak dikenakan pada intersep (j = 0).
      if (j > 0) {
        hessian[j]![j]! += ridge * n;
        gradient[j]! -= ridge * n * beta[j]!;
      }
    }
    const step = solve(hessian, gradient);
    beta = beta.map((value, j) => value + (step[j] ?? 0));
    if (step.reduce((max, value) => Math.max(max, Math.abs(value)), 0) < tolerance) break;
  }
  return Object.fromEntries(keys.map((key, j) => [key, beta[j + 1] ?? 0])) as Record<K, number>;
}

/** Koefisien negatif = komponen itu tidak membantu → bobot 0, bukan bobot negatif. */
function normalizePositive<K extends string>(coefficients: Record<K, number>, keys: readonly K[]): Record<K, number> | null {
  const total = keys.reduce((sum, key) => sum + Math.max(coefficients[key], 0), 0);
  if (total <= 0) return null;
  return Object.fromEntries(
    keys.map((key) => [key, Math.round((Math.max(coefficients[key], 0) / total) * 100) / 100]),
  ) as Record<K, number>;
}

function liftOf<K extends string>(rows: readonly TrainingRow<K>[], keys: readonly K[]): Record<K, number> {
  const mean = (subset: readonly TrainingRow<K>[], key: K) =>
    subset.length === 0 ? 0 : subset.reduce((sum, row) => sum + row.features[key], 0) / subset.length;
  const chosen = rows.filter((row) => row.chosen);
  const other = rows.filter((row) => !row.chosen);
  return Object.fromEntries(
    keys.map((key) => [key, Math.round((mean(chosen, key) - mean(other, key)) * 1000) / 1000]),
  ) as Record<K, number>;
}

function suggestion<K extends string>(
  rows: readonly TrainingRow<K>[],
  keys: readonly K[],
  current: Readonly<Record<K, number>>,
  minSignals: number,
): WeightSuggestion<K> {
  const signals = rows.filter((row) => row.chosen).length;
  const sufficient = signals >= minSignals;
  return {
    signals,
    sufficient,
    current,
    suggested: sufficient ? normalizePositive(fitLogistic(rows, keys), keys) : null,
    lift: liftOf(rows, keys),
  };
}

export function calibrate(
  signals: readonly CalibrationSignal[],
  events: readonly CalibrationEvent[],
  { negativesPerSignal = 20, seed = 20260926, minSignals = MIN_SIGNALS_FOR_SUGGESTION }: CalibrationOptions = {},
): CalibrationReport {
  const random = mulberry32(seed);
  const prepared = events.map(prepare);
  const byId = new Map(prepared.map((item) => [item.event.id, item]));
  const maxSaved = events.reduce((max, event) => Math.max(max, event.savedCount), 0);
  const personalRows: TrainingRow<PersonalKey>[] = [];
  const coldRows: TrainingRow<ColdStartKey>[] = [];

  for (const signal of signals) {
    const chosen = byId.get(signal.eventId);
    if (!chosen) continue;
    const at = new Date(signal.createdAt);
    const moment: SignalMoment = { at, atMs: at.getTime(), day: jakartaDayNumber(at) };
    const negatives = sample(
      prepared.filter((item) => item !== chosen && wasVisible(item, moment)),
      negativesPerSignal,
      random,
    );
    // Sama dengan isColdStart(): profil tanpa minat ATAU tanpa jenjang diperingkat cold start.
    const personalized = signal.interests.length > 0 && signal.educationLevel !== null;

    for (const [item, isChosen] of [[chosen, true] as const, ...negatives.map((item) => [item, false] as const)]) {
      if (personalized) personalRows.push({ features: personalFeatures(item, signal, moment), chosen: isChosen });
      else coldRows.push({ features: coldStartFeatures(item, maxSaved, moment), chosen: isChosen });
    }
  }

  return {
    personal: suggestion(personalRows, ['category', 'education', 'deadline', 'recency'], PERSONAL_WEIGHTS, minSignals),
    coldStart: suggestion(coldRows, ['recency', 'popularity', 'deadline'], COLD_START_WEIGHTS, minSignals),
  };
}
