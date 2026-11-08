import { describe, expect, it } from 'vitest';
import { groupSecret, normalizeTotpCode } from './admin-mfa';

describe('normalizeTotpCode', () => {
  it('menerima 6 digit, termasuk yang ditempel berspasi/bertanda hubung dari aplikasi', () => {
    expect(normalizeTotpCode('123456')).toBe('123456');
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('123-456')).toBe('123456');
  });

  it('selain tepat 6 digit ditolak sebelum menyentuh GoTrue (tidak menghabiskan kuota percobaan)', () => {
    for (const raw of ['', '12345', '1234567', '12345a', '１２３４５６', null, undefined]) {
      expect(normalizeTotpCode(raw)).toBeNull();
    }
  });
});

describe('groupSecret', () => {
  it('per 4 karakter tanpa spasi di ujung', () => {
    expect(groupSecret('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGH IJKL MNOP');
    expect(groupSecret('ABCDEF')).toBe('ABCD EF');
  });
});
