import { describe, expect, it } from 'vitest';
import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';

const SECRET = 'rahasia-uji-tautan-email-minimal-32-karakter';
const USER = '7f3a09c2-1111-4000-8000-000000000001';

describe('token berhenti-langganan', () => {
  it('bolak-balik; huruf besar di UUID dinormalkan', () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken(USER, SECRET), SECRET)).toBe(USER);
    expect(verifyUnsubscribeToken(createUnsubscribeToken(USER.toUpperCase(), SECRET), SECRET)).toBe(USER);
  });

  it('tidak bisa dipindah ke pengguna lain, dipalsukan, atau dipakai dengan kunci lain', () => {
    const token = createUnsubscribeToken(USER, SECRET);
    const [, signature] = token.split('.');
    expect(verifyUnsubscribeToken(`7f3a09c2-1111-4000-8000-000000000002.${signature}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(token, `${SECRET}-lain`)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}.ekor`, SECRET)).toBeNull();
  });

  it('masukan kosong/rusak & kunci yang belum diisi = null, tanpa melempar', () => {
    for (const raw of [null, undefined, '', 'tanpa-titik', 'bukan-uuid.abc', '.'.repeat(300)]) {
      expect(verifyUnsubscribeToken(raw, SECRET)).toBeNull();
    }
    expect(verifyUnsubscribeToken(createUnsubscribeToken(USER, SECRET), undefined)).toBeNull();
  });
});
