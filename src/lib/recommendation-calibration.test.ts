import { describe, expect, it } from 'vitest';
import { categoryMatch, deadlineFit } from '@/lib/recommendation';
import type { EducationLevel } from '@/types/domain';
import {
  calibrate,
  fitLogistic,
  MIN_SIGNALS_FOR_SUGGESTION,
  type CalibrationEvent,
  type CalibrationSignal,
} from './recommendation-calibration';

const DAY = 86_400_000;
const NOW = new Date('2026-09-26T05:00:00Z').getTime();
const CATEGORIES = ['teknologi', 'desain', 'bisnis', 'sains', 'seni', 'sosial'];
const LEVELS: EducationLevel[] = ['SMA_SMK', 'D4_S1', 'S2'];

function lcg(seed: number) {
  let s = seed;
  return () => ((s = (s * 1_664_525 + 1_013_904_223) >>> 0) / 4_294_967_296);
}

function syntheticEvents(random: () => number, count = 80): CalibrationEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    createdAt: new Date(NOW - (30 + random() * 60) * DAY).toISOString(),
    primaryDeadlineAt: new Date(NOW + (1 + random() * 90) * DAY).toISOString(),
    categorySlugs: [CATEGORIES[Math.floor(random() * CATEGORIES.length)]!],
    educationLevels: [LEVELS[Math.floor(random() * LEVELS.length)]!],
    savedCount: Math.floor(random() * 50),
  }));
}

/** Pengguna memilih dengan peluang ∝ exp(utility): hanya `utility` yang menentukan pilihan. */
function syntheticSignals(
  events: readonly CalibrationEvent[],
  random: () => number,
  utility: (event: CalibrationEvent, interests: string[], at: Date) => number,
  count: number,
): CalibrationSignal[] {
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(NOW - random() * 20 * DAY);
    const interests = [CATEGORIES[i % CATEGORIES.length]!, CATEGORIES[(i + 2) % CATEGORIES.length]!];
    const visible = events.filter((event) => new Date(event.createdAt) <= at && deadlineFit(event.primaryDeadlineAt, at) > 0);
    const scores = visible.map((event) => Math.exp(utility(event, interests, at)));
    let pick = random() * scores.reduce((a, b) => a + b, 0);
    const chosen = visible.find((_, j) => (pick -= scores[j]!) <= 0) ?? visible[0]!;
    return { eventId: chosen.id, createdAt: at.toISOString(), interests, educationLevel: 'D4_S1' };
  });
}

