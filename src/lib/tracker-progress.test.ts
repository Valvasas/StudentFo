import { describe, expect, it } from 'vitest';
import { TRACKER_STATUSES } from '@/types/domain';
import { needsActionSoon, trackerProgress } from './tracker-progress';

describe('trackerProgress', () => {
  it('setiap status terpetakan tanpa melempar', () => {
    for (const status of TRACKER_STATUSES) expect(() => trackerProgress(status)).not.toThrow();
  });

  it('maju berurutan dan berakhir di diterima', () => {
    expect(['SAVED', 'APPLIED', 'INTERVIEW', 'ACCEPTED'].map((status) => trackerProgress(status as never).reached)).toEqual([0, 1, 2, 3]);
    expect(trackerProgress('ACCEPTED').next).toBeNull();
  });

  it('ditolak = berhenti di "sudah daftar", ditandai, tanpa langkah berikutnya', () => {
    expect(trackerProgress('REJECTED')).toEqual({ reached: 1, rejected: true, next: null });
  });
});

describe('needsActionSoon', () => {
  // 12.00 WIB, 30 Sep 2026 — batas hari dihitung per kalender Asia/Jakarta.
  const now = new Date('2026-09-30T05:00:00Z');
  const item = (id: string, status: 'SAVED' | 'APPLIED', deadline: string | null) => ({
    id,
    status,
    event: { primaryDeadlineAt: deadline },
  });

  it('hanya yang masih disimpan, belum lewat, dan tutup dalam 7 hari — paling mendesak dulu', () => {
    const result = needsActionSoon(
      [
        item('h7', 'SAVED', '2026-10-07T16:59:00Z'), // 23.59 WIB 7 Okt = H-7
        item('h8', 'SAVED', '2026-10-08T16:59:00Z'),
        item('h0', 'SAVED', '2026-09-30T16:59:00Z'),
        item('lewat', 'SAVED', '2026-09-29T16:59:00Z'),
        item('sudah-daftar', 'APPLIED', '2026-10-01T16:59:00Z'),
        item('tanpa-tenggat', 'SAVED', null),
      ],
      now,
    );
    expect(result.map((entry) => [entry.item.id, entry.daysLeft])).toEqual([
      ['h0', 0],
      ['h7', 7],
    ]);
  });
});
