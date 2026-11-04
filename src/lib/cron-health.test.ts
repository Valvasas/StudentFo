import { describe, expect, it } from 'vitest';
import type { CronJobHealth } from '@/types/domain';
import { cronJobState, needsAttention, sortByUrgency } from './cron-health';

const healthy: CronJobHealth = {
  jobName: 'studentfo-b',
  schedule: '5 17 * * *',
  active: true,
  lastStartedAt: '2026-10-30T17:05:00Z',
  lastStatus: 'succeeded',
  lastMessage: '1 row',
  runs7d: 7,
  failures7d: 0,
  overdue: false,
};

describe('cronJobState', () => {
  it('gagal mengalahkan telat; nonaktif mengalahkan keduanya', () => {
    expect(cronJobState({ ...healthy, lastStatus: 'failed', overdue: true })).toBe('failed');
    expect(cronJobState({ ...healthy, overdue: true })).toBe('overdue');
    expect(cronJobState({ ...healthy, active: false, lastStatus: 'failed' })).toBe('inactive');
  });

  it('belum pernah jalan bukan masalah (job baru); sedang jalan = sehat', () => {
    expect(cronJobState({ ...healthy, lastStartedAt: null, lastStatus: null })).toBe('never');
    expect(needsAttention('never')).toBe(false);
    expect(cronJobState({ ...healthy, lastStatus: 'running' })).toBe('ok');
  });

  it('gagal pernah terjadi minggu ini tapi run terakhir sukses = sehat (riwayat tetap ditampilkan)', () => {
    expect(cronJobState({ ...healthy, failures7d: 2 })).toBe('ok');
  });
});

describe('sortByUrgency', () => {
  it('bermasalah di atas, sisanya urut nama', () => {
    const order = sortByUrgency([
      { ...healthy, jobName: 'studentfo-c' },
      { ...healthy, jobName: 'studentfo-z', overdue: true },
      { ...healthy, jobName: 'studentfo-a' },
      { ...healthy, jobName: 'studentfo-y', lastStatus: 'failed' },
    ]).map(({ job }) => job.jobName);
    expect(order).toEqual(['studentfo-y', 'studentfo-z', 'studentfo-a', 'studentfo-c']);
  });
});
