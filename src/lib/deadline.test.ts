import { describe, expect, it } from 'vitest';
import {
  daysLeftLabel,
  formatShortDateId,
  jakartaDateParts,
  formatTimeId,
  buildDeadlineWeek,
  daysUntil,
  getDeadlineState,
  jakartaDayWindow,
  urgencyFromDays,
} from './deadline';

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

describe('buildDeadlineWeek', () => {
  it('selalu mengembalikan 7 hari kalender WIB mulai hari ini', () => {
    const week = buildDeadlineWeek([], NOW);
    expect(week.map((day) => day.date)).toEqual([
      '2026-01-10',
      '2026-01-11',
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
      '2026-01-16',
    ]);
    expect(week.every((day) => day.count === 0)).toBe(true);
  });

  it('mengelompokkan per hari WIB, bukan per hari UTC', () => {
    const week = buildDeadlineWeek(
      [
        '2026-01-10T16:59:00Z', // 10 Jan 23:59 WIB -> hari ini
        '2026-01-10T17:30:00Z', // 11 Jan 00:30 WIB -> besok, walau UTC masih 10 Jan
        '2026-01-11T16:59:00Z', // 11 Jan 23:59 WIB -> besok
      ],
      NOW,
    );
    expect(week[0]).toEqual({ date: '2026-01-10', count: 1 });
    expect(week[1]).toEqual({ date: '2026-01-11', count: 2 });
  });

  it('mengabaikan tenggat di luar jendela dan tanggal tidak valid', () => {
    const week = buildDeadlineWeek(
      ['2026-01-09T10:00:00Z', '2026-01-17T01:00:00Z', 'bukan-tanggal', '2026-01-16T16:59:00Z'],
      NOW,
    );
    expect(week.reduce((sum, day) => sum + day.count, 0)).toBe(1);
    expect(week[6]).toEqual({ date: '2026-01-16', count: 1 });
  });
});

describe('jakartaDayWindow', () => {
  it('batasnya tengah malam WIB, dinyatakan dalam UTC', () => {
    const window = jakartaDayWindow(NOW, 7);
    // 10 Jan 00:00 WIB = 9 Jan 17:00 UTC; 17 Jan 00:00 WIB = 16 Jan 17:00 UTC.
    expect(window.startIso).toBe('2026-01-09T17:00:00.000Z');
    expect(window.endIso).toBe('2026-01-16T17:00:00.000Z');
  });
});

describe('formatTimeId', () => {
  it('jam WIB, bukan jam server', () => {
    expect(formatTimeId('2026-09-26T07:30:00Z')).toBe('14.30 WIB');
    expect(formatTimeId('bukan tanggal')).toBe('waktu tidak valid');
  });
});

describe('daysLeftLabel', () => {
  it('memakai kalimat sehari-hari, bukan H-n', () => {
    expect(daysLeftLabel(null)).toBe('Tanggal TBA');
    expect(daysLeftLabel(-3)).toBe('Ditutup');
    expect(daysLeftLabel(0)).toBe('Tutup hari ini');
    expect(daysLeftLabel(1)).toBe('Tutup besok');
    expect(daysLeftLabel(12)).toBe('12 hari lagi');
  });
});

describe('tanggal kalender WIB', () => {
  it('tenggat 01:00 WIB tetap tanggal WIB, bukan tanggal UTC kemarin', () => {
    // 12 Okt 2026 01:00 WIB = 11 Okt 2026 18:00 UTC.
    const iso = '2026-10-11T18:00:00Z';
    expect(jakartaDateParts(iso)).toMatchObject({ day: '12', month: 'Oktober', year: '2026', weekday: 'Senin' });
    expect(formatShortDateId(iso)).toBe('12 Okt');
  });

  it('nilai rusak tidak melempar', () => {
    expect(jakartaDateParts('bukan-tanggal')).toBeNull();
    expect(formatShortDateId('bukan-tanggal')).toBe('–');
  });
});
