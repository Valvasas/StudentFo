import { describe, expect, it, vi } from 'vitest';
import {
  actionError,
  parseActionErrorCode,
  parseActionNoticeCode,
  toActionErrorCode,
  withQuery,
} from './action-feedback';
import { AppError, ERROR_CODES, notFound } from './errors';

describe('parseActionErrorCode', () => {
  it('menerima kode dari daftar tertutup', () => {
    expect(parseActionErrorCode('team_full')).toBe('team_full');
    expect(parseActionErrorCode(['team_full', 'unknown'])).toBe('team_full');
  });

  it('menolak teks bebas — URL tidak boleh bisa menampilkan kalimat karangan', () => {
    expect(parseActionErrorCode('Akun kamu diblokir, hubungi wa.me/62811')).toBeNull();
    expect(parseActionErrorCode('constructor')).toBeNull();
    expect(parseActionErrorCode(undefined)).toBeNull();
  });

  it('kode notice juga dari daftar tertutup', () => {
    expect(parseActionNoticeCode('submission_received')).toBe('submission_received');
    expect(parseActionNoticeCode('halo')).toBeNull();
  });
});

describe('toActionErrorCode', () => {
  it('memakai reason dari actionError()', () => {
    expect(toActionErrorCode(actionError('team_full'))).toBe('team_full');
    expect(toActionErrorCode(actionError('team_forbidden'))).toBe('team_forbidden');
  });

  it('error tanpa reason yang dikenal selalu jadi unknown', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(toActionErrorCode(new Error('duplicate key value violates unique constraint'))).toBe('unknown');
    expect(toActionErrorCode(notFound())).toBe('unknown');
    expect(
      toActionErrorCode(new AppError(ERROR_CODES.INTERNAL, 'x', 500, { reason: 'bukan-kode' })),
    ).toBe('unknown');
    spy.mockRestore();
  });

  it('status HTTP mengikuti jenis alasan', () => {
    expect(actionError('team_forbidden').httpStatus).toBe(403);
    expect(actionError('team_not_found').httpStatus).toBe(404);
    expect(actionError('team_full').httpStatus).toBe(422);
  });
});

describe('withQuery', () => {
  it('menambah query ke path tanpa query', () => {
    expect(withQuery('/teams', { error: 'team_full' })).toBe('/teams?error=team_full');
  });

  it('menggabungkan dengan query yang sudah ada, bukan menempel "?" kedua', () => {
    expect(withQuery('/events?type=LOMBA&page=2', { error: 'unknown' })).toBe(
      '/events?type=LOMBA&page=2&error=unknown',
    );
  });

  it('menimpa nilai lama dan menghapus yang undefined', () => {
    expect(withQuery('/teams?error=team_full', { error: 'team_forbidden' })).toBe(
      '/teams?error=team_forbidden',
    );
    expect(withQuery('/teams?error=team_full', { error: undefined })).toBe('/teams');
  });
});
