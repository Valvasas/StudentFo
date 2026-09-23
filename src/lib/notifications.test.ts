import { describe, expect, it } from 'vitest';
import {
  buildDeadlineMessage,
  notificationTypeForDaysLeft,
  notificationTypeForDeadline,
} from './notifications';

/** 23:59 WIB pada tanggal yang diminta = 16:59 UTC di hari yang sama. */
function wibDeadline(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day, 16, 59, 0)).toISOString();
}

describe('notificationTypeForDaysLeft', () => {
  it('mengirim pengingat tepat di H-3 dan H-1', () => {
    expect(notificationTypeForDaysLeft(3)).toBe('DEADLINE_H3');
    expect(notificationTypeForDaysLeft(1)).toBe('DEADLINE_H1');
  });

  it('diam di hari selain H-3 dan H-1', () => {
    for (const days of [0, 2, 4, 5, 7, 30]) {
      expect(notificationTypeForDaysLeft(days)).toBeNull();
    }
  });

  it('tidak mengirim apa pun untuk tenggat yang sudah lewat', () => {
    expect(notificationTypeForDaysLeft(-1)).toBeNull();
    expect(notificationTypeForDaysLeft(-90)).toBeNull();
  });

  it('tidak mengirim apa pun kalau tenggatnya belum diumumkan', () => {
    expect(notificationTypeForDaysLeft(null)).toBeNull();
    expect(notificationTypeForDeadline(null)).toBeNull();
  });
});

describe('notificationTypeForDeadline', () => {
  /**
   * Regresi untuk bug hitung-hari yang sama dengan deadline.ts: kalau
   * selisihnya dihitung dengan (deadline - now) / 86400000, tenggat besok
   * malam yang dilihat pagi ini terbaca < 1 hari dan pengingat H-1 tidak
   * pernah terkirim.
   */
  it('memakai selisih hari kalender WIB, bukan pembagian milidetik', () => {
    // 12 Okt 2026 pukul 07:00 WIB = 11 Okt 2026 pukul 00:00 UTC.
    const pagiWib = new Date(Date.UTC(2026, 9, 12, 0, 0, 0));

    expect(notificationTypeForDeadline(wibDeadline(2026, 10, 13), pagiWib)).toBe('DEADLINE_H1');
    expect(notificationTypeForDeadline(wibDeadline(2026, 10, 15), pagiWib)).toBe('DEADLINE_H3');
    expect(notificationTypeForDeadline(wibDeadline(2026, 10, 14), pagiWib)).toBeNull();
  });

  it('menghitung dari hari kalender Jakarta walau jam server larut malam UTC', () => {
    // 12 Okt 2026 pukul 23:30 UTC sudah masuk 13 Okt di Jakarta.
    const larutUtc = new Date(Date.UTC(2026, 9, 12, 23, 30, 0));
    expect(notificationTypeForDeadline(wibDeadline(2026, 10, 14), larutUtc)).toBe('DEADLINE_H1');
  });
});

describe('buildDeadlineMessage', () => {
  it('menyebut nama kegiatan, bukan pesan generik', () => {
    expect(buildDeadlineMessage('Beasiswa LPDP', 'DEADLINE_H3')).toContain('Beasiswa LPDP');
    expect(buildDeadlineMessage('Beasiswa LPDP', 'DEADLINE_H1')).toContain('Beasiswa LPDP');
  });

  it('membedakan nada H-3 dan H-1', () => {
    expect(buildDeadlineMessage('Lomba X', 'DEADLINE_H3')).toContain('3 hari lagi');
    expect(buildDeadlineMessage('Lomba X', 'DEADLINE_H1')).toContain('besok');
  });
});
