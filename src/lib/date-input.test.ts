import { describe, expect, it } from 'vitest';
import { formatPickedDate } from './date-input';

describe('formatPickedDate', () => {
  it('menulis tanggal panjang bahasa Indonesia, tidak bergantung zona waktu mesin', () => {
    expect(formatPickedDate('2026-12-12')).toBe('Sabtu, 12 Desember 2026');
    expect(formatPickedDate('2026-01-01')).toBe('Kamis, 1 Januari 2026');
  });

  it('kosong, bentuk salah, atau tanggal yang tidak ada = null', () => {
    expect(formatPickedDate('')).toBeNull();
    expect(formatPickedDate('12/12/2026')).toBeNull();
    expect(formatPickedDate('2026-02-31')).toBeNull();
    expect(formatPickedDate('2026-13-01')).toBeNull();
  });
});
