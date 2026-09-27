import { describe, expect, it } from 'vitest';
import { isUuid, keysetAfter, sanitizeSearchQuery, sqlState, toModerationLogEntry, toSubmission } from './supabase-mappers';

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

describe('toModerationLogEntry', () => {
  const row = {
    id: 42,
    subject_type: 'event' as const,
    subject_id: 'e1000000-0000-4000-8000-000000000001',
    title: 'Lomba X',
    from_status: 'PENDING' as const,
    to_status: 'APPROVED' as const,
    actor_id: 'a1000000-0000-4000-8000-000000000001',
    reason: null,
    created_at: '2026-09-26T01:00:00Z',
    actor: { full_name: 'Admin A' },
  };

  it('memetakan nama aktor dari join users', () => {
    expect(toModerationLogEntry(row)).toMatchObject({ id: '42', actorName: 'Admin A', fromStatus: 'PENDING' });
  });

  it('aktor yang akunnya dihapus / perubahan sistem → nama null', () => {
    expect(toModerationLogEntry({ ...row, actor: null }).actorName).toBeNull();
    expect(toModerationLogEntry({ ...row, actor_id: null, actor: null }).actorId).toBeNull();
  });
});

describe('keysetAfter', () => {
  it('baris setelah kursor dalam urutan (status, created_at, id) menurun, stempel waktu dikutip', () => {
    expect(keysetAfter({ status: 'PENDING', createdAt: '2026-09-27T10:00:00.5+00:00', id: '0f8b6a1e-1c2d-4e3f-8a9b-0c1d2e3f4a5b' })).toBe(
      'status.lt.PENDING,' +
        'and(status.eq.PENDING,created_at.lt."2026-09-27T10:00:00.5+00:00"),' +
        'and(status.eq.PENDING,created_at.eq."2026-09-27T10:00:00.5+00:00",connection_id.lt.0f8b6a1e-1c2d-4e3f-8a9b-0c1d2e3f4a5b)',
    );
  });
});
