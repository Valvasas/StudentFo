import { describe, expect, it } from 'vitest';
import type { ModerationLogEntry } from '@/types/domain';
import { formatWait, REVIEW_SLA_HOURS, summarizeDecisions, summarizeQueue } from './admin-health';

const now = new Date('2026-09-30T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

function entry(partial: Partial<ModerationLogEntry>): ModerationLogEntry {
  return {
    id: 'x',
    subjectType: 'event',
    subjectId: 'e',
    title: 'Acara',
    fromStatus: 'PENDING',
    toStatus: 'APPROVED',
    actorId: 'admin',
    actorName: 'Admin',
    reason: null,
    createdAt: hoursAgo(1),
    ...partial,
  };
}

describe('summarizeQueue', () => {
  it('antrean kosong tidak punya umur tertua', () => {
    expect(summarizeQueue([], now)).toEqual({ count: 0, oldestHours: null, overdue: 0 });
  });

  it('menghitung umur tertua dan item yang melewati batas tepat di ambangnya', () => {
    const result = summarizeQueue([hoursAgo(2), hoursAgo(REVIEW_SLA_HOURS), hoursAgo(REVIEW_SLA_HOURS - 1), hoursAgo(90)], now);
    expect(result).toEqual({ count: 4, oldestHours: 90, overdue: 2 });
  });

  it('mengabaikan tanggal rusak tanpa menjatuhkan halaman', () => {
    expect(summarizeQueue(['bukan-tanggal', hoursAgo(3)], now)).toEqual({ count: 2, oldestHours: 3, overdue: 0 });
  });
});

describe('summarizeDecisions', () => {
  it('hanya menghitung keputusan manusia dalam 7 hari', () => {
    const result = summarizeDecisions(
      [
        entry({ toStatus: 'APPROVED' }),
        entry({ toStatus: 'VERIFIED' }),
        entry({ toStatus: 'REJECTED' }),
        entry({ toStatus: 'REVOKED' }),
        entry({ toStatus: 'EXPIRED', actorId: null }),
        entry({ toStatus: 'APPROVED', actorId: null }),
        entry({ toStatus: 'PENDING', fromStatus: 'REJECTED' }),
        entry({ toStatus: 'APPROVED', createdAt: hoursAgo(24 * 8) }),
      ],
      now,
    );
    expect(result).toEqual({ approved: 2, rejected: 2, windowDays: 7 });
  });
});

describe('formatWait', () => {
  it('memakai jam untuk tunggu singkat dan hari setelah dua hari', () => {
    expect(formatWait(null)).toBe('—');
    expect(formatWait(0)).toBe('< 1 jam');
    expect(formatWait(47)).toBe('47 jam');
    expect(formatWait(49)).toBe('2 hari');
  });
});
