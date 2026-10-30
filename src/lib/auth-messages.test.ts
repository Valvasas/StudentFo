import { describe, expect, it } from 'vitest';
import {
  isPerAddressEmailThrottle,
  AUTH_ERROR_MESSAGE,
  AUTH_NOTICE_MESSAGE,
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

  it('akun yang ditangguhkan juga tampil sebagai "kredensial salah" (tidak membocorkan keberadaan akun)', () => {
    expect(mapSupabaseAuthError({ code: 'user_banned', status: 400 })).toBe('invalid_credentials');
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

describe('isPerAddressEmailThrottle', () => {
  it('hanya jeda per alamat yang ditelan; batas per IP & kuota email proyek tetap dilaporkan', () => {
    const perAddress = { code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 47 seconds.' };
    const projectCap = { code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' };
    const perIp = { code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' };
    expect(isPerAddressEmailThrottle(perAddress)).toBe(true);
    expect(isPerAddressEmailThrottle({ status: 429, message: 'For security purposes, you can only request this after 1 second.' })).toBe(true);
    expect(isPerAddressEmailThrottle(projectCap)).toBe(false);
    expect(isPerAddressEmailThrottle(perIp)).toBe(false);
    expect(mapSupabaseAuthError(projectCap)).toBe('rate_limited');
    expect(mapSupabaseAuthError(perIp)).toBe('rate_limited');
    expect(isPerAddressEmailThrottle(null)).toBe(false);
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

describe('kode baru form daftar & lupa sandi', () => {
  it('CAPTCHA & persetujuan punya kode sendiri dari daftar tertutup', () => {
    expect(parseAuthErrorCode('captcha_failed')).toBe('captcha_failed');
    expect(parseAuthErrorCode('consent_required')).toBe('consent_required');
  });

  it('kabar kirim ulang konfirmasi tidak membocorkan keberadaan akun', () => {
    expect(parseAuthNoticeCode('confirmation_resent')).toBe('confirmation_resent');
    // Berlaku untuk alamat apa pun — jadi harus berbentuk pengandaian.
    expect(AUTH_NOTICE_MESSAGE.confirmation_resent).toMatch(/^Kalau /);
    expect(AUTH_NOTICE_MESSAGE.confirmation_resent).not.toMatch(/tidak terdaftar|belum terdaftar|tidak ditemukan/i);
  });
});

describe('parseAuthNoticeCode', () => {
  it('menyaring kode kabar baik dengan aturan yang sama', () => {
    expect(parseAuthNoticeCode('check_email')).toBe('check_email');
    expect(parseAuthNoticeCode('kamu_menang_undian')).toBeNull();
  });
});
