import { describe, expect, it } from 'vitest';
import { passwordSchema } from './auth-schema';
import { assessPassword } from './password-rules';

describe('assessPassword', () => {
  it('kosong bukan "lemah" — indikator belum perlu bicara', () => {
    expect(assessPassword('').strength).toBe('empty');
  });

  it('memeriksa tiap syarat terpisah', () => {
    expect(assessPassword('abcdefgh')).toMatchObject({ strength: 'weak', length: true, letter: true, digit: false });
    expect(assessPassword('a1')).toMatchObject({ strength: 'weak', length: false, letter: true, digit: true });
  });

  it('memenuhi syarat = cukup; ≥ 12 karakter = kuat', () => {
    expect(assessPassword('rahasia123').strength).toBe('fair');
    expect(assessPassword('rahasia-kampus-9').strength).toBe('strong');
  });

  it('di atas 72 karakter tidak pernah dianggap memenuhi syarat', () => {
    expect(assessPassword(`a1${'x'.repeat(71)}`).strength).toBe('weak');
  });

  it('selaras dengan validasi server: lolos di sini ⇔ lolos passwordSchema', () => {
    for (const sample of ['', 'abc1234', 'abcdefgh', '12345678', 'rahasia123', 'Kata Sandi 2026', `a1${'x'.repeat(70)}`, `a1${'x'.repeat(71)}`]) {
      const meets = assessPassword(sample).strength === 'fair' || assessPassword(sample).strength === 'strong';
      expect(meets, sample).toBe(passwordSchema.safeParse(sample).success);
    }
  });
});
