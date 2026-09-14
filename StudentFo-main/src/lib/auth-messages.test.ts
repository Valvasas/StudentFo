import { describe, expect, it } from 'vitest';
import {
  AUTH_ERROR_MESSAGE,
  mapSupabaseAuthError,
  parseAuthErrorCode,
  parseAuthNoticeCode,
} from './auth-messages';

describe('mapSupabaseAuthError', () => {
  it('memetakan kode kredensial salah', () => {
    expect(mapSupabaseAuthError({ code: 'invalid_credentials', status: 400 })).toBe(
      'invalid_credentials',
    );
  });

  it('menyamakan "user tidak ditemukan" dengan "kredensial salah"', () => {
    // Membedakan keduanya sama saja dengan menyediakan alat pemeriksa
    // keanggotaan: ketik email siapa pun, baca balasannya.
    expect(mapSupabaseAuthError({ code: 'user_not_found' })).toBe('invalid_credentials');
    expect(AUTH_ERROR_MESSAGE.invalid_credentials).not.toMatch(/tidak terdaftar|belum terdaftar/i);
  });

  it('mengenali pembatasan laju dari status 429 meski kodenya tak dikenal', () => {
    expect(mapSupabaseAuthError({ status: 429 })).toBe('rate_limited');
  });

  it('jatuh ke teks pesan hanya sebagai upaya terakhir', () => {
    expect(mapSupabaseAuthError({ status: 400, message: 'Invalid login credentials' })).toBe(
      'invalid_credentials',
    );
  });

  it('mengembalikan unknown untuk bentuk error yang tidak dikenali', () => {
    expect(mapSupabaseAuthError(null)).toBe('unknown');
    expect(mapSupabaseAuthError('meledak')).toBe('unknown');
    expect(mapSupabaseAuthError({ code: 'sesuatu_yang_baru' })).toBe('unknown');
  });
});

describe('parseAuthErrorCode', () => {
  it('hanya menerima kode dari daftar tertutup', () => {
    expect(parseAuthErrorCode('rate_limited')).toBe('rate_limited');
    // Kalau nilai bebas diterima, URL bisa dipakai menampilkan kalimat
    // karangan di halaman kita sendiri.
    expect(parseAuthErrorCode('Akun diblokir, hubungi wa.me/123')).toBeNull();
    expect(parseAuthErrorCode(undefined)).toBeNull();
  });

  it('memakai nilai pertama kalau parameter diulang', () => {
    expect(parseAuthErrorCode(['validation', 'unknown'])).toBe('validation');
  });
});

describe('parseAuthNoticeCode', () => {
  it('menyaring kode kabar baik dengan aturan yang sama', () => {
    expect(parseAuthNoticeCode('check_email')).toBe('check_email');
    expect(parseAuthNoticeCode('kamu_menang_undian')).toBeNull();
  });
});
