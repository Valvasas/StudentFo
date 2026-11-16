import { describe, expect, it } from 'vitest';
import { isEventDeleteConfirmed, takedownReasonText } from './event-removal';

describe('takedownReasonText', () => {
  it('alasan baku + keterangan opsional, dirapikan', () => {
    expect(takedownReasonText('salah-posting', '')).toBe('Dihapus admin — Salah posting / data keliru');
    expect(takedownReasonText('duplikat', '  sama   dengan  lomba-x ')).toBe('Dihapus admin — Duplikat postingan lain: sama dengan lomba-x');
  });

  it('"Lainnya" wajib keterangan; kunci asing ditolak', () => {
    expect(takedownReasonText('lainnya', 'abc')).toBeNull();
    expect(takedownReasonText('lainnya', 'Diminta panitia lewat email')).toBe('Dihapus admin — Lainnya: Diminta panitia lewat email');
    expect(takedownReasonText('iseng', 'apa saja')).toBeNull();
  });

  it('tidak pernah melebihi batas kolom 500', () => {
    expect(takedownReasonText('melanggar', 'x'.repeat(2000))!.length).toBeLessThanOrEqual(500);
  });
});

describe('isEventDeleteConfirmed', () => {
  it('hanya HAPUS (tanpa peka huruf), bukan frasa hapus akun', () => {
    expect(isEventDeleteConfirmed(' hapus ')).toBe(true);
    expect(isEventDeleteConfirmed('HAPUS AKUN')).toBe(false);
    expect(isEventDeleteConfirmed('')).toBe(false);
  });
});
