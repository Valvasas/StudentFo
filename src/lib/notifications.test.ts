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
  it('mengirim pengingat di H-3 dan H-1', () => {
    expect(notificationTypeForDaysLeft(3)).toBe('DEADLINE_H3');
    expect(notificationTypeForDaysLeft(1)).toBe('DEADLINE_H1');
  });

  it('menyusulkan pengingat yang terlewat: H-2 -> H3, H-0 -> H1', () => {
    expect(notificationTypeForDaysLeft(2)).toBe('DEADLINE_H3');
    expect(notificationTypeForDaysLeft(0)).toBe('DEADLINE_H1');
  });

  it('diam di luar jendela H-3', () => {
    for (const days of [4, 5, 7, 30]) {
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
    expect(notificationTypeForDeadline(wibDeadline(2026, 10, 16), pagiWib)).toBeNull();
  });

  it('menghitung dari hari kalender Jakarta walau jam server larut malam UTC', () => {
    // 12 Okt 2026 pukul 23:30 UTC sudah masuk 13 Okt di Jakarta.
    const larutUtc = new Date(Date.UTC(2026, 9, 12, 23, 30, 0));
    expect(notificationTypeForDeadline(wibDeadline(2026, 10, 14), larutUtc)).toBe('DEADLINE_H1');
  });
});

describe('buildDeadlineMessage', () => {
  it('menyebut nama kegiatan, bukan pesan generik', () => {
    expect(buildDeadlineMessage('Beasiswa LPDP', 3)).toContain('Beasiswa LPDP');
    expect(buildDeadlineMessage('Beasiswa LPDP', 1)).toContain('Beasiswa LPDP');
  });

  it('menyebut sisa hari yang sebenarnya, termasuk susulan', () => {
    expect(buildDeadlineMessage('Lomba X', 3)).toContain('3 hari lagi');
    expect(buildDeadlineMessage('Lomba X', 2)).toContain('2 hari lagi');
    expect(buildDeadlineMessage('Lomba X', 1)).toContain('besok');
    expect(buildDeadlineMessage('Lomba X', 0)).toContain('hari ini');
  });

  it('teksnya identik dengan SQL create_deadline_notifications()', () => {
    // Kalau salah satu diubah, test ini dan migration wajib ikut diubah.
    expect(buildDeadlineMessage('Gemastik', 2)).toBe('Pendaftaran Gemastik ditutup 2 hari lagi.');
    expect(buildDeadlineMessage('Gemastik', 1)).toBe('Terakhir — pendaftaran Gemastik ditutup besok.');
    expect(buildDeadlineMessage('Gemastik', 0)).toBe('Hari terakhir — pendaftaran Gemastik ditutup hari ini.');
  });
});
