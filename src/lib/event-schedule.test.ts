import { describe, expect, it } from 'vitest';
import { formatSchedule, parseSchedule, parseWibDateTime, toWibDateTimeInput } from './event-schedule';

const NOW = new Date('2026-11-25T03:00:00Z');

describe('parseWibDateTime', () => {
  it('menafsirkan isian sebagai WIB (+07:00), bukan zona server', () => {
    expect(parseWibDateTime('2026-12-12T09:00')).toBe('2026-12-12T02:00:00.000Z');
    expect(parseWibDateTime(' 2026-12-12T00:30 ')).toBe('2026-12-11T17:30:00.000Z');
  });

  it('format lain atau tanggal yang tidak ada di kalender = null', () => {
    for (const value of ['', '2026-12-12', '12/12/2026 09:00', '2026-02-31T09:00', '2026-13-01T09:00', '2026-12-12T24:00']) {
      expect(parseWibDateTime(value)).toBeNull();
    }
  });

  it('bolak-balik dengan nilai formulir', () => {
    expect(toWibDateTimeInput(parseWibDateTime('2027-01-05T19:45'))).toBe('2027-01-05T19:45');
    expect(toWibDateTimeInput(null)).toBe('');
  });
});

describe('parseSchedule (cermin CHECK events_schedule_order)', () => {
  it('dua isian kosong = hapus jadwal', () => {
    expect(parseSchedule('', '', NOW)).toEqual({ ok: true, startsAt: null, endsAt: null });
  });

  it('mulai saja, atau mulai + selesai berurutan', () => {
    expect(parseSchedule('2026-12-12T09:00', '', NOW)).toEqual({ ok: true, startsAt: '2026-12-12T02:00:00.000Z', endsAt: null });
    expect(parseSchedule('2026-12-12T09:00', '2026-12-12T16:00', NOW)).toMatchObject({ ok: true, endsAt: '2026-12-12T09:00:00.000Z' });
  });

  it('selesai tanpa mulai, selesai sebelum mulai, isian rusak, atau tahun salah ketik ditolak', () => {
    expect(parseSchedule('', '2026-12-12T16:00', NOW).ok).toBe(false);
    expect(parseSchedule('2026-12-12T16:00', '2026-12-12T09:00', NOW).ok).toBe(false);
    expect(parseSchedule('2026-12-12T09:00', 'besok', NOW).ok).toBe(false);
    expect(parseSchedule('2062-12-12T09:00', '', NOW).ok).toBe(false);
    expect(parseSchedule('2020-12-12T09:00', '', NOW).ok).toBe(false);
  });
});

describe('formatSchedule', () => {
  it('satu hari: tanggal lengkap + rentang jam WIB', () => {
    expect(formatSchedule('2026-12-12T02:00:00.000Z', '2026-12-12T09:00:00.000Z')).toBe('Sabtu, 12 Desember 2026 · 09.00–16.00 WIB');
    expect(formatSchedule('2026-12-12T02:00:00.000Z', null)).toBe('Sabtu, 12 Desember 2026 · 09.00 WIB');
  });

  it('beberapa hari: dua tanggal ringkas', () => {
    expect(formatSchedule('2026-12-12T02:00:00.000Z', '2026-12-14T10:00:00.000Z')).toBe('12 Des 2026, 09.00 – 14 Des 2026, 17.00 WIB');
  });
});