describe('calibrate', () => {
  it('menemukan kembali bahwa hanya kecocokan minat yang menentukan pilihan', () => {
    const random = lcg(1);
    const events = syntheticEvents(random);
    const signals = syntheticSignals(events, random, (e, interests) => 4 * categoryMatch(interests, e.categorySlugs), 400);

    const { personal } = calibrate(signals, events);
    expect(personal.sufficient).toBe(true);
    const suggested = personal.suggested!;
    expect(suggested.category).toBeGreaterThan(0.6);
    for (const key of ['education', 'deadline', 'recency'] as const) {
      expect(suggested[key]).toBeLessThan(suggested.category);
    }
    expect(personal.lift.category).toBeGreaterThan(0.2);
  });

  it('menemukan kembali pengaruh tenggat kalau itu satu-satunya penentu', () => {
    const random = lcg(2);
    const events = syntheticEvents(random);
    const signals = syntheticSignals(events, random, (e, _i, at) => 5 * deadlineFit(e.primaryDeadlineAt, at), 400);

    const suggested = calibrate(signals, events).personal.suggested!;
    expect(suggested.deadline).toBeGreaterThan(0.5);
    expect(suggested.deadline).toBeGreaterThan(suggested.category);
  });

  it('profil tidak lengkap masuk jalur cold start, bukan personal (sama dengan isColdStart)', () => {
    const random = lcg(3);
    const events = syntheticEvents(random);
    const signals = syntheticSignals(events, random, () => 0, 30).map((signal) => ({ ...signal, educationLevel: null }));
    const report = calibrate(signals, events, { minSignals: 1 });
    expect(report.personal.signals).toBe(0);
    expect(report.coldStart.signals).toBe(30);
  });

  it(`tidak menyarankan bobot di bawah ${MIN_SIGNALS_FOR_SUGGESTION} sinyal`, () => {
    const random = lcg(4);
    const events = syntheticEvents(random);
    const signals = syntheticSignals(events, random, () => 0, 50);
    const { personal } = calibrate(signals, events);
    expect(personal.sufficient).toBe(false);
    expect(personal.suggested).toBeNull();
    expect(personal.current).toEqual({ category: 0.45, education: 0.25, deadline: 0.15, recency: 0.15 });
  });

  it('deterministik untuk data & seed yang sama; sinyal ke event tak dikenal diabaikan', () => {
    const random = lcg(5);
    const events = syntheticEvents(random);
    const signals = syntheticSignals(events, random, () => 0, 20);
    const withGhost = [...signals, { ...signals[0]!, eventId: 'tidak-ada' }];
    expect(calibrate(withGhost, events, { minSignals: 1 })).toEqual(calibrate(signals, events, { minSignals: 1 }));
  });

  it('kandidat hanya event yang sudah terbit & belum tutup saat sinyal terjadi', () => {
    const at = new Date(NOW);
    const chosen: CalibrationEvent = {
      id: 'dipilih', createdAt: new Date(NOW - 5 * DAY).toISOString(),
      primaryDeadlineAt: new Date(NOW + 5 * DAY).toISOString(), categorySlugs: ['teknologi'], educationLevels: ['D4_S1'], savedCount: 0,
    };
    const future = { ...chosen, id: 'belum-terbit', createdAt: new Date(NOW + DAY).toISOString() };
    const closed = { ...chosen, id: 'sudah-tutup', primaryDeadlineAt: new Date(NOW - 2 * DAY).toISOString() };
    const signal: CalibrationSignal = { eventId: 'dipilih', createdAt: at.toISOString(), interests: ['teknologi'], educationLevel: 'D4_S1' };
    const report = calibrate([signal], [chosen, future, closed], { minSignals: 1 });
    // Tidak ada negatif yang sah → lift 0 (hanya satu baris positif).
    expect(report.personal.lift).toEqual({ category: 1, education: 1, deadline: 1, recency: expect.any(Number) });
  });
});

describe('fitLogistic', () => {
  it('koefisien positif untuk fitur yang memisahkan kelas, ~0 untuk derau', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      features: { signal: i % 2, noise: (i * 7919) % 13 / 13 },
      chosen: i % 2 === 1,
    }));
    const weights = fitLogistic(rows, ['signal', 'noise']);
    expect(weights.signal).toBeGreaterThan(2);
    expect(Math.abs(weights.noise)).toBeLessThan(1);
  });

  it('tanpa data → nol', () => {
    expect(fitLogistic([], ['a'])).toEqual({ a: 0 });
  });
});

describe('calibrate — skala produksi', () => {
  it('2.000 sinyal × 1.000 event selesai jauh di bawah batas request (sebelumnya ±14 dtk)', () => {
    const random = lcg(6);
    const events = syntheticEvents(random, 1000);
    const signals = Array.from({ length: 2000 }, (_, i) => ({
      eventId: `e${(i * 13) % 1000}`,
      createdAt: new Date(NOW - (i % 20) * DAY).toISOString(),
      interests: [CATEGORIES[i % CATEGORIES.length]!],
      educationLevel: 'D4_S1' as const,
    }));
    const started = performance.now();
    const report = calibrate(signals, events);
    // Batas longgar supaya tidak goyah di runner CI yang lambat; regresi ke
    // pola lama (Intl per pasangan sinyal × event) melampauinya berkali lipat.
    expect(performance.now() - started).toBeLessThan(4000);
    expect(report.personal.signals).toBe(2000);
  }, 20_000);
});
