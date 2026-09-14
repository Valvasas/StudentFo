import { describe, expect, it } from 'vitest';
import { daysUntil, getDeadlineState, urgencyFromDays } from './deadline';

// 10 Jan 2026, 20:00 WIB = 13:00 UTC.
const NOW = new Date('2026-01-10T13:00:00Z');

describe('daysUntil', () => {
  it('menghitung per hari kalender WIB, bukan selisih 24 jam', () => {
    // 11 Jan 08:00 WIB hanya 12 jam dari NOW, tapi secara kalender = besok.
    expect(daysUntil('2026-01-11T01:00:00Z', NOW)).toBe(1);
  });

  it('mengembalikan 0 untuk tenggat di hari yang sama', () => {
    expect(daysUntil('2026-01-10T16:00:00Z', NOW)).toBe(0);
  });

  it('tidak terpengaruh pergantian hari UTC', () => {
    // 10 Jan 23:00 WIB = 16:00 UTC hari yang sama -> tetap H-0.
    expect(daysUntil('2026-01-10T16:00:00Z', NOW)).toBe(0);
    // 11 Jan 00:30 WIB = 10 Jan 17:30 UTC -> secara WIB sudah besok.
    expect(daysUntil('2026-01-10T17:30:00Z', NOW)).toBe(1);
  });

  it('negatif untuk tenggat yang sudah lewat', () => {
    expect(daysUntil('2026-01-05T13:00:00Z', NOW)).toBe(-5);
  });

  it('mengembalikan null untuk tanggal tidak valid', () => {
    expect(daysUntil('bukan-tanggal', NOW)).toBeNull();
  });
});

describe('urgencyFromDays — batas persis Blueprint §5.1', () => {
  it.each([
    [30, 'safe'],
    [8, 'safe'],
    [7, 'warning'],
    [3, 'warning'],
    [2, 'urgent'],
    [0, 'urgent'],
    [-1, 'closed'],
    [null, 'unknown'],
  ] as const)('days=%s -> %s', (days, expected) => {
    expect(urgencyFromDays(days)).toBe(expected);
  });
});

describe('getDeadlineState', () => {
  it('memberi label manusiawi untuk hari ini dan besok', () => {
    expect(getDeadlineState('2026-01-10T16:00:00Z', NOW).shortLabel).toBe('Hari ini');
    expect(getDeadlineState('2026-01-11T16:00:00Z', NOW).shortLabel).toBe('Besok');
    expect(getDeadlineState('2026-01-15T16:00:00Z', NOW).shortLabel).toBe('H-5');
  });

  it('menangani deadline null tanpa melempar error', () => {
    const state = getDeadlineState(null, NOW);
    expect(state.urgency).toBe('unknown');
    expect(state.ringProgress).toBe(0);
  });

  it('mengunci ringProgress di rentang 0..1', () => {
    expect(getDeadlineState('2027-01-01T00:00:00Z', NOW).ringProgress).toBe(0);
    expect(getDeadlineState('2020-01-01T00:00:00Z', NOW).ringProgress).toBe(1);
  });

  it('mengisi cincin separuh tepat di H-15', () => {
    expect(getDeadlineState('2026-01-25T16:00:00Z', NOW).ringProgress).toBeCloseTo(0.5, 5);
  });
});
