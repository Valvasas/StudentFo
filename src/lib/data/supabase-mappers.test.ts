import { describe, expect, it } from 'vitest';
import { isUuid, sanitizeSearchQuery, sqlState, toSubmission } from './supabase-mappers';

describe('isUuid', () => {
  it('menerima UUID dan menolak selainnya sebelum sampai ke Postgres', () => {
    expect(isUuid('e1000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('abc')).toBe(false);
    expect(isUuid("1' OR '1'='1")).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('sanitizeSearchQuery', () => {
  it('membuang karakter operator tsquery dan memotong panjang', () => {
    expect(sanitizeSearchQuery("lomba & (esai | !puisi) 'x'")).toBe('lomba esai puisi x');
    expect(sanitizeSearchQuery('a'.repeat(300))).toHaveLength(120);
  });
});

describe('sqlState', () => {
  it('membaca kode SQLSTATE dari error PostgREST', () => {
    expect(sqlState({ code: '23505', message: 'duplicate' })).toBe('23505');
    expect(sqlState(new Error('x'))).toBeNull();
    expect(sqlState(null)).toBeNull();
  });
});

describe('toSubmission', () => {
  it('payload rusak tidak membuat baris hilang — admin tetap bisa menolaknya', () => {
    const submission = toSubmission({
      id: 's1',
      submitted_by_email: 'a@b.co',
      payload: { title: 123 },
      status: 'PENDING',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(submission.id).toBe('s1');
    expect(submission.payload).toBeNull();
  });
});
