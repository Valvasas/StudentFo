import { describe, expect, it } from 'vitest';
import { TRACKER_STATUSES } from '@/types/domain';
import { trackerProgress } from './tracker-progress';

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
