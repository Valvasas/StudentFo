import { describe, expect, it } from 'vitest';
import { groupSecret, normalizeTotpCode, otpauthHref } from './admin-mfa';

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

describe('otpauthHref', () => {
  it('hanya URI TOTP yang jadi tautan', () => {
    expect(otpauthHref('otpauth://totp/StudentFo:admin%40contoh.id?secret=JBSWY3DPEHPK3PXP&issuer=StudentFo')).toMatch(/^otpauth:\/\/totp\//);
    for (const bad of ['javascript:alert(1)', 'https://contoh.id', 'otpauth://hotp/x?secret=A', 'otpauth://totp/ spasi', '', null, undefined, 42]) {
      expect(otpauthHref(bad)).toBeNull();
    }
  });
});

describe('groupSecret', () => {
  it('per 4 karakter tanpa spasi di ujung', () => {
    expect(groupSecret('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGH IJKL MNOP');
    expect(groupSecret('ABCDEF')).toBe('ABCD EF');
  });
});
