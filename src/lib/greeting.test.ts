import { describe, expect, it } from 'vitest';
import { firstNameOf, greetingFor, todayLabel } from './greeting';

describe('greetingFor — jam WIB, bukan jam server', () => {
  it.each([
    ['2026-10-05T21:30:00Z', 'Selamat pagi'], // 04.30 WIB
    ['2026-10-05T03:59:00Z', 'Selamat pagi'], // 10.59 WIB
    ['2026-10-05T04:00:00Z', 'Selamat siang'], // 11.00 WIB
    ['2026-10-05T08:00:00Z', 'Selamat sore'], // 15.00 WIB
    ['2026-10-05T11:00:00Z', 'Selamat malam'], // 18.00 WIB
    ['2026-10-05T20:59:00Z', 'Selamat malam'], // 03.59 WIB
  ])('%s → %s', (iso, expected) => {
    expect(greetingFor(new Date(iso))).toBe(expected);
  });

  it('pergantian hari UTC tidak menggeser hari WIB', () => {
    // 17.30 UTC Minggu = 00.30 WIB Senin.
    expect(todayLabel(new Date('2026-10-04T17:30:00Z'))).toBe('Senin, 5 Oktober');
  });
});

describe('firstNameOf', () => {
  it('kata pertama, dipotong wajar, dan tidak pernah kosong', () => {
    expect(firstNameOf('Dinda Pratiwi')).toBe('Dinda');
    expect(firstNameOf('  Raka  ')).toBe('Raka');
    expect(firstNameOf('')).toBe('kamu');
    expect(firstNameOf('a'.repeat(60))).toHaveLength(24);
  });
});
